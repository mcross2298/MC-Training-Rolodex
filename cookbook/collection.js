/* ==========================================================================
   collection.js  —  Phase 3
   --------------------------------------------------------------------------
   Renders collection.html?c=<id>: the recipe list for one COLLECTION, with a
   live search box (Tier 2). For a coming-soon collection it shows a friendly
   placeholder instead of a list — so all three Recipes-tab cards are tappable.

   Reuses the .rc recipe card and the ❤️ favorite store (mc-cookbook:favorites)
   so favoriting here shows up in the Home favorites list. No framework, no build.
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  // Retrigger a one-shot animation by removing the class, forcing reflow, re-adding.
  var pop = function (node) {
    node.classList.remove("pop");
    void node.offsetWidth;
    node.classList.add("pop");
  };
  // Authored accents range down to near-black; used as literal text/border color
  // on dark surfaces, so floor the lightness before it's ever set as a CSS var.
  // Recipe/category/collection icons used to be raw platform emoji, which
  // render differently per OS and clash with icon.svg's crafted look. Every
  // authored emoji maps to one of a small set of cream/ink line icons (same
  // two-tone palette as icon.svg) instead of the literal glyph; anything
  // without a mapping — a handful of one-off novelty emoji like 🎉 or 🤠 —
  // falls back to the book/page-lines glyph below rather than forcing a bad
  // match. Sized with width/height:1em so the same markup drops cleanly into
  // every context that used to size the emoji via font-size (.rc-icon at
  // 24px, .cat-icon at 32px, .plan-meal-icon/.plan-chip-icon at their own
  // sizes) with no separate icon set needed per size.
  /* Recipe-card rendering lives in mc-cards.js (audit C-07) — this file used
     to carry a byte-identical copy of the icon table and accent helpers, and
     a second, drifting copy of the card itself. Aliases keep the existing
     call sites unchanged; configureCards() below supplies this page's
     behavior (its own plan store + toast, the user-recipe delete control,
     and the flat "Toggle favorite" heart label it has always used). */
  var clampAccent    = MCCards.clampAccent;
  var rgbFromHex     = MCCards.rgbFromHex;
  var hashStr        = MCCards.hashStr;
  var cardPatternFor = MCCards.cardPatternFor;
  var cardSheenDelay = MCCards.cardSheenDelay;
  var recipeIconHtml = MCCards.recipeIconHtml;
  var macroStatsHtml = MCCards.macroStatsHtml;
  function recipeCard(r, onChange) {
    return MCCards.recipeCard(r, {
      onChange: onChange, allowDelete: true, favLabels: false
    });
  }


  // Recipe cards have no photography — see cookbook-home.js's matching
  // cardPatternFor() for the full rationale. Deterministic per recipe_id so
  // the same card always gets the same texture, not a reshuffle on repaint.
  // Desyncs the ported category-card sheen sweep (see .rc-sheen) so a grid
  // of many recipe cards doesn't all flash in unison.

  /* ── Favorites store (same key as cookbook-home.js) ───────────────── */
  // The favorites store itself is mc-fav.js (audit C-07).
  var FAV_KEY = MCFav.KEY;
  function loadFavs()    { return MCFav.load(); }
  function toggleFav(id) { return MCFav.toggle(id); }

  /* ── This Week planner (shared store with cookbook-home.js) ────────
     collection.html doesn't load cookbook-home.js, so this mirrors just
     enough of its addMeal() shape to add a recipe unscheduled — the
     planner's own "Add a meal" flow still owns day/slot assignment. */
  var PLAN_KEY = "mc-cookbook:mealplan";
  function addToPlan(r) {
    var p;
    try { p = JSON.parse(localStorage.getItem(PLAN_KEY) || "null"); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.meals)) p = { meals: [] };
    var serving = (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
    var meal = {
      uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      id: r.recipe_id, serving: serving, day: null, slot: null,
      completed: false, completedAt: null
    };
    p.meals.push(meal);
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(p));
    } catch (e) {
      // mc-cards.js's shared plan button treats a falsy return as "the write
      // failed, don't show Added ✓" — matches cookbook.js's addToPlan.
      warnStorageFull();
      return null;
    }
    return meal;
  }
  function removeFromPlan(uid) {
    var p;
    try { p = JSON.parse(localStorage.getItem(PLAN_KEY) || "null"); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.meals)) return;
    p.meals = p.meals.filter(function (m) { return m.uid !== uid; });
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) { warnStorageFull(); }
  }

  // Same toast look as cookbook.js's/cookbook-home.js's, with an optional
  // action button for "Undo".
  function toast(msg, actionLabel, onAction) {
    var t = el("div", "mc-toast");
    t.appendChild(el("span", "mc-toast-msg", esc(msg)));
    if (actionLabel) {
      var btn = el("button", "mc-toast-btn", esc(actionLabel));
      btn.type = "button";
      btn.addEventListener("click", function () {
        onAction();
        t.classList.remove("show");
        setTimeout(function () { t.remove(); }, 300);
      });
      t.appendChild(btn);
    }
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, actionLabel ? 5000 : 3200);
  }

  /* ── Storage-full warning (audit VOC/VOA wave 7) ──────────────────────
     Same gap as cookbook.js: cookbook-home.js's C-12 fix only wired
     MCFav.onWriteFail / MCTimers.onWriteFail on the shell, so a full quota
     on this page silently swallowed a heart tap or a running timer's
     write with no signal at all. Same one-shot-per-session shape. */
  var storageWarned = false;
  function warnStorageFull() {
    if (storageWarned) return;
    storageWarned = true;
    toast("Storage is full — that change didn't save. Remove some cook-log photos to free space.");
  }

  /* ── Detail-shard arrival (CI initiative 5) ───────────────────────────
     The grid paints from recipes-index.js; ingredients arrive a moment later
     in mc-data.js's shards. Two things here read them — the search box matches
     ingredient names, and the card's low-shopping count reads the whole list —
     so the screen's own paint() is re-run in place when they land. In place,
     not a re-render: rebuilding would discard a half-typed query. */
  var detailRepaint = null;
  function onDetailReady(fn) { detailRepaint = fn; }

  function collections() { return window.COLLECTIONS || []; }
  function recipes() { return window.RECIPES || []; }

  function pickCollection() {
    var id = new URLSearchParams(location.search).get("c");
    return collections().filter(function (c) { return c.id === id; })[0] || collections()[0] || null;
  }

  // CI initiative 4: ranked, tokenized, bounded-fuzz search (mc-search.js),
  // replacing the old indexOf-over-three-fields substring scan — same gap
  // this had as the shell's Browse screen, fixed the same way. Returns a
  // ranked ARRAY, not a boolean, so best-match-first replaces filter-in-
  // array-order within this collection's own recipe list.

  // Compact bottom stat row for a recipe card — one authored serving's
  // Cal/Protein/Fat/Carbs, matching recipe.html's macro card exactly (no
  // division by serving count; see macrosFor() in cookbook.js).


  /* ── Desserts: "similar desserts" grouping ───────────────────────────
     Desserts collection only. Groups the current (subtab-filtered) list
     into clusters of 2-3 recipes that share several ingredients, so
     browsing 28+ sweets surfaces the ones worth comparing side by side
     instead of one long flat list. Reuses the same ingredient-identity
     keying cookbook-home.js's Smart Week overlap scoring uses (category +
     lowercased item name), just applied here as pure similarity instead
     of a planner bonus. Anything that doesn't cluster still shows, under
     a "More Desserts" divider — nothing is hidden. */
  var DESSERT_CLUSTER_MIN_SHARED = 3;
  function dessertIngredientEntries(r) {
    var by = r.ingredients_by_serving || {};
    var list = by[Object.keys(by)[0]] || [];
    var map = {};
    list.forEach(function (ing) {
      var item = (ing.item || "").trim();
      if (!item) return;
      var key = (ing.category || "Other") + "|" + item.toLowerCase();
      if (!map[key]) map[key] = item;
    });
    return map;
  }
  function sharedKeyCount(a, b) {
    var n = 0;
    Object.keys(a).forEach(function (k) { if (b[k]) n++; });
    return n;
  }
  // Names the cluster after ingredients common to every member; falls back
  // to the seed pair's overlap, then a generic label, so it never breaks.
  function dessertClusterLabel(members) {
    var maps = members.map(dessertIngredientEntries);
    var common = Object.keys(maps[0]).filter(function (k) {
      return maps.every(function (m) { return m[k]; });
    });
    if (!common.length && maps.length > 1) {
      common = Object.keys(maps[0]).filter(function (k) { return maps[1][k]; });
    }
    if (!common.length) return "🔗 Similar Desserts";
    return "🔗 Similar · " + common.slice(0, 2).map(function (k) { return maps[0][k]; }).join(", ");
  }
  // Greedy pairing: each unclustered recipe grabs up to 2 unclustered
  // recipes that share the most ingredients with it (min threshold above).
  // Whatever's left over is a "single" and renders in the flat list as usual.
  function buildDessertClusters(items) {
    var entries = {};
    items.forEach(function (r) { entries[r.recipe_id] = dessertIngredientEntries(r); });
    var remaining = items.slice();
    var clusters = [], singles = [];
    while (remaining.length) {
      var seed = remaining.shift();
      var ranked = remaining
        .map(function (r) { return { r: r, n: sharedKeyCount(entries[seed.recipe_id], entries[r.recipe_id]) }; })
        .filter(function (m) { return m.n >= DESSERT_CLUSTER_MIN_SHARED; })
        .sort(function (a, b) { return b.n - a.n; })
        .slice(0, 2);
      if (ranked.length) {
        ranked.forEach(function (m) { remaining.splice(remaining.indexOf(m.r), 1); });
        clusters.push([seed].concat(ranked.map(function (m) { return m.r; })));
      } else {
        singles.push(seed);
      }
    }
    return { clusters: clusters, singles: singles };
  }
  function renderDessertGroups(grid, items, onChange) {
    var built = buildDessertClusters(items);
    built.clusters.forEach(function (members) {
      grid.appendChild(el("p", "cluster-label", esc(dessertClusterLabel(members))));
      members.forEach(function (r) { grid.appendChild(recipeCard(r, onChange)); });
    });
    if (built.singles.length) {
      if (built.clusters.length) {
        grid.appendChild(el("p", "cluster-label cluster-label-more", "More Desserts"));
      }
      built.singles.forEach(function (r) { grid.appendChild(recipeCard(r, onChange)); });
    }
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  function init() {
    // This page's half of the shared card's behavior (audit C-07). The shell
    // configures the same hooks with its own planner and curation gestures;
    // neither side needs to know the other exists.
    MCCards.configure({
      // The curated, shipped list reads here too, so a visitor sees Mike's
      // picks while browsing a collection.
      isMikePick: function (id) { return (window.MIKES_FAVORITES || []).indexOf(id) >= 0; },
      mikesBadge: function () {
        var mb = el("span", "mikes-badge", "★");
        mb.setAttribute("aria-label", "Mike's pick");
        mb.title = "Mike's pick";
        return mb;
      },
      addToPlan: function (r) { return addToPlan(r); },
      removeFromPlan: removeFromPlan,
      toast: toast
    });

    var c = pickCollection();
    var top = $("#top"), grid = $("#grid"), searchWrap = $("#searchWrap");

    if (!c) {
      top.innerHTML = '<a class="col-back" href="index.html#recipes">‹ Recipes</a>' +
        '<h1 class="col-title">Collection not found</h1>';
      return;
    }

    // Global override is intentional here, same reasoning as cookbook.js:
    // collection.html themes exactly one collection per page load, unlike
    // cookbook-home.js's multi-card grids which need per-card scoped vars.
    var pageAccent = clampAccent(c.accent);
    document.documentElement.style.setProperty("--accent", pageAccent);
    document.documentElement.style.setProperty("--accent-rgb", rgbFromHex(pageAccent));
    document.title = c.title + " · Mike's Cookbook";

    // Recompute on demand so deletes (user recipes) reflect immediately.
    function currentList() {
      return (c.status === "live" && c.source_match)
        ? recipes().filter(function (r) { return r.source === c.source_match; })
        : [];
    }
    var list = currentList();

    function paintHead() {
      var n = currentList().length;
      top.innerHTML =
        '<a class="col-back" href="index.html#recipes">‹ Recipes</a>' +
        '<h1 class="col-title">' + esc(c.title) + "</h1>" +
        '<p class="col-sub">' + esc(c.tag.replace(/^★\s*/, "")) +
          (n ? " · " + n + " recipes" : "") + "</p>";
    }
    paintHead();

    // Coming-soon collections: friendly placeholder, no list / search.
    if (c.status !== "live") {
      searchWrap.innerHTML = "";
      grid.className = "";
      grid.innerHTML = "";
      grid.appendChild(el("div", "empty",
        '<span class="empty-emoji">' + esc(c.icon || "🍽️") + "</span>" +
        "<strong>" + esc(c.title) + "</strong> is coming soon.<br>" +
        esc(c.blurb)));
      return;
    }

    // Live: search box + grid.
    var box = el("input", "search-box");
    box.type = "search";
    box.placeholder = "Search " + c.title + "…";
    box.setAttribute("aria-label", "Search recipes");
    searchWrap.appendChild(box);

    // Sub-tabs (optional): a collection can define c.subsections to split its
    // list into an "All" tab plus one tab per subsection key. A recipe with no
    // matching subsection only shows under "All". No-op for collections that
    // don't define subsections — everything renders exactly as before.
    var activeSub = "";
    var subtabButtons = [];
    if (c.subsections && c.subsections.length) {
      var subtabsBar = el("div", "subtabs");
      [{ key: "", label: "All" }].concat(c.subsections).forEach(function (t) {
        var btn = el("button", "subtab" + (t.key === activeSub ? " active" : ""), esc(t.label));
        btn.type = "button";
        btn.addEventListener("click", function () {
          if (activeSub === t.key) return;
          activeSub = t.key;
          subtabButtons.forEach(function (b) { b.el.classList.toggle("active", b.key === activeSub); });
          paint();
        });
        subtabButtons.push({ key: t.key, el: btn });
        subtabsBar.appendChild(btn);
      });
      searchWrap.parentNode.insertBefore(subtabsBar, searchWrap.nextSibling);
      // .col-top is also sticky at top:0; offset the tab bar by its rendered
      // height so the two stack instead of overlapping when both are stuck.
      var positionSubtabs = function () { subtabsBar.style.top = top.offsetHeight + "px"; };
      positionSubtabs();
      window.addEventListener("resize", positionSubtabs);
    }

    function paint() {
      var q = box.value.trim();
      grid.innerHTML = "";
      list = currentList();
      if (activeSub) list = list.filter(function (r) { return r.subsection === activeSub; });
      paintHead();

      // A live collection with nothing in it yet (e.g. "My Recipes" before you
      // add anything): show a friendly invitation rather than a "no match".
      if (!list.length && !q) {
        var empty = el("div", "empty",
          '<span class="empty-emoji">' + esc(c.icon || "🍽️") + "</span>" +
          "No recipes here yet.<br>" +
          (c.source_match === (window.MCUser && window.MCUser.SOURCE)
            ? "Tap <b>Add Recipe</b> on the Home screen to start your library."
            : esc(c.blurb)));
        if (c.source_match === (window.MCUser && window.MCUser.SOURCE)) {
          var add = el("a", "cook-start", "＋ Add a recipe");
          add.href = "index.html#home";
          empty.appendChild(add);
        }
        grid.appendChild(empty);
        return;
      }

      var shown = q ? MCSearch.search(q, list) : list;
      if (!shown.length) {
        grid.appendChild(el("div", "empty",
          '<span class="empty-emoji">🔍</span>No recipes match “' + esc(q) + "”."));
        return;
      }
      if (c.id === "desserts" && !q) {
        renderDessertGroups(grid, shown, paint);
      } else {
        shown.forEach(function (r) { grid.appendChild(recipeCard(r, paint)); });
      }
    }
    box.addEventListener("input", paint);
    onDetailReady(paint);
    paint();
  }

  // A timer started while cooking stays visible if the cook wanders back out
  // to a collection to look something up mid-recipe. Mounted outside init()
  // because init() returns early for a coming-soon collection, and the rail
  // has nothing to do with which collection this is.
  function boot() {
    init();
    // A full quota shouldn't silently swallow a heart or a timer (audit
    // VOC/VOA wave 7 — see warnStorageFull() above).
    MCFav.onWriteFail = warnStorageFull;
    MCTimers.onWriteFail = warnStorageFull;
    // Collection pages filter on ingredients too (the search box matches
    // ingredient names, and the low-shopping count reads the whole list), so
    // they need the detail shards — just not before the grid can paint.
    MCData.ensureAll().then(function (ok) { if (ok && detailRepaint) detailRepaint(); });
    MCTimers.configure({
      onJump: function (t) {
        if (t.recipeId) location.href = "recipe.html?id=" + encodeURIComponent(t.recipeId) + "&cook=1";
      }
    });
    MCTimers.mountRail();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
