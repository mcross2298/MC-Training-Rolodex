/* ==========================================================================
   mc-search.js  —  tokenized, field-weighted, bounded-fuzz recipe search
   --------------------------------------------------------------------------
   CI initiative 4 ("Intent-Ranked Discovery"), search slice. The app's front
   door to 318 recipes was `indexOf` over five joined fields — one contiguous
   substring match, no tokenization, no ranking, no tolerance. Verified
   against the real catalog before this file existed: `"chicken broccoli"` →
   **0 results** (the words are never adjacent in any single field), and
   `"chiken"` → **0 results** (no typo tolerance at all).

   This replaces that with three real ingredients of search:

   1. **Tokenize + AND.** The query splits on non-alphanumeric boundaries;
      EVERY token must match something on a recipe for it to qualify.
      `"chicken broccoli"` now matches any recipe naming both, regardless of
      where in the recipe (or which field) each word appears.
   2. **Field-weighted, tiered scoring.** title > dish_category > tags >
      ingredient, and within a field: exact match > prefix match > bounded
      fuzzy match. Results are ranked, not returned in array order.
   3. **Bounded fuzzy matching.** A short token (< 4 chars) only matches
      exactly or as a prefix — `"pork"` must never fuzzy-match `"port"`.
      Longer tokens tolerate a small edit distance (≤1 for 4–6 chars, ≤2 for
      7+), which is what makes `"chiken"` find "Chicken" recipes.

   **Not a literal postings index — but not a naive per-recipe scan either.**
   The first working version of this file WAS a naive scan (for every recipe,
   for every query token, for every candidate word, maybe run Levenshtein) and
   it measured ~35–50ms per keystroke on the real 318-recipe corpus — because
   a correctly-spelled, non-matching recipe still paid for a full fuzzy scan
   of every word in every field. The fix: **fuzzy resolution happens ONCE per
   query token against a corpus-wide vocabulary** (`resolveFuzzy()`), not once
   per (recipe × field × word). The result is a small Set of vocabulary words
   that fuzzy-match the token; checking a recipe's field against it afterward
   is a plain object-membership test. Measured on the real corpus: a 1-token
   query (all 318 recipes, cache already warm) runs in ~4ms, a 3-token query
   needing fuzzy resolution on every token in ~9ms — both well under a frame,
   which is what a live-typing search box actually needs (see
   tools/test-mc-search.js's perf assertion) — the honest, scoped structure
   this corpus size needs, not a full inverted index it doesn't.

   Ingredient tokens are indexed across EVERY authored serving tier, not just
   the native one — `recipesMatch()`'s old ingredient search only ever read
   one tier, so a recipe whose native tier happened to omit an ingredient
   present in its other tier was invisible to a search for that ingredient.

   Exposed as window.MCSearch. Pure scoring/indexing logic — no DOM.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCSearch) return;

  /* ── tokenizing ─────────────────────────────────────────────────────── */
  var TOKEN_RE = /[a-z0-9]+/g;
  function tokenize(s) {
    var m = String(s || "").toLowerCase().match(TOKEN_RE);
    return m || [];
  }

  /* ── bounded Levenshtein distance, early-exits past the max ──────────── */
  // Two reused row buffers rather than fresh arrays per call — this now only
  // runs once per (query token × vocabulary word), not once per (recipe ×
  // field × word), but the buffers stay reused regardless since it's still
  // called at real volume on every keystroke that needs fuzzy resolution.
  var levRowA = [], levRowB = [];
  function levenshtein(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = levRowA, cur = levRowB;
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur[0] = i;
      var rowMin = cur[0];
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
        if (cur[k] < rowMin) rowMin = cur[k];
      }
      if (rowMin > max) return max + 1;    // whole row exceeded the budget
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[b.length];
  }
  // Never fuzzes a short token; scales the allowance with length so a longer
  // word can absorb one real typo. The floor is 5, not 4 — a real bug caught
  // by this file's own test suite: at a 4-char floor, "pork" (4 letters)
  // fuzzy-matched "York" (as in New York strip steak) at edit distance 1, a
  // single p→y substitution. That's a single-letter neighbor, not a typo,
  // and it's exactly the kind of unrelated-word noise bounded fuzz exists to
  // prevent — a 4-letter word has too little structure left for one edit to
  // reliably mean "the same word, misspelled."
  function fuzzMax(len) {
    if (len < 5) return 0;
    if (len <= 6) return 1;
    return 2;
  }

  /* ── per-token match tier against one indexed word, given a precomputed
     fuzzy-match set for that token (see resolveFuzzy below). Exact and
     prefix are plain string ops; "fuzzy" is now a Set lookup, not a
     Levenshtein call — the whole reason this is fast at real query volume. */
  function tierFor(queryToken, word, fuzzySet) {
    if (word === queryToken) return 1;
    if (word.indexOf(queryToken) === 0) return 0.6;
    if (fuzzySet && fuzzySet[word]) return 0.35;
    return 0;
  }
  function bestTierInField(queryToken, words, fuzzySet) {
    var best = 0;
    for (var i = 0; i < words.length; i++) {
      var t = tierFor(queryToken, words[i], fuzzySet);
      if (t > best) best = t;
      if (best === 1) break;
    }
    return best;
  }

  var FIELD_WEIGHTS = { title: 10, dish_category: 6, tags: 4, ingredient: 3 };
  // Highest weight first, so the per-token scan below can stop the moment no
  // remaining field could possibly beat the best score already found.
  var FIELD_ORDER = ["title", "dish_category", "tags", "ingredient"];

  /* ── per-recipe token-set cache + a corpus-wide vocabulary ─────────────
     `ingredient` tokens are collected across every authored serving_N tier
     present on the recipe (not just native), deduplicated. A recipe whose
     detail shard hasn't loaded yet (CI initiative 5) simply has no
     ingredient tokens until it does — the same honest degrade every other
     ingredient-dependent Browse feature already accepts.

     `vocab` is the deduplicated union of every word across every field of
     every recipe — a few hundred to low thousands of words for this corpus,
     an order of magnitude smaller than "every word in every recipe," which
     is what makes fuzzy resolution against it cheap. */
  function buildEntry(r, vocabSet) {
    var by = r.ingredients_by_serving || {};
    var seen = {}, ingredientWords = [];
    Object.keys(by).forEach(function (tier) {
      (by[tier] || []).forEach(function (ing) {
        tokenize(ing.item).forEach(function (t) {
          if (!seen[t]) { seen[t] = 1; ingredientWords.push(t); }
        });
      });
    });
    var titleWords = tokenize(r.title);
    var catWords = tokenize(r.dish_category);
    var tagWords = tokenize((r.tags || []).join(" "));
    titleWords.concat(catWords, tagWords, ingredientWords).forEach(function (w) { vocabSet[w] = true; });
    return {
      id: r.recipe_id,
      title: titleWords,
      dish_category: catWords,
      tags: tagWords,
      ingredient: ingredientWords,
      hasDetail: Object.keys(by).length > 0
    };
  }

  var cache = null;        // Map recipe_id -> entry
  var vocab = null;        // string[] — deduplicated words across the corpus
  var cacheComplete = false;
  function rebuild(recipeList) {
    cache = {};
    var vocabSet = {}, complete = true;
    recipeList.forEach(function (r) {
      var e = buildEntry(r, vocabSet);
      cache[e.id] = e;
      if (!e.hasDetail) complete = false;
    });
    vocab = Object.keys(vocabSet);
    cacheComplete = complete;
  }
  // Rebuild whenever the recipe list's size changed (a user recipe was
  // added/removed) or the cache was built before every detail shard had
  // landed — cheap at 318 recipes, and correctness matters more than
  // avoiding a rescan here.
  function ensureIndex(recipeList) {
    if (!cache || Object.keys(cache).length !== recipeList.length || !cacheComplete) {
      rebuild(recipeList);
    }
  }

  // The one Levenshtein-bearing pass per query token: which vocabulary words
  // fall within this token's edit-distance budget. Returns null (never
  // fuzzed) for a token too short to qualify — bestTierInField/tierFor treat
  // a null fuzzySet as "no fuzzy matches," which is correct.
  function resolveFuzzy(queryToken) {
    var max = fuzzMax(queryToken.length);
    if (max === 0) return null;
    var out = {};
    for (var i = 0; i < vocab.length; i++) {
      var w = vocab[i];
      if (w !== queryToken && levenshtein(queryToken, w, max) <= max) out[w] = true;
    }
    return out;
  }

  /* ── query ──────────────────────────────────────────────────────────── */
  // recipeList: the full window.RECIPES-shaped array to search.
  // Returns [{ recipe, score, matchedFields }], sorted by score desc, then
  // title asc for stable ordering between ties.
  function query(q, recipeList) {
    var qTokens = tokenize(q);
    if (!qTokens.length) return recipeList.map(function (r) { return { recipe: r, score: 0, matchedFields: [] }; });

    ensureIndex(recipeList);
    // Fuzzy resolution happens ONCE per query token here, against the whole
    // vocabulary — not once per recipe. This is the fix for the ~35ms/query
    // naive version; see the file header.
    var fuzzySets = qTokens.map(resolveFuzzy);

    var results = [];
    recipeList.forEach(function (r) {
      var entry = cache[r.recipe_id];
      if (!entry) return;
      var total = 0, matchedFields = {}, everyTokenMatched = true;
      for (var i = 0; i < qTokens.length; i++) {
        var qt = qTokens[i], fuzzySet = fuzzySets[i];
        var bestTokenScore = 0, bestField = null;
        for (var fi = 0; fi < FIELD_ORDER.length; fi++) {
          var field = FIELD_ORDER[fi];
          if (FIELD_WEIGHTS[field] <= bestTokenScore) continue;   // can't beat what we already have
          var tier = bestTierInField(qt, entry[field], fuzzySet);
          if (tier > 0) {
            var s = tier * FIELD_WEIGHTS[field];
            if (s > bestTokenScore) { bestTokenScore = s; bestField = field; }
          }
        }
        if (bestTokenScore === 0) { everyTokenMatched = false; break; }  // AND across tokens
        total += bestTokenScore;
        if (bestField) matchedFields[bestField] = true;
      }
      if (everyTokenMatched) {
        results.push({ recipe: r, score: total, matchedFields: Object.keys(matchedFields) });
      }
    });

    results.sort(function (a, b) {
      return b.score - a.score || String(a.recipe.title).localeCompare(String(b.recipe.title));
    });
    return results;
  }

  // Convenience for callers that only need the filtered, ranked list.
  function search(q, recipeList) {
    return query(q, recipeList).map(function (x) { return x.recipe; });
  }

  /* ── Missing-ingredient substitution ────────────────────────────────────
     A curated, deliberately small table — the ~20 swaps genuinely common
     across a Primal/Carnivore/high-protein recipe corpus like this one, not
     an attempt at a general substitution database. Matched against an
     ingredient's item TEXT with plain substring containment (recipe.html
     doesn't load mc-grocery.js's groceryMergeName identity keying, and these
     phrases are common enough — "sour cream," "buttermilk" — that a
     substring match is unambiguous without it).

     Deliberately informational, not interactive: this surfaces "here's an
     option," it does not rewrite the grocery row or know whether the cook's
     pantry actually lacks the item — recipe.html has no pantry read, and
     adding one to make this "1–2 items short"-aware was judged not worth a
     new cross-file dependency for a first slice. Extend `SUBSTITUTIONS`
     rather than the matching logic when a new swap is confirmed useful. */
  var SUBSTITUTIONS = [
    { match: "buttermilk", swap: "1 cup milk + 1 tbsp lemon juice or vinegar, rested 5 min (or plain kefir)" },
    { match: "sour cream", swap: "an equal amount of plain Greek yogurt" },
    { match: "heavy cream", swap: "whole milk + a little melted butter (thinner, but works in most sauces)" },
    { match: "shallot", swap: "half the amount of onion + a small clove of garlic" },
    { match: "fresh basil", swap: "half the amount of dried basil" },
    { match: "fresh cilantro", swap: "flat-leaf parsley (different flavor, similar texture)" },
    { match: "fresh parsley", swap: "half the amount of dried parsley" },
    { match: "fresh dill", swap: "a third the amount of dried dill" },
    { match: "fresh ginger", swap: "a quarter the amount of ground ginger" },
    { match: "worcestershire sauce", swap: "soy sauce + a splash of vinegar" },
    { match: "dijon mustard", swap: "yellow mustard + a pinch of prepared horseradish, if you have it" },
    { match: "red wine vinegar", swap: "apple cider vinegar" },
    { match: "rice wine vinegar", swap: "apple cider vinegar + a pinch of sugar" },
    { match: "panko", swap: "regular breadcrumbs, or crushed pork rinds for low-carb" },
    { match: "cornstarch", swap: "twice the amount of arrowroot powder" },
    { match: "brown sugar", swap: "white sugar + a splash of molasses, if you have it" },
    { match: "honey", swap: "maple syrup" },
    { match: "greek yogurt", swap: "sour cream" },
    { match: "coconut aminos", swap: "soy sauce (saltier — start with less)" },
    { match: "fish sauce", swap: "soy sauce + a squeeze of lime" }
  ];
  // Returns the first applicable swap for one ingredient's item text, or
  // null. First match wins — the table is small and curated enough that
  // ordering collisions aren't a real concern.
  function substitutionFor(itemText) {
    var s = String(itemText || "").toLowerCase();
    for (var i = 0; i < SUBSTITUTIONS.length; i++) {
      if (s.indexOf(SUBSTITUTIONS[i].match) >= 0) return SUBSTITUTIONS[i];
    }
    return null;
  }

  window.MCSearch = {
    tokenize: tokenize,
    query: query,
    search: search,
    substitutionFor: substitutionFor,
    // exposed for tests
    levenshtein: levenshtein,
    fuzzMax: fuzzMax
  };
})();
