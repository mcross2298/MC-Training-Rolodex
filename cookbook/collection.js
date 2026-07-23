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
  function rgbFromHex(hex) {
    var h = (hex || "").replace("#", "");
    if (h.length !== 6) return "200,122,83";
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join(",");
  }
  // Authored accents range down to near-black; used as literal text/border color
  // on dark surfaces, so floor the lightness before it's ever set as a CSS var.
  function clampAccent(hex) {
    var h = (hex || "").replace("#", "");
    if (h.length !== 6) return hex || "#C87A53";
    var r = parseInt(h.substr(0, 2), 16) / 255;
    var g = parseInt(h.substr(2, 2), 16) / 255;
    var b = parseInt(h.substr(4, 2), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (l >= 0.45) return "#" + h;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var hue = 0;
    if (d !== 0) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60; if (hue < 0) hue += 360;
    }
    l = 0.45;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    var m = l - c / 2, rp, gp, bp;
    if (hue < 60) { rp = c; gp = x; bp = 0; }
    else if (hue < 120) { rp = x; gp = c; bp = 0; }
    else if (hue < 180) { rp = 0; gp = c; bp = x; }
    else if (hue < 240) { rp = 0; gp = x; bp = c; }
    else if (hue < 300) { rp = x; gp = 0; bp = c; }
    else { rp = c; gp = 0; bp = x; }
    function toHex(v) { var n = Math.round((v + m) * 255); return (n < 16 ? "0" : "") + n.toString(16); }
    return "#" + toHex(rp) + toHex(gp) + toHex(bp);
  }
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
  var DEFAULT_RECIPE_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="5" y="4" width="14" height="16" rx="2.4" fill="#F9F8F6"/>' +
      '<rect x="8" y="8" width="8" height="1.6" rx="0.8" fill="#2A2C2E" fill-opacity="0.55"/>' +
      '<rect x="8" y="11.4" width="8" height="1.6" rx="0.8" fill="#2A2C2E" fill-opacity="0.4"/>' +
      '<rect x="8" y="14.8" width="5" height="1.6" rx="0.8" fill="#2A2C2E" fill-opacity="0.3"/>' +
    "</svg>";
  var RECIPE_ICON_SVGS = {
    protein:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<ellipse cx="14.5" cy="9" rx="6" ry="5" fill="#F9F8F6"/>' +
        '<path d="M11 12.5c-2.6 2.1-5.4 4.9-6 6.9-.4 1.5.9 2.6 2.3 2 2-.8 4.6-3.4 6.6-6.2" fill="#F9F8F6"/>' +
        '<circle cx="6.2" cy="19.6" r="1.3" fill="#2A2C2E" fill-opacity="0.28"/>' +
      "</svg>",
    seafood:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<ellipse cx="10.5" cy="12" rx="7" ry="4.2" fill="#F9F8F6"/>' +
        '<path d="M17 9.5 21.5 6.5 19.5 12 21.5 17.5 17 14.5Z" fill="#F9F8F6"/>' +
        '<circle cx="6.8" cy="11" r="1" fill="#2A2C2E" fill-opacity="0.4"/>' +
      "</svg>",
    dairy:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M3 17.5 11 5 21 10.5 21 17.5Z" fill="#F9F8F6"/>' +
        '<circle cx="14" cy="12.5" r="1.1" fill="#2A2C2E" fill-opacity="0.3"/>' +
        '<circle cx="10.5" cy="15.5" r="0.9" fill="#2A2C2E" fill-opacity="0.3"/>' +
        '<circle cx="17" cy="15" r="0.8" fill="#2A2C2E" fill-opacity="0.3"/>' +
      "</svg>",
    heat:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M12 2c1.8 3 3.6 5 3.6 8.4a3.6 3.6 0 1 1-7.2 0c0-1 .3-1.8.7-2.6-.1 1.6.8 2 1.3 1 .5-1-.2-2 .2-3.8.5 1.4 1.4 1.6 1.4 0Z" fill="#F9F8F6"/>' +
        '<path d="M9 20c1.5.8 4.5.8 6 0-1 1.5-2 2-3 2s-2-.5-3-2Z" fill="#2A2C2E" fill-opacity="0.25"/>' +
      "</svg>",
    herb:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M12 21c0-8 2-13 8-16-1 7-3 12-8 16Z" fill="#F9F8F6"/>' +
        '<path d="M12 21c0-8-2-13-8-16 1 7 3 12 8 16Z" fill="#F9F8F6" fill-opacity="0.75"/>' +
        '<path d="M12 21V9" stroke="#2A2C2E" stroke-opacity="0.3" stroke-width="1.2"/>' +
      "</svg>",
    citrus:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9" fill="#F9F8F6"/>' +
        '<path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" stroke="#2A2C2E" stroke-opacity="0.22" stroke-width="1"/>' +
      "</svg>",
    berry:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<circle cx="9" cy="14" r="4" fill="#F9F8F6"/>' +
        '<circle cx="15" cy="14" r="4" fill="#F9F8F6"/>' +
        '<circle cx="12" cy="9.5" r="4" fill="#F9F8F6"/>' +
        '<path d="M12 5.5c1-1.5 2.5-2 4-1.7" stroke="#2A2C2E" stroke-opacity="0.3" stroke-width="1.3" stroke-linecap="round"/>' +
      "</svg>",
    vegetable:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M9 8c4-4 9-5.5 11-3.5S16 10 12 14Z" fill="#2A2C2E" fill-opacity="0.22"/>' +
        '<path d="M4 20c-1-4 1-9 5-11s7 1 6 5-7 8-11 6Z" fill="#F9F8F6"/>' +
      "</svg>",
    grain:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M3 11h18a9 6 0 0 1-18 0Z" fill="#F9F8F6"/>' +
        '<path d="M6 8c1-1.5 2-2 2-3.5M11 7c1-1.5 2-2 2-3.5M16 8c1-1.5 2-2 2-3.5" stroke="#2A2C2E" stroke-opacity="0.25" stroke-width="1.3" stroke-linecap="round"/>' +
      "</svg>",
    sauce:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M7 3h7l-1 5 4 3.5c2 1.7 1.6 5.5-2.5 6.5-4.5 1.1-9.5-1-9.5-5.5 0-2.5 1.5-4 3-5Z" fill="#F9F8F6"/>' +
        '<circle cx="12.5" cy="15" r="1" fill="#2A2C2E" fill-opacity="0.28"/>' +
      "</svg>",
    bread:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M4 13c0-5 3.6-8 8-8s8 3 8 8v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill="#F9F8F6"/>' +
        '<path d="M8 8.5v5M12 7.5v6M16 8.5v5" stroke="#2A2C2E" stroke-opacity="0.22" stroke-width="1.3" stroke-linecap="round"/>' +
      "</svg>",
    dessert:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M4 20 12 4l8 16Z" fill="#F9F8F6"/>' +
        '<path d="M7 14h10M8.5 17h7" stroke="#2A2C2E" stroke-opacity="0.22" stroke-width="1.3"/>' +
        '<circle cx="12" cy="4" r="1.1" fill="#2A2C2E" fill-opacity="0.3"/>' +
      "</svg>",
    egg:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M12 5c4 0 8 3 8 7.5S17 20 12 20 3 16 3 12.5C3 8.5 7 5 12 5Z" fill="#F9F8F6" fill-opacity="0.85"/>' +
        '<circle cx="13" cy="12" r="4" fill="#F9F8F6"/>' +
        '<circle cx="13" cy="12" r="4" fill="#2A2C2E" fill-opacity="0.12"/>' +
      "</svg>",
    drink:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M5 8h11v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" fill="#F9F8F6"/>' +
        '<path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" stroke="#F9F8F6" stroke-width="1.6" fill="none"/>' +
        '<path d="M8 5.5c.4-.8-.2-1.3 0-2M11.5 5.5c.4-.8-.2-1.3 0-2" stroke="#2A2C2E" stroke-opacity="0.25" stroke-width="1.1" stroke-linecap="round"/>' +
      "</svg>",
    bowl:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M3 10.5h18a9 7.5 0 0 1-18 0Z" fill="#F9F8F6"/>' +
        '<path d="M3 10.5a9 3 0 0 1 18 0" fill="#2A2C2E" fill-opacity="0.12"/>' +
      "</svg>",
    fruit:
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" style="display:block" aria-hidden="true">' +
        '<path d="M12 9c3.5-2 7 .3 7 4.5S15.5 21 12 21s-7-3.3-7-7.5S8.5 7 12 9Z" fill="#F9F8F6"/>' +
        '<path d="M12 9V5.5c1-1 2-1.2 3-1" stroke="#2A2C2E" stroke-opacity="0.3" stroke-width="1.3" stroke-linecap="round" fill="none"/>' +
      "</svg>"
  };
  // Every emoji actually authored across recipes-data.js's 226 recipes plus
  // CATEGORY_META/COLLECTIONS, grouped into the icon set above. A few
  // one-off novelty glyphs (🌈🌌🎉🤠💍🌀🌴) have no sensible food mapping and
  // are left out on purpose — they fall through to DEFAULT_RECIPE_ICON.
  var EMOJI_ICON_GROUP = {
    "🌶️": "heat", "🍯": "sauce", "🧀": "dairy", "🍋": "citrus", "🌮": "bread",
    "🥗": "bowl", "🍗": "protein", "🐟": "seafood", "🍤": "seafood", "🍫": "dessert",
    "🍓": "berry", "🥢": "grain", "🥩": "protein", "🍝": "grain", "🔥": "heat",
    "🧄": "herb", "🥪": "bread", "🫑": "vegetable", "🥣": "bowl", "🥑": "vegetable",
    "🍚": "grain", "🌯": "bread", "🌿": "herb", "🥦": "vegetable", "🍳": "egg",
    "🍕": "bread", "🧈": "dairy", "🫐": "berry", "🍪": "dessert", "🥔": "vegetable",
    "🧆": "protein", "🍖": "protein", "🥧": "dessert", "🍔": "bread", "🦐": "seafood",
    "🍲": "bowl", "🍜": "grain", "🍍": "fruit", "🥜": "vegetable", "🍅": "vegetable",
    "🌽": "vegetable", "🫘": "vegetable", "🥙": "bread", "🍰": "dessert", "🧂": "sauce",
    "🍊": "citrus", "🍁": "herb", "🧇": "bread", "🍛": "grain", "🌭": "bread",
    "🥬": "vegetable", "🥘": "bowl", "🎃": "vegetable", "🍌": "fruit", "🍨": "dessert",
    "🍎": "fruit", "🍭": "dessert", "🥭": "fruit", "🥟": "bread", "🍒": "berry",
    "🥨": "bread", "🍑": "fruit", "🥝": "fruit", "🦀": "seafood", "🦃": "protein",
    "🍠": "vegetable", "🍢": "protein", "🍩": "dessert", "🥕": "vegetable", "☕": "drink",
    "🍇": "fruit", "🫒": "vegetable", "🌱": "herb", "🍣": "seafood", "🥥": "fruit",
    "🥖": "bread", "🥡": "bowl", "🍦": "dessert", "🍱": "bowl"
  };
  function recipeIconHtml(icon) {
    if (!icon) return DEFAULT_RECIPE_ICON;
    var group = EMOJI_ICON_GROUP[icon];
    return group ? RECIPE_ICON_SVGS[group] : DEFAULT_RECIPE_ICON;
  }

  // Recipe cards have no photography — see cookbook-home.js's matching
  // cardPatternFor() for the full rationale. Deterministic per recipe_id so
  // the same card always gets the same texture, not a reshuffle on repaint.
  var CARD_PATTERNS = [
    { image: "repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 2px, transparent 2px 11px)", size: "auto" },
    { image: "radial-gradient(rgba(255,255,255,0.18) 1.4px, transparent 1.6px)", size: "14px 14px" },
    { image: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.10) 0 2px, transparent 2px 11px)", size: "auto" },
    { image: "repeating-linear-gradient(90deg, rgba(255,255,255,0.09) 0 2px, transparent 2px 12px)", size: "auto" }
  ];
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function cardPatternFor(recipeId) {
    return CARD_PATTERNS[hashStr(recipeId) % CARD_PATTERNS.length];
  }
  // Desyncs the ported category-card sheen sweep (see .rc-sheen) so a grid
  // of many recipe cards doesn't all flash in unison.
  function cardSheenDelay(recipeId) {
    return ((hashStr(recipeId) >>> 3) % 7) * 0.8 + "s";
  }

  /* ── Favorites store (same key as cookbook-home.js) ───────────────── */
  var FAV_KEY = "mc-cookbook:favorites";
  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function toggleFav(id) {
    var set = loadFavs();
    if (set.has(id)) set.delete(id); else set.add(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
    return set.has(id);
  }

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
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {}
    return meal;
  }
  function removeFromPlan(uid) {
    var p;
    try { p = JSON.parse(localStorage.getItem(PLAN_KEY) || "null"); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.meals)) return;
    p.meals = p.meals.filter(function (m) { return m.uid !== uid; });
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {}
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

  function collections() { return window.COLLECTIONS || []; }
  function recipes() { return window.RECIPES || []; }

  function pickCollection() {
    var id = new URLSearchParams(location.search).get("c");
    return collections().filter(function (c) { return c.id === id; })[0] || collections()[0] || null;
  }

  /* Search across title, tags and ingredient items. */
  function matches(r, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if ((r.title || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((r.tags || []).join(" ").toLowerCase().indexOf(q) >= 0) return true;
    var first = r.ingredients_by_serving &&
      r.ingredients_by_serving["serving_" + (r.native_serving || 2)];
    if (first && first.some(function (i) {
      return (i.item || "").toLowerCase().indexOf(q) >= 0;
    })) return true;
    return false;
  }

  // Compact bottom stat row for a recipe card — one authored serving's
  // Cal/Protein/Fat/Carbs, matching recipe.html's macro card exactly (no
  // division by serving count; see macrosFor() in cookbook.js).
  function macroStatsHtml(m) {
    var stats = [
      { cls: "cal", v: m.calories, label: "Cal" },
      { cls: "", v: m.protein_g, label: "Protein" },
      { cls: "", v: m.fat_g, label: "Fat" },
      { cls: "", v: m.carbs_g, label: "Carbs" }
    ].filter(function (s) { return s.v != null; });
    if (!stats.length) return "";
    return '<div class="rc-stats">' + stats.map(function (s) {
      return '<div class="rc-stat ' + s.cls + '">' +
        '<span class="rc-stat-num">' + Math.round(s.v) + "</span>" +
        '<span class="rc-stat-label">' + s.label + "</span></div>";
    }).join("") + "</div>";
  }

  function recipeCard(r, onChange) {
    var accent = clampAccent(r.accent || "#C87A53");
    var card = el("a", "rc");
    card.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
    card.style.setProperty("--rc-accent", accent);
    card.style.setProperty("--rc-accent-rgb", rgbFromHex(accent));
    var pattern = cardPatternFor(r.recipe_id);
    card.style.setProperty("--rc-pattern", pattern.image);
    card.style.setProperty("--rc-pattern-size", pattern.size);

    // macro_profiles are stored PER SINGLE SERVING and are identical across
    // every authored tier (see recipes-data.js / CLAUDE.md) — show them as-is,
    // the same way recipe.html's macro card does.
    var tier = (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
    var m = (r.macro_profiles && r.macro_profiles["serving_" + tier]) ||
      (r.macro_profiles && r.macro_profiles["serving_" + (r.native_serving || 2)]) || {};

    card.innerHTML =
      '<div class="rc-band">' +
        '<span class="rc-sheen" style="animation-delay:' + cardSheenDelay(r.recipe_id) + '"></span>' +
        '<span class="rc-icon">' + recipeIconHtml(r.icon) + "</span>" +
      "</div>" +
      '<div class="rc-body">' +
        '<h3 class="rc-title">' + esc(r.title) + "</h3>" +
        macroStatsHtml(m) +
      "</div>";

    var on = loadFavs().has(r.recipe_id);
    var heart = el("button", "fav-toggle" + (on ? " on" : ""), on ? "❤" : "♡");
    heart.type = "button";
    heart.setAttribute("aria-label", "Toggle favorite");
    heart.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var nowOn = toggleFav(r.recipe_id);
      heart.classList.toggle("on", nowOn);
      heart.textContent = nowOn ? "❤" : "♡";
      pop(heart);
    });
    card.appendChild(heart);

    // One-tap plan-add, stacked below the heart (see cookbook.js's matching
    // recipe-detail control for the full rationale).
    var planBtn = el("button", "plan-toggle", "+");
    planBtn.type = "button";
    planBtn.setAttribute("aria-label", "Add to This Week");
    var planBtnTimer = null;
    planBtn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var meal = addToPlan(r);
      planBtn.classList.add("added");
      planBtn.textContent = "✓";
      pop(planBtn);
      toast("Added “" + r.title + "” to This Week", "Undo", function () {
        removeFromPlan(meal.uid);
      });
      clearTimeout(planBtnTimer);
      planBtnTimer = setTimeout(function () {
        planBtn.classList.remove("added");
        planBtn.textContent = "+";
      }, 1800);
    });
    card.appendChild(planBtn);

    // "Mike's pick" star — the curated, shipped list (window.MIKES_FAVORITES)
    // reads here too, so a visitor sees Mike's picks while browsing a collection.
    if ((window.MIKES_FAVORITES || []).indexOf(r.recipe_id) >= 0) {
      card.classList.add("mikes-pick");
      var mb = el("span", "mikes-badge", "★");
      mb.setAttribute("aria-label", "Mike's pick");
      mb.title = "Mike's pick";
      card.appendChild(mb);
    }

    // User-authored recipes get a delete control so the personal library is
    // manageable. Removal updates the shared store + the live list.
    if (r.user && window.MCUser) {
      var del = el("button", "rc-delete", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Delete this recipe");
      del.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (window.confirm("Delete “" + r.title + "” from your recipes?")) {
          window.MCUser.remove(r.recipe_id);
          if (onChange) onChange();
        }
      });
      card.appendChild(del);
    }
    return card;
  }

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

      var shown = list.filter(function (r) { return matches(r, q); });
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
    paint();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
