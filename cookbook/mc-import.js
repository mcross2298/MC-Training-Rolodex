/* ==========================================================================
   mc-import.js  —  recipe capture: parse a fetched page into the Add-Recipe
                     form's shape
   --------------------------------------------------------------------------
   First slice of the Recipe Capture & Import Pipeline proposed in
   FLAGSHIP_COOKBOOK_ROADMAP.md ("Recipe Capture & Import Pipeline"). This
   module is deliberately narrow and self-contained: given raw HTML text (as
   a string — no DOMParser dependency, so the exact same code path runs
   identically in a browser and under plain Node in CI), it returns a
   best-effort recipe object shaped like mc-recipe-form.js's own save
   payload (`title` / `icon` / `dish_category` / `description` / `tags` /
   `prep_time_mins` / `cook_time_mins` / `base_serving` / `ingredients:
   [{quantity, unit, item, category}]` / `steps: [{title, detail}]`), plus a
   `macros` field the form doesn't accept yet (the roadmap's own documented
   gap — mc-recipe-form.js has no macros field at all today).

   Two extraction paths, tried in order:

   1. **schema.org/Recipe JSON-LD.** Most recipe sites (WordPress recipe
      plugins, AllRecipes, Food Network, etc.) embed a
      `<script type="application/ld+json">` block with a structured Recipe
      node — `recipeIngredient`, `recipeInstructions`, `nutrition`, `image`,
      `prepTime`/`cookTime` as ISO 8601 durations. When present, this is
      reliable structured data, not a guess.
   2. **Heuristic fallback.** No JSON-LD Recipe node found: scan for an
      "Ingredients" / "Instructions" heading and the <li> (or <p>) runs that
      follow each, up to the next heading. This is genuinely best-effort —
      it can't tell a recipe's own ingredient list from an unrelated one on
      a busy page — which is exactly why the UI spec this feeds (still to be
      wired — see the roadmap) always lands on a reviewable, fully-editable
      form rather than auto-saving anything this module returns.

   Neither path knows a page's `dish_category`, `accent`, or `icon` — those
   stay for the cook to choose in the existing form, same as a hand-typed
   recipe today. `category` (Meat/Dairy/Produce/Pantry) per ingredient is a
   keyword-based best guess (`guessCategory`), not a classifier — wrong
   guesses are exactly what the review step exists to catch.

   Not yet wired to any UI, the OCR photo-capture path, or the
   `fetch-recipe-source` Supabase edge function the roadmap calls for to get
   a URL's HTML past CORS in a browser — this module only does the parsing
   half, and takes HTML however the caller obtained it (a fixture file in
   tests; the edge function's response in the real app).

   Exposed as window.MCImport. Pure functions, no DOM, no storage — safe to
   load anywhere, safe to unit-test with tools/test-mc-import.js.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCImport) return;

  /* ── tiny text helpers (no DOMParser — must run identically in Node) ─── */
  var ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
    "&nbsp;": " ", "&rsquo;": "’", "&lsquo;": "‘",
    "&rdquo;": "”", "&ldquo;": "“", "&mdash;": "—", "&ndash;": "–"
  };
  function decodeEntities(s) {
    return String(s || "").replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, function (m) {
      if (ENTITIES[m.toLowerCase()]) return ENTITIES[m.toLowerCase()];
      var num = m.match(/^&#(\d+);$/) || m.match(/^&#x([0-9a-f]+);$/i);
      if (num) {
        var code = m.charAt(2) === "x" || m.charAt(2) === "X" ? parseInt(num[1], 16) : parseInt(num[1], 10);
        try { return String.fromCodePoint(code); } catch (e) { return m; }
      }
      return m;
    });
  }
  function stripTags(s) {
    return decodeEntities(String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
  }
  function hostFromUrl(url) {
    var m = String(url || "").match(/^https?:\/\/(?:www\.)?([^\/?#]+)/i);
    return m ? m[1] : "";
  }

  /* ── JSON-LD extraction ───────────────────────────────────────────────
     Regex over the raw markup rather than a DOM query, on purpose — this
     module has exactly one job (turn HTML text into a recipe guess) and
     adding a DOMParser dependency would make it behave differently in
     Node (tests) than in a browser (real use). Recipe JSON-LD is small and
     well-formed in practice; a script tag whose content fails JSON.parse is
     skipped rather than thrown on, since one malformed block (an analytics
     script mislabeled as ld+json, a trailing comma) shouldn't sink parsing
     the rest of the page. */
  var LDJSON_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  function extractJsonLdBlocks(html) {
    var out = [];
    var m;
    LDJSON_RE.lastIndex = 0;
    while ((m = LDJSON_RE.exec(String(html || "")))) {
      try { out.push(JSON.parse(m[1].trim())); } catch (e) { /* skip malformed block */ }
    }
    return out;
  }
  function asArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

  // JSON-LD allows a Recipe to sit at the top level, inside an array, or
  // nested in an @graph array (common on WordPress/Yoast-driven sites).
  function flattenJsonLdNodes(blocks) {
    var out = [];
    blocks.forEach(function (b) {
      asArray(b).forEach(function (node) {
        if (!node || typeof node !== "object") return;
        out.push(node);
        if (Array.isArray(node["@graph"])) {
          node["@graph"].forEach(function (n) { if (n && typeof n === "object") out.push(n); });
        }
      });
    });
    return out;
  }
  function isRecipeNode(node) {
    if (!node || !node["@type"]) return false;
    return asArray(node["@type"]).some(function (t) { return String(t).toLowerCase() === "recipe"; });
  }
  function findRecipeNode(nodes) {
    for (var i = 0; i < nodes.length; i++) { if (isRecipeNode(nodes[i])) return nodes[i]; }
    return null;
  }

  // "PT1H5M" / "PT20M" / "PT45S" → whole minutes (seconds round down; a
  // recipe's prep/cook time granularity is minutes everywhere else in this
  // app's data model too — see recipes-data.js's prep_time_mins).
  function parseISODuration(s) {
    var m = String(s || "").match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    var mins = (parseInt(m[1] || "0", 10) * 60) + parseInt(m[2] || "0", 10);
    return mins > 0 ? mins : (m[3] ? 1 : null);
  }

  // "PT30M" style, OR a plain recipeYield like "4" / "4 servings" / ["4","4 servings"].
  function firstIntFromYield(y) {
    var v = asArray(y)[0];
    var m = String(v == null ? "" : v).match(/\d+/);
    return m ? m[0] : "";
  }

  // "320 kcal" / "320" / "12 g" → the leading number, or null.
  function leadingNumber(s) {
    if (s == null) return null;
    var m = String(s).match(/[\d.]+/);
    return m ? Math.round(parseFloat(m[0])) : null;
  }

  /* ── ingredient-line parsing ──────────────────────────────────────────
     Best-effort split of one free-text ingredient line into quantity/unit/
     item — genuinely a guess, not a grammar. "2 1/2 cups chopped onion" →
     {quantity:"2 1/2", unit:"cups", item:"chopped onion"}; "Salt to taste"
     → {quantity:null, unit:null, item:"Salt to taste"} when no leading
     quantity is found at all, rather than forcing a false split. */
  var QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+/;
  var UNIT_WORDS = [
    "cups?", "tablespoons?", "tbsp\\.?", "teaspoons?", "tsp\\.?",
    "ounces?", "oz\\.?", "pounds?", "lbs?\\.?", "grams?", "g\\b", "kilograms?", "kg",
    "milliliters?", "ml", "liters?", "l\\b", "cloves?", "cans?", "slices?",
    "pinch(?:es)?", "dash(?:es)?", "large", "medium", "small", "whole", "sticks?", "bunche?s?"
  ];
  var UNIT_RE = new RegExp("^(" + UNIT_WORDS.join("|") + ")\\.?\\s+", "i");
  function parseIngredientLine(rawLine) {
    var line = stripTags(rawLine);
    var quantity = null, unit = null, item = line;
    var qm = line.match(QTY_RE);
    if (qm) {
      quantity = qm[1].trim();
      var rest = line.slice(qm[0].length);
      var um = rest.match(UNIT_RE);
      if (um) { unit = um[1].replace(/\.$/, ""); item = rest.slice(um[0].length).trim(); }
      else { item = rest.trim(); }
    }
    return { quantity: quantity, unit: unit, item: item };
  }

  var CATEGORY_KEYWORDS = {
    Meat: ["chicken", "beef", "pork", "turkey", "bacon", "sausage", "steak", "ground", "lamb",
      "fish", "salmon", "shrimp", "tuna", "cod", "ham"],
    Dairy: ["milk", "cheese", "butter", "cream", "yogurt", "egg"],
    Produce: ["onion", "garlic", "tomato", "pepper", "lettuce", "spinach", "carrot", "celery",
      "potato", "lemon", "lime", "apple", "avocado", "cilantro", "parsley", "basil",
      "broccoli", "cucumber", "mushroom", "herb"]
  };
  function guessCategory(itemText) {
    var hay = String(itemText || "").toLowerCase();
    var cats = Object.keys(CATEGORY_KEYWORDS);
    for (var i = 0; i < cats.length; i++) {
      if (CATEGORY_KEYWORDS[cats[i]].some(function (w) { return hay.indexOf(w) >= 0; })) return cats[i];
    }
    return "Pantry";
  }

  /* ── instruction flattening ───────────────────────────────────────────
     recipeInstructions is a string, an array of strings, an array of
     HowToStep objects ({text}), or an array of HowToSection objects that
     each nest their own itemListElement of HowToSteps. One level of
     section nesting is flattened — deeper nesting is rare in practice. */
  function textFromInstructionItem(item) {
    if (item == null) return "";
    if (typeof item === "string") return stripTags(item);
    if (typeof item === "object") {
      if (item.text) return stripTags(item.text);
      if (item.name && !item.itemListElement) return stripTags(item.name);
    }
    return "";
  }
  function flattenInstructions(raw) {
    var out = [];
    asArray(raw).forEach(function (item) {
      if (item && typeof item === "object" && Array.isArray(item.itemListElement)) {
        item.itemListElement.forEach(function (sub) {
          var t = textFromInstructionItem(sub);
          if (t) out.push(t);
        });
      } else {
        var t = textFromInstructionItem(item);
        if (t) out.push(t);
      }
    });
    // A single long block (no <li>/array structure) sometimes arrives as one
    // string with embedded newlines — split it into steps rather than saving
    // the whole recipe as "step 1."
    if (out.length === 1 && /\n/.test(out[0])) {
      out = out[0].split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return out;
  }

  function imageUrlFrom(img) {
    var v = asArray(img)[0];
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object" && v.url) return String(v.url);
    return "";
  }

  function normalizeRecipeFromJsonLd(node, sourceUrl) {
    var nutrition = node.nutrition && typeof node.nutrition === "object" ? node.nutrition : null;
    var macros = null;
    if (nutrition) {
      var cal = leadingNumber(nutrition.calories);
      var p = leadingNumber(nutrition.proteinContent);
      var f = leadingNumber(nutrition.fatContent);
      var c = leadingNumber(nutrition.carbohydrateContent);
      if (cal != null || p != null || f != null || c != null) {
        macros = { calories: cal, protein_g: p, fat_g: f, carbs_g: c };
      }
    }
    return {
      title: stripTags(node.name || ""),
      description: node.description ? stripTags(node.description).slice(0, 500) : "",
      image: imageUrlFrom(node.image),
      base_serving: firstIntFromYield(node.recipeYield),
      prep_time_mins: parseISODuration(node.prepTime),
      cook_time_mins: parseISODuration(node.cookTime),
      ingredients: asArray(node.recipeIngredient).map(function (line) {
        var p2 = parseIngredientLine(line);
        return { quantity: p2.quantity, unit: p2.unit, item: p2.item, category: guessCategory(p2.item) };
      }),
      steps: flattenInstructions(node.recipeInstructions).map(function (text) {
        return { title: "", detail: text };
      }),
      macros: macros,
      sourceUrl: sourceUrl || "",
      via: hostFromUrl(sourceUrl)
    };
  }

  /* ── heuristic fallback (no JSON-LD Recipe found) ─────────────────────
     Deliberately conservative: returns null (not a half-built recipe) when
     it can't find both an ingredients section and an instructions section,
     so the caller can steer to "try Photograph a page, or type it in"
     rather than presenting a guess as if it were reliable. */
  var LI_RE = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  var HEADING_RE = /<(h[1-6]|strong|b)[^>]*>\s*([^<]{2,40})\s*<\/\1>/gi;

  function stripNonContent(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");
  }

  // Finds the text between one heading matching `test` and the next heading
  // of any kind, then pulls every <li> inside that slice.
  function sectionListItems(html, test) {
    var headings = [];
    var m;
    HEADING_RE.lastIndex = 0;
    while ((m = HEADING_RE.exec(html))) headings.push({ index: m.index, end: m.index + m[0].length, text: m[2] });
    for (var i = 0; i < headings.length; i++) {
      if (!test(headings[i].text)) continue;
      var start = headings[i].end;
      var end = (i + 1 < headings.length) ? headings[i + 1].index : html.length;
      var slice = html.slice(start, end);
      var items = [];
      LI_RE.lastIndex = 0;
      var lm;
      while ((lm = LI_RE.exec(slice))) {
        var t = stripTags(lm[1]);
        if (t) items.push(t);
      }
      if (items.length) return items;
    }
    return [];
  }

  function extractHeuristic(html, sourceUrl) {
    var cleaned = stripNonContent(html);
    var titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    var title = titleMatch ? stripTags(titleMatch[1]) : "";

    var ingredientLines = sectionListItems(cleaned, function (t) { return /ingredients?/i.test(t); });
    var stepLines = sectionListItems(cleaned, function (t) { return /instructions?|directions?|method|steps?/i.test(t); });
    if (!ingredientLines.length || !stepLines.length) return null;

    return {
      title: title,
      description: "",
      image: "",
      base_serving: "",
      prep_time_mins: null,
      cook_time_mins: null,
      ingredients: ingredientLines.map(function (line) {
        var p2 = parseIngredientLine(line);
        return { quantity: p2.quantity, unit: p2.unit, item: p2.item, category: guessCategory(p2.item) };
      }),
      steps: stepLines.map(function (text) { return { title: "", detail: text }; }),
      macros: null,
      sourceUrl: sourceUrl || "",
      via: hostFromUrl(sourceUrl)
    };
  }

  /* ── entry point ───────────────────────────────────────────────────── */
  function parseFromHTML(html, sourceUrl) {
    var nodes = flattenJsonLdNodes(extractJsonLdBlocks(html));
    var recipeNode = findRecipeNode(nodes);
    if (recipeNode) {
      return { ok: true, via: "jsonld", recipe: normalizeRecipeFromJsonLd(recipeNode, sourceUrl) };
    }
    var heuristic = extractHeuristic(html, sourceUrl);
    if (heuristic) return { ok: true, via: "heuristic", recipe: heuristic };
    return { ok: false, via: null, recipe: null };
  }

  window.MCImport = {
    parseFromHTML: parseFromHTML,
    // exposed for tests
    extractJsonLdBlocks: extractJsonLdBlocks,
    flattenJsonLdNodes: flattenJsonLdNodes,
    findRecipeNode: findRecipeNode,
    normalizeRecipeFromJsonLd: normalizeRecipeFromJsonLd,
    parseIngredientLine: parseIngredientLine,
    guessCategory: guessCategory,
    parseISODuration: parseISODuration,
    extractHeuristic: extractHeuristic
  };
})();
