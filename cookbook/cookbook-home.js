/* ==========================================================================
   cookbook-home.js  —  Phase 3 (Home-hub shell)
   --------------------------------------------------------------------------
   Drives index.html as a hub-and-spoke PWA shell — no bottom tab bar. Home is
   the hub; you tap a module to drill into a spoke screen, and every spoke has
   a "‹ Home" anchor back:

     Home        — hub: "This Week" planner hero + tappable Categories /
                   Recipes / Favorites modules.
     This Week   — the weekly meal planner. Build a week of meals as a flat
                   list or an optional 7-day × Breakfast/Lunch/Dinner schedule,
                   then get one smart-merged grocery list and the week's
                   recipes — all in the module (localStorage).
     Categories  — the 7 dish-type categories as premium cards. Tapping a
                   category drills into a grid of that category's recipes.
     Recipes     — flagship COLLECTION cards + app-wide search.
     Favorites   — recipes the user ❤'d (localStorage).

   The two standalone deep pages (recipe.html / collection.html) get a single
   persistent Home button from cookbook-nav.js. Active screen is mirrored to
   location.hash (#recipes) so it survives reloads and deep links.
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
  function rgbFromHex(hex) {
    var h = (hex || "").replace("#", "");
    if (h.length !== 6) return "200,122,83";
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join(",");
  }
  // Authored accents range down to near-black; used as literal text/border color
  // on dark surfaces (tags, labels, icons), so floor the lightness before it's
  // ever set as a CSS var — otherwise a dark accent goes illegible.
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

  // Recipe cards have no photography — recipes-data.js has no image field,
  // and the detail page's own cover photo is opt-in/user-uploaded, so most
  // cards never get one. A deterministic (same recipe → same pattern every
  // render) subtle texture over the existing accent band gives each card
  // some visual distinction beyond "same tile, different title," without a
  // photo pipeline. Four patterns is enough variety to read as "textured,"
  // not so many it looks random/noisy across a grid.
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
  // of many recipe cards doesn't all flash in unison — same hash source as
  // the pattern above, just a different modulus.
  function cardSheenDelay(recipeId) {
    return ((hashStr(recipeId) >>> 3) % 7) * 0.8 + "s";
  }

  // Retrigger a one-shot animation: drop the class, force reflow, re-add.
  var pop = function (node) {
    node.classList.remove("pop");
    void node.offsetWidth; // eslint-disable-line no-unused-expressions
    node.classList.add("pop");
  };
  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  function emptyState(emoji, html) {
    return el("div", "empty", '<span class="empty-emoji">' + emoji + "</span>" + html);
  }

  function recipes() { return window.RECIPES || []; }
  function collections() { return window.COLLECTIONS || []; }
  function recipesIn(col) {
    if (!col.source_match) return [];
    return recipes().filter(function (r) { return r.source === col.source_match; });
  }

  /* ── Favorites (shared store, also read by collection.js / recipe page) ── */
  var FAV_KEY = "mc-cookbook:favorites";
  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveFavs(set) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  function toggleFav(id) {
    var set = loadFavs();
    if (set.has(id)) set.delete(id); else set.add(id);
    saveFavs(set);
    return set.has(id);
  }

  function recipeById(id) {
    return recipes().filter(function (r) { return r.recipe_id === id; })[0] || null;
  }

  /* ── Mike's Favorites (curated, shipped to EVERYONE) ──────────────────
     Distinct from personal ❤ favorites (per-device, mc-cookbook:favorites).
     The published list ships in recipes-data.js (window.MIKES_FAVORITES) and
     is identical for every visitor. Owner mode lets Mike edit a LOCAL DRAFT
     that overlays the published list on his own device; "Copy list" emits the
     array to paste back into the data file — that commit is the publish step. */
  var MIKE_DRAFT_KEY = "mc-cookbook:mikesFavorites:draft";
  function publishedMikes() { return (window.MIKES_FAVORITES || []).slice(); }
  function loadMikeDraft() {
    try {
      var raw = localStorage.getItem(MIKE_DRAFT_KEY);
      if (raw == null) return null;            // no draft → display the published list
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }
  function saveMikeDraft(list) {
    try { localStorage.setItem(MIKE_DRAFT_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function clearMikeDraft() { try { localStorage.removeItem(MIKE_DRAFT_KEY); } catch (e) {} }
  // The list to DISPLAY: an owner's in-progress draft overlays the published one.
  function mikesList() {
    var d = loadMikeDraft();
    return d != null ? d : publishedMikes();
  }
  function isMikeFav(id) { return mikesList().indexOf(id) >= 0; }
  function toggleMikeFav(id) {
    var list = mikesList().slice();
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    saveMikeDraft(list);
    return list.indexOf(id) >= 0;
  }
  // "Dirty" = the local draft differs from what currently ships in the repo.
  function mikeDraftDirty() {
    var d = loadMikeDraft();
    if (d == null) return false;
    var pub = publishedMikes();
    if (d.length !== pub.length) return true;
    for (var i = 0; i < d.length; i++) if (d[i] !== pub[i]) return true;
    return false;
  }
  // The exact JS snippet Mike pastes into recipes-data.js to publish his list.
  function mikeExportText() {
    var lines = mikesList().map(function (id) { return '  "' + id + '"'; }).join(",\n");
    return "const MIKES_FAVORITES = [\n" + lines + "\n];";
  }

  /* ── Owner mode (hidden) ──────────────────────────────────────────────
     A public site can't truly authenticate Mike, so owner mode is a quiet,
     device-local unlock: visit with ?owner=1 (or tap the "Mike's" title 5×).
     It only enables the curation UI on THIS device; visitors never see it. */
  var OWNER_KEY = "mc-cookbook:owner";
  function isOwner() {
    try { return localStorage.getItem(OWNER_KEY) === "1"; } catch (e) { return false; }
  }
  function setOwner(on) {
    try {
      if (on) localStorage.setItem(OWNER_KEY, "1");
      else localStorage.removeItem(OWNER_KEY);
    } catch (e) {}
  }
  // Honor ?owner=1 / ?owner=0 in the URL — a shareable bookmark for Mike.
  function syncOwnerFromUrl() {
    var m = location.search.match(/[?&]owner=([01])(?:&|$)/);
    if (m) setOwner(m[1] === "1");
  }
  // Hidden unlock: 5 quick taps on the "Mike's" eyebrow toggles owner mode.
  function wireOwnerUnlock(node) {
    var taps = 0, timer = null;
    node.addEventListener("click", function () {
      taps++;
      clearTimeout(timer);
      timer = setTimeout(function () { taps = 0; }, 1200);
      if (taps >= 5) {
        taps = 0;
        var on = !isOwner();
        setOwner(on);
        window.alert(on
          ? "Owner mode on. Double-tap recipe cards to curate Mike's Favorites."
          : "Owner mode off.");
        setTab("home");
      }
    });
  }
  function mikesBadge() {
    var b = el("span", "mikes-badge", "★");
    b.setAttribute("aria-label", "Mike's pick");
    b.title = "Mike's pick";
    return b;
  }

  /* ══ WEEKLY MEAL PLANNER — data layer ═══════════════════════════════ */
  // The plan is a flat list of meal instances. Each instance is a chosen
  // recipe at a serving tier, optionally tagged with a day + meal-type slot.
  // The flat list is the default view; the day/slot tags drive the optional
  // Schedule view. The same meal set always feeds the grocery list + recipes,
  // so "structure" only changes how meals are organized, not what you buy.
  var PLAN_KEY    = "mc-cookbook:mealplan";          // { meals: [ {uid,id,serving,day,slot} ] }
  var GROC_KEY    = "mc-cookbook:mealplan:grocery"; // [ checked merge-keys ]
  var HISTORY_KEY = "mc-cookbook:mealplan:history"; // [ { savedAt, label, meals } ]
  var CUSTOM_KEY  = "mc-cookbook:mealplan:custom";  // [ { uid, text, done } ]
  var AUTODRAFT_DISMISS_KEY = "mc-cookbook:mealplan:autodraft-dismissed"; // timestamp (ms)
  var AUTODRAFT_COOLDOWN_MS = 7 * 86400000;
  var DAYS      = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DAY_LONG  = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday"
  };
  var SLOTS     = ["Breakfast", "Lunch", "Dinner"];

  /* ── Meal-slot classifier (feeds Smart Week generation) ──────────────
     Maps a recipe's dish_category to the SLOTS it's eligible to fill.
     Condiment/component categories (Desserts, Marinades, Salsas & Dips,
     Sauces) aren't standalone meals, so they map to no slots and are never
     picked by Smart Week. A quick Skillets & Stir-Fries recipe (<=20 min
     total) also flexes into Lunch on top of its Dinner base. */
  var MEAL_SLOT_MAP = {
    "Breakfast":             ["Breakfast"],
    "Sandwiches":            ["Lunch"],
    "Salads & Slaws":        ["Lunch", "Dinner"],
    "Soups, Stews & Chilis": ["Lunch", "Dinner"],
    "Casseroles & Bakes":    ["Dinner"],
    "Skillets & Stir-Fries": ["Dinner"],
    "Grilled & Sheet-Pan":   ["Dinner"]
  };
  var QUICK_LUNCH_MAX_MINS = 20;
  function totalTimeMins(r) { return (r && (r.prep_time_mins || 0) + (r.cook_time_mins || 0)) || 0; }
  function classifyMealSlots(r) {
    var base = MEAL_SLOT_MAP[r && r.dish_category];
    if (!base) return [];
    var slots = base.slice();
    if (slots.indexOf("Dinner") >= 0 && slots.indexOf("Lunch") < 0) {
      var t = totalTimeMins(r);
      if (t > 0 && t <= QUICK_LUNCH_MAX_MINS) slots.push("Lunch");
    }
    return slots;
  }
  function isMealEligible(r, slot) {
    return classifyMealSlots(r).indexOf(slot) >= 0;
  }
  function mealEligibleRecipes(slot) {
    return recipes().filter(function (r) { return isMealEligible(r, slot); });
  }

  function loadPlan() {
    try {
      var p = JSON.parse(localStorage.getItem(PLAN_KEY) || "{}") || {};
      if (!Array.isArray(p.meals)) p.meals = [];
      if (!("startedAt" in p)) p.startedAt = null;
      if (!("day7Dismissed" in p)) p.day7Dismissed = false;
      backfillMealSnapshots(p);
      return p;
    } catch (e) { return { meals: [], startedAt: null, day7Dismissed: false }; }
  }
  // Self-heal meal entries missing their {title,icon,macros} bridge snapshot
  // (e.g. restored from an older export/import predating mealSnapshot, or any
  // future write path that skips it). The workout app never loads
  // recipes-data.js, so a snapshot-less entry shows as a bare "Planned meal"
  // with no macros and a disabled Log button there, even though this app can
  // resolve the real recipe fine. Runs on every plan load; only re-saves (and
  // so only re-syncs to Supabase) when something actually changed.
  function backfillMealSnapshots(p) {
    var changed = false;
    p.meals.forEach(function (m) {
      if (m.macros) return;
      var snap = mealSnapshot(m.id, m.serving);
      if (!snap.macros) return;   // recipe genuinely unresolvable — leave as-is
      m.title = snap.title; m.icon = snap.icon; m.macros = snap.macros;
      changed = true;
    });
    if (changed) savePlan(p);
  }
  // Auto-stamps startedAt the moment a plan first gets meals, and clears it
  // (plus the day-7 dismissal flag) once the plan empties out, so a fresh
  // plan always gets its own 7-day window for the day-7 archive prompt.
  function savePlan(p) {
    if (p.meals && p.meals.length) {
      if (!p.startedAt) {
        p.startedAt = new Date().toISOString();
        // A manually-built plan means the auto-draft offer (Home) is moot
        // until the plan empties out again — clear any standing dismissal.
        clearAutoDraftDismiss();
        homeAutoDraftGrid = null;
      }
    } else {
      p.startedAt = null;
      p.day7Dismissed = false;
    }
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {}
    updateAppBadge();   // every plan mutation funnels through here
  }
  // Home's auto-drafted-week offer (see renderAutoDraftCard): only offered
  // when the plan is empty, and dismissing it snoozes the offer for ~7 days
  // or until the plan changes (savePlan clears the dismissal above).
  var homeAutoDraftGrid = null;
  function loadAutoDraftDismissedAt() {
    try { return parseInt(localStorage.getItem(AUTODRAFT_DISMISS_KEY) || "0", 10) || 0; }
    catch (e) { return 0; }
  }
  function dismissAutoDraft() {
    try { localStorage.setItem(AUTODRAFT_DISMISS_KEY, String(Date.now())); } catch (e) {}
  }
  function clearAutoDraftDismiss() {
    try { localStorage.removeItem(AUTODRAFT_DISMISS_KEY); } catch (e) {}
  }
  function homeAutoDraftEligible() {
    if (planMeals().length) return false;
    var at = loadAutoDraftDismissedAt();
    return !(at > 0 && (Date.now() - at) < AUTODRAFT_COOLDOWN_MS);
  }
  function newUid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  // Not every recipe authors a serving_2 tier (batch-yield recipes author
  // just one serving_N matching native_serving/scaling_options — see
  // CLAUDE.md's "Serving ladder"). Defaulting blindly to 2 left recipes like
  // a serving_4-only or serving_1-only dish with an unresolvable
  // ingredients_by_serving lookup, silently dropping them from the grocery
  // list. Fall back to an authored tier for that recipe instead.
  function defaultServingFor(id) {
    var r = recipeById(id);
    if (!r) return 2;
    return (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
  }
  // Roadmap B1 (cookbook->workout bridge) — a denormalized {title,icon,macros}
  // snapshot stored ON each meal entry, not just its recipe_id. The workout
  // app pulls mc-cookbook:mealplan read-only (see mc-bridge.js) but never
  // loads recipes-data.js, so without this snapshot it could show a bare
  // recipe id and nothing else. macro_profiles are per single serving and
  // identical across every authored tier (CLAUDE.md "Serving ladder"), so a
  // snapshot never goes stale even if the meal's serving count changes later.
  // Shared tier resolution: NOT every recipe authors a serving_2 tier (batch-
  // yield/single-serving recipes author just one serving_N matching
  // native_serving/scaling_options — see CLAUDE.md's "Serving ladder").
  // mealMacros()/computeWeekMacros() below used to hardcode
  // r.macro_profiles.serving_2 directly — for a serving_1-only recipe (e.g.
  // Baked Berry Protein Breakfast Bowl, Buffalo Ranch Turkey Burrito Bowl,
  // Chicken Fajita Sweet Potato Bowl) that resolved to {} and silently logged
  // 0 kcal/0g everything. Centralized here so every macro consumer falls back
  // the same way mealSnapshot always has.
  function perServingMacroTier(r, serving) {
    if (!r || !r.macro_profiles) return null;
    var tier = serving || defaultServingFor(r.recipe_id);
    return r.macro_profiles["serving_" + tier] ||
      r.macro_profiles["serving_" + (r.native_serving || 2)] || null;
  }
  // Normalize recipes-data.js's field names (calories/protein_g/fat_g/carbs_g)
  // to the {kcal,p,f,c} shape mc_macros_v1 entries already use natively, so
  // the workout side (mc-bridge.js) can pass this straight into an addEntry()
  // `per:` field with zero further translation. macro_profiles values are
  // already per SINGLE serving and identical across every authored tier
  // (CLAUDE.md "Serving ladder") — never scale these by meal.serving.
  function macrosFromTier(m) {
    return m ? {
      kcal: Math.round(m.calories || 0), p: Math.round(m.protein_g || 0),
      f: Math.round(m.fat_g || 0), c: Math.round(m.carbs_g || 0)
    } : null;
  }
  function mealSnapshot(id, serving) {
    var r = recipeById(id);
    if (!r) return { title: null, icon: null, macros: null };
    var macros = macrosFromTier(perServingMacroTier(r, serving));
    return { title: r.title || null, icon: r.icon || null, macros: macros };
  }
  function addMeal(id, opts) {
    opts = opts || {};
    var p = loadPlan();
    var serving = opts.serving || defaultServingFor(id);
    var meal = Object.assign({
      uid: newUid(), id: id,
      serving: serving,
      day: opts.day || null,
      slot: opts.slot || null,
      completed: false,
      completedAt: null
    }, mealSnapshot(id, serving));
    p.meals.push(meal);
    savePlan(p);
    return meal;
  }
  function updateMeal(uid, patch) {
    var p = loadPlan();
    p.meals.forEach(function (m) { if (m.uid === uid) { for (var k in patch) m[k] = patch[k]; } });
    savePlan(p);
  }
  function removeMeal(uid) {
    var p = loadPlan();
    p.meals = p.meals.filter(function (m) { return m.uid !== uid; });
    savePlan(p);
  }
  // Re-inserts a previously-removed meal object as-is (same uid/serving/day/
  // slot/completed state) — powers the "Removed — Undo" toast on removeBtn.
  function restoreMeal(meal) {
    var p = loadPlan();
    p.meals.push(meal);
    savePlan(p);
  }
  function clearPlan() { savePlan({ meals: [] }); }
  function planMeals() { return loadPlan().meals; }
  function planRecipeIds() {                          // unique recipe ids, first-seen order
    var seen = {}, out = [];
    planMeals().forEach(function (m) { if (!seen[m.id]) { seen[m.id] = 1; out.push(m.id); } });
    return out;
  }

  /* ── Grocery check-off store ──────────────────────────────────────── */
  function loadGroc() {
    try { return new Set(JSON.parse(localStorage.getItem(GROC_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveGroc(set) {
    try { localStorage.setItem(GROC_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }

  /* ── Cook log (shared with the recipe detail page's "I Cooked This") ───
     Drives "made recently" awareness in the planner picker and Smart Week's
     repeat-avoidance. Entries may be bare ISO strings (legacy) or
     { at, photo } objects. The planner also *writes* here now (see
     toggleMealCompleted) so Smart Week gets a recency signal even from
     users who never open the recipe detail page. */
  var COOKED_KEY = "mc-cookbook:cooked";
  function loadCookedMap() {
    try { var o = JSON.parse(localStorage.getItem(COOKED_KEY) || "{}"); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
    catch (e) { return {}; }
  }
  function saveCookedMap(map) {
    try { localStorage.setItem(COOKED_KEY, JSON.stringify(map)); } catch (e) {}
  }
  // Mirrors cookbook.js's logCooked/removeCooked. Returns the ISO timestamp
  // used, so the caller can stash it on the meal and remove exactly this
  // entry later without touching any recipe-page-authored history.
  function logCookEntry(id) {
    var map = loadCookedMap();
    var at = new Date().toISOString();
    if (!Array.isArray(map[id])) map[id] = [];
    map[id].push({ at: at, photo: null });
    saveCookedMap(map);
    return at;
  }
  function removeCookEntry(id, at) {
    var map = loadCookedMap();
    if (!Array.isArray(map[id])) return;
    map[id] = map[id].filter(function (e) {
      var eat = typeof e === "string" ? e : (e && e.at);
      return eat !== at;
    });
    if (!map[id].length) delete map[id];
    saveCookedMap(map);
  }
  function lastCookedAt(id) {
    var list = loadCookedMap()[id];
    if (!Array.isArray(list) || !list.length) return null;
    var best = null;
    list.forEach(function (e) {
      var t = Date.parse((typeof e === "string" ? e : (e && e.at)) || "");
      if (!isNaN(t) && (best == null || t > best)) best = t;
    });
    return best;
  }
  function daysSinceCooked(id) {
    var t = lastCookedAt(id);
    return t == null ? null : Math.floor((Date.now() - t) / 86400000);
  }

  /* ── Consistency streak (Home hero) ──────────────────────────────────
     Derived only — no new storage. A day "counts" if it has either a cook-log
     entry (COOKED_KEY, any recipe) or a tracker entry (mc_macros_v1),
     so cooking-only or tracking-only days both keep the streak alive. */
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function loadCookedDateSet() {
    var map = loadCookedMap(), days = {};
    Object.keys(map).forEach(function (id) {
      (map[id] || []).forEach(function (e) {
        var at = typeof e === "string" ? e : (e && e.at);
        if (at) days[at.slice(0, 10)] = 1;
      });
    });
    return days;
  }
  function loadTrackedDateSet() {
    if (!window.MCTrackerStore) return {};
    var obj = MCTrackerStore.read(), days = {};
    Object.keys(obj.days || {}).forEach(function (k) {
      if ((obj.days[k].entries || []).length) days[k] = 1;
    });
    return days;
  }
  function activeStreakDays() {
    var cooked = loadCookedDateSet(), tracked = loadTrackedDateSet();
    function keyFor(d) { return window.MCTrackerStore ? MCTrackerStore.keyFromDate(d) : ymd(d); }
    var d = new Date();
    // Not logging anything yet *today* shouldn't read as "streak broken" —
    // start counting from yesterday until today has its first entry.
    if (!(cooked[keyFor(d)] || tracked[keyFor(d)])) d.setDate(d.getDate() - 1);
    var streak = 0;
    while (streak < 400) {
      var k = keyFor(d);
      if (!(cooked[k] || tracked[k])) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  /* ── Weekly consistency recap (Home, Sun/Mon only) ────────────────────
     A "wrapped"-style summary of the last 7 days — days active, meals
     cooked, and (if tracker goals exist) how many of those days landed
     within ±15% of the kcal goal. Pairs with the existing Sunday reminder
     trigger without being formally wired to it. Dismissible per week so it
     doesn't nag once seen. */
  var RECAP_DISMISS_KEY = "mc-cookbook:mealplan:recap-dismissed";
  function loadRecapDismissedWeek() {
    try { return localStorage.getItem(RECAP_DISMISS_KEY) || ""; } catch (e) { return ""; }
  }
  function dismissRecapForWeek(weekKey) {
    try { localStorage.setItem(RECAP_DISMISS_KEY, weekKey); } catch (e) {}
  }
  function weekKeyFor(d) {
    var offset = (d.getDay() + 6) % 7;
    var monday = new Date(d);
    monday.setDate(d.getDate() - offset);
    return ymd(monday);
  }
  function weeklyRecapStats() {
    var cooked = loadCookedDateSet(), tracked = loadTrackedDateSet();
    var cookedMap = loadCookedMap(), cookedCountByDate = {};
    Object.keys(cookedMap).forEach(function (id) {
      (cookedMap[id] || []).forEach(function (e) {
        var at = typeof e === "string" ? e : (e && e.at);
        if (!at) return;
        var d = at.slice(0, 10);
        cookedCountByDate[d] = (cookedCountByDate[d] || 0) + 1;
      });
    });
    var goals = window.MCTrackerStore && MCTrackerStore.getGoals();
    var daysLogged = 0, mealsCooked = 0, goalHitDays = 0, daysWithGoalData = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = window.MCTrackerStore ? MCTrackerStore.keyFromDate(d) : ymd(d);
      if (cooked[key] || tracked[key]) daysLogged++;
      mealsCooked += cookedCountByDate[key] || 0;
      if (goals && goals.kcal && window.MCTrackerStore) {
        var totals = MCTrackerStore.totalsOf(MCTrackerStore.entriesFor(key));
        if (totals.kcal > 0) {
          daysWithGoalData++;
          var pct = totals.kcal / goals.kcal;
          if (pct >= 0.85 && pct <= 1.15) goalHitDays++;
        }
      }
    }
    // Planned-vs-cooked adherence: This Week's plan is a recurring Mon-Sun
    // template (m.day is a day-code, not a date — see planMeals()), so
    // "adherence" here means the active plan's own completion, not a
    // rolling calendar window like the stats above.
    var scheduled = planMeals().filter(function (m) { return m.day; });
    var plannedCount = scheduled.length;
    var completedCount = scheduled.filter(function (m) { return m.completed; }).length;
    // Roadmap B2 — fuse in workouts completed over the same rolling 7-day
    // window as the stats above (today back through 6 days ago), from the
    // bridge's pulled mc_workout_log_v1. null (not 0) when that store has
    // never been pulled at all — i.e. never signed in / never linked the
    // workout app — so the line doesn't claim "0 workouts" to someone who's
    // never connected the two apps; a real 0 for a linked-but-rest week is
    // still shown, since that's genuine fused signal.
    var hasWorkoutData = false;
    try { hasWorkoutData = localStorage.getItem('mc_workout_log_v1') != null; } catch (e) {}
    var workoutsThisWeek = null;
    if (hasWorkoutData && window.MCBridge) {
      var recapStart = new Date();
      recapStart.setDate(recapStart.getDate() - 6);
      recapStart.setHours(0, 0, 0, 0);
      workoutsThisWeek = MCBridge.workoutsSince(recapStart.getTime());
    }
    return {
      daysLogged: daysLogged, mealsCooked: mealsCooked, goalHitDays: goalHitDays, daysWithGoalData: daysWithGoalData,
      plannedCount: plannedCount, completedCount: completedCount, workoutsThisWeek: workoutsThisWeek
    };
  }
  function renderWeeklyRecapCard() {
    var code = todayDayCode();
    if (code !== "Sun" && code !== "Mon") return null;
    var weekKey = weekKeyFor(new Date());
    if (loadRecapDismissedWeek() === weekKey) return null;
    var stats = weeklyRecapStats();
    if (!stats.daysLogged) return null;   // nothing happened this week — no recap to show

    var card = el("div", "home-hero-card recap-card");
    card.appendChild(el("p", "home-hero-eyebrow", "Past 7 Days"));
    var line = stats.daysLogged + " of 7 days active · " +
      stats.mealsCooked + (stats.mealsCooked === 1 ? " meal" : " meals") + " cooked";
    if (stats.daysWithGoalData > 0) {
      line += " · " + stats.goalHitDays + "/" + stats.daysWithGoalData + " goal days";
    }
    if (stats.plannedCount > 0) {
      line += " · " + stats.completedCount + "/" + stats.plannedCount + " planned meals cooked";
    }
    if (stats.workoutsThisWeek != null) {
      line += " · " + stats.workoutsThisWeek + (stats.workoutsThisWeek === 1 ? " workout" : " workouts");
    }
    card.appendChild(el("p", "recap-line", line));
    var dismiss = el("button", "recap-dismiss", "Dismiss");
    dismiss.type = "button";
    dismiss.addEventListener("click", function () {
      dismissRecapForWeek(weekKey);
      renderHome();
    });
    card.appendChild(dismiss);
    return card;
  }

  /* ── Pantry staples (items you always have → off the buy list) ─────────
     mc-cookbook:pantry → array of normalized item names. Keyed by item name
     (not category) so "salt" is a staple everywhere. Part of the mc-cookbook:
     namespace, so it rides along in Home's backup export/import. */
  var PANTRY_KEY = "mc-cookbook:pantry";
  function loadPantry() {
    try { return new Set(JSON.parse(localStorage.getItem(PANTRY_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function savePantry(set) {
    try { localStorage.setItem(PANTRY_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  function pantryKey(item) { return (item || "").trim().toLowerCase(); }
  function togglePantry(item) {
    var set = loadPantry(), k = pantryKey(item);
    if (set.has(k)) set.delete(k); else set.add(k);
    savePantry(set);
    return set.has(k);
  }
  // Pantry data previously only suppressed grocery-list rows (write-only past
  // that one screen) — this puts it to work a second way: how many of a
  // recipe's ingredients are already staples, so "cook what you have" can be
  // an actual browse filter on the Recipes screen, not just a shopping aid.
  function pantryMatchInfo(r) {
    var pantry = loadPantry();
    var tier = (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
    var by = r.ingredients_by_serving || {};
    var list = by["serving_" + tier] || by["serving_" + (r.native_serving || 2)] || by[Object.keys(by)[0]] || [];
    if (!list.length) return null;
    var have = 0;
    list.forEach(function (ing) { if (pantry.has(pantryKey(ing.item))) have++; });
    return { total: list.length, have: have, need: list.length - have };
  }

  /* ── Week history — archive finished plans, restore with one tap ──────
     Up to 8 weeks stored as { savedAt, label, meals[] }. "Clear week"
     archives before wiping so meals are never lost. */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  // Most-recurring recipe tags across a set of meals, joined into a
  // readable auto-name (e.g. "High-Protein & One-Dish Week"). Falls back
  // to a dated label when no recipe has tags.
  function tagFrequencyName(meals) {
    var counts = {};
    meals.forEach(function (m) {
      var r = recipeById(m.id);
      if (!r || !Array.isArray(r.tags)) return;
      r.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var sorted = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!sorted.length) {
      return "Week of " + new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return sorted.slice(0, 2).join(" & ") + " Week";
  }
  function archiveWeek(customLabel) {
    var meals = planMeals();
    if (!meals.length) return;
    var arr = loadHistory();
    var now = new Date();
    var label = (customLabel && customLabel.trim()) || tagFrequencyName(meals);
    // Snapshot which grocery items were checked off this week (merge-keys, same
    // shape as GROC_KEY) — feeds pantryCandidates()'s "you've bought this N
    // weeks running" suggestion. Older archives predate this field and are
    // simply skipped by that heuristic, not treated as "never checked."
    arr.unshift({ savedAt: now.toISOString(), label: label, meals: meals, grocery: Array.from(loadGroc()) });
    if (arr.length > 8) arr = arr.slice(0, 8);
    saveHistory(arr);
  }
  // Grocery items checked off (bought) in each of the last few archived
  // weeks running, not already marked a pantry staple — a real "you keep
  // buying this every week, want to stop shopping for it?" signal, instead
  // of requiring a manual 🧂 tap the first time every single item appears.
  var PANTRY_SUGGEST_WEEKS = 3;
  function pantryCandidates() {
    var history = loadHistory().filter(function (w) { return Array.isArray(w.grocery); });
    if (history.length < PANTRY_SUGGEST_WEEKS) return [];
    var recent = history.slice(0, PANTRY_SUGGEST_WEEKS).map(function (w) { return new Set(w.grocery); });
    var pantry = loadPantry();
    var cats = buildGrocery(), out = [];
    cats.forEach(function (c) {
      c.rows.forEach(function (row) {
        if (pantry.has(pantryKey(row.item))) return;
        var boughtEveryWeek = recent.every(function (weekSet) { return weekSet.has(row.key); });
        if (boughtEveryWeek) out.push(row);
      });
    });
    return out;
  }
  // Has the active plan's 7-day window elapsed since its first meal was
  // added? Checked at app boot (no real background cron available).
  var SMW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  function planWeekElapsed(p) {
    if (!p.startedAt) return false;
    var started = Date.parse(p.startedAt);
    return !isNaN(started) && (Date.now() - started) >= SMW_WEEK_MS;
  }
  function shouldPromptDay7(p) {
    return p.meals.length > 0 && !p.day7Dismissed && planWeekElapsed(p);
  }

  /* ── Completion tracking & macro history ──────────────────────────────
     "Mark Completed" flips a meal's completed/completedAt, logs its macros
     to MACRO_HISTORY_KEY, and appends a shared cook-log entry (feeding
     Smart Week's repeat-avoidance) — all keyed by uid/cookLogAt so
     re-toggling never double-counts. Un-marking removes both. Macro math
     mirrors computeWeekMacros: perServingMacroTier() resolves whichever tier
     the recipe actually authored (never hardcodes serving_2), and the
     resulting per-serving value is used as-is — macro_profiles is already
     per single serving and never scales with meal.serving. */
  var MACRO_HISTORY_KEY = "mc-cookbook:mealplan:macrohistory";
  function loadMacroHistory() {
    try { return JSON.parse(localStorage.getItem(MACRO_HISTORY_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveMacroHistory(arr) {
    try { localStorage.setItem(MACRO_HISTORY_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function mealMacros(m) {
    var r = recipeById(m.id);
    return macrosFromTier(perServingMacroTier(r, m.serving));
  }
  function logMealMacros(m) {
    var macros = mealMacros(m);
    if (!macros) return;
    var arr = loadMacroHistory().filter(function (e) { return e.uid !== m.uid; });
    arr.push({
      uid: m.uid, recipeId: m.id, day: m.day || null, slot: m.slot || null,
      serving: m.serving || 2, completedAt: m.completedAt,
      date: (m.completedAt || "").slice(0, 10),
      kcal: macros.kcal, p: macros.p, f: macros.f, c: macros.c
    });
    saveMacroHistory(arr);
  }
  function unlogMealMacros(uid) {
    saveMacroHistory(loadMacroHistory().filter(function (e) { return e.uid !== uid; }));
  }
  // Bridges "Mark Completed" to the in-app macro Tracker (tracker-store.js) —
  // previously the planner only fed its own recency scoring (macrohistory
  // above), so a completed meal never showed up in the day's actual macro
  // totals unless separately re-logged from the recipe page. The planner
  // already knows recipe/serving/time, so there's no reason to make the cook
  // do that twice. m.trackerEntryId/trackerDayKey round-trip through the
  // plan so un-completing removes the exact entry, not just any match.
  function logMealToTracker(m) {
    if (!window.MCTrackerStore) return;
    var macros = mealMacros(m);
    if (!macros) return;
    var r = recipeById(m.id);
    var slotMs = Date.parse(m.completedAt) || Date.now();
    var entry = MCTrackerStore.addEntry({
      name: (r && r.title) || m.id, source: "recipe", unit: "serving", qty: 1,
      per: { kcal: macros.kcal, p: macros.p, f: macros.f, c: macros.c }
    }, slotMs);
    m.trackerEntryId = entry.id;
    m.trackerDayKey = MCTrackerStore.keyFromDate(new Date(slotMs));
  }
  function unlogMealFromTracker(m) {
    if (!window.MCTrackerStore || !m.trackerEntryId || !m.trackerDayKey) return;
    MCTrackerStore.removeEntry(m.trackerDayKey, m.trackerEntryId);
    m.trackerEntryId = null;
    m.trackerDayKey = null;
  }
  // Returns true when this tap just completed the final remaining meal of
  // the week, so the caller can surface the "Save Week Block?" prompt.
  function toggleMealCompleted(uid) {
    var p = loadPlan();
    var m = p.meals.filter(function (x) { return x.uid === uid; })[0];
    if (!m) return false;
    m.completed = !m.completed;
    m.completedAt = m.completed ? new Date().toISOString() : null;
    if (!m.completed) {
      unlogMealMacros(uid);
      if (m.cookLogAt) { removeCookEntry(m.id, m.cookLogAt); m.cookLogAt = null; }
      unlogMealFromTracker(m);
      savePlan(p);
      return false;
    }
    logMealMacros(m);
    m.cookLogAt = logCookEntry(m.id);
    logMealToTracker(m);
    savePlan(p);
    return p.meals.length > 0 && p.meals.every(function (x) { return x.completed; });
  }

  /* ── Post-log celebration ─────────────────────────────────────────────
     Completing a plan meal used to just silently flip a checkbox — no
     feedback moment for what's otherwise the app's core "did I actually do
     the thing" action. beforeTotals is a snapshot taken by the caller BEFORE
     toggleMealCompleted() runs, so this can tell "logging this meal is what
     just pushed a macro over goal" apart from an ordinary log. */
  function celebrateMealLogged(beforeTotals) {
    var msg = "Logged for today.";
    if (window.MCTrackerStore && beforeTotals) {
      var goals = MCTrackerStore.getGoals();
      var after = MCTrackerStore.totalsOf(MCTrackerStore.entriesFor(MCTrackerStore.todayKey()));
      if (goals && goals.p && beforeTotals.p < goals.p && after.p >= goals.p) {
        msg = "🎯 Protein goal hit for today!";
      } else if (goals && goals.kcal && beforeTotals.kcal < goals.kcal && after.kcal >= goals.kcal) {
        msg = "🎯 Calorie goal hit for today!";
      }
    }
    plannerToast(msg);
  }
  function todayTotalsSnapshot() {
    return window.MCTrackerStore
      ? MCTrackerStore.totalsOf(MCTrackerStore.entriesFor(MCTrackerStore.todayKey()))
      : null;
  }

  /* ── Custom grocery items — user-typed additions outside of recipes ── */
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveCustom(arr) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  /* ── Macro goals bridge — reads goals set in MC Training's calculator ─
     mc_macros_v1 is written by MC Training on the same github.io origin,
     so this Cookbook can read it directly from localStorage. */
  function loadMacroGoals() {
    try {
      var v = JSON.parse(localStorage.getItem("mc_macros_v1") || "null");
      return (v && v.goals && v.goals.kcal) ? v.goals : null;
    } catch (e) { return null; }
  }

  /* ── Quantity math (parse → sum → pretty) for the merged grocery list ─ */
  // Parses integers, decimals, and simple/mixed fractions ("1", "0.75",
  // "1/2", "1 1/2"). Non-numeric amounts ("to taste") return null and are
  // listed as-is rather than summed.
  function parseQty(qty) {
    if (qty == null) return null;
    var s = String(qty).trim();
    var m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);                 // mixed: "1 1/2"
    if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return parseInt(m[1], 10) / parseInt(m[2], 10);
    if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
    return null;
  }
  function prettyQty(v) {
    var whole = Math.floor(v + 1e-9), frac = v - whole;
    var FRACTIONS = [[1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]];
    var best = null, bestDiff = 0.06;
    for (var i = 0; i < FRACTIONS.length; i++) {
      var d = Math.abs(frac - FRACTIONS[i][0]);
      if (d < bestDiff) { best = FRACTIONS[i][1]; bestDiff = d; }
    }
    if (frac < 0.06) return String(whole);
    if (frac > 0.94) return String(whole + 1);
    if (best) return (whole > 0 ? whole + " " : "") + best;
    return String(Math.round(v * 100) / 100);
  }

  // Unit normalization for the smart merge. We only convert within the small,
  // unambiguous families the data actually uses — volume (tsp↔tbsp↔cup) and
  // weight (oz↔lb). Anything else (counts, "small", "clove", ml, g…) is merged
  // only against the exact same unit string and never cross-summed, so the list
  // can't fabricate a wrong total from incompatible units.
  var UNIT_DEFS = {
    "tsp": { cls: "vol", f: 1 }, "teaspoon": { cls: "vol", f: 1 }, "teaspoons": { cls: "vol", f: 1 },
    "tbsp": { cls: "vol", f: 3 }, "tablespoon": { cls: "vol", f: 3 }, "tablespoons": { cls: "vol", f: 3 },
    "cup": { cls: "vol", f: 48 }, "cups": { cls: "vol", f: 48 },
    "oz": { cls: "wt", f: 1 }, "ounce": { cls: "wt", f: 1 }, "ounces": { cls: "wt", f: 1 },
    "lb": { cls: "wt", f: 16 }, "lbs": { cls: "wt", f: 16 }, "pound": { cls: "wt", f: 16 }, "pounds": { cls: "wt", f: 16 }
  };
  // Display ladders (largest unit first) with a plural label and the smallest
  // value at which we'll use that unit. Volume keeps natural cup-fractions
  // (down to ¼ cup); weight only promotes to lb at a whole pound, since cooks
  // read "4 oz" not "¼ lb". The last (smallest) unit is always the fallback.
  var UNIT_DISPLAY = {
    vol: [{ u: "cup", p: "cups", f: 48, min: 0.25 }, { u: "tbsp", p: "tbsp", f: 3, min: 1 }, { u: "tsp", p: "tsp", f: 1, min: 0 }],
    wt:  [{ u: "lb", p: "lb", f: 16, min: 1 }, { u: "oz", p: "oz", f: 1, min: 0 }]
  };
  function unitInfo(unit) {
    return UNIT_DEFS[(unit || "").trim().toLowerCase()] || null;
  }
  // A value reads cleanly if it's whole or a common kitchen fraction.
  function isCleanAmount(v) {
    var f = v - Math.floor(v + 1e-9);
    if (f < 0.06 || f > 0.94) return true;
    var T = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
    for (var i = 0; i < T.length; i++) if (Math.abs(f - T[i]) < 0.06) return true;
    return false;
  }
  // Render a convertible bucket's summed base amount in the nicest unit: the
  // largest unit whose value clears its threshold and reads as a clean amount.
  function prettyMeasure(base, cls) {
    var ladder = UNIT_DISPLAY[cls];
    for (var i = 0; i < ladder.length; i++) {
      var v = base / ladder[i].f;
      if (i === ladder.length - 1 || (v >= ladder[i].min - 1e-9 && isCleanAmount(v))) {
        return prettyQty(v) + " " + (v > 1 + 1e-9 ? ladder[i].p : ladder[i].u);
      }
    }
  }

  // Singularize an item name for merge-key purposes only (display keeps the
  // recipe's original wording). Trivial wording differences like "Chicken
  // breast" vs "Chicken breasts" are the SAME shopping item and must merge —
  // but this is intentionally conservative. Broader "near-identical" fuzzy
  // matching (e.g. "Onion" vs "Red onion", "Lemon" vs "Lemon juice") was
  // tested against the real recipe data and rejected: those are genuinely
  // different items to buy, and auto-merging them would silently under-count
  // the list. True synonyms (same product, different wording) belong in
  // ITEM_ALIASES below instead of a generic fuzzy rule.
  function singularizeForMerge(s) {
    if (/sses$/i.test(s)) return s;              // molasses — invariant, not a plural
    if (/us$/i.test(s)) return s;                // hummus, asparagus — invariant
    if (/ss$/i.test(s)) return s;                // swiss, glass — not a plural "s"
    if (/[a-z]oes$/i.test(s)) return s.slice(0, -2);           // tomatoes -> tomato
    if (/[a-z]ies$/i.test(s) && s.length > 4) return s.slice(0, -3) + "y"; // berries -> berry
    if (/(ch|sh|x)es$/i.test(s)) return s.slice(0, -2);        // peaches -> peach
    if (/[a-z]s$/i.test(s) && s.length > 3) return s.slice(0, -1); // breasts -> breast
    return s;
  }
  // Curated synonym table for items that are the same product but authored
  // with different wording across recipes — NOT auto-detected (see above).
  // Add an entry here only when you've confirmed two item names really are
  // interchangeable at the store; keys/values are matched after lowercasing
  // and singularizing. Empty until specific pairs are confirmed.
  var ITEM_ALIASES = {
    // "fajita chicken seasoning": "fajita seasoning"
  };
  function groceryMergeName(item) {
    var norm = singularizeForMerge(item.toLowerCase().trim());
    return ITEM_ALIASES[norm] || norm;
  }

  // ── Purchase-unit rounding ────────────────────────────────────────────
  // A recipe's cooking measurement ("1/4 cup", "1 tbsp") isn't how the item
  // is actually bought. Two independent rules, both round UP (never down —
  // it's always safe to have a little extra):
  //
  // 1. Discrete units (a size word, a package word, or no unit at all) can't
  //    be bought fractionally — "1/2 small" onion means grab 1. Any unit not
  //    on this list is a real cooking measurement (g, ml, tsp not otherwise
  //    converted, etc.) and is left as the merged amount, unrounded.
  // 2. A curated list of pantry items that are always bought as a single
  //    whole product regardless of how much the recipe calls for — a
  //    seasoning blend is a packet, guacamole is a tub — override the whole
  //    line to "1 <purchase unit>". Deliberately conservative: only named
  //    matches or an explicit "season(ing)" in the item name qualify: this
  //    never applies to a normal bulk ingredient (olive oil, honey, rice…)
  //    just because a fraction looks awkward — the rest of buildGrocery
  //    already leaves those as their real called-for amount.
  var DISCRETE_UNIT_RE = /^(|small|medium|large|whole)$|\b(packets?|sachets?|cans?|jars?|boxe?s?|bags?|bottles?|containers?|scoops?|packs?)\b/i;
  function isDiscreteUnit(unit) {
    return DISCRETE_UNIT_RE.test((unit || "").trim().toLowerCase());
  }
  var PANTRY_PURCHASE_UNITS = {
    "ranch dip mix": "packet",
    "taco seasoning": "packet",
    "guacamole": "container",
    "hummus": "container",
    "salsa": "container",
    "prepared salsa": "container",
    "pesto": "container",
    "basil pesto": "container"
  };
  function purchaseUnitFor(item) {
    var norm = groceryMergeName(item);
    if (PANTRY_PURCHASE_UNITS[norm]) return PANTRY_PURCHASE_UNITS[norm];
    if (/season/i.test(item)) return "packet";
    return null;
  }

  // Build the combined shopping list across every planned meal. Quantities for
  // the SAME item are merged into per-item buckets: amounts in a compatible
  // unit family are converted to a common base and summed; incompatible units
  // (e.g. "2 small" vs "4 oz") stay as separate sub-amounts on one line rather
  // than being force-summed into a wrong total. Returns categories in aisle
  // order, each holding one row per item keyed for check-off.
  var GROC_CAT_ORDER = ["Meat", "Dairy", "Produce", "Pantry"];
  function buildGrocery() {
    var items = {}, order = [];
    planMeals().forEach(function (meal) {
      var r = recipeById(meal.id);
      if (!r) return;
      var list = (r.ingredients_by_serving && r.ingredients_by_serving["serving_" + meal.serving]) || [];
      list.forEach(function (ing) {
        var item = (ing.item || "").trim();
        if (!item) return;
        var unit = (ing.unit || "").trim();
        var cat  = ing.category || "Other";
        var ikey = cat + "|" + groceryMergeName(item);
        var it = items[ikey];
        if (!it) { it = items[ikey] = { key: ikey, item: item, category: cat, buckets: {}, bucketOrder: [], texts: [], mealUids: [] }; order.push(ikey); }
        if (it.mealUids.indexOf(meal.uid) < 0) it.mealUids.push(meal.uid);

        var info = unitInfo(unit);
        var num  = parseQty(ing.quantity);
        var bkey = info ? ("cls:" + info.cls) : ("u:" + unit.toLowerCase());
        var bk = it.buckets[bkey];
        if (!bk) {
          bk = it.buckets[bkey] = info
            ? { kind: "conv", cls: info.cls, base: 0, hasNum: false }
            : { kind: "raw", unit: unit, sum: 0, hasNum: false };
          it.bucketOrder.push(bkey);
        }
        if (num != null) {
          if (info) bk.base += num * info.f; else bk.sum += num;
          bk.hasNum = true;
        } else if (ing.quantity != null && String(ing.quantity).trim()) {
          it.texts.push(String(ing.quantity).trim() + (unit ? " " + unit : ""));
        }
      });
    });

    // Group items into categories (aisle order first, then any extras seen).
    var groups = {};
    order.forEach(function (ikey) {
      var it = items[ikey];
      (groups[it.category] = groups[it.category] || []).push(it);
    });
    var cats = GROC_CAT_ORDER.filter(function (c) { return groups[c]; })
      .concat(Object.keys(groups).filter(function (c) { return GROC_CAT_ORDER.indexOf(c) < 0; }));

    return cats.map(function (cat) {
      return {
        category: cat,
        rows: groups[cat].map(function (it) {
          var parts = [];
          it.bucketOrder.forEach(function (bkey) {
            var bk = it.buckets[bkey];
            if (bk.kind === "conv") {
              if (bk.hasNum && bk.base > 0) parts.push(prettyMeasure(bk.base, bk.cls));
            } else if (bk.hasNum && bk.sum > 0) {
              var shown = isDiscreteUnit(bk.unit) ? Math.ceil(bk.sum - 1e-9) : prettyQty(bk.sum);
              parts.push(shown + (bk.unit ? " " + bk.unit : ""));
            }
          });
          if (it.texts.length) {
            var uniq = it.texts.filter(function (t, i) { return it.texts.indexOf(t) === i; });
            parts.push(uniq.join(", "));
          }
          var qty = parts.join(" · ");
          var pu = parts.length ? purchaseUnitFor(it.item) : null;
          if (pu) qty = "1 " + pu;
          return { key: it.key, item: it.item, qty: qty, mealUids: it.mealUids };
        })
      };
    });
  }
  // True once every meal that contributed this item has been marked
  // completed — the "split-trip" signal that it's already been used up.
  function groceryRowAllDone(row) {
    if (!row.mealUids || !row.mealUids.length) return false;
    var plan = planMeals();
    return row.mealUids.every(function (uid) {
      var m = plan.filter(function (x) { return x.uid === uid; })[0];
      return !!(m && m.completed);
    });
  }
  function groceryItemCount() {
    var pantry = loadPantry();   // count only what you'd still actually need to buy
    return buildGrocery().reduce(function (n, c) {
      return n + c.rows.filter(function (row) {
        return !pantry.has(pantryKey(row.item)) && !groceryRowAllDone(row);
      }).length;
    }, 0);
  }

  // Ingredient identity for overlap scoring below — same items regardless of
  // which authored serving tier we read, since scaling only changes
  // quantity, not what's on the list (see recipes-data.js's data model).
  // Keyed the same way buildGrocery() keys a merged row (category + lower-
  // cased item name) so "shares an ingredient" means the same thing here as
  // it does on the actual grocery list.
  function recipeIngredientKeys(r) {
    var by = r.ingredients_by_serving || {};
    var list = by[Object.keys(by)[0]] || [];
    var keys = {};
    list.forEach(function (ing) {
      var item = (ing.item || "").trim();
      if (!item) return;
      keys[(ing.category || "Other") + "|" + groceryMergeName(item)] = true;
    });
    return keys;
  }
  function mergeIngredientKeys(target, keys) {
    Object.keys(keys).forEach(function (k) { target[k] = true; });
  }

  /* ── Smart Week generation ────────────────────────────────────────────
     Scope-driven 7-day generator: pick a scope (All / Breakfast / Lunch /
     Dinner / Breakfast+Dinner / Lunch+Dinner), fill every day for the
     slots in that scope from classifyMealSlots' eligible pools. Selection
     favors recipes not yet used elsewhere in the generated week, avoids
     repeating the same dish_category on consecutive days within a slot,
     deprioritizes recipes cooked recently (via the cook log — which the
     planner's own "Mark Completed" now feeds, not just the recipe detail
     page), and gives a bounded bonus to recipes that share grocery-list
     ingredients with what's already been picked this week (so perishable
     Produce/Meat/Dairy tends to get used up across meals instead of each
     day pulling from a totally disjoint set). Anything cooked within
     SMW_HARD_EXCLUDE_DAYS is dropped from the candidate pool outright,
     unless that would leave a slot with no options at all, in which case
     it falls back to scoring the full pool with the existing soft
     recency decay. */
  var SMART_SCOPES = [
    { key: "all",           label: "All",                slots: ["Breakfast", "Lunch", "Dinner"] },
    { key: "breakfast",     label: "Breakfast",          slots: ["Breakfast"] },
    { key: "lunch",         label: "Lunch",              slots: ["Lunch"] },
    { key: "dinner",        label: "Dinner",             slots: ["Dinner"] },
    { key: "bfast_dinner",  label: "Breakfast + Dinner", slots: ["Breakfast", "Dinner"] },
    { key: "lunch_dinner",  label: "Lunch + Dinner",     slots: ["Lunch", "Dinner"] }
  ];
  var SMW_RECENCY_CAP_DAYS = 60;   // never-cooked / long-ago treated as equally "fresh"
  var SMW_REPEAT_CATEGORY_PENALTY = 15;
  var SMW_HARD_EXCLUDE_DAYS = 7;   // cooked this recently: skip unless the pool would go empty
  var SMW_OVERLAP_WEIGHT = 4;      // points per shared ingredient with recipes already picked this week
  var SMW_OVERLAP_CAP = 6;         // cap the bonus so overlap nudges ties rather than steamrolling recency/variety
  var SMW_FAVORITE_BONUS = 10;     // hearting a recipe should mean something beyond a filter tab
  // Roadmap B2 — training-day-aware bias. dayBias is true (likely training
  // day, per MCBridge.likelyTrainingDays()'s real historical pattern), false
  // (likely rest day), or null/undefined (no bridge / no established pattern
  // yet / signed out) — null means "no bias," identical to pre-B2 behavior.
  var SMW_TRAIN_PROTEIN_CAP = 60;      // grams; diminishing return past this
  var SMW_TRAIN_PROTEIN_WEIGHT = 0.35; // -> up to +21 for a 60g-protein recipe
  var SMW_REST_KCAL_TARGET = 650;      // "lighter" reference point for a rest day
  var SMW_REST_KCAL_WEIGHT = 0.03;
  var SMW_REST_KCAL_CAP = 8;
  function recipeMacrosRaw(r) {
    if (!r || !r.macro_profiles) return null;
    for (var k in r.macro_profiles) if (r.macro_profiles[k]) return r.macro_profiles[k];
    return null;
  }
  function smwTrainBias(r, dayBias) {
    if (dayBias == null) return 0;
    var m = recipeMacrosRaw(r);
    if (!m) return 0;
    if (dayBias) return Math.min(m.protein_g || 0, SMW_TRAIN_PROTEIN_CAP) * SMW_TRAIN_PROTEIN_WEIGHT;
    var delta = (SMW_REST_KCAL_TARGET - (m.calories || 0)) * SMW_REST_KCAL_WEIGHT;
    return Math.max(-SMW_REST_KCAL_CAP, Math.min(SMW_REST_KCAL_CAP, delta));
  }
  function smwScoreCandidate(r, usedIds, prevCategory, usedIngredientKeys, dayBias) {
    var score = 0;
    if (usedIds.has(r.recipe_id)) score -= 1000;
    var days = daysSinceCooked(r.recipe_id);
    score += (days == null) ? SMW_RECENCY_CAP_DAYS : Math.min(days, SMW_RECENCY_CAP_DAYS);
    if (prevCategory && r.dish_category === prevCategory) score -= SMW_REPEAT_CATEGORY_PENALTY;
    if (usedIngredientKeys) {
      var keys = recipeIngredientKeys(r), overlap = 0;
      Object.keys(keys).forEach(function (k) { if (usedIngredientKeys[k]) overlap++; });
      score += Math.min(overlap, SMW_OVERLAP_CAP) * SMW_OVERLAP_WEIGHT;
    }
    if (loadFavs().has(r.recipe_id)) score += SMW_FAVORITE_BONUS;
    score += seasonalWeight(r.dish_category);
    score += smwTrainBias(r, dayBias);
    score += Math.random() * 10; // jitter so Regenerate actually varies
    return score;
  }
  function smwPickForSlot(slot, usedIds, prevCategory, excludeId, usedIngredientKeys, dayBias) {
    var pool = mealEligibleRecipes(slot);
    if (excludeId) pool = pool.filter(function (r) { return r.recipe_id !== excludeId; });
    if (!pool.length) return null;
    var fresh = pool.filter(function (r) {
      var days = daysSinceCooked(r.recipe_id);
      return days == null || days > SMW_HARD_EXCLUDE_DAYS;
    });
    var candidates = fresh.length ? fresh : pool;
    var best = null, bestScore = -Infinity;
    candidates.forEach(function (r) {
      var s = smwScoreCandidate(r, usedIds, prevCategory, usedIngredientKeys, dayBias);
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }
  // Real historical training pattern from MCBridge (roadmap B2) — {} (no
  // bias anywhere) until MC_SB/mc-sync has pulled enough real workout history
  // to establish one. Never fabricates a future schedule.
  function smwDayBiasMap() {
    if (!window.MCBridge || !MCBridge.likelyTrainingDays) return {};
    var pattern = MCBridge.likelyTrainingDays();
    var hasPattern = Object.keys(pattern).some(function (k) { return pattern[k]; });
    return hasPattern ? pattern : {};
  }
  function smwDayBiasFor(pattern, day) {
    return (day in pattern) ? pattern[day] : null;
  }
  // Full 7-day grid for a scope: [{ day, slot, id }], best-effort no-repeat.
  function smwGenerateWeek(scopeKey) {
    var scope = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];
    var usedIds = new Set();
    var usedIngredientKeys = {};
    var prevCategoryBySlot = {};
    var dayBiasPattern = smwDayBiasMap();
    var grid = [];
    DAYS.forEach(function (day) {
      var dayBias = smwDayBiasFor(dayBiasPattern, day);
      scope.slots.forEach(function (slot) {
        var pick = smwPickForSlot(slot, usedIds, prevCategoryBySlot[slot], null, usedIngredientKeys, dayBias);
        if (pick) {
          usedIds.add(pick.recipe_id);
          prevCategoryBySlot[slot] = pick.dish_category;
          mergeIngredientKeys(usedIngredientKeys, recipeIngredientKeys(pick));
          grid.push({ day: day, slot: slot, id: pick.recipe_id });
        }
      });
    });
    return { scope: scope, grid: grid };
  }
  // Re-pick a single day+slot, excluding its current recipe so the tap
  // always changes something (when an alternative exists). Ingredient
  // overlap is scored against every OTHER slot already in the grid, so a
  // regenerated pick still tries to match the rest of the week.
  function smwRegenerateSlot(grid, day, slot) {
    var usedIds = new Set();
    var usedIngredientKeys = {};
    grid.forEach(function (g) {
      if (g.day === day && g.slot === slot) return;
      usedIds.add(g.id);
      var r = recipeById(g.id);
      if (r) mergeIngredientKeys(usedIngredientKeys, recipeIngredientKeys(r));
    });
    var current = grid.filter(function (g) { return g.day === day && g.slot === slot; })[0];
    var dayIdx = DAYS.indexOf(day);
    var prevEntry = dayIdx > 0
      ? grid.filter(function (g) { return g.day === DAYS[dayIdx - 1] && g.slot === slot; })[0]
      : null;
    var prevCategory = prevEntry ? ((recipeById(prevEntry.id) || {}).dish_category) : null;
    var dayBias = smwDayBiasFor(smwDayBiasMap(), day);
    var pick = smwPickForSlot(slot, usedIds, prevCategory, current ? current.id : null, usedIngredientKeys, dayBias);
    return pick ? pick.recipe_id : null;
  }
  // Commits a generated grid into the plan: replaces any existing meals in
  // the scope's slots (any day), then adds the new 7-day grid. Meals in
  // slots outside the scope (or unscheduled/slot-less) are left untouched,
  // so a narrow scope like Dinner-only never disturbs Breakfast/Lunch.
  function commitSmartWeek(grid, scopeSlots) {
    var p = loadPlan();
    p.meals = p.meals.filter(function (m) { return scopeSlots.indexOf(m.slot) < 0; });
    grid.forEach(function (g) {
      var serving = defaultServingFor(g.id);
      p.meals.push(Object.assign(
        { uid: newUid(), id: g.id, serving: serving, day: g.day, slot: g.slot },
        mealSnapshot(g.id, serving)
      ));
    });
    savePlan(p);
    saveGroc(new Set());
  }

  /* ── Macro Smart Generator (msg* namespace) ───────────────────────────
     Deliberately decoupled from Smart Week's smw* scoring above — same
     grid shape ({ day, slot, id }) and the same slot-eligibility +
     SMW_HARD_EXCLUDE_DAYS repeat-avoidance, but picks each slot to fit the
     remaining share of the day's macro goal (loadMacroGoals — the same
     mc_macros_v1 bridge the Grocery tab's macro-goals bar reads) instead
     of optimizing for dish-category variety. Only ever invoked when goals
     exist; Smart Week's default "Balanced" path never calls into this. A
     greedy per-slot best-fit, not a true optimizer, matching Balanced
     mode's complexity. */
  var MSG_PROTEIN_WEIGHT = 2; // protein fit matters ~2x as much as calorie fit
  var MSG_FAVORITE_BONUS = 8; // same signal Smart Week gets — a heart should nudge both generators
  var MSG_TRAIN_PROTEIN_BONUS = 15; // grams added to a likely-training day's protein goal (roadmap B2)
  // Folds in ROADMAP.md Pillar C's deferred "macro-trend bias" fast-follow:
  // read the planner's own completed-meal history (MACRO_HISTORY_KEY — what
  // was actually cooked and marked done, not the Tracker's separate food
  // log) and nudge the protein target up if the trailing trend is clearly
  // under goal. Requires real history (MACRO_TREND_MIN_DAYS) before applying,
  // so a fresh planner never gets biased off zero data. Its acceptance
  // criterion is that this stays visible, never silent — see the
  // "smw-trend-callout" banner in openSmartWeek()'s paint().
  var MACRO_TREND_LOOKBACK_DAYS = 14;
  var MACRO_TREND_MIN_DAYS = 4;      // days of real history needed to trust a trend
  var MACRO_TREND_UNDER_PCT = 0.85;  // avg daily protein below this share of goal counts as "under"
  var MACRO_TREND_BONUS = 12;        // grams
  function macroTrendBias(goals) {
    if (!goals || !goals.p) return { bonus: 0, reason: null };
    var cutoffKey = ymd((function () { var d = new Date(); d.setDate(d.getDate() - MACRO_TREND_LOOKBACK_DAYS); return d; })());
    var byDate = {};
    loadMacroHistory().forEach(function (e) {
      if (!e.date || e.date < cutoffKey) return;
      byDate[e.date] = (byDate[e.date] || 0) + (e.p || 0);
    });
    var dates = Object.keys(byDate);
    if (dates.length < MACRO_TREND_MIN_DAYS) return { bonus: 0, reason: null };
    var avgP = dates.reduce(function (sum, d) { return sum + byDate[d]; }, 0) / dates.length;
    if (avgP >= goals.p * MACRO_TREND_UNDER_PCT) return { bonus: 0, reason: null };
    return { bonus: MACRO_TREND_BONUS, reason: "Trending under on protein lately — meals biased +" + MACRO_TREND_BONUS + "g" };
  }
  // Effective per-day protein goal — bumped on a likely-training day (real
  // historical pattern from MCBridge.likelyTrainingDays(), same signal
  // Smart Week's smwTrainBias uses) and/or by the macro-trend bias above.
  // Falls back to the plain goal with no bridge / no pattern / no trend /
  // signed out, unchanged from pre-B2.
  function msgDayProteinGoal(goals, day, dayBiasPattern, trendBonus) {
    var base = goals ? goals.p : 0;
    var trainBonus = smwDayBiasFor(dayBiasPattern, day) ? MSG_TRAIN_PROTEIN_BONUS : 0;
    return base + trainBonus + (trendBonus || 0);
  }
  function msgMacroFit(r) {
    var mp = (r && r.macro_profiles && r.macro_profiles.serving_2) || {};
    return { kcal: mp.calories || 0, p: mp.protein_g || 0 };
  }
  function msgScoreCandidate(r, usedIds, budget) {
    var score = 0;
    if (usedIds.has(r.recipe_id)) score -= 1000;
    var m = msgMacroFit(r);
    var kcalErr = budget.kcal > 0 ? Math.abs(m.kcal - budget.kcal) / budget.kcal : 0;
    var pErr = budget.p > 0 ? Math.abs(m.p - budget.p) / budget.p : 0;
    score -= (kcalErr + pErr * MSG_PROTEIN_WEIGHT) * 100;
    score += Math.random() * 2; // small jitter so Regenerate still varies, without swamping macro fit
    return score;
  }
  function msgPickForSlot(slot, usedIds, budget, excludeId) {
    var pool = mealEligibleRecipes(slot);
    if (excludeId) pool = pool.filter(function (r) { return r.recipe_id !== excludeId; });
    if (!pool.length) return null;
    var fresh = pool.filter(function (r) {
      var days = daysSinceCooked(r.recipe_id);
      return days == null || days > SMW_HARD_EXCLUDE_DAYS;
    });
    var candidates = fresh.length ? fresh : pool;
    var best = null, bestScore = -Infinity;
    candidates.forEach(function (r) {
      var s = msgScoreCandidate(r, usedIds, budget);
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }
  // Sum of this day's already-picked slots' macro fit, optionally excluding
  // one slot (used to find what's left for that slot when regenerating it).
  function msgDayConsumed(grid, day, excludeSlot) {
    return grid.filter(function (g) { return g.day === day && g.slot !== excludeSlot; })
      .reduce(function (acc, g) {
        var m = msgMacroFit(recipeById(g.id));
        acc.kcal += m.kcal; acc.p += m.p;
        return acc;
      }, { kcal: 0, p: 0 });
  }
  // Full 7-day grid for a scope, same shape as smwGenerateWeek's. Walks each
  // day's slots in order, giving each an equal share of whatever's left of
  // that day's kcal/protein goal after earlier slots in the same day.
  function msgGenerateWeek(scopeKey) {
    var scope = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];
    var goals = loadMacroGoals();
    var dayBiasPattern = smwDayBiasMap();
    var trendBonus = macroTrendBias(goals).bonus;
    var usedIds = new Set();
    var grid = [];
    DAYS.forEach(function (day) {
      scope.slots.forEach(function (slot, i) {
        var consumed = msgDayConsumed(grid, day, null);
        var remaining = {
          kcal: (goals ? goals.kcal : 0) - consumed.kcal,
          p:    msgDayProteinGoal(goals, day, dayBiasPattern, trendBonus) - consumed.p
        };
        var slotsLeft = scope.slots.length - i;
        var budget = { kcal: remaining.kcal / slotsLeft, p: remaining.p / slotsLeft };
        var pick = msgPickForSlot(slot, usedIds, budget, null);
        if (pick) {
          usedIds.add(pick.recipe_id);
          grid.push({ day: day, slot: slot, id: pick.recipe_id });
        }
      });
    });
    return { scope: scope, grid: grid };
  }
  // Re-pick a single day+slot against what's left of that day's goal once
  // its other slots are accounted for.
  function msgRegenerateSlot(grid, day, slot, scopeKey) {
    var scope = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];
    var goals = loadMacroGoals();
    var dayBiasPattern = smwDayBiasMap();
    var trendBonus = macroTrendBias(goals).bonus;
    var usedIds = new Set();
    grid.forEach(function (g) { if (!(g.day === day && g.slot === slot)) usedIds.add(g.id); });
    var current = grid.filter(function (g) { return g.day === day && g.slot === slot; })[0];
    var consumed = msgDayConsumed(grid, day, slot);
    var remaining = {
      kcal: (goals ? goals.kcal : 0) - consumed.kcal,
      p:    msgDayProteinGoal(goals, day, dayBiasPattern, trendBonus) - consumed.p
    };
    var otherFilled = grid.filter(function (g) { return g.day === day && g.slot !== slot; }).length;
    var slotsLeft = Math.max(1, scope.slots.length - otherFilled);
    var budget = { kcal: remaining.kcal / slotsLeft, p: remaining.p / slotsLeft };
    var pick = msgPickForSlot(slot, usedIds, budget, current ? current.id : null);
    return pick ? pick.recipe_id : null;
  }
  // Whole-day protein fit vs. goal, for the preview's "~92% of daily
  // protein goal" readout. Null when there's no goal to compare against.
  function msgDayFitPct(grid, day, goals) {
    if (!goals || !goals.p) return null;
    var got = msgDayConsumed(grid, day, null).p;
    return Math.round((got / goals.p) * 100);
  }

  /* ── RecipeEquivalenceEngine (Smart Replacement) ──────────────────────
     Deliberately decoupled from Smart Week's generation/scoring above —
     this only ever answers "what could replace THIS one meal", using its
     own sre* namespace. Two branches:
       Iso-Nutritional: same dish_category (the app's proxy for cooking
       method/"structural blueprint"), shared equipment-style tags, and
       per-serving protein/carbs/fat within a tolerance band, widened only
       if the strict ±10% band can't surface 3 candidates.
       Express: prep+cook <= 15 min, ranked by low-friction tags first
       (No-Cook/One-Pot/One-Pan/One-Skillet/Quick) then by speed.
     Both stay within the meal's own slot eligibility (or, for an
     unscheduled meal, the source recipe's own eligible slots). */
  var SRE_EQUIPMENT_TAGS = [
    "Skillet", "One-Skillet", "One-Pan", "One-Pot", "Sheet-Pan",
    "Grill-Ready", "Grilled", "Air Fryer", "Crockpot", "Instant-Pot", "Casserole"
  ];
  var SRE_EXPRESS_LOW_FRICTION_TAGS = ["No-Cook", "One-Pot", "One-Pan", "One-Skillet", "Quick"];
  var SRE_EXPRESS_MAX_MINS = 15;
  var SRE_MACRO_TOLERANCES = [0.10, 0.20, 0.35];

  function sreTargetSlots(m, source) {
    return m.slot ? [m.slot] : classifyMealSlots(source);
  }
  function sreSharedTagCount(a, b) {
    var bTags = b.tags || [];
    return (a.tags || []).filter(function (t) { return bTags.indexOf(t) >= 0; }).length;
  }
  function sreEquipmentMatch(a, b) {
    var aEq = (a.tags || []).filter(function (t) { return SRE_EQUIPMENT_TAGS.indexOf(t) >= 0; });
    var bEq = (b.tags || []).filter(function (t) { return SRE_EQUIPMENT_TAGS.indexOf(t) >= 0; });
    return aEq.some(function (t) { return bEq.indexOf(t) >= 0; });
  }
  function sreWithinTolerance(sourceVal, candVal, tolerance) {
    if (sourceVal === 0) return Math.abs(candVal - sourceVal) <= 1;
    return Math.abs(candVal - sourceVal) / Math.abs(sourceVal) <= tolerance;
  }
  function sreMacroWithinBand(source, candidate, tolerance) {
    var sm = source.macro_profiles && source.macro_profiles.serving_2;
    var cm = candidate.macro_profiles && candidate.macro_profiles.serving_2;
    if (!sm || !cm) return false;
    return sreWithinTolerance(sm.protein_g || 0, cm.protein_g || 0, tolerance) &&
           sreWithinTolerance(sm.carbs_g   || 0, cm.carbs_g   || 0, tolerance) &&
           sreWithinTolerance(sm.fat_g     || 0, cm.fat_g     || 0, tolerance);
  }
  function sreIsoCandidates(m) {
    var source = recipeById(m.id);
    if (!source) return [];
    var slots = sreTargetSlots(m, source);
    var pool = recipes().filter(function (r) {
      return r.recipe_id !== source.recipe_id &&
        slots.some(function (slot) { return isMealEligible(r, slot); });
    });
    var matches = [];
    for (var i = 0; i < SRE_MACRO_TOLERANCES.length; i++) {
      matches = pool.filter(function (r) { return sreMacroWithinBand(source, r, SRE_MACRO_TOLERANCES[i]); });
      if (matches.length >= 3) break;
    }
    if (matches.length < 3) matches = pool.slice(); // last resort: drop the macro band entirely
    matches.sort(function (a, b) {
      function score(r) {
        return (r.dish_category === source.dish_category ? 100 : 0) +
               (sreEquipmentMatch(source, r) ? 30 : 0) +
               sreSharedTagCount(source, r) * 5;
      }
      return score(b) - score(a);
    });
    return matches.slice(0, 3);
  }
  function sreExpressScore(r) {
    var tags = r.tags || [];
    var bonus = tags.filter(function (t) { return SRE_EXPRESS_LOW_FRICTION_TAGS.indexOf(t) >= 0; }).length;
    var total = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
    return bonus * 100 - total;
  }
  function sreExpressCandidates(m) {
    var source = recipeById(m.id);
    if (!source) return [];
    var slots = sreTargetSlots(m, source);
    var pool = recipes().filter(function (r) {
      if (r.recipe_id === source.recipe_id) return false;
      var total = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
      if (total <= 0 || total > SRE_EXPRESS_MAX_MINS) return false;
      return slots.some(function (slot) { return isMealEligible(r, slot); });
    });
    pool.sort(function (a, b) { return sreExpressScore(b) - sreExpressScore(a); });
    return pool.slice(0, 3);
  }
  // Swaps a meal's recipe in place (keeps day/slot/serving); resets
  // completion since it's now literally a different dish. The grocery list
  // and macro tally sync automatically on next render — both are always
  // derived fresh from planMeals(), never cached.
  function swapMeal(uid, newRecipeId) {
    var p = loadPlan();
    var m = p.meals.filter(function (x) { return x.uid === uid; })[0];
    if (!m) return;
    if (m.completed) unlogMealMacros(uid);
    m.id = newRecipeId;
    m.completed = false;
    m.completedAt = null;
    savePlan(p);
  }

  /* ── Batch-prep day suggestion ─────────────────────────────────────────
     Pure post-generation grouping pass over a Smart Week grid (Balanced or
     Macro-Targeted, either produces the same { day, slot, id } shape) — no
     new persisted state, re-derived every time like the grocery list
     already is. Finds the equipment-style tag (reusing Smart Replacement's
     SRE_EQUIPMENT_TAGS) shared by the most meals in the grid, and surfaces
     it as a dismissible callout naming the day that already has the most
     of them, so cooking those together is a smaller lift. It's advisory
     only: it never touches the grid or the committed plan itself. */
  var PREP_DAY_MIN_MEALS = 3; // below this, grouping isn't worth surfacing
  function prepDaySuggestion(grid) {
    if (!grid.length) return null;
    var byTag = {};
    grid.forEach(function (g) {
      var r = recipeById(g.id);
      if (!r) return;
      (r.tags || []).forEach(function (t) {
        if (SRE_EQUIPMENT_TAGS.indexOf(t) < 0) return;
        (byTag[t] || (byTag[t] = [])).push(g);
      });
    });
    var bestTag = null, bestEntries = null;
    Object.keys(byTag).forEach(function (t) {
      var entries = byTag[t];
      if (entries.length < PREP_DAY_MIN_MEALS) return;
      if (!bestEntries || entries.length > bestEntries.length) { bestTag = t; bestEntries = entries; }
    });
    if (!bestTag) return null;
    var dayCounts = {};
    bestEntries.forEach(function (g) { dayCounts[g.day] = (dayCounts[g.day] || 0) + 1; });
    var day = DAYS.filter(function (d) { return dayCounts[d]; })
      .sort(function (a, b) { return dayCounts[b] - dayCounts[a] || DAYS.indexOf(a) - DAYS.indexOf(b); })[0];
    return { tag: bestTag, count: bestEntries.length, day: day };
  }

  /* ── Dish-type categories ─────────────────────────────────────────── */
  // Each recipe declares exactly one `dish_category`, so a recipe always has a
  // single home. Per-category icon/accent/blurb drive the Categories cards.
  var CATEGORY_ORDER = [
    "Breakfast",
    "Salads & Slaws",
    "Soups, Stews & Chilis",
    "Casseroles & Bakes",
    "Skillets & Stir-Fries",
    "Grilled & Sheet-Pan",
    "Sandwiches",
    "Desserts",
    "Salsas & Dips",
    "Sauces",
    "Marinades"
  ];
  var CATEGORY_META = {
    "Breakfast":             { icon: "🍳", accent: "#E0A458", blurb: "Eggs, hashes, and morning plates to start the day strong." },
    "Salads & Slaws":        { icon: "🥗", accent: "#7D8C77", blurb: "Crisp, bright bowls and big-ass salads." },
    "Soups, Stews & Chilis": { icon: "🥣", accent: "#C0633F", blurb: "Low-and-slow pots, broths, and bowls of comfort." },
    "Casseroles & Bakes":    { icon: "🧀", accent: "#C87A53", blurb: "Bubbling, golden, oven-baked one-dish dinners." },
    "Skillets & Stir-Fries": { icon: "🥘", accent: "#B5894E", blurb: "Fast, high-heat one-pan meals." },
    "Grilled & Sheet-Pan":   { icon: "🔥", accent: "#A65A3A", blurb: "Char, smoke, and hands-off sheet-pan roasts." },
    "Sandwiches":            { icon: "🥪", accent: "#B98A4B", blurb: "Stacked, handheld, low-carb-friendly bites." },
    "Desserts":              { icon: "🍰", accent: "#C9738B", blurb: "Icebox cakes, trifles, and sweet make-ahead treats." },
    "Salsas & Dips":         { icon: "🌶️", accent: "#C1442E", blurb: "Fresh, no-cook salsas and dips for chips, tacos, and grilled everything." },
    "Sauces":                { icon: "🥄", accent: "#BF7A3D", blurb: "Sauces for any meal — protein-packed yogurt drizzles and buttery pasta sauces alike." },
    "Marinades":             { icon: "🧂", accent: "#A63D2F", blurb: "No-cook marinades to build a crust and lock in flavor before the grill." }
  };
  // A small curated month→category weight table (no data-model change — no
  // season tag exists in recipes-data.js) applied as a minor score bonus in
  // both Smart Week generation and the "For You" carousel below.
  var SEASON_CATEGORY_BONUS = {
    winter: { "Soups, Stews & Chilis": 8, "Casseroles & Bakes": 5 },
    spring: { "Salads & Slaws": 5, "Sandwiches": 3 },
    summer: { "Grilled & Sheet-Pan": 8, "Salsas & Dips": 5, "Salads & Slaws": 5 },
    fall:   { "Soups, Stews & Chilis": 5, "Casseroles & Bakes": 5, "Desserts": 3 }
  };
  function currentSeason() {
    var m = new Date().getMonth();   // 0=Jan..11=Dec
    if (m === 11 || m <= 1) return "winter";
    if (m <= 4) return "spring";
    if (m <= 7) return "summer";
    return "fall";
  }
  function seasonalWeight(dishCategory) {
    var bonus = SEASON_CATEGORY_BONUS[currentSeason()] || {};
    return bonus[dishCategory] || 0;
  }
  function presentCategories() {
    return CATEGORY_ORDER.filter(function (c) {
      return recipes().some(function (r) { return r.dish_category === c; });
    });
  }
  function recipesInCategory(cat) {
    return recipes().filter(function (r) { return r.dish_category === cat; });
  }

  // Compact bottom stat row for a recipe card — one authored serving's
  // Cal/Protein/Fat/Carbs, matching recipe.html's macro card exactly (no
  // division by serving count; see macrosFor() there).
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

  /* ── Shared: a recipe card (used by Categories / Recipes / Favorites) ── */
  function recipeCard(r, opts) {
    opts = opts || {};
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
    // the same way recipe.html's macro card does. Do not divide by serving count.
    var tier = (opts.serving || (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2);
    var m = (r.macro_profiles && r.macro_profiles["serving_" + tier]) ||
      (r.macro_profiles && r.macro_profiles["serving_" + (r.native_serving || 2)]) || {};

    // Pantry-match badge — only passed in from the Recipes screen's
    // "Low-shopping" filter, so this card doesn't change anywhere else.
    var pantryBadge = "";
    if (opts.pantryInfo) {
      pantryBadge = '<div class="rc-pantry-badge">' +
        (opts.pantryInfo.need === 0 ? "Have everything"
          : "Need " + opts.pantryInfo.need + (opts.pantryInfo.need === 1 ? " item" : " items")) +
        "</div>";
    }

    card.innerHTML =
      '<div class="rc-band">' +
        '<span class="rc-sheen" style="animation-delay:' + cardSheenDelay(r.recipe_id) + '"></span>' +
        '<span class="rc-icon">' + recipeIconHtml(r.icon) + "</span>" +
      "</div>" +
      '<div class="rc-body">' +
        '<h3 class="rc-title">' + esc(r.title) + "</h3>" +
        macroStatsHtml(m) +
        pantryBadge +
      "</div>";

    // A heart in the card's upper-right corner — favorite straight from the
    // grid. Filled when saved, outline when not; tapping flips it in place. On
    // the Favorites screen, un-saving also drops the card out of the list.
    var saved = loadFavs().has(r.recipe_id);
    var heart = el("button", "fav-toggle" + (saved ? " on" : ""), saved ? "❤" : "♡");
    heart.type = "button";
    heart.setAttribute("aria-label", saved ? "Remove from favorites" : "Add to favorites");
    heart.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var on = toggleFav(r.recipe_id);
      if (opts.fav) { renderFavorites(); return; }   // drop out of the favorites grid
      heart.classList.toggle("on", on);
      heart.textContent = on ? "❤" : "♡";
      heart.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
      pop(heart);
    });
    card.appendChild(heart);

    // One-tap plan-add, stacked below the heart — previously the only way
    // onto This Week's plan was leaving the card, going Home, and re-
    // searching for the same recipe by name in the planner's picker.
    var planBtn = el("button", "plan-toggle", "+");
    planBtn.type = "button";
    planBtn.setAttribute("aria-label", "Add to This Week");
    var planBtnTimer = null;
    planBtn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var meal = addMeal(r.recipe_id, { serving: opts.serving });
      planBtn.classList.add("added");
      planBtn.textContent = "✓";
      pop(planBtn);
      plannerToast("Added “" + r.title + "” to This Week", "Undo", function () {
        removeMeal(meal.uid);
      });
      clearTimeout(planBtnTimer);
      planBtnTimer = setTimeout(function () {
        planBtn.classList.remove("added");
        planBtn.textContent = "+";
      }, 1800);
    });
    card.appendChild(planBtn);

    // "Mike's pick" star — visible to EVERYONE on a curated recipe, so Mike's
    // taste reads across the whole app, not just inside the Mike's screen.
    if (isMikeFav(r.recipe_id)) {
      card.classList.add("mikes-pick");
      card.appendChild(mikesBadge());
    }

    // Owner-only curation: double-tap a card to add/remove it from Mike's
    // Favorites. Single tap still opens the recipe — but because the card is a
    // link, in owner mode we hold navigation ~280ms to see if a second tap
    // (the curate gesture) lands first. Visitors never enter this branch.
    if (isOwner()) {
      card.classList.add("owner-curatable");
      var tapTimer = null;
      card.addEventListener("click", function (e) {
        if (e.defaultPrevented) return;          // heart (stopPropagation) handled it
        e.preventDefault();
        if (tapTimer) {                          // second tap → curate
          clearTimeout(tapTimer); tapTimer = null;
          var on = toggleMikeFav(r.recipe_id);
          if (activeScreen() === "mikes") { renderMikes(); return; }
          card.classList.toggle("mikes-pick", on);
          var b = card.querySelector(".mikes-badge");
          if (on && !b) card.appendChild(mikesBadge());
          else if (!on && b) card.removeChild(b);
          pop(card);
        } else {                                 // first tap → maybe a single tap
          tapTimer = setTimeout(function () {
            tapTimer = null;
            window.location.href = card.href;    // confirmed single tap → navigate
          }, 280);
        }
      });
    }
    return card;
  }

  /* ══ HOME screen — the hub ══════════════════════════════════════════ */
  // Each module is a premium glass card (gradient + accent border + soft
  // glow), echoing the "Now Cooking" hero. A per-module accent (--hm) drives
  // the gradient, border, glow, and icon so the three read as a tactile set.
  function homeModule(opts) {
    var accent = clampAccent(opts.accent || "#C87A53");
    var b = el("button", "home-mod");
    b.type = "button";
    b.setAttribute("aria-label", opts.title);
    b.style.setProperty("--hm", accent);
    b.style.setProperty("--hm-rgb", rgbFromHex(accent));
    b.innerHTML =
      '<span class="home-mod-glow"></span>' +
      '<span class="home-mod-icon">' + esc(opts.icon) + "</span>" +
      '<span class="home-mod-text">' +
        '<span class="home-mod-title">' + esc(opts.title) + "</span>" +
        '<span class="home-mod-sub">' + esc(opts.sub) + "</span>" +
      "</span>" +
      '<span class="home-mod-arrow">→</span>';
    b.addEventListener("click", opts.onTap);
    return b;
  }

  /* ══ BACKUP & RESTORE — export/import the whole mc-cookbook: namespace ═
     The app is local-only: every byte of a cook's data (favorites, the weekly
     plan, grocery check-offs, their own recipes, per-recipe step/grocery
     check-offs) lives in localStorage under the mc-cookbook: namespace. This is
     the safety net — one tap writes it all to a portable JSON file, and a
     matching import restores it (also the stop-gap for moving a plan between
     phones until/if real sync ever lands). */
  var NS         = "mc-cookbook:";
  var BACKUP_KEY = "mc-cookbook:lastBackupAt";
  var BACKUP_FMT = 1;                         // backup-file schema version
  var backupBannerDismissed = false;          // per-session dismissal

  /* ── First-launch Quick Tour nudge ────────────────────────────────── */
  var TOUR_SEEN_KEY = "mc-cookbook:tourSeen";
  function tourSeen() {
    try { return localStorage.getItem(TOUR_SEEN_KEY) === "1"; }
    catch (e) { return true; } // storage unavailable — fail quiet, not nagging
  }
  function markTourSeen() {
    try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch (e) {}
  }
  function tourBanner() {
    var b = el("div", "backup-banner tour-banner");
    b.innerHTML =
      '<span class="backup-banner-icon">🎬</span>' +
      '<span class="backup-banner-text">New here? Take the 3-minute Quick Tour ' +
        "to see how the app works.</span>";
    var cta = el("button", "backup-banner-cta", "Take the tour →");
    cta.type = "button";
    cta.addEventListener("click", function () {
      markTourSeen();
      location.href = "quick-tour.html";
    });
    var x = el("button", "backup-banner-dismiss", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Dismiss");
    x.addEventListener("click", function () {
      markTourSeen();
      if (b.parentNode) b.parentNode.removeChild(b);
    });
    b.appendChild(cta);
    b.appendChild(x);
    return b;
  }

  function namespacedKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(NS) === 0) out.push(k);
    }
    return out;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function todayStamp() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function exportData() {
    var data = {};
    namespacedKeys().forEach(function (k) { data[k] = localStorage.getItem(k); });
    var payload = {
      app: "mikes-cookbook", version: BACKUP_FMT,
      exportedAt: new Date().toISOString(), data: data
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url  = URL.createObjectURL(blob);
    var a = el("a");
    a.href = url;
    a.download = "mikes-cookbook-backup-" + todayStamp() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch (e) {}
  }

  // Validate → confirm → clean-restore, reporting via done(ok, message). A
  // malformed or wrong-version file is rejected BEFORE anything is written, so
  // a bad import can never corrupt the data already on the device.
  function importData(file, done) {
    var reader = new FileReader();
    reader.onerror = function () { done(false, "Couldn't read that file."); };
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (e) { done(false, "That file isn't valid JSON."); return; }
      var data = parsed && parsed.data;
      if (!parsed || parsed.version !== BACKUP_FMT ||
          typeof data !== "object" || data === null || Array.isArray(data)) {
        done(false, "This doesn't look like a Mike's Cookbook backup file.");
        return;
      }
      if (!window.confirm("This replaces your current saved data with the backup. Continue?")) {
        done(false, null);                    // cancelled — no-op, not an error
        return;
      }
      try {
        namespacedKeys().forEach(function (k) { localStorage.removeItem(k); });
        Object.keys(data).forEach(function (k) {
          if (k.indexOf(NS) === 0 && data[k] != null) localStorage.setItem(k, String(data[k]));
        });
        done(true, null);
      } catch (e) {
        done(false, "Couldn't restore — your device storage may be full.");
      }
    };
    reader.readAsText(file);
  }

  function relativeDays(iso) {
    var then = Date.parse(iso || "");
    if (isNaN(then)) return null;
    var days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return days + " days ago";
  }
  function hasCookData() {
    return planMeals().length > 0 || loadFavs().size > 0 ||
           ((window.MCUser && window.MCUser.count()) || 0) > 0;
  }
  function backupIsStale() {
    var iso;
    try { iso = localStorage.getItem(BACKUP_KEY); } catch (e) { iso = null; }
    var then = Date.parse(iso || "");
    if (isNaN(then)) return true;             // never backed up (or unreadable)
    return (Date.now() - then) >= 14 * 86400000;
  }

  // Auto-drafted week: only offered when the plan is empty (homeAutoDraftEligible).
  // Reuses Smart Week's own generator/commit (smwGenerateWeek/commitSmartWeek) —
  // this is a new *trigger* for that existing code (shown proactively instead of
  // waiting for a button tap), not a new generator. The grid is cached in
  // homeAutoDraftGrid so Regenerate re-rolls it but a re-render (e.g. tab switch)
  // doesn't silently swap the draft out from under the cook.
  function renderAutoDraftCard() {
    if (!homeAutoDraftGrid) homeAutoDraftGrid = smwGenerateWeek("all").grid;
    var grid = homeAutoDraftGrid;
    var mealCount = grid.length;
    var recipeCount = Array.from(new Set(grid.map(function (g) { return g.id; }))).length;

    var card = el("div", "autodraft-card");
    card.innerHTML =
      '<p class="autodraft-eyebrow">✨ Drafted for you</p>' +
      '<h3 class="autodraft-title">This week, ready to review</h3>' +
      '<p class="autodraft-text">' +
        esc(mealCount + (mealCount === 1 ? " meal" : " meals") + " across " +
            recipeCount + (recipeCount === 1 ? " recipe" : " recipes") +
            " — a Balanced Smart Week, picked to avoid repeats.") +
      "</p>";

    var actions = el("div", "autodraft-actions");
    var use = el("button", "autodraft-use", "Use this week");
    use.type = "button";
    use.addEventListener("click", function () {
      var scope = SMART_SCOPES.filter(function (s) { return s.key === "all"; })[0];
      commitSmartWeek(grid, scope.slots);
      homeAutoDraftGrid = null;
      renderHome();
    });
    var regen = el("button", "autodraft-regen", "🔀 Regenerate");
    regen.type = "button";
    regen.addEventListener("click", function () {
      homeAutoDraftGrid = smwGenerateWeek("all").grid;
      renderHome();
    });
    var not = el("button", "autodraft-dismiss", "Not now");
    not.type = "button";
    not.addEventListener("click", function () {
      dismissAutoDraft();
      homeAutoDraftGrid = null;
      renderHome();
    });
    actions.appendChild(use);
    actions.appendChild(regen);
    actions.appendChild(not);
    card.appendChild(actions);
    return card;
  }

  // Dismissible inline nudge: only when a backup is stale AND there's data worth
  // protecting. Dismiss hides it for the session; an export clears it for good.
  function backupBanner() {
    var b = el("div", "backup-banner");
    b.innerHTML =
      '<span class="backup-banner-icon">🛟</span>' +
      '<span class="backup-banner-text">Back up your cookbook so a cleared ' +
        "browser can&rsquo;t wipe your plan &amp; favorites.</span>";
    var cta = el("button", "backup-banner-cta", "Back up →");
    cta.type = "button";
    cta.addEventListener("click", function () {
      var sec = $("#home-backup");
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    var x = el("button", "backup-banner-dismiss", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Dismiss backup reminder");
    x.addEventListener("click", function () {
      backupBannerDismissed = true;
      if (b.parentNode) b.parentNode.removeChild(b);
    });
    b.appendChild(cta);
    b.appendChild(x);
    return b;
  }

  function renderBackupSection() {
    var wrap = el("div", "home-backup");
    wrap.id = "home-backup";
    wrap.appendChild(el("div", "tier-label", "Backup &amp; Restore"));

    var card = el("div", "card backup-card");
    card.appendChild(el("p", "card-label", "Your cookbook lives on this device"));
    card.appendChild(el("p", "backup-copy",
      "Export a backup file to keep your favorites, weekly plan, grocery " +
      "check-offs, cook log and your own recipes safe — or to move them to " +
      "another phone. Cook-log photos are included, so a backup with photos " +
      "can be several MB. Importing replaces what&rsquo;s on this device."));

    var iso;
    try { iso = localStorage.getItem(BACKUP_KEY); } catch (e) { iso = null; }
    var rel = relativeDays(iso);
    var lastEl = el("p", "backup-last", rel ? "Last backup: " + esc(rel) : "No backup yet.");
    card.appendChild(lastEl);

    var actions = el("div", "backup-actions");
    var exportBtn = el("button", "backup-btn backup-export", "⬇&nbsp; Export backup");
    exportBtn.type = "button";
    var importBtn = el("button", "backup-btn backup-import", "⬆&nbsp; Import backup");
    importBtn.type = "button";
    var fileInput = el("input", "backup-file");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.hidden = true;

    var status = el("p", "backup-status", "");

    exportBtn.addEventListener("click", function () {
      exportData();
      lastEl.textContent = "Last backup: today";
      var banner = $(".backup-banner");
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      status.className = "backup-status ok";
      status.textContent = "Backup file downloaded ✓";
    });
    importBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = "";                   // allow re-importing the same file
      if (!file) return;
      importData(file, function (ok, msg) {
        if (ok) {
          status.className = "backup-status ok";
          status.textContent = "Restored ✓ Reloading…";
          // Reload so restored favorites, plan AND user recipes (merged at load)
          // all reflect the imported data immediately.
          setTimeout(function () { window.location.reload(); }, 700);
        } else if (msg) {
          status.className = "backup-status err";
          status.textContent = msg;
        }
      });
    });

    actions.appendChild(exportBtn);
    actions.appendChild(importBtn);
    card.appendChild(actions);
    card.appendChild(fileInput);
    card.appendChild(status);
    wrap.appendChild(card);
    return wrap;
  }

  /* ── "Today" glance card (Home) ────────────────────────────────────
     The hero above answers "what does my week look like"; this answers
     "what do I do right now" — the gap that sends someone to a notes app
     on a day the week is already planned. Only renders once something's
     actually scheduled for today; an empty week is already covered by the
     hero/auto-draft card. */
  function todayDayCode() {
    return DAYS[(new Date().getDay() + 6) % 7];   // JS getDay(): Sun=0..Sat=6
  }
  // The empty-plan hero used to read the same at 7am Monday and 9pm Friday —
  // varying it by day-of-week/time-of-day signals the app "knows" the
  // moment instead of showing one static line year-round. Pure client-side
  // Date() logic, no new state.
  // Roadmap B2 — workout-aware Home nudge. Real training signal from the
  // bridge takes priority over the generic time-of-day copy below: a
  // trainee who actually trained today (or is mid-streak) gets a specific
  // line instead of a generic prompt. Returns null with no bridge / signed
  // out / no real signal today, so emptyHeroCopy() falls through unchanged.
  function trainingNudgeCopy() {
    if (!window.MCBridge) return null;
    var workout = MCBridge.todaysWorkout();
    if (workout.trainedToday) {
      var todaysName = (MCBridge.recentActivity().recentWorkouts || [])
        .filter(function (w) { return w.date && ymd(new Date(w.date)) === ymd(new Date()); })
        .map(function (w) { return w.name; })[0];
      return (todaysName ? esc(todaysName) + " today" : "You trained today") +
        " — plan meals that fuel the recovery. A protein-forward day's ready when you are.";
    }
    var streak = MCBridge.recentActivity().streak;
    if (streak >= 3) {
      return "🔥 " + streak + "-day training streak — keep the fuel matching the work. Plan today's meals.";
    }
    return null;
  }
  function emptyHeroCopy() {
    var trainingCopy = trainingNudgeCopy();
    if (trainingCopy) return trainingCopy;
    var hour = new Date().getHours();
    var isWeekend = todayDayCode() === "Sat" || todayDayCode() === "Sun";
    if (isWeekend) {
      return "Weekend's a good time to batch-plan the week ahead — pick meals and get one smart grocery list.";
    }
    if (hour < 11) {
      return "Plan today's meals before the day gets away from you — one smart grocery list, every recipe included.";
    }
    if (hour < 17) {
      return "Get ahead of tonight — pick a few meals now and build your grocery list.";
    }
    return "Plan tomorrow before you turn in — wake up to a week that's already sorted.";
  }
  // Home-screen presence without opening the app — an installed PWA can
  // still show a count on its icon via the Badging API, no push/backend
  // needed. Purely client-side and degrades silently where unsupported.
  function updateAppBadge() {
    if (!(navigator.setAppBadge || navigator.clearAppBadge)) return;
    var code = todayDayCode();
    var unlogged = planMeals().filter(function (m) { return m.day === code && !m.completed; }).length;
    try {
      if (unlogged > 0 && navigator.setAppBadge) navigator.setAppBadge(unlogged);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (e) {}
  }
  // Roadmap B3 — the reverse of the workout dashboard's own cross-app strip:
  // a short line of real training status from the bridge, so this card
  // becomes a genuine "what am I doing today, both apps" glance instead of
  // meals-only. null with no bridge / no real signal today.
  function todayWorkoutBadge() {
    if (!window.MCBridge) return null;
    var w = MCBridge.todaysWorkout();
    if (w.trainedToday) return "🏋️ Trained today";
    if (w.streak >= 1) return "🔥 " + w.streak + "-day training streak";
    return null;
  }
  function renderTodayCard() {
    var code = todayDayCode();
    var todays = planMeals().filter(function (m) { return m.day === code; });
    var workoutBadge = todayWorkoutBadge();
    if (!todays.length && !workoutBadge) return null;

    var card = el("div", "home-hero-card today-card");
    card.appendChild(el("p", "home-hero-eyebrow", "Today · " + DAY_LONG[code]));
    if (workoutBadge) card.appendChild(el("div", "today-workout-badge", esc(workoutBadge)));
    if (!todays.length) return card; // workout signal only — no meals planned today

    var list = el("div", "today-meals");
    todays.forEach(function (m) {
      var r = recipeById(m.id);
      if (!r) return;
      var row = el("div", "today-meal" + (m.completed ? " done" : ""));
      row.innerHTML =
        '<span class="today-meal-slot">' + esc(m.slot || "") + "</span>" +
        '<span class="today-meal-title">' + esc(r.title) + "</span>";
      if (m.completed) {
        row.appendChild(el("span", "today-meal-check", "✓ Logged"));
      } else {
        var logBtn = el("button", "today-meal-log", "Log");
        logBtn.type = "button";
        logBtn.addEventListener("click", function () {
          var before = todayTotalsSnapshot();
          toggleMealCompleted(m.uid);
          celebrateMealLogged(before);
          renderHome();
        });
        row.appendChild(logBtn);
      }
      list.appendChild(row);
    });
    card.appendChild(list);

    if (window.MCTrackerStore) {
      var goals = MCTrackerStore.getGoals();
      if (goals) {
        var totals = MCTrackerStore.totalsOf(MCTrackerStore.entriesFor(MCTrackerStore.todayKey()));
        var strip = el("div", "today-macros");
        [["kcal", "Cal", goals.kcal], ["p", "Protein", goals.p], ["f", "Fat", goals.f], ["c", "Carbs", goals.c]]
          .forEach(function (t) {
            var have = totals[t[0]] || 0, goal = t[2] || 0;
            var pct = goal ? Math.min(100, Math.round((have / goal) * 100)) : 0;
            var tile = el("div", "today-macro");
            tile.innerHTML =
              '<span class="today-macro-lbl">' + t[1] + "</span>" +
              '<span class="today-macro-val">' + have + (goal ? "/" + goal : "") + "</span>" +
              '<span class="today-macro-track"><span class="today-macro-fill" style="width:' + pct + '%"></span></span>';
            strip.appendChild(tile);
          });
        card.appendChild(strip);
        var link = el("a", "today-tracker-link", "Open Tracker →");
        link.href = "#tracker";
        link.addEventListener("click", function (e) { e.preventDefault(); setTab("tracker"); });
        card.appendChild(link);
      }
    }
    return card;
  }

  /* ── "For You" recommendation carousel (Home) ────────────────────────
     Independent of the planner's weekly-intent flow (Smart Week) — a small
     always-visible strip so Home has something to say even when nobody's
     building a plan. Ranks by favorite-tag overlap, Mike's-pick status, and
     the same seasonal category bonus Smart Week uses, deprioritizing
     anything cooked in the last two weeks so it doesn't just repeat the
     Today card. */
  var FORYOU_MIKES_BONUS = 6;
  var FORYOU_RECENT_PENALTY = 12;
  var FORYOU_RECENT_DAYS = 14;
  function forYouCandidates(limit) {
    var favIds = loadFavs();
    var favRecipes = recipes().filter(function (r) { return favIds.has(r.recipe_id); });
    var tagWeight = {};
    favRecipes.forEach(function (r) {
      (r.tags || []).forEach(function (t) { tagWeight[t] = (tagWeight[t] || 0) + 1; });
    });
    var hasTasteSignal = Object.keys(tagWeight).length > 0;
    var scored = recipes()
      .filter(function (r) { return !favIds.has(r.recipe_id); })   // favorites have their own screen
      .map(function (r) {
        var score = 0;
        (r.tags || []).forEach(function (t) { if (tagWeight[t]) score += tagWeight[t]; });
        if (isMikeFav(r.recipe_id)) score += FORYOU_MIKES_BONUS;
        score += seasonalWeight(r.dish_category);
        var days = daysSinceCooked(r.recipe_id);
        if (days != null && days < FORYOU_RECENT_DAYS) score -= FORYOU_RECENT_PENALTY;
        score += Math.random() * 3;   // light jitter so ties don't render identically every visit
        return { r: r, score: score };
      });
    // With no favorites yet (fresh install) every score is jitter-plus-
    // seasonal — fine on its own, but Mike's curated picks are a better
    // "here's something worth trying" default than an arbitrary data-order
    // tie-break would be.
    if (!hasTasteSignal) {
      scored.forEach(function (x) { if (isMikeFav(x.r.recipe_id)) x.score += FORYOU_MIKES_BONUS; });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit).map(function (x) { return x.r; });
  }
  function renderForYouCarousel() {
    var picks = forYouCandidates(8);
    if (picks.length < 3) return null;   // too few real candidates to feel curated
    var wrap = el("div", "foryou");
    wrap.appendChild(el("div", "tier-label", "For You"));
    var row = el("div", "foryou-row");
    picks.forEach(function (r) {
      var accent = clampAccent(r.accent || "#C87A53");
      var card = el("a", "foryou-card");
      card.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
      card.style.setProperty("--rc-accent", accent);
      card.style.setProperty("--rc-accent-rgb", rgbFromHex(accent));
      card.innerHTML =
        '<span class="foryou-icon">' + recipeIconHtml(r.icon) + "</span>" +
        '<span class="foryou-title">' + esc(r.title) + "</span>";
      row.appendChild(card);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function renderHome() {
    var s = $("#screen-home");
    s.innerHTML = "";

    var bar = topBar("Mike's", "Cookbook",
      "Heirloom hand-me-downs & performance plates.");
    bar.appendChild(el("p", "home-premise",
      "Whole-food, low-carb cooking — built around a two-meals-a-day rhythm."));
    // Hidden owner unlock lives on the "Mike's" eyebrow (5 quick taps).
    var eyebrow = $(".shell-eyebrow", bar);
    if (eyebrow) wireOwnerUnlock(eyebrow);
    // Search was only discoverable from inside the Recipes screen — give Home
    // (the hub every visit starts from) a one-tap way in.
    var searchBtn = el("button", "home-search-btn", "🔍");
    searchBtn.type = "button";
    searchBtn.setAttribute("aria-label", "Search recipes");
    searchBtn.addEventListener("click", function () {
      focusRecipesSearch = true;
      setTab("recipes");
    });
    bar.appendChild(searchBtn);

    // Reciprocal nav to the workout app (roadmap B3) — same origin as this
    // app (different path), so the signed-in Supabase session there is
    // already visible here via ordinary same-origin localStorage sharing;
    // no token hand-off needed for this link to land signed in. The
    // absolute URL names a specific personal deployment, so it's swapped
    // for a relative link when this file is mounted inside the Rolodex
    // market build (a separate, white-label product) — same treatment
    // dashboard.html's own cookbook-nav link already gets in reverse.
    var workoutBtn = el("a", "home-workout-btn", "🏋️");
    workoutBtn.href = "../dashboard.html";
    workoutBtn.setAttribute("aria-label", "Open the workout app");
    workoutBtn.title = "4 Weeks to Open — workout app";
    bar.appendChild(workoutBtn);

    // Account entry point (sign in / sync) — no-op mount() if MC_SB isn't
    // configured or mc-account.js isn't loaded.
    if (window.MCAccount) MCAccount.mount(bar);

    s.appendChild(bar);

    // First-launch nudge: Quick Tour used to be reachable only via a Help-tier
    // link at the very bottom of Home, with no signal a brand-new user should
    // scroll all the way down to find it. Shows once, dismissed permanently by
    // either taking the tour or explicitly closing it.
    if (!tourSeen()) s.appendChild(tourBanner());

    // Safety-net nudge: stale backup + data worth protecting.
    if (!backupBannerDismissed && backupIsStale() && hasCookData()) {
      s.appendChild(backupBanner());
    }

    // Hero — the weekly meal planner entry (replaces the old "Now Cooking"
    // collection spotlight). Reflects the live plan and opens the planner spoke.
    var mealCount   = planMeals().length;
    var recipeCount = planRecipeIds().length;
    var planned     = mealCount > 0;

    var hero = el("div", "home-hero");
    var hc = el("div", "home-hero-card planner-hero");
    hc.innerHTML =
      '<p class="home-hero-eyebrow">This Week</p>' +
      '<h2 class="home-hero-title">' +
        (planned ? mealCount + (mealCount === 1 ? " meal planned" : " meals planned")
                 : "Plan your week") + "</h2>" +
      '<p class="home-hero-text">' +
        (planned
          ? esc(recipeCount + (recipeCount === 1 ? " recipe" : " recipes") +
                " · tap to see your combined grocery list and cook the week.")
          : emptyHeroCopy()) +
      "</p>";
    var cta = el("a", "home-cta", planned ? "Open planner →" : "Start planning →");
    cta.href = "#planner";
    cta.addEventListener("click", function (e) { e.preventDefault(); setTab("planner"); });
    hc.appendChild(cta);

    // Consistency streak — derived only (cook log + tracker entries), no new
    // storage. Shown on the hero itself, not a separate card, so it reads as
    // part of "this is how you're doing" rather than competing for attention.
    var streak = activeStreakDays();
    if (streak > 0) {
      hc.appendChild(el("div", "home-streak", "🔥 " + streak + "-day streak"));
    }

    hero.appendChild(hc);
    s.appendChild(hero);

    // "Today" glance — only renders when today itself has something planned,
    // so it complements rather than duplicates the auto-draft card below
    // (which only ever shows for a fully empty week).
    var todayCard = renderTodayCard();
    if (todayCard) s.appendChild(todayCard);

    var recapCard = renderWeeklyRecapCard();
    if (recapCard) s.appendChild(recapCard);

    // Auto-drafted week: only when there's no plan yet and the offer isn't
    // on cooldown (dismissed recently). Sits right under the hero so it
    // reads as "here's a start" rather than competing with it.
    if (!planned && homeAutoDraftEligible()) {
      s.appendChild(renderAutoDraftCard());
    }

    var forYou = renderForYouCarousel();
    if (forYou) s.appendChild(forYou);

    // Browse modules — two labeled sections keep the Home screen scannable.
    var browse = el("div", "home-browse");

    // — Explore section: browse the full recipe library —
    browse.appendChild(el("div", "tier-label", "Explore"));
    browse.appendChild(homeModule({
      icon: "🍽️", title: "Categories", accent: "#C87A53",
      sub: "By dish type · " + presentCategories().length + " types",
      onTap: function () { setTab("categories"); }
    }));
    browse.appendChild(homeModule({
      icon: "📖", title: "Recipes", accent: "#D9A05B",
      sub: "By collection · " + collections().length + " collections · " + recipes().length + " recipes",
      onTap: function () { setTab("recipes"); }
    }));

    // — Your Library section: personal saves + custom recipes —
    browse.appendChild(el("div", "tier-label", "Your Library"));
    var mikeCount = mikesList().length;
    browse.appendChild(homeModule({
      icon: "⭐", title: "Mike's Favorites", accent: "#E0A458",
      sub: mikeCount
        ? mikeCount + (mikeCount === 1 ? " recipe Mike loves" : " recipes Mike loves")
        : "Recipes Mike has made and loved",
      onTap: function () { setTab("mikes"); }
    }));
    var favCount = loadFavs().size;
    browse.appendChild(homeModule({
      icon: "❤", title: "Favorites", accent: "#FF5A6E",
      sub: favCount ? favCount + (favCount === 1 ? " saved recipe" : " saved recipes")
                    : "Tap the heart on any recipe to save it",
      onTap: function () { setTab("favorites"); }
    }));
    var userCount = (window.MCUser && window.MCUser.count()) || 0;
    browse.appendChild(homeModule({
      icon: "📝", title: "Add Recipe", accent: "#7D8C77",
      sub: userCount
        ? "Your library · " + userCount + (userCount === 1 ? " recipe" : " recipes")
        : "Create your own or add to your library",
      onTap: function () { openRecipeForm(); }
    }));

    // — Help section —
    browse.appendChild(el("div", "tier-label", "Help"));
    browse.appendChild(homeModule({
      icon: "🎬", title: "Quick Tour", accent: "#C87A53",
      sub: "3-min guided walkthrough of the app",
      onTap: function () { location.href = "quick-tour.html"; }
    }));
    s.appendChild(browse);

    s.appendChild(renderBackupSection());

    // Ambient cloud-sync status (roadmap B4 — ported from 4-Weeks-to-Open-'s
    // mc-backup-status.js so both apps give the same "is my data actually
    // synced?" confidence signal). Distinct from the Backup & Restore card
    // above (a manual local-file export/import), this is the live "☁️ Backed
    // up · 2m ago" ticker fed by mc-sync.js. Hidden entirely signed-out.
    var backupStatus = el("div", null, "");
    backupStatus.id = "backupStatus";
    backupStatus.style.display = "none";
    s.appendChild(backupStatus);
    // mc-backup-status.js caches nothing across renders (this SPA rebuilds
    // Home's DOM every visit) — ask it to refresh immediately instead of
    // waiting up to 15s for its own interval tick.
    if (window.MC_BACKUP_STATUS) MC_BACKUP_STATUS.refresh();
  }

  /* ── Shared spoke top bar with a "‹ <label>" anchor ───────────────── */
  // Deliberately a fixed-target button, not history.back() — setTab() uses
  // replaceState (never pushState), so the shell has no real per-screen
  // history stack to go back through. cookbook-nav.js's standalone-page Back
  // FAB *is* history-based, which is correct there since recipe.html/
  // collection.html are genuine separate page loads with real history
  // entries. The two models look inconsistent but aren't interchangeable —
  // making this one history-aware would navigate out of the app instead of
  // to a previous screen.
  function backTopBar(backLabel, title, sub, onBack) {
    var t = el("div", "shell-top");
    var back = el("button", "col-back", backLabel);
    back.type = "button";
    back.addEventListener("click", onBack);
    t.appendChild(back);
    t.appendChild(el("h1", "shell-title", esc(title)));
    if (sub) t.appendChild(el("p", "shell-sub", esc(sub)));
    return t;
  }

  /* ══ MACRO TRACKER screen — mounts the standalone tracker (tracker.js) ══ */
  // The tracker owns its own calendar / summary / hourly-timeline UI; the shell
  // just provides the "‹ Home" frame and a mount point so back-nav is uniform.
  function renderTracker() {
    var s = $("#screen-tracker");
    if (!s) return;
    s.innerHTML = "";
    s.appendChild(backTopBar("‹ Home", "Macro Tracker", "Track your day, by the hour",
      function () { setTab("home"); }));
    var body = el("div", "tracker-body");
    s.appendChild(body);
    if (window.MCTracker && MCTracker.mount) MCTracker.mount(body);
    else {
      // tracker.js loads synchronously before this ever runs in normal use,
      // so this is a rare defensive fallback — but a plain text apology read
      // as an afterthought. A skeleton pulse at least hints at the shape of
      // what's about to render, same as any other brief loading state.
      var skel = el("div", "tracker-skeleton");
      skel.appendChild(el("div", "skel-bar skel-bar-1"));
      skel.appendChild(el("div", "skel-bar skel-bar-2"));
      skel.appendChild(el("div", "skel-bar skel-bar-3"));
      body.appendChild(skel);
    }
  }

  /* ══ CATEGORIES screen — the 7 dish types, then a per-category grid ══ */
  // Default view: one premium card per category (reuses the .cat-card look).
  // Tapping a card drills into that category's recipe grid.
  var catState = { open: null };

  function categoryCard(cat) {
    var meta = CATEGORY_META[cat] || {};
    var accent = clampAccent(meta.accent || "#C87A53");
    var n = recipesInCategory(cat).length;

    var card = el("a", "cat-card");
    card.href = "#categories";
    card.style.setProperty("--cc", accent);
    card.style.setProperty("--cc-rgb", rgbFromHex(accent));
    card.innerHTML =
      '<span class="cc-glow"></span>' +
      '<span class="cc-sheen"></span>' +
      '<span class="cat-icon">' + recipeIconHtml(meta.icon) + "</span>" +
      '<div class="cat-tag">Category</div>' +
      '<div class="cat-name">' + esc(cat) + "</div>" +
      '<div class="cat-meta">' + esc(meta.blurb || "") + "</div>" +
      '<div class="cat-count">' + n + (n === 1 ? " Recipe →" : " Recipes →") + "</div>";
    card.addEventListener("click", function (e) {
      e.preventDefault();
      catState.open = cat;
      renderCategories();
      window.scrollTo(0, 0);
    });
    return card;
  }

  function renderCategories() {
    var s = $("#screen-categories");
    s.innerHTML = "";

    if (catState.open) { renderCategoryDetail(s, catState.open); return; }

    s.appendChild(backTopBar("‹ Home", "Categories", "Browse by dish type",
      function () { setTab("home"); }));
    var wrap = el("div", "cards-wrap");
    presentCategories().forEach(function (cat) { wrap.appendChild(categoryCard(cat)); });
    s.appendChild(wrap);
  }

  function renderCategoryDetail(s, cat) {
    var list = recipesInCategory(cat);
    s.appendChild(backTopBar("‹ Categories", cat,
      list.length + (list.length === 1 ? " recipe" : " recipes"),
      function () { catState.open = null; renderCategories(); window.scrollTo(0, 0); }));

    if (!list.length) {
      s.appendChild(el("div", "empty",
        '<span class="empty-emoji">🍽️</span>No recipes in this category yet.'));
      return;
    }
    var grid = el("div", "col-grid");
    list.forEach(function (r) { grid.appendChild(recipeCard(r)); });
    s.appendChild(grid);
  }

  /* ══ RECIPES screen — collection cards + app-wide search ════════════ */
  // Default view = flagship collection cards. Once a search query is active,
  // the screen switches to a flat grid of matching recipe cards drawn from ALL
  // recipes. Dish-type browsing lives on the Categories spoke.
  function recipesMatch(r, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if ((r.title || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((r.dish_category || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((r.category || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((r.tags || []).join(" ").toLowerCase().indexOf(q) >= 0) return true;
    var ing = r.ingredients_by_serving &&
      r.ingredients_by_serving["serving_" + (r.native_serving || 2)];
    if (ing && ing.some(function (i) { return (i.item || "").toLowerCase().indexOf(q) >= 0; })) return true;
    return false;
  }

  // Set by Home's search button so this screen's box grabs focus (and the
  // keyboard opens) the moment it renders, instead of landing on a static list.
  var focusRecipesSearch = false;

  // Persists only for the JS runtime (like catState/plannerState) — resets
  // to off on a fresh load rather than sticking on silently across visits.
  var recipesState = { lowShopping: false, category: null, macro: null };

  // ── Workout-app macro handoff (index.html?mkcal=620&mp=42#recipes) ────────
  // The training app's nutrition tab links here with the day's remaining
  // calories/protein; the Recipes screen answers with recipes that fit.
  // Params are consumed once and stripped from the URL (mirrors the
  // cookbook → tracker handoff in tracker-recipe.js, just pointed back).
  var macroHandoff = (function () {
    try {
      var q = new URLSearchParams(location.search);
      if (!q.has("mkcal")) return null;
      // dt (day-type) is optional — the workout app only sends it when it can
      // confidently tell what today's session trained; 'legs' biases the
      // suggestions toward carb-forward recipes (see macroHandoffMatches).
      var h = { kcal: parseInt(q.get("mkcal"), 10) || 0, p: parseInt(q.get("mp"), 10) || 0, dt: q.get("dt") || null };
      q.delete("mkcal"); q.delete("mp"); q.delete("dt");
      var qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
      return h.kcal > 0 ? h : null;
    } catch (e) { return null; }
  })();

  function macroHandoffMatches() {
    // Recipes that fit inside what's left of the day (small tolerance so a
    // 610-kcal plate still shows for 600 left), best protein payload first.
    var pool = recipes()
      .map(function (r) { var m = recipeNativeMacros(r); return { r: r, m: m }; })
      .filter(function (x) { return (x.m.calories || 0) > 0 && (x.m.calories || 0) <= macroHandoff.kcal + 25; });
    // Leg day → carb-forward first, replenishing what a heavy lower-body
    // session actually burns — but only if that leaves enough real options,
    // same "prefer, don't force" guard as the workout app's own history-aware
    // Quick Pump biasing.
    if (macroHandoff.dt === "legs") {
      var carbForward = pool.filter(function (x) { return MACRO_FACETS.carbforward.test(x.m); });
      if (carbForward.length >= 3) pool = carbForward;
    }
    return pool
      .sort(function (a, b) { return (b.m.protein_g || 0) - (a.m.protein_g || 0); })
      .slice(0, 6)
      .map(function (x) { return x.r; });
  }
  // "Need 2 or fewer" keeps the filter meaningfully narrower than "browse
  // everything," while still surfacing real dishes, not just the ones with
  // the shortest ingredient lists.
  var LOW_SHOPPING_MAX_NEED = 2;
  var MACRO_FACETS = {
    protein: { label: "🍗 High Protein", test: function (m) { return (m.protein_g || 0) >= 30; } },
    lowcarb: { label: "🥑 Low Carb", test: function (m) { return m.carbs_g != null && m.carbs_g <= 15; } },
    carbforward: { label: "🍚 Carb-Forward", test: function (m) { return (m.carbs_g || 0) >= 35; } }
  };
  function recipeNativeMacros(r) {
    var tier = (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
    return (r.macro_profiles && r.macro_profiles["serving_" + tier]) ||
      (r.macro_profiles && r.macro_profiles["serving_" + (r.native_serving || 2)]) || {};
  }

  function renderRecipes() {
    var s = $("#screen-recipes");
    s.innerHTML = "";
    s.appendChild(backTopBar("‹ Home", "Recipes",
      collections().length + " collections · " + recipes().length + " recipes",
      function () { setTab("home"); }));

    // Workout-tracker handoff — remaining-macros suggestions, above everything
    if (macroHandoff) {
      var ho = el("div", "macro-handoff");
      var hoHead = el("div", "macro-handoff-head",
        '<span class="macro-handoff-title">🎯 Fits your day</span>' +
        '<span class="macro-handoff-sub">' + macroHandoff.kcal + " kcal" +
        (macroHandoff.p ? " · " + macroHandoff.p + " g protein" : "") + " left in your tracker" +
        (macroHandoff.dt === "legs" ? " · carb-forward for leg day" : "") + "</span>");
      var hoClose = el("button", "macro-handoff-close", "✕");
      hoClose.type = "button";
      hoClose.setAttribute("aria-label", "Dismiss suggestions");
      hoClose.addEventListener("click", function () { macroHandoff = null; renderRecipes(); });
      hoHead.appendChild(hoClose);
      ho.appendChild(hoHead);
      var matches = macroHandoffMatches();
      if (matches.length) {
        var hoGrid = el("div", "col-grid");
        matches.forEach(function (r) { hoGrid.appendChild(recipeCard(r)); });
        ho.appendChild(hoGrid);
      } else {
        ho.appendChild(el("div", "empty", "Nothing fits under " + macroHandoff.kcal + " kcal — browse below."));
      }
      s.appendChild(ho);
    }

    // Search box
    var searchWrap = el("div", "search-wrap");
    var box = el("input", "search-box");
    box.type = "search";
    box.placeholder = "Search all recipes…";
    box.setAttribute("aria-label", "Search all recipes");
    searchWrap.appendChild(box);
    s.appendChild(searchWrap);

    // Composable filter chips — dish category, macro thresholds, and the
    // existing pantry-match filter all combine with each other and with the
    // search box, instead of search being the only way into the catalog.
    var filterBar = el("div", "recipe-filter-bar");

    var pantryToggle = el("button", "pantry-filter-toggle" + (recipesState.lowShopping ? " on" : ""),
      "🧂 Low-shopping");
    pantryToggle.type = "button";
    pantryToggle.setAttribute("aria-pressed", recipesState.lowShopping ? "true" : "false");
    pantryToggle.addEventListener("click", function () {
      recipesState.lowShopping = !recipesState.lowShopping;
      pantryToggle.classList.toggle("on", recipesState.lowShopping);
      pantryToggle.setAttribute("aria-pressed", recipesState.lowShopping ? "true" : "false");
      paint();
    });
    filterBar.appendChild(pantryToggle);

    Object.keys(MACRO_FACETS).forEach(function (key) {
      var facet = MACRO_FACETS[key];
      var chip = el("button", "pantry-filter-toggle" + (recipesState.macro === key ? " on" : ""), facet.label);
      chip.type = "button";
      chip.setAttribute("aria-pressed", recipesState.macro === key ? "true" : "false");
      chip.addEventListener("click", function () {
        recipesState.macro = (recipesState.macro === key) ? null : key;
        paint();
      });
      filterBar.appendChild(chip);
    });
    s.appendChild(filterBar);

    // Category chips get their own scrollable row — 11 categories is too
    // many to fit inline with the macro/pantry chips above.
    var catBar = el("div", "recipe-cat-bar");
    presentCategories().forEach(function (cat) {
      var chip = el("button", "recipe-cat-chip" + (recipesState.category === cat ? " on" : ""), cat);
      chip.type = "button";
      chip.setAttribute("aria-pressed", recipesState.category === cat ? "true" : "false");
      chip.addEventListener("click", function () {
        recipesState.category = (recipesState.category === cat) ? null : cat;
        paint();
      });
      catBar.appendChild(chip);
    });
    s.appendChild(catBar);

    if (focusRecipesSearch) {
      focusRecipesSearch = false;
      requestAnimationFrame(function () { box.focus(); });
    }

    var results = el("div", "browse-results");
    s.appendChild(results);

    function anyFacetActive() {
      return recipesState.lowShopping || recipesState.category || recipesState.macro;
    }

    function paint() {
      var q = box.value.trim();
      results.innerHTML = "";

      if (!q && !anyFacetActive()) {                   // default: collection cards
        var wrap = el("div", "cards-wrap");
        wrap.appendChild(el("div", "tier-label", "★ Collections"));
        collections().forEach(function (c) { wrap.appendChild(collectionCard(c)); });
        results.appendChild(wrap);
        return;
      }

      var list = q ? recipes().filter(function (r) { return recipesMatch(r, q); }) : recipes().slice();

      if (recipesState.category) {
        list = list.filter(function (r) { return r.dish_category === recipesState.category; });
      }
      if (recipesState.macro) {
        var test = MACRO_FACETS[recipesState.macro].test;
        list = list.filter(function (r) { return test(recipeNativeMacros(r)); });
      }
      if (recipesState.lowShopping) {
        list = list
          .map(function (r) { return { r: r, info: pantryMatchInfo(r) }; })
          .filter(function (x) { return x.info && x.info.need <= LOW_SHOPPING_MAX_NEED; })
          .sort(function (a, b) { return a.info.need - b.info.need; })
          .map(function (x) { return x.r; });
      }

      if (!list.length) {
        results.appendChild(el("div", "empty",
          '<span class="empty-emoji">' + (recipesState.lowShopping ? "🧂" : "🔍") + "</span>" +
          (recipesState.lowShopping
            ? "Nothing needs " + LOW_SHOPPING_MAX_NEED + " or fewer items you don't already have — mark more staples from the Grocery tab, or turn this filter off."
            : "No recipes match these filters.")));
        return;
      }
      var facetLabel = [
        recipesState.category,
        recipesState.macro ? MACRO_FACETS[recipesState.macro].label.replace(/^\S+\s/, "") : null,
        recipesState.lowShopping ? "low-shopping" : null
      ].filter(Boolean).join(" · ");
      results.appendChild(el("div", "browse-count",
        list.length + (list.length === 1 ? " recipe" : " recipes") +
        (facetLabel ? " · " + facetLabel : "")));
      var grid = el("div", "col-grid");
      list.forEach(function (r) {
        grid.appendChild(recipeCard(r, { pantryInfo: recipesState.lowShopping ? pantryMatchInfo(r) : null }));
      });
      results.appendChild(grid);
    }

    box.addEventListener("input", paint);
    paint();
  }

  function collectionCard(c) {
    var soon = c.status !== "live";
    var card = el("a", "cat-card" + (soon ? " soon" : ""));
    card.href = "collection.html?c=" + encodeURIComponent(c.id);
    var accent = clampAccent(c.accent || "#C87A53");
    card.style.setProperty("--cc", accent);
    card.style.setProperty("--cc-rgb", rgbFromHex(accent));

    var count = soon ? "Coming Soon →" : (recipesIn(c).length + " Recipes →");

    card.innerHTML =
      '<span class="cc-glow"></span>' +
      '<span class="cc-sheen"></span>' +
      (soon ? '<span class="soon-badge">Soon</span>' : "") +
      '<span class="cat-icon">' + recipeIconHtml(c.icon) + "</span>" +
      '<div class="cat-tag">' + esc(c.tag) + "</div>" +
      '<div class="cat-name">' + esc(c.title) + "</div>" +
      '<div class="cat-meta">' + esc(c.blurb) + "</div>" +
      '<div class="cat-count">' + count + "</div>" +
      '<div class="cat-designer">' + esc(c.designer || "") + "</div>";
    return card;
  }

  /* ══ FAVORITES screen ═══════════════════════════════════════════════ */
  function renderFavorites() {
    var s = $("#screen-favorites");
    s.innerHTML = "";

    var favs = loadFavs();
    var list = recipes().filter(function (r) { return favs.has(r.recipe_id); });

    s.appendChild(backTopBar("‹ Home", "Favorites",
      (list.length || "No") + (list.length === 1 ? " saved recipe" : " saved recipes"),
      function () { setTab("home"); }));

    if (!list.length) {
      s.appendChild(el("div", "empty",
        '<span class="empty-emoji">❤️</span>' +
        "No favorites yet.<br>Tap the heart on any recipe to save it here."));
      return;
    }
    var grid = el("div", "col-grid");
    list.forEach(function (r) { grid.appendChild(recipeCard(r, { fav: true })); });
    s.appendChild(grid);
  }

  /* ══ MIKE'S FAVORITES screen ════════════════════════════════════════
     The curated, shipped-to-everyone shortlist. Read-only for visitors; in
     owner mode it grows an owner toolbar (curation help + publish/discard). */
  function ownerToolbar() {
    var wrap = el("div", "owner-bar");

    var head = el("div", "owner-bar-head");
    head.appendChild(el("span", "owner-bar-tag", "🔑 Owner mode"));
    var exit = el("button", "owner-bar-exit", "Exit");
    exit.type = "button";
    exit.setAttribute("aria-label", "Exit owner mode");
    exit.addEventListener("click", function () { setOwner(false); setTab("mikes"); });
    head.appendChild(exit);
    wrap.appendChild(head);

    wrap.appendChild(el("p", "owner-bar-help",
      "Double-tap any recipe card to add or remove it. A single tap still opens the recipe."));

    // One-tap migrate: pull the personal ❤ favorites stored on THIS device into
    // the Mike's list (union, keeping current order). This is how "the recipes I
    // already love" move over — the import runs locally where the hearts live,
    // then Copy-list publishes them. Non-destructive: personal hearts are kept.
    var myFavs = loadFavs();
    if (myFavs.size) {
      var imp = el("button", "owner-btn owner-import",
        "＋ Add my ❤ favorites (" + myFavs.size + ")");
      imp.type = "button";
      imp.addEventListener("click", function () {
        var list = mikesList().slice(), added = 0;
        myFavs.forEach(function (id) {
          if (recipeById(id) && list.indexOf(id) < 0) { list.push(id); added++; }
        });
        saveMikeDraft(list);
        renderMikes();
        if (!added) window.alert("Your ❤ favorites are already in Mike's Favorites.");
      });
      wrap.appendChild(imp);
    }

    if (!mikeDraftDirty()) return wrap;

    // Unpublished changes → offer Copy-list (publish) and Discard.
    var pub = el("div", "owner-publish");
    pub.appendChild(el("p", "owner-publish-msg",
      "You have unpublished changes. Copy your list and commit it to recipes-data.js " +
      "to publish it to everyone."));

    var status = el("p", "owner-publish-status", "");
    var ta = null;                              // lazily-shown copy-by-hand fallback
    function showFallback(text) {
      if (ta) { ta.focus(); ta.select(); return; }
      ta = el("textarea", "owner-export-ta");
      ta.readOnly = true; ta.rows = 6; ta.value = text;
      pub.appendChild(ta);
      ta.focus(); ta.select();
    }

    var copy = el("button", "owner-btn owner-copy", "⧉ Copy list");
    copy.type = "button";
    copy.addEventListener("click", function () {
      var text = mikeExportText();
      function ok() {
        status.className = "owner-publish-status ok";
        status.textContent = "Copied ✓ Paste it into recipes-data.js to publish.";
      }
      function fail() {
        status.className = "owner-publish-status err";
        status.textContent = "Couldn't copy automatically — select the text below:";
        showFallback(text);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, fail);
      } else { fail(); }
    });

    var revert = el("button", "owner-btn owner-revert", "↩ Discard");
    revert.type = "button";
    revert.addEventListener("click", function () {
      if (window.confirm("Discard your unpublished changes and revert to the published list?")) {
        clearMikeDraft(); setTab("mikes");
      }
    });

    var actions = el("div", "owner-publish-actions");
    actions.appendChild(copy);
    actions.appendChild(revert);
    pub.appendChild(actions);
    pub.appendChild(status);
    wrap.appendChild(pub);
    return wrap;
  }

  function renderMikes() {
    var s = $("#screen-mikes");
    s.innerHTML = "";

    var list = mikesList().map(recipeById).filter(Boolean);

    s.appendChild(backTopBar("‹ Home", "Mike's Favorites",
      (list.length || "No") + (list.length === 1 ? " recipe Mike loves" : " recipes Mike loves"),
      function () { setTab("home"); }));

    s.appendChild(el("p", "mikes-intro",
      "Mike's favorites from across the whole cookbook — every collection and diet. " +
      "The recipes that actually worked, as a starting point for yours. " +
      "This is separate from your own ❤ Favorites — tap the heart on any recipe to build that list."));

    if (isOwner()) s.appendChild(ownerToolbar());

    if (!list.length) {
      s.appendChild(emptyState("⭐",
        isOwner()
          ? "No favorites yet.<br>Double-tap any recipe card to add it to your list."
          : "Mike hasn't picked any favorites yet.<br>Check back soon."));
      return;
    }
    var grid = el("div", "col-grid");
    list.forEach(function (r) { grid.appendChild(recipeCard(r, { mikes: true })); });
    s.appendChild(grid);
  }

  /* ══ THIS WEEK — the meal planner spoke ═════════════════════════════ */
  // Three sub-views (Plan / Grocery / Recipes). The Plan view itself toggles
  // between a flat List (default) and a 7-day × Breakfast/Lunch/Dinner
  // Schedule. The same meal set feeds all three views.
  var plannerState = { view: "plan", planView: "list", pantryOpen: false, historyOpen: false, madeOpen: false };
  function refresh() { renderPlanner(); }

  // Same visual language as the SW update toast (cookbook-sw.js), but its own
  // .mc-toast class so the two never stack if both are on screen at once.
  function plannerToast(msg, actionLabel, onAction) {
    var t = el("div", "mc-toast");
    var span = el("span", "mc-toast-msg", esc(msg));
    t.appendChild(span);
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
    }, 5000);
  }

  // Segmented control reusing the recipe page's .servings / .serving-opt look.
  function segControl(cls, items, active, onPick) {
    var wrap = el("div", "servings" + (cls ? " " + cls : ""));
    items.forEach(function (it) {
      var b = el("button", "serving-opt" + (it.value === active ? " active" : ""), esc(it.label));
      b.type = "button";
      b.addEventListener("click", function () { if (it.value !== active) onPick(it.value); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // Per-meal 2/4 serving toggle.
  function servingToggle(m) {
    var r = recipeById(m.id);
    var opts = (r && r.scaling_options) || [2, 4];
    var wrap = el("div", "plan-serv");
    opts.forEach(function (n) {
      var b = el("button", "plan-serv-opt" + (m.serving === n ? " active" : ""), String(n));
      b.type = "button";
      b.setAttribute("aria-label", n + " servings");
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (m.serving !== n) { updateMeal(m.uid, { serving: n }); refresh(); }
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function removeBtn(m) {
    var b = el("button", "plan-remove", "✕");
    b.type = "button";
    b.setAttribute("aria-label", "Remove meal");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var r = recipeById(m.id);
      removeMeal(m.uid); refresh();
      plannerToast((r ? r.title : "Meal") + " removed", "Undo", function () {
        restoreMeal(m); refresh();
      });
    });
    return b;
  }
  // Opens the Smart Replacement picker (Iso-Nutritional / Express) for this meal.
  function replaceBtn(m) {
    var b = el("button", "plan-swap", "⇄");
    b.type = "button";
    b.setAttribute("aria-label", "Replace this meal");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      openReplaceRecipe(m);
    });
    return b;
  }
  // Batch-cooking shortcut: clone this meal onto other days without tapping
  // through the recipe picker once per day.
  function repeatBtn(m) {
    var b = el("button", "plan-repeat", "⟳");
    b.type = "button";
    b.setAttribute("aria-label", "Repeat this meal on other days");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      openRepeatMeal(m);
    });
    return b;
  }
  // "Mark Completed" toggle: flips m.completed/completedAt, logs macros,
  // and surfaces "Save Week Block?" the moment this was the last meal left.
  function completeToggle(m) {
    var b = el("button", "plan-complete" + (m.completed ? " is-done" : ""), CHECK_SVG);
    b.type = "button";
    b.setAttribute("aria-label", m.completed ? "Mark meal not completed" : "Mark meal completed");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var completing = !m.completed;
      var before = completing ? todayTotalsSnapshot() : null;
      var weekJustFinished = toggleMealCompleted(m.uid);
      if (completing) celebrateMealLogged(before);
      refresh();
      if (weekJustFinished) openSaveWeekPrompt();
    });
    return b;
  }

  // Full meal row (List view + Schedule "Unscheduled" tray): completion
  // toggle, icon, title, serving toggle, per-meal Day + Slot pickers, remove.
  function mealRow(m) {
    var r = recipeById(m.id);
    var row = el("div", "plan-meal" + (m.completed ? " is-done" : ""));

    row.appendChild(completeToggle(m));
    row.appendChild(el("span", "plan-meal-icon", recipeIconHtml(r && r.icon)));

    var main = el("div", "plan-meal-main");
    var title = el("a", "plan-meal-title", esc(r ? r.title : m.id));
    if (r) title.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
    main.appendChild(title);
    var meta = [];
    if (r && r.dish_category) meta.push(r.dish_category);
    var t = r ? (r.prep_time_mins || 0) + (r.cook_time_mins || 0) : 0;
    if (t) meta.push(t + " min");
    if (meta.length) main.appendChild(el("p", "plan-meal-meta", esc(meta.join(" · "))));
    row.appendChild(main);

    var ctrl = el("div", "plan-meal-controls");
    ctrl.appendChild(servingToggle(m));

    var pickers = el("div", "plan-pickers");
    var daySel = el("select", "plan-select");
    daySel.setAttribute("aria-label", "Day");
    daySel.innerHTML = '<option value="">Any day</option>' +
      DAYS.map(function (d) {
        return '<option value="' + d + '"' + (m.day === d ? " selected" : "") + ">" + DAY_LONG[d] + "</option>";
      }).join("");
    daySel.addEventListener("change", function () { updateMeal(m.uid, { day: daySel.value || null }); refresh(); });

    var slotSel = el("select", "plan-select");
    slotSel.setAttribute("aria-label", "Meal");
    slotSel.innerHTML = '<option value="">Any meal</option>' +
      SLOTS.map(function (sl) {
        return '<option value="' + sl + '"' + (m.slot === sl ? " selected" : "") + ">" + sl + "</option>";
      }).join("");
    slotSel.addEventListener("change", function () { updateMeal(m.uid, { slot: slotSel.value || null }); refresh(); });

    pickers.appendChild(daySel);
    pickers.appendChild(slotSel);
    ctrl.appendChild(pickers);
    ctrl.appendChild(repeatBtn(m));
    ctrl.appendChild(replaceBtn(m));
    ctrl.appendChild(removeBtn(m));
    row.appendChild(ctrl);
    return row;
  }

  // Compact chip for a meal placed in a Schedule slot.
  function scheduleChip(m) {
    var r = recipeById(m.id);
    var chip = el("div", "plan-chip" + (m.completed ? " is-done" : ""));
    chip.appendChild(completeToggle(m));
    chip.appendChild(el("span", "plan-chip-icon", recipeIconHtml(r && r.icon)));
    var t = el("a", "plan-chip-title", esc(r ? r.title : m.id));
    if (r) t.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
    chip.appendChild(t);
    chip.appendChild(servingToggle(m));
    chip.appendChild(replaceBtn(m));
    chip.appendChild(removeBtn(m));
    return chip;
  }

  function renderPlanList(body, meals) {
    var wrap = el("div", "plan-list");
    meals.forEach(function (m) { wrap.appendChild(mealRow(m)); });
    body.appendChild(wrap);
  }

  function renderPlanSchedule(body, meals) {
    var unsched = meals.filter(function (m) { return !m.day || !m.slot; });
    if (unsched.length) {
      var tray = el("div", "plan-tray");
      tray.appendChild(el("div", "plan-tray-label",
        "Unscheduled — set a Day &amp; Meal, or tap a slot below"));
      var list = el("div", "plan-list");
      unsched.forEach(function (m) { list.appendChild(mealRow(m)); });
      tray.appendChild(list);
      body.appendChild(tray);
    }

    DAYS.forEach(function (d) {
      var dayBlock = el("div", "plan-day");
      dayBlock.appendChild(el("div", "plan-day-head", esc(DAY_LONG[d])));
      SLOTS.forEach(function (slot) {
        var inSlot = meals.filter(function (m) { return m.day === d && m.slot === slot; });
        var slotEl = el("div", "plan-slot");
        slotEl.appendChild(el("div", "plan-slot-label", esc(slot)));
        var cell = el("div", "plan-slot-cell");
        inSlot.forEach(function (m) { cell.appendChild(scheduleChip(m)); });
        var addCell = el("button", "plan-slot-add", inSlot.length ? "＋" : "＋ Add");
        addCell.type = "button";
        addCell.setAttribute("aria-label", "Add to " + DAY_LONG[d] + " " + slot);
        addCell.addEventListener("click", function () { openPicker({ day: d, slot: slot }); });
        cell.appendChild(addCell);
        slotEl.appendChild(cell);
        dayBlock.appendChild(slotEl);
      });
      body.appendChild(dayBlock);
    });
  }

  function renderPlanPane(body) {
    body.appendChild(segControl("plan-modetoggle", [
      { value: "list", label: "List" },
      { value: "schedule", label: "Schedule" }
    ], plannerState.planView, function (v) { plannerState.planView = v; refresh(); }));

    var meals = planMeals();
    if (!meals.length) {
      body.appendChild(emptyState("🗓️",
        "No meals planned yet.<br>Tap <b>Add a meal</b> to start building your week."));
    } else if (plannerState.planView === "list") {
      renderPlanList(body, meals);
    } else {
      renderPlanSchedule(body, meals);
    }

    // The payoff of planning: a live count + one-tap jump straight to the
    // merged grocery list, so the list isn't a tab the cook has to discover.
    if (meals.length) {
      var gcount = groceryItemCount();
      var payoff = el("button", "plan-payoff");
      payoff.type = "button";
      payoff.innerHTML =
        '<span class="plan-payoff-info">' +
          '<span class="plan-payoff-counts">' +
            meals.length + (meals.length === 1 ? " meal" : " meals") + " · " +
            gcount + (gcount === 1 ? " grocery item" : " grocery items") +
          "</span>" +
          '<span class="plan-payoff-sub">Your combined shopping list is ready</span>' +
        "</span>" +
        '<span class="plan-payoff-cta">View list →</span>';
      payoff.addEventListener("click", function () {
        plannerState.view = "grocery"; refresh(); window.scrollTo(0, 0);
      });
      body.appendChild(payoff);
    }

    var add = el("button", "cook-start plan-add", "＋&nbsp;&nbsp;Add a meal");
    add.type = "button";
    add.addEventListener("click", function () { openPicker({}); });
    body.appendChild(add);

    var smart = el("button", "plan-smart-btn", "✨&nbsp;&nbsp;Smart Week");
    smart.type = "button";
    smart.addEventListener("click", openSmartWeek);
    body.appendChild(smart);

    var timeCheck = el("button", "plan-time-btn", "⏱️&nbsp;&nbsp;Time Check");
    timeCheck.type = "button";
    timeCheck.addEventListener("click", openBandwidthQuiz);
    body.appendChild(timeCheck);

    if (meals.length) {
      var clear = el("button", "plan-clear", "Clear week");
      clear.type = "button";
      clear.addEventListener("click", function () {
        if (window.confirm("Save this week to history and clear?")) {
          archiveWeek(); clearPlan(); saveGroc(new Set()); refresh();
        }
      });
      body.appendChild(clear);
    }

    // C1: Past-weeks history — collapsible, each entry has a Reuse button
    var history = loadHistory();
    if (history.length) {
      var histWrap = el("div", "plan-history");
      var histHead = el("button", "plan-history-head");
      histHead.type = "button";
      histHead.setAttribute("aria-expanded", plannerState.historyOpen ? "true" : "false");
      histHead.innerHTML =
        '<span class="plan-history-title">Past weeks</span>' +
        '<span class="plan-history-chev">' + (plannerState.historyOpen ? "▾" : "▸") + "</span>";
      histHead.addEventListener("click", function () {
        plannerState.historyOpen = !plannerState.historyOpen; refresh();
      });
      histWrap.appendChild(histHead);
      if (plannerState.historyOpen) {
        history.forEach(function (week) {
          var row = el("div", "plan-history-week");
          row.innerHTML =
            '<span class="plan-history-label">' + esc(week.label) + "</span>" +
            '<span class="plan-history-count">' +
              week.meals.length + (week.meals.length === 1 ? " meal" : " meals") +
            "</span>";
          var reuseBtn = el("button", "plan-history-reuse", "Reuse");
          reuseBtn.type = "button";
          reuseBtn.addEventListener("click", function () {
            if (window.confirm("Replace this week with “" + week.label + "”?")) {
              savePlan({ meals: week.meals.map(function (m) {
                return Object.assign(
                  { uid: newUid(), id: m.id, serving: m.serving, day: m.day || null, slot: m.slot || null },
                  mealSnapshot(m.id, m.serving)
                );
              }) });
              saveGroc(new Set());
              plannerState.historyOpen = false;
              refresh();
            }
          });
          row.appendChild(reuseBtn);
          histWrap.appendChild(row);
        });
      }
      body.appendChild(histWrap);
    }
  }

  // Auto-collapse: a checked row drops to the bottom of its own section (the
  // category it's already grouped under, or the pantry/made list), leaving
  // the still-need-to-buy rows together at the top. Un-checking reinserts it
  // just above the first still-checked row rather than restoring its exact
  // original position — good enough since shopping only rarely un-checks.
  function collapseGroceryRow(rowEl, isDone) {
    var parent = rowEl.parentNode;
    if (!parent) return;
    rowEl.classList.add("row-settling");
    window.setTimeout(function () {
      if (isDone) {
        parent.appendChild(rowEl);
      } else {
        var kids = parent.children, firstDone = null;
        for (var i = 0; i < kids.length; i++) {
          if (kids[i] !== rowEl && kids[i].classList.contains("done")) { firstDone = kids[i]; break; }
        }
        if (firstDone) parent.insertBefore(rowEl, firstDone);
      }
      rowEl.classList.remove("row-settling");
    }, 220);
  }

  /* ── "Use it up" ingredient cross-links (Grocery tab) ────────────────
     An odd leftover half-pound of something has no obvious next use today —
     this indexes every recipe's native-tier ingredient list once (cached)
     so tapping a grocery item can surface other recipes that use it. Keyed
     through the same groceryMergeName() singular/plural normalization the
     grocery list itself already merges on, so matches line up with what's
     actually on the list. */
  var ingredientIndexCache = null;
  function ingredientIndex() {
    if (ingredientIndexCache) return ingredientIndexCache;
    var idx = {};
    recipes().forEach(function (r) {
      var tier = (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
      var by = r.ingredients_by_serving || {};
      var list = by["serving_" + tier] || by["serving_" + (r.native_serving || 2)] || by[Object.keys(by)[0]] || [];
      var seen = {};
      list.forEach(function (ing) {
        var key = groceryMergeName((ing.item || "").trim());
        if (!key || seen[key]) return;
        seen[key] = 1;
        (idx[key] = idx[key] || []).push(r);
      });
    });
    ingredientIndexCache = idx;
    return idx;
  }
  function recipesUsingItem(itemName) {
    return ingredientIndex()[groceryMergeName((itemName || "").trim())] || [];
  }
  function closeIngredientUses() {
    var ov = document.querySelector(".iu-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openIngredientUses(itemName) {
    closeIngredientUses();
    var matches = recipesUsingItem(itemName);

    var ov = el("div", "picker iu-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "Uses for " + itemName));
    var close = el("button", "picker-close", "✕");
    close.type = "button";
    close.addEventListener("click", closeIngredientUses);
    top.appendChild(close);
    ov.appendChild(top);

    var body = el("div", "picker-results");
    if (!matches.length) {
      body.appendChild(emptyState("🔍", "No other recipes in the cookbook use " + itemName + " yet."));
    } else {
      var list = el("div", "iu-list");
      matches.forEach(function (r) {
        var row = el("a", "iu-row");
        row.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
        row.innerHTML =
          '<span class="iu-icon">' + recipeIconHtml(r.icon) + "</span>" +
          '<span class="iu-name">' + esc(r.title) + "</span>";
        list.appendChild(row);
      });
      body.appendChild(list);
    }
    ov.appendChild(body);

    ov.addEventListener("click", function (e) { if (e.target === ov) closeIngredientUses(); });
    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  function groceryRow(row, checked, opts) {
    opts = opts || {};
    var isDone = checked.has(row.key);
    var el2 = el("div", "check-row grocery-row" + (isDone ? " done" : "") +
      (opts.pantry ? " is-staple" : ""));
    el2.innerHTML =
      '<span class="check-box">' + CHECK_SVG + "</span>" +
      '<span class="grocery-qty">' + (row.qty ? esc(row.qty) : "") + "</span>" +
      '<span class="check-text">' + esc(row.item) + "</span>";
    el2.addEventListener("click", function () {
      var set = loadGroc();
      var nowDone = !set.has(row.key);
      if (nowDone) set.add(row.key); else set.delete(row.key);
      el2.classList.toggle("done", nowDone);
      saveGroc(set);
      collapseGroceryRow(el2, nowDone);
    });
    // Tapping the item name itself (not the row) surfaces other recipes
    // that use it — an odd leftover has no obvious next use otherwise.
    // Stops propagation so it never also toggles the check-off.
    var textEl = el2.querySelector(".check-text");
    textEl.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      openIngredientUses(row.item);
    });
    // Staple toggle: lift an "always have" item off the buy list (or send a
    // staple back to it). Stops propagation so it never toggles the check-off.
    var pin = el("button", "grocery-staple" + (opts.pantry ? " on" : ""),
      opts.pantry ? "↩" : "🧂");
    pin.type = "button";
    pin.setAttribute("aria-label", opts.pantry
      ? "Move " + row.item + " back to the shopping list"
      : "Mark " + row.item + " as a pantry staple");
    pin.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      togglePantry(row.item);
      refresh();
    });
    el2.appendChild(pin);
    return el2;
  }

  function pantryFooter(staples, checked) {
    var wrap = el("div", "pantry-foot" + (plannerState.pantryOpen ? " open" : ""));
    var head = el("button", "pantry-foot-head");
    head.type = "button";
    head.setAttribute("aria-expanded", plannerState.pantryOpen ? "true" : "false");
    head.innerHTML =
      '<span class="pantry-foot-title">🧂 Check your pantry</span>' +
      '<span class="pantry-foot-count">' + staples.length + "</span>" +
      '<span class="pantry-foot-chev">' + (plannerState.pantryOpen ? "▾" : "▸") + "</span>";
    head.addEventListener("click", function () {
      plannerState.pantryOpen = !plannerState.pantryOpen; refresh();
    });
    wrap.appendChild(head);
    if (plannerState.pantryOpen) {
      var list = el("div", "pantry-foot-list");
      staples.forEach(function (row) { list.appendChild(groceryRow(row, checked, { pantry: true })); });
      wrap.appendChild(list);
    }
    return wrap;
  }

  // Split-trip collapse: items whose contributing meals are all marked
  // Completed move here, off the active shopping list.
  function madeSection(rows, checked) {
    var wrap = el("div", "made-foot" + (plannerState.madeOpen ? " open" : ""));
    var head = el("button", "made-foot-head");
    head.type = "button";
    head.setAttribute("aria-expanded", plannerState.madeOpen ? "true" : "false");
    head.innerHTML =
      '<span class="made-foot-title">✅ Already made</span>' +
      '<span class="made-foot-count">' + rows.length + "</span>" +
      '<span class="made-foot-chev">' + (plannerState.madeOpen ? "▾" : "▸") + "</span>";
    head.addEventListener("click", function () {
      plannerState.madeOpen = !plannerState.madeOpen; refresh();
    });
    wrap.appendChild(head);
    if (plannerState.madeOpen) {
      var list = el("div", "made-foot-list");
      rows.forEach(function (row) { list.appendChild(groceryRow(row, checked)); });
      wrap.appendChild(list);
    }
    return wrap;
  }

  /* ── C4: Sum the weekly planned macros from recipe data ──────────────
     perServingMacroTier() resolves whichever tier the recipe actually
     authored (never hardcodes serving_2 — see the comment above it); macros
     are constant per serving and never scale with meal.serving. */
  function computeWeekMacros(meals) {
    var kcal = 0, p = 0, f = 0, c = 0;
    meals.forEach(function (meal) {
      var macros = macrosFromTier(perServingMacroTier(recipeById(meal.id), meal.serving));
      if (!macros) return;
      kcal += macros.kcal; p += macros.p; f += macros.f; c += macros.c;
    });
    return { kcal: Math.round(kcal), p: Math.round(p), f: Math.round(f), c: Math.round(c) };
  }

  function renderMacroGoalsBar(totals, goals) {
    var weekGoal = { kcal: goals.kcal * 7, p: goals.p * 7, f: goals.f * 7, c: goals.c * 7 };
    var card = el("div", "card macro-goals-card");
    card.appendChild(el("p", "card-label", "Weekly nutrition · goals × 7 days"));
    [
      { label: "Calories", val: totals.kcal, goal: weekGoal.kcal, unit: "kcal" },
      { label: "Protein",  val: totals.p,    goal: weekGoal.p,    unit: "g" },
      { label: "Fat",      val: totals.f,    goal: weekGoal.f,    unit: "g" },
      { label: "Carbs",    val: totals.c,    goal: weekGoal.c,    unit: "g" }
    ].forEach(function (row) {
      var pct = row.goal > 0 ? Math.min(100, Math.round(row.val / row.goal * 100)) : 0;
      var r = el("div", "macro-goal-row");
      r.innerHTML =
        '<span class="macro-goal-label">' + esc(row.label) + "</span>" +
        '<span class="macro-goal-nums">' + row.val + " / " + row.goal + " " + esc(row.unit) + "</span>" +
        '<div class="macro-goal-bar-wrap"><div class="macro-goal-bar" style="width:' + pct + '%"></div></div>';
      card.appendChild(r);
    });
    return card;
  }

  /* ── C2: Custom grocery items — user-typed additions outside recipes ── */
  function customGrocSection() {
    var items = loadCustom();
    var wrap = el("div", "custom-groc");
    wrap.appendChild(el("div", "custom-groc-head", "Extra items"));

    var inputRow = el("div", "custom-groc-input-row");
    var inp = document.createElement("input");
    inp.className = "custom-groc-input";
    inp.type = "text";
    inp.placeholder = "Add an item…";
    inp.setAttribute("aria-label", "Add a custom grocery item");
    var addBtn = el("button", "custom-groc-add", "Add");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      var text = inp.value.trim();
      if (!text) return;
      var arr = loadCustom();
      arr.push({ uid: newUid(), text: text, done: false });
      saveCustom(arr);
      inp.value = "";
      var updated = customGrocSection();
      wrap.parentNode.replaceChild(updated, wrap);
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addBtn.click(); }
    });
    inputRow.appendChild(inp);
    inputRow.appendChild(addBtn);
    wrap.appendChild(inputRow);

    items.forEach(function (item) {
      var row = el("div", "check-row grocery-row custom-item-row" + (item.done ? " done" : ""));
      row.innerHTML =
        '<span class="check-box">' + CHECK_SVG + "</span>" +
        '<span class="check-text">' + esc(item.text) + "</span>";
      var delBtn = el("button", "custom-item-del", "✕");
      delBtn.type = "button";
      delBtn.setAttribute("aria-label", "Remove " + item.text);
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        saveCustom(loadCustom().filter(function (x) { return x.uid !== item.uid; }));
        row.parentNode.removeChild(row);
      });
      row.appendChild(delBtn);
      row.addEventListener("click", function () {
        var arr = loadCustom();
        arr.forEach(function (x) { if (x.uid === item.uid) x.done = !x.done; });
        saveCustom(arr);
        row.classList.toggle("done");
      });
      wrap.appendChild(row);
    });
    return wrap;
  }

  // "You've bought this N weeks running — stop shopping for it?" nudge.
  function pantrySuggestCard() {
    var candidates = pantryCandidates();
    if (!candidates.length) return null;
    var card = el("div", "card pantry-suggest");
    card.appendChild(el("p", "card-label", "🧂 Always on your list"));
    card.appendChild(el("p", "pantry-suggest-copy",
      "Bought " + PANTRY_SUGGEST_WEEKS + " weeks running — worth marking as a staple?"));
    candidates.forEach(function (row) {
      var r = el("div", "pantry-suggest-row");
      r.appendChild(el("span", "pantry-suggest-item", esc(row.item)));
      var btn = el("button", "pantry-suggest-btn", "Mark as staple");
      btn.type = "button";
      btn.addEventListener("click", function () { togglePantry(row.item); refresh(); });
      r.appendChild(btn);
      card.appendChild(r);
    });
    return card;
  }

  function renderGroceryPane(body) {
    var meals = planMeals();

    if (!meals.length) {
      body.appendChild(emptyState("🛒",
        "No meals planned yet.<br>Add meals and your combined grocery list builds itself."));
    } else {
      var cats = buildGrocery();
      var checked = loadGroc();
      var pantry = loadPantry();
      var suggest = pantrySuggestCard();
      if (suggest) body.appendChild(suggest);

      var buyCats = [], staples = [], madeRows = [];
      cats.forEach(function (c) {
        var buy = [];
        c.rows.forEach(function (row) {
          if (pantry.has(pantryKey(row.item))) { staples.push(row); return; }
          if (groceryRowAllDone(row)) { madeRows.push(row); return; }
          buy.push(row);
        });
        if (buy.length) buyCats.push({ category: c.category, rows: buy });
      });
      var total = buyCats.reduce(function (n, c) { return n + c.rows.length; }, 0);

      var card = el("div", "card grocery-card");
      card.appendChild(el("p", "card-label",
        "Shopping list · " + total + (total === 1 ? " item" : " items") +
        " · " + meals.length + (meals.length === 1 ? " meal" : " meals")));

      if (!total) {
        card.appendChild(madeRows.length
          ? emptyState("✅", "Everything for this week is already made.<br>Nice work.")
          : emptyState("🧂", "Everything you need is a pantry staple.<br>Check your pantry below."));
      }
      buyCats.forEach(function (c) {
        var sec = el("div", "grocery-cat");
        sec.appendChild(el("div", "grocery-cat-head",
          '<span class="dot"></span>' + esc(c.category) +
          '<span class="grocery-cat-count">' + c.rows.length + "</span>"));
        c.rows.forEach(function (row) { sec.appendChild(groceryRow(row, checked)); });
        card.appendChild(sec);
      });
      body.appendChild(card);

      if (madeRows.length) body.appendChild(madeSection(madeRows, checked));
      if (staples.length) body.appendChild(pantryFooter(staples, checked));

      // C4: Macro goals bar — only when goals exist in MC Training's calculator
      var goals = loadMacroGoals();
      if (goals) body.appendChild(renderMacroGoalsBar(computeWeekMacros(meals), goals));

      body.appendChild(el("p", "macro-foot",
        "Quantities combine identical items across your planned meals. " +
        "Tap 🧂 to set aside a staple you always have."));
    }

    // C2: Custom items always shown so users can add extras at any time
    body.appendChild(customGrocSection());
  }

  function renderRecipesPane(body) {
    var ids = planRecipeIds();
    if (!ids.length) {
      body.appendChild(emptyState("📖",
        "No recipes yet.<br>Add meals to gather the week's recipes here."));
      return;
    }
    body.appendChild(el("div", "browse-count",
      ids.length + (ids.length === 1 ? " recipe" : " recipes") + " this week"));
    var grid = el("div", "col-grid");
    ids.forEach(function (id) { var r = recipeById(id); if (r) grid.appendChild(recipeCard(r)); });
    body.appendChild(grid);
  }

  function renderPlanner() {
    var s = $("#screen-planner");
    s.innerHTML = "";

    var meals = planMeals();
    var sub = meals.length
      ? meals.length + (meals.length === 1 ? " meal" : " meals") +
        " · " + planRecipeIds().length + (planRecipeIds().length === 1 ? " recipe" : " recipes")
      : "Plan a week of meals";
    s.appendChild(backTopBar("‹ Home", "This Week", sub, function () { setTab("home"); }));

    s.appendChild(segControl("planner-nav", [
      { value: "plan", label: "Plan" },
      { value: "grocery", label: "Grocery" },
      { value: "recipes", label: "Recipes" }
    ], plannerState.view, function (v) { plannerState.view = v; refresh(); }));

    var body = el("div", "planner-body");
    if (plannerState.view === "plan") renderPlanPane(body);
    else if (plannerState.view === "grocery") renderGroceryPane(body);
    else if (plannerState.view === "recipes") renderRecipesPane(body);
    s.appendChild(body);
  }

  /* ── Recipe picker overlay (full-screen; add to week / to a slot) ──── */
  function pickCard(r, ctx) {
    var card = el("button", "rc rc-pick");
    card.type = "button";
    var accent = clampAccent(r.accent || "#C87A53");
    card.style.setProperty("--rc-accent", accent);
    card.style.setProperty("--rc-accent-rgb", rgbFromHex(accent));
    var totalTime = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
    var meta = [];
    if (r.dish_category) meta.push(esc(r.dish_category));
    if (totalTime) meta.push(totalTime + " min");
    card.innerHTML =
      '<div class="rc-band"><span class="rc-icon">' + recipeIconHtml(r.icon) + "</span></div>" +
      '<div class="rc-body">' +
        '<h3 class="rc-title">' + esc(r.title) + "</h3>" +
        '<p class="rc-meta">' + meta.join(" · ") + "</p>" +
        '<p class="rc-macro">＋ Add to week</p>' +
      "</div>";
    // "Made recently" awareness: flag anything cooked in the last 2 weeks so
    // the cook can steer away from same-meals-every-week fatigue.
    var days = daysSinceCooked(r.recipe_id);
    if (days != null && days <= 14) {
      card.appendChild(el("span", "rc-cooked-badge",
        days <= 0 ? "Cooked today" : "Cooked " + days + "d ago"));
    }
    card.addEventListener("click", function () {
      addMeal(r.recipe_id, { day: ctx.day || null, slot: ctx.slot || null });
      closePicker();
      refresh();
    });
    return card;
  }
  function closePicker() {
    var ov = document.querySelector(".picker");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openPicker(ctx) {
    ctx = ctx || {};
    closePicker();

    var ov = el("div", "picker");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title",
      ctx.day ? esc("Add to " + DAY_LONG[ctx.day] + " · " + ctx.slot) : "Add a meal"));
    var done = el("button", "picker-close", "Done");
    done.type = "button";
    done.addEventListener("click", closePicker);
    top.appendChild(done);
    ov.appendChild(top);

    var sw = el("div", "picker-search");
    var box = el("input", "search-box");
    box.type = "search";
    box.placeholder = "Search recipes to add…";
    box.setAttribute("aria-label", "Search recipes to add");
    sw.appendChild(box);
    ov.appendChild(sw);

    // Optional freshness sort: least-recently-cooked (and never-cooked) first,
    // so the week doesn't keep surfacing what you just made.
    var sortFresh = false;
    var sortRow = el("div", "picker-sort");
    var sortBtn = el("button", "picker-sort-btn", "↻ Freshest first");
    sortBtn.type = "button";
    sortBtn.setAttribute("aria-pressed", "false");
    sortBtn.addEventListener("click", function () {
      sortFresh = !sortFresh;
      sortBtn.classList.toggle("active", sortFresh);
      sortBtn.setAttribute("aria-pressed", sortFresh ? "true" : "false");
      paint();
    });
    sortRow.appendChild(sortBtn);
    ov.appendChild(sortRow);

    var results = el("div", "picker-results");
    ov.appendChild(results);

    function paint() {
      var q = box.value.trim();
      results.innerHTML = "";
      var list = recipes().filter(function (r) { return recipesMatch(r, q); });
      if (sortFresh) {
        // never-cooked → 0 → sorts first (freshest); most-recent → last.
        list = list.slice().sort(function (a, b) {
          return (lastCookedAt(a.recipe_id) || 0) - (lastCookedAt(b.recipe_id) || 0);
        });
      }
      if (!list.length) {
        results.appendChild(emptyState("🔍", "No recipes match your search."));
        return;
      }
      var grid = el("div", "col-grid");
      list.forEach(function (r) { grid.appendChild(pickCard(r, ctx)); });
      results.appendChild(grid);
    }
    box.addEventListener("input", paint);
    paint();

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  /* ── Smart Week overlay: scope → 7-day preview → commit ─────────────── */
  function closeSmartWeek() {
    var ov = document.querySelector(".smw-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openSmartWeek() {
    closeSmartWeek();

    var scopeKey = "all";
    // Macro-Targeted is only ever offered when the user has real goals set
    // (via MC Training's calculator) — with no goals, this stays "balanced"
    // and the mode toggle never renders, so casual users see no change.
    var macroGoals = loadMacroGoals();
    var mode = "balanced"; // "balanced" | "macro"
    function currentGrid() {
      return (mode === "macro" && macroGoals) ? msgGenerateWeek(scopeKey).grid : smwGenerateWeek(scopeKey).grid;
    }
    var grid = currentGrid();
    // Dismissing the prep-day callout only sticks until the grid is
    // wholesale-regenerated (new scope/mode/Regenerate tap) — a single
    // slot edit shouldn't bring back a suggestion the user just dismissed.
    var prepDismissed = false;

    var ov = el("div", "picker smw-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "✨ Smart Week"));
    var close = el("button", "picker-close", "Cancel");
    close.type = "button";
    close.addEventListener("click", closeSmartWeek);
    top.appendChild(close);
    ov.appendChild(top);

    var scopeBar = el("div", "smw-scope-bar");
    var scopeSel = el("select", "smw-scope-select");
    scopeSel.setAttribute("aria-label", "Smart Week scope");
    scopeSel.innerHTML = SMART_SCOPES.map(function (s) {
      return '<option value="' + s.key + '">' + esc(s.label) + "</option>";
    }).join("");
    scopeSel.value = scopeKey;
    scopeSel.addEventListener("change", function () {
      scopeKey = scopeSel.value;
      grid = currentGrid();
      prepDismissed = false;
      paint();
    });
    scopeBar.appendChild(scopeSel);
    var regenAll = el("button", "picker-sort-btn smw-regen-all-btn", "🔀 Regenerate");
    regenAll.type = "button";
    regenAll.addEventListener("click", function () {
      grid = currentGrid();
      prepDismissed = false;
      paint();
    });
    scopeBar.appendChild(regenAll);
    ov.appendChild(scopeBar);

    var modeBar = el("div", "smw-mode-bar");
    function paintMode() {
      modeBar.innerHTML = "";
      modeBar.appendChild(segControl("smw-modetoggle", [
        { value: "balanced", label: "Balanced" },
        { value: "macro", label: "Macro-Targeted" }
      ], mode, function (v) {
        mode = v;
        grid = currentGrid();
        prepDismissed = false;
        paintMode();
        paint();
      }));
    }
    if (macroGoals) {
      paintMode();
      ov.appendChild(modeBar);
    }

    var body = el("div", "picker-results smw-body");
    ov.appendChild(body);

    function slotCount(slot) { return grid.filter(function (g) { return g.slot === slot; }).length; }

    function paint() {
      body.innerHTML = "";
      var scope = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];

      // Macro-trend bias reason (ROADMAP.md Pillar C fast-follow, folded into
      // roadmap B2) — only applies in Macro-Targeted mode, and per that
      // item's own acceptance criterion, must stay visible, never silent.
      if (mode === "macro" && macroGoals) {
        var trend = macroTrendBias(macroGoals);
        if (trend.reason) {
          body.appendChild(el("div", "smw-trend-callout", "📈 " + esc(trend.reason)));
        }
      }

      if (!grid.length) {
        body.appendChild(emptyState("🧊", "No recipes available for this scope yet."));
      } else {
        if (!prepDismissed) {
          var suggestion = prepDaySuggestion(grid);
          if (suggestion) {
            var callout = el("div", "smw-prep-callout");
            callout.appendChild(el("span", "smw-prep-text",
              suggestion.count + " meals share " + esc(suggestion.tag) + " gear — batch-prep on " +
              esc(DAY_LONG[suggestion.day]) + "?"));
            var dismiss = el("button", "smw-prep-dismiss", "×");
            dismiss.type = "button";
            dismiss.setAttribute("aria-label", "Dismiss prep-day suggestion");
            dismiss.addEventListener("click", function () { prepDismissed = true; paint(); });
            callout.appendChild(dismiss);
            body.appendChild(callout);
          }
        }

        if (scope.slots.length > 1) {
          var trimRow = el("div", "smw-trim-row");
          scope.slots.forEach(function (slot) {
            if (!slotCount(slot)) return;
            var trimBtn = el("button", "smw-trim-btn", "Skip all " + slot + " ×");
            trimBtn.type = "button";
            trimBtn.addEventListener("click", function () {
              grid = grid.filter(function (g) { return g.slot !== slot; });
              paint();
            });
            trimRow.appendChild(trimBtn);
          });
          if (trimRow.children.length) body.appendChild(trimRow);
        }

        DAYS.forEach(function (day) {
          var entries = grid.filter(function (g) { return g.day === day; });
          if (!entries.length) return;
          var dayBlock = el("div", "plan-day smw-day");
          dayBlock.appendChild(el("div", "plan-day-head", esc(DAY_LONG[day])));
          if (mode === "macro" && macroGoals) {
            var fitPct = msgDayFitPct(grid, day, macroGoals);
            if (fitPct != null) {
              dayBlock.appendChild(el("div", "smw-macro-fit",
                "~" + fitPct + "% of daily protein goal"));
            }
          }
          scope.slots.forEach(function (slot) {
            var entry = entries.filter(function (g) { return g.slot === slot; })[0];
            if (!entry) return;
            var r = recipeById(entry.id);
            var slotEl = el("div", "plan-slot");
            slotEl.appendChild(el("div", "plan-slot-label", esc(slot)));
            var cell = el("div", "plan-slot-cell");
            var chip = el("div", "plan-chip smw-chip");
            chip.appendChild(el("span", "plan-chip-icon", recipeIconHtml(r && r.icon)));
            var titleEl = el("a", "plan-chip-title", esc(r ? r.title : entry.id));
            if (r) titleEl.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
            chip.appendChild(titleEl);
            var regen = el("button", "smw-chip-regen", "↻");
            regen.type = "button";
            regen.setAttribute("aria-label", "Regenerate " + slot + " for " + DAY_LONG[day]);
            regen.addEventListener("click", function () {
              var newId = (mode === "macro" && macroGoals)
                ? msgRegenerateSlot(grid, day, slot, scopeKey)
                : smwRegenerateSlot(grid, day, slot);
              if (!newId) { pop(regen); return; }
              grid = grid.map(function (g) {
                return (g.day === day && g.slot === slot) ? { day: day, slot: slot, id: newId } : g;
              });
              paint();
            });
            chip.appendChild(regen);
            var rm = el("button", "smw-chip-remove", "×");
            rm.type = "button";
            rm.setAttribute("aria-label", "Remove " + slot + " for " + DAY_LONG[day]);
            rm.addEventListener("click", function () {
              grid = grid.filter(function (g) { return !(g.day === day && g.slot === slot); });
              paint();
            });
            chip.appendChild(rm);
            cell.appendChild(chip);
            slotEl.appendChild(cell);
            dayBlock.appendChild(slotEl);
          });
          body.appendChild(dayBlock);
        });
      }

      var actions = el("div", "smw-actions");
      var confirm = el("button", "cook-start smw-confirm-btn", "＋ Set Weekly Meal Plan");
      confirm.type = "button";
      confirm.disabled = !grid.length;
      confirm.addEventListener("click", function () {
        var scope2 = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];
        commitSmartWeek(grid, scope2.slots);
        closeSmartWeek();
        plannerState.view = "plan";
        refresh();
        window.scrollTo(0, 0);
      });
      actions.appendChild(confirm);
      body.appendChild(actions);
    }
    paint();

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  /* ── Save Week Block prompt: fires on final-meal completion (see
     completeToggle) or a day-7-elapsed check at app boot (see init()).
     "Not now" sets day7Dismissed so the boot check won't re-nag for this
     same plan; saving archives with either the tag-frequency name or a
     custom override, then clears the plan like "Clear week" already does. */
  function closeSaveWeekPrompt() {
    var ov = document.querySelector(".swp-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openSaveWeekPrompt() {
    closeSaveWeekPrompt();
    var meals = planMeals();
    if (!meals.length) return;

    var ov = el("div", "picker swp-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "🎉 Save Week Block?"));
    var close = el("button", "picker-close", "Not now");
    close.type = "button";
    close.addEventListener("click", function () {
      var p = loadPlan();
      p.day7Dismissed = true;
      savePlan(p);
      closeSaveWeekPrompt();
    });
    top.appendChild(close);
    ov.appendChild(top);

    var body = el("div", "picker-results swp-body");
    body.appendChild(el("p", "swp-copy",
      "This week is complete. Save it to your library so you can reuse it later."));
    body.appendChild(el("label", "swp-label", "Name this week"));
    var input = el("input", "swp-input");
    input.type = "text";
    input.maxLength = 60;
    input.value = tagFrequencyName(meals);
    body.appendChild(input);

    var actions = el("div", "smw-actions");
    var save = el("button", "cook-start swp-save-btn", "Save Week Block");
    save.type = "button";
    save.addEventListener("click", function () {
      archiveWeek(input.value);
      clearPlan();
      saveGroc(new Set());
      closeSaveWeekPrompt();
      plannerState.view = "plan";
      refresh();
    });
    actions.appendChild(save);
    body.appendChild(actions);
    ov.appendChild(body);

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  /* ── Repeat meal overlay: batch-cook one recipe onto several days ───── */
  function closeRepeatMeal() {
    var ov = document.querySelector(".rpt-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openRepeatMeal(m) {
    closeRepeatMeal();
    var r = recipeById(m.id);
    var picked = new Set();

    var ov = el("div", "picker rpt-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "Repeat " + esc(r ? r.title : "this meal")));
    var close = el("button", "picker-close", "Cancel");
    close.type = "button";
    close.addEventListener("click", closeRepeatMeal);
    top.appendChild(close);
    ov.appendChild(top);

    var body = el("div", "picker-results rpt-body");
    body.appendChild(el("p", "rpt-copy",
      "Add the same recipe, same " + m.serving + "-serving size" +
      (m.slot ? " and " + m.slot.toLowerCase() : "") + ", to any other days this week."));

    var days = el("div", "rpt-days");
    DAYS.forEach(function (d) {
      var chip = el("button", "rpt-day" + (d === m.day ? " current" : ""), DAY_LONG[d]);
      chip.type = "button";
      if (d === m.day) {
        chip.disabled = true; // already has this exact meal — nothing to add here
      } else {
        chip.addEventListener("click", function () {
          if (picked.has(d)) picked.delete(d); else picked.add(d);
          chip.classList.toggle("on", picked.has(d));
        });
      }
      days.appendChild(chip);
    });
    body.appendChild(days);

    var actions = el("div", "smw-actions");
    var confirm = el("button", "cook-start rpt-confirm-btn", "Add to selected days");
    confirm.type = "button";
    confirm.addEventListener("click", function () {
      var n = picked.size;
      picked.forEach(function (d) {
        addMeal(m.id, { serving: m.serving, day: d, slot: m.slot });
      });
      closeRepeatMeal();
      refresh();
      if (n) plannerToast((r ? r.title : "Meal") + " added to " + n + " more day" + (n === 1 ? "" : "s"));
    });
    actions.appendChild(confirm);
    body.appendChild(actions);
    ov.appendChild(body);

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  /* ── Smart Replacement overlay: Iso-Nutritional / Express picker ────── */
  function closeReplaceRecipe() {
    var ov = document.querySelector(".sre-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openReplaceRecipe(m) {
    closeReplaceRecipe();
    var source = recipeById(m.id);
    if (!source) return;

    var mode = "iso";

    var ov = el("div", "picker sre-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "⇄ Replace " + esc(source.title)));
    var close = el("button", "picker-close", "Cancel");
    close.type = "button";
    close.addEventListener("click", closeReplaceRecipe);
    top.appendChild(close);
    ov.appendChild(top);

    var modeBar = el("div", "sre-mode-bar");
    ov.appendChild(modeBar);

    var body = el("div", "picker-results sre-body");
    ov.appendChild(body);

    function paint() {
      modeBar.innerHTML = "";
      modeBar.appendChild(segControl("sre-modetoggle", [
        { value: "iso", label: "Similar" },
        { value: "express", label: "Quick (≤15 min)" }
      ], mode, function (v) { mode = v; paint(); }));

      body.innerHTML = "";
      var candidates = mode === "iso" ? sreIsoCandidates(m) : sreExpressCandidates(m);
      if (!candidates.length) {
        body.appendChild(emptyState("🔍", mode === "iso"
          ? "No close matches found yet."
          : "No 15-minutes-or-less options for this slot yet."));
        return;
      }
      var grid = el("div", "col-grid sre-grid");
      candidates.forEach(function (r) {
        var t = (r.prep_time_mins || 0) + (r.cook_time_mins || 0);
        var card = el("button", "rc-pick rc sre-card");
        card.type = "button";
        var accent = clampAccent(r.accent || "#C87A53");
        card.style.setProperty("--rc-accent", accent);
        card.style.setProperty("--rc-accent-rgb", rgbFromHex(accent));
        card.innerHTML =
          '<div class="rc-band"><span class="rc-icon">' + recipeIconHtml(r.icon) + "</span></div>" +
          '<div class="rc-body">' +
            '<h3 class="rc-title">' + esc(r.title) + "</h3>" +
            '<p class="rc-meta">' + esc(r.dish_category || "") + (t ? " · " + t + " min" : "") + "</p>" +
          "</div>";
        card.addEventListener("click", function () {
          swapMeal(m.uid, r.recipe_id);
          closeReplaceRecipe();
          refresh();
        });
        grid.appendChild(card);
      });
      body.appendChild(grid);
    }
    paint();

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  /* ── Time Check: a precursor to Smart Week, not a separate suggestion
     list. The cook assigns each day of the week a time budget (Quick /
     Standard / No rush), picks which meal slots to fill (reusing Smart
     Week's own scope selector, since not every household eats all three),
     then Time Check generates a full day-by-day grid the same shape as
     Smart Week's — each day's meals are pulled from that day's assigned
     time bucket first. Day assignments + scope persist to localStorage so
     reopening Time Check later starts from the prior week's plan. ──── */
  var BWQ_BUCKETS = [
    { key: "quick", emoji: "⚡", label: "Quick nights", short: "Quick", sub: "Under 30 minutes",
      match: function (t) { return t > 0 && t <= 30; } },
    { key: "standard", emoji: "🕐", label: "Standard nights", short: "Standard", sub: "About an hour",
      match: function (t) { return t > 30 && t <= 60; } },
    { key: "none", emoji: "♾️", label: "No rush", short: "No rush", sub: "No time limit",
      match: function (t) { return t === 0 || t > 60; } }
  ];
  function bwqTotalTime(r) { return (r.prep_time_mins || 0) + (r.cook_time_mins || 0); }

  var TIME_CHECK_KEY = "mc-cookbook:timecheck"; // { scopeKey, days: { Mon: "quick", ... } }
  function loadTimeCheck() {
    try {
      var v = JSON.parse(localStorage.getItem(TIME_CHECK_KEY) || "null");
      if (!v || typeof v !== "object") return { scopeKey: "all", days: {} };
      return { scopeKey: v.scopeKey || "all", days: v.days || {} };
    } catch (e) { return { scopeKey: "all", days: {} }; }
  }
  function saveTimeCheck(scopeKey, dayBuckets) {
    try { localStorage.setItem(TIME_CHECK_KEY, JSON.stringify({ scopeKey: scopeKey, days: dayBuckets })); }
    catch (e) {}
  }

  /* ── Time Check generation (tcw* namespace) ───────────────────────────
     Deliberately decoupled from Smart Week's own smw* scoring above (see
     that section's note) — same grid shape and the same recency +
     dish-category-variety + ingredient-overlap tie-break
     (smwScoreCandidate), but each day's candidate pool is first narrowed
     to whatever fits that day's assigned time bucket. A bucket with zero
     fits for a slot falls back to the full eligible pool, so a day/slot
     never comes back empty just because its budget was narrow. */
  function tcwPickForSlot(slot, usedIds, prevCategory, excludeId, bucketKey, usedIngredientKeys) {
    var pool = mealEligibleRecipes(slot);
    if (excludeId) pool = pool.filter(function (r) { return r.recipe_id !== excludeId; });
    var bucket = BWQ_BUCKETS.filter(function (b) { return b.key === bucketKey; })[0];
    if (bucket) {
      var fit = pool.filter(function (r) { return bucket.match(bwqTotalTime(r)); });
      if (fit.length) pool = fit;
    }
    if (!pool.length) return null;
    var fresh = pool.filter(function (r) {
      var days = daysSinceCooked(r.recipe_id);
      return days == null || days > SMW_HARD_EXCLUDE_DAYS;
    });
    var candidates = fresh.length ? fresh : pool;
    var best = null, bestScore = -Infinity;
    candidates.forEach(function (r) {
      var s = smwScoreCandidate(r, usedIds, prevCategory, usedIngredientKeys);
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }
  // Full 7-day grid, same shape as smwGenerateWeek's — days with no bucket
  // assigned are skipped (the cook didn't tell us anything about them).
  function tcwGenerateWeek(scopeKey, dayBuckets) {
    var scope = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];
    var usedIds = new Set();
    var usedIngredientKeys = {};
    var prevCategoryBySlot = {};
    var grid = [];
    DAYS.forEach(function (day) {
      var bucketKey = dayBuckets[day];
      if (!bucketKey) return;
      scope.slots.forEach(function (slot) {
        var pick = tcwPickForSlot(slot, usedIds, prevCategoryBySlot[slot], null, bucketKey, usedIngredientKeys);
        if (pick) {
          usedIds.add(pick.recipe_id);
          prevCategoryBySlot[slot] = pick.dish_category;
          mergeIngredientKeys(usedIngredientKeys, recipeIngredientKeys(pick));
          grid.push({ day: day, slot: slot, id: pick.recipe_id });
        }
      });
    });
    return { scope: scope, grid: grid };
  }
  // Re-pick a single day+slot against that day's assigned bucket, excluding
  // its current recipe so the tap always changes something when possible.
  // Ingredient overlap is scored against every other slot already in the
  // grid, same as smwRegenerateSlot.
  function tcwRegenerateSlot(grid, day, slot, dayBuckets) {
    var usedIds = new Set();
    var usedIngredientKeys = {};
    grid.forEach(function (g) {
      if (g.day === day && g.slot === slot) return;
      usedIds.add(g.id);
      var r = recipeById(g.id);
      if (r) mergeIngredientKeys(usedIngredientKeys, recipeIngredientKeys(r));
    });
    var current = grid.filter(function (g) { return g.day === day && g.slot === slot; })[0];
    var dayIdx = DAYS.indexOf(day);
    var prevEntry = dayIdx > 0
      ? grid.filter(function (g) { return g.day === DAYS[dayIdx - 1] && g.slot === slot; })[0]
      : null;
    var prevCategory = prevEntry ? ((recipeById(prevEntry.id) || {}).dish_category) : null;
    var pick = tcwPickForSlot(slot, usedIds, prevCategory, current ? current.id : null, dayBuckets[day], usedIngredientKeys);
    return pick ? pick.recipe_id : null;
  }

  function closeBandwidthQuiz() {
    var ov = document.querySelector(".bwq-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }
  function openBandwidthQuiz() {
    closeBandwidthQuiz();

    var saved = loadTimeCheck();
    var scopeKey = saved.scopeKey;
    var dayBuckets = {};
    DAYS.forEach(function (d) { dayBuckets[d] = saved.days[d] || null; });
    var phase = "quiz";  // "quiz" | "results"
    var grid = [];
    var scope = SMART_SCOPES[0];

    var ov = el("div", "picker bwq-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "⏱ Time Check"));
    var done = el("button", "picker-close", "Done");
    done.type = "button";
    done.addEventListener("click", function () { closeBandwidthQuiz(); refresh(); });
    top.appendChild(done);
    ov.appendChild(top);

    var body = el("div", "picker-results bwq-body");
    ov.appendChild(body);

    function tcwDayBlock(day) {
      var block = el("div", "tcw-day-block");
      block.appendChild(el("div", "tcw-day-label", esc(DAY_LONG[day])));
      var items = BWQ_BUCKETS.map(function (b) { return { value: b.key, label: b.emoji + " " + b.short }; });
      block.appendChild(segControl("tcw-day-toggle", items, dayBuckets[day], function (v) {
        dayBuckets[day] = v;
        paintQuiz();
      }));
      return block;
    }

    function paintQuiz() {
      body.innerHTML = "";
      body.appendChild(el("p", "bwq-intro",
        "Which days need to move fast, and which have room to breathe? We'll build the week around it."));

      var scopeBar = el("div", "smw-scope-bar");
      var scopeSel = el("select", "smw-scope-select");
      scopeSel.setAttribute("aria-label", "Time Check meal slots");
      scopeSel.innerHTML = SMART_SCOPES.map(function (s) {
        return '<option value="' + s.key + '">' + esc(s.label) + "</option>";
      }).join("");
      scopeSel.value = scopeKey;
      scopeSel.addEventListener("change", function () { scopeKey = scopeSel.value; });
      scopeBar.appendChild(scopeSel);
      body.appendChild(scopeBar);

      DAYS.forEach(function (day) { body.appendChild(tcwDayBlock(day)); });

      var cta = el("button", "cook-start bwq-continue-btn", "Generate my week →");
      cta.type = "button";
      cta.disabled = !DAYS.some(function (d) { return !!dayBuckets[d]; });
      cta.addEventListener("click", function () {
        saveTimeCheck(scopeKey, dayBuckets);
        var result = tcwGenerateWeek(scopeKey, dayBuckets);
        grid = result.grid;
        scope = result.scope;
        phase = "results";
        paint();
      });
      body.appendChild(cta);
    }

    function paintResults() {
      body.innerHTML = "";

      var back = el("button", "picker-sort-btn bwq-back-btn", "‹ Back to quiz");
      back.type = "button";
      back.addEventListener("click", function () { phase = "quiz"; paint(); });
      body.appendChild(back);

      var regenAll = el("button", "picker-sort-btn smw-regen-all-btn", "🔀 Regenerate");
      regenAll.type = "button";
      regenAll.addEventListener("click", function () {
        var result = tcwGenerateWeek(scopeKey, dayBuckets);
        grid = result.grid;
        scope = result.scope;
        paint();
      });
      body.appendChild(regenAll);

      if (!grid.length) {
        body.appendChild(emptyState("🧊",
          "No recipes available yet.<br>Go back and assign at least one day."));
      } else {
        DAYS.forEach(function (day) {
          var entries = grid.filter(function (g) { return g.day === day; });
          if (!entries.length) return;
          var dayBlock = el("div", "plan-day smw-day");
          dayBlock.appendChild(el("div", "plan-day-head", esc(DAY_LONG[day])));
          scope.slots.forEach(function (slot) {
            var entry = entries.filter(function (g) { return g.slot === slot; })[0];
            if (!entry) return;
            var r = recipeById(entry.id);
            var slotEl = el("div", "plan-slot");
            slotEl.appendChild(el("div", "plan-slot-label", esc(slot)));
            var cell = el("div", "plan-slot-cell");
            var chip = el("div", "plan-chip smw-chip");
            chip.appendChild(el("span", "plan-chip-icon", recipeIconHtml(r && r.icon)));
            var titleEl = el("a", "plan-chip-title", esc(r ? r.title : entry.id));
            if (r) titleEl.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id);
            chip.appendChild(titleEl);
            var regen = el("button", "smw-chip-regen", "↻");
            regen.type = "button";
            regen.setAttribute("aria-label", "Regenerate " + slot + " for " + DAY_LONG[day]);
            regen.addEventListener("click", function () {
              var newId = tcwRegenerateSlot(grid, day, slot, dayBuckets);
              if (!newId) { pop(regen); return; }
              grid = grid.map(function (g) {
                return (g.day === day && g.slot === slot) ? { day: day, slot: slot, id: newId } : g;
              });
              paint();
            });
            chip.appendChild(regen);
            var rm = el("button", "smw-chip-remove", "×");
            rm.type = "button";
            rm.setAttribute("aria-label", "Remove " + slot + " for " + DAY_LONG[day]);
            rm.addEventListener("click", function () {
              grid = grid.filter(function (g) { return !(g.day === day && g.slot === slot); });
              paint();
            });
            chip.appendChild(rm);
            cell.appendChild(chip);
            slotEl.appendChild(cell);
            dayBlock.appendChild(slotEl);
          });
          body.appendChild(dayBlock);
        });
      }

      var actions = el("div", "smw-actions");
      var confirm = el("button", "cook-start smw-confirm-btn", "＋ Set Weekly Meal Plan");
      confirm.type = "button";
      confirm.disabled = !grid.length;
      confirm.addEventListener("click", function () {
        commitSmartWeek(grid, scope.slots);
        closeBandwidthQuiz();
        plannerState.view = "plan";
        refresh();
        window.scrollTo(0, 0);
      });
      actions.appendChild(confirm);
      body.appendChild(actions);
    }

    function paint() { if (phase === "quiz") paintQuiz(); else paintResults(); }
    paint();

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  /* ══ ADD-RECIPE FORM — create your own / add to library ═════════════ */
  // A full-screen overlay (reuses the picker overlay shell) holding a "Medium"
  // recipe form: title, icon, category, structured ingredients (item / qty /
  // unit / Meat·Dairy·Produce·Pantry) and numbered steps — no macros. On save
  // the recipe is persisted via MCUser and merged into the live data layer, so
  // it appears immediately in the "My Recipes" collection, search, Categories
  // and the planner.
  var GROC_CATS = ["Meat", "Dairy", "Produce", "Pantry"];
  var FORM_ACCENTS = ["#7D8C77", "#C87A53", "#B08D57", "#B23A48", "#C0633F", "#E0A458", "#5E6B8C"];

  function rfLabel(text) { return el("label", "rf-label", esc(text)); }
  function rfText(ph, value) {
    var i = el("input", "search-box rf-input");
    i.type = "text";
    i.placeholder = ph || "";
    if (value != null) i.value = value;
    return i;
  }
  function rfNumber(ph) {
    var i = el("input", "search-box rf-input rf-num");
    i.type = "number"; i.min = "0"; i.placeholder = ph || "";
    i.setAttribute("inputmode", "numeric");
    return i;
  }
  function rfArea(ph, value) {
    var t = el("textarea", "search-box rf-textarea");
    t.placeholder = ph || ""; t.rows = 3;
    if (value != null) t.value = value;
    return t;
  }
  function rfField(labelText, control, hint) {
    var f = el("div", "rf-field");
    f.appendChild(rfLabel(labelText));
    f.appendChild(control);
    if (hint) f.appendChild(el("p", "rf-hint", esc(hint)));
    return f;
  }

  function rfIngredientRow() {
    var row = el("div", "rf-ing");
    var qty  = rfText("Qty");  qty.classList.add("rf-ing-qty");
    var unit = rfText("Unit"); unit.classList.add("rf-ing-unit");
    var item = rfText("Ingredient"); item.classList.add("rf-ing-item");
    var cat  = el("select", "plan-select rf-ing-cat");
    GROC_CATS.forEach(function (c) {
      var o = el("option", null, esc(c)); o.value = c; cat.appendChild(o);
    });
    var rm = el("button", "rf-row-remove", "✕");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove ingredient");
    rm.addEventListener("click", function () { if (row.parentNode) row.parentNode.removeChild(row); });
    row.appendChild(qty); row.appendChild(unit); row.appendChild(item);
    row.appendChild(cat); row.appendChild(rm);
    row._read = function () {
      return { quantity: qty.value, unit: unit.value, item: item.value, category: cat.value };
    };
    return row;
  }

  function rfStepRow(stepWrap) {
    var row = el("div", "rf-step");
    var head = el("div", "rf-step-head");
    head.appendChild(el("span", "rf-step-num", ""));
    var rm = el("button", "rf-row-remove", "✕");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove step");
    rm.addEventListener("click", function () {
      if (row.parentNode) { row.parentNode.removeChild(row); rfRenumber(stepWrap); }
    });
    head.appendChild(rm);
    row.appendChild(head);
    var title  = rfText("Step title (optional)");
    var detail = rfArea("What to do… (durations like “simmer 20 minutes” become tap-to-start timers)");
    row.appendChild(title); row.appendChild(detail);
    row._read = function () { return { title: title.value, detail: detail.value }; };
    return row;
  }
  function rfRenumber(stepWrap) {
    var n = 1;
    Array.prototype.forEach.call(stepWrap.children, function (row) {
      var num = row.querySelector(".rf-step-num");
      if (num) num.textContent = String(n++);
    });
  }

  function closeRecipeForm() {
    var ov = document.querySelector(".recipe-form");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }

  function openRecipeForm() {
    closePicker();
    closeRecipeForm();

    var selectedAccent = FORM_ACCENTS[0];

    var ov = el("div", "picker recipe-form");

    // Top bar: Cancel · title · Save
    var top = el("div", "picker-top");
    var cancel = el("button", "picker-close rf-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeRecipeForm);
    top.appendChild(cancel);
    top.appendChild(el("div", "picker-title", "Add a Recipe"));
    var saveTop = el("button", "picker-close rf-save-top", "Save");
    saveTop.type = "button";
    top.appendChild(saveTop);
    ov.appendChild(top);

    var body = el("div", "rf-body");

    // ── Basics ──
    var titleInput = rfText("e.g. Grandma's Pot Roast");
    body.appendChild(rfField("Title", titleInput));

    var iconInput = rfText("🍽️", "🍽️");
    iconInput.classList.add("rf-icon-input");
    body.appendChild(rfField("Icon", iconInput, "An emoji for the card. Tap to change it."));

    var catSel = el("select", "plan-select rf-select");
    var ph = el("option", null, "Choose a category…"); ph.value = ""; catSel.appendChild(ph);
    CATEGORY_ORDER.forEach(function (c) {
      var o = el("option", null, esc(c)); o.value = c; catSel.appendChild(o);
    });
    body.appendChild(rfField("Category", catSel));

    var descInput = rfArea("A short description (optional)");
    body.appendChild(rfField("Description", descInput));

    var tagsInput = rfText("Spicy, One-Dish, High-Protein");
    body.appendChild(rfField("Tags", tagsInput, "Comma-separated (optional)."));

    // Accent swatches
    var swatches = el("div", "rf-swatches");
    FORM_ACCENTS.forEach(function (hex, i) {
      var sw = el("button", "rf-swatch" + (i === 0 ? " active" : ""));
      sw.type = "button";
      sw.style.background = hex;
      sw.style.setProperty("--sw", hex);   // lets the active ring match this swatch's own color
      sw.setAttribute("aria-label", "Accent color " + (i + 1));
      sw.addEventListener("click", function () {
        selectedAccent = hex;
        Array.prototype.forEach.call(swatches.children, function (n) { n.classList.remove("active"); });
        sw.classList.add("active");
      });
      swatches.appendChild(sw);
    });
    body.appendChild(rfField("Accent color", swatches));

    // Times + serving size
    var times = el("div", "rf-times");
    var prepInput = rfNumber("0");
    var cookInput = rfNumber("0");
    var servInput = rfNumber("2"); servInput.value = "2";
    times.appendChild(rfField("Prep (min)", prepInput));
    times.appendChild(rfField("Cook (min)", cookInput));
    times.appendChild(rfField("Makes (servings)", servInput));
    body.appendChild(times);

    // ── Ingredients ──
    body.appendChild(el("div", "tier-label rf-section", "Ingredients"));
    body.appendChild(el("p", "rf-hint rf-section-hint",
      "Amounts are for the serving count above; the app scales them automatically."));
    var ingWrap = el("div", "rf-ing-wrap");
    ingWrap.appendChild(rfIngredientRow());
    ingWrap.appendChild(rfIngredientRow());
    body.appendChild(ingWrap);
    var addIng = el("button", "rf-add", "＋ Add ingredient");
    addIng.type = "button";
    addIng.addEventListener("click", function () { ingWrap.appendChild(rfIngredientRow()); });
    body.appendChild(addIng);

    // ── Steps ──
    body.appendChild(el("div", "tier-label rf-section", "Method"));
    var stepWrap = el("div", "rf-step-wrap");
    body.appendChild(stepWrap);
    function addStepRow() { stepWrap.appendChild(rfStepRow(stepWrap)); rfRenumber(stepWrap); }
    addStepRow();
    var addStep = el("button", "rf-add", "＋ Add step");
    addStep.type = "button";
    addStep.addEventListener("click", addStepRow);
    body.appendChild(addStep);

    // Error line + primary Save
    var errBox = el("p", "rf-error", "");
    body.appendChild(errBox);
    var save = el("button", "cook-start rf-save", "Save recipe");
    save.type = "button";
    body.appendChild(save);

    ov.appendChild(body);

    function doSave() {
      errBox.textContent = "";
      var title = titleInput.value.trim();
      if (!title) { errBox.textContent = "Give your recipe a title."; titleInput.focus(); return; }
      if (!catSel.value) { errBox.textContent = "Choose a category."; catSel.focus(); return; }

      var ings = Array.prototype.map.call(ingWrap.children, function (r) {
        return r._read ? r._read() : null;
      }).filter(function (x) { return x && x.item.trim(); });
      if (!ings.length) { errBox.textContent = "Add at least one ingredient."; return; }

      var steps = Array.prototype.map.call(stepWrap.children, function (r) {
        return r._read ? r._read() : null;
      }).filter(function (x) { return x && x.detail.trim(); });
      if (!steps.length) { errBox.textContent = "Add at least one step (with instructions)."; return; }

      window.MCUser.add({
        title: title,
        icon: iconInput.value,
        dish_category: catSel.value,
        description: descInput.value,
        tags: tagsInput.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean),
        accent: selectedAccent,
        prep_time_mins: prepInput.value,
        cook_time_mins: cookInput.value,
        base_serving: servInput.value,
        ingredients: ings,
        steps: steps
      });

      closeRecipeForm();
      setTab("recipes");   // land on the Recipes screen → My Recipes card updated
    }
    save.addEventListener("click", doSave);
    saveTop.addEventListener("click", doSave);

    document.body.appendChild(ov);
    document.body.classList.add("picking");
    titleInput.focus();
  }

  /* ── Shared top bar (brand / titles, no back) ─────────────────────── */
  function topBar(eyebrow, title, sub) {
    var t = el("div", "shell-top");
    t.innerHTML =
      (eyebrow ? '<p class="shell-eyebrow">' + esc(eyebrow) + "</p>" : "") +
      (title ? '<h1 class="shell-title">' + esc(title) + "</h1>" : "") +
      (sub ? '<p class="shell-sub">' + esc(sub) + "</p>" : "");
    return t;
  }

  /* ── Screen switching (hub-and-spoke; mirrored to location.hash) ──── */
  var SCREENS = ["home", "planner", "categories", "recipes", "favorites", "mikes", "tracker"];
  var COOKBOOK_SCREENS = ["home", "planner", "categories", "recipes", "favorites", "mikes"];

  function setTab(name) {
    if (SCREENS.indexOf(name) < 0) name = "home";
    if (name === "categories") catState.open = null;  // re-entry → category grid
    if (name !== "planner") closePicker();             // never leave the picker open

    SCREENS.forEach(function (t) {
      var sc = $("#screen-" + t);
      if (sc) sc.classList.toggle("active", t === name);
    });

    if (name === "home") renderHome();
    if (name === "planner") renderPlanner();
    if (name === "categories") renderCategories();
    if (name === "recipes") renderRecipes();
    if (name === "favorites") renderFavorites();
    if (name === "mikes") renderMikes();
    if (name === "tracker") renderTracker();

    // Sync persistent tab bar — aria-current mirrors the .active class so
    // screen-reader/switch-control users can tell which tab is current too.
    var tabCookbook = document.getElementById("tab-cookbook");
    var tabTracker  = document.getElementById("tab-tracker");
    var isTracker   = (name === "tracker");
    if (tabCookbook) {
      tabCookbook.classList.toggle("active", !isTracker);
      if (isTracker) tabCookbook.removeAttribute("aria-current"); else tabCookbook.setAttribute("aria-current", "page");
    }
    if (tabTracker) {
      tabTracker.classList.toggle("active", isTracker);
      if (isTracker) tabTracker.setAttribute("aria-current", "page"); else tabTracker.removeAttribute("aria-current");
    }

    history.replaceState(null, "", name === "home" ? location.pathname : "#" + name);
    window.scrollTo(0, 0);

    // Breadcrumb for cookbook-nav.js's Home FAB on recipe.html/collection.html:
    // sessionStorage survives the navigation to those standalone pages (unlike
    // document.referrer, which drops the hash), so the FAB can return to
    // wherever the user actually was instead of always resetting to Home.
    try { sessionStorage.setItem("mc-cookbook:lastScreen", name); } catch (e) {}
  }

  // The currently visible screen, read from the DOM so it stays correct even
  // after hash-less home navigation.
  function activeScreen() {
    for (var i = 0; i < SCREENS.length; i++) {
      var sc = $("#screen-" + SCREENS[i]);
      if (sc && sc.classList.contains("active")) return SCREENS[i];
    }
    return "home";
  }

  // Live favorites sync. The recipe view (and any other tab) writes the shared
  // store from a DIFFERENT document, so the `storage` event is our signal to
  // re-render without a manual refresh. Only the favorites-aware screens care;
  // a null key means localStorage was cleared, so refresh defensively.
  function wireFavSync() {
    window.addEventListener("storage", function (e) {
      if (e.key && e.key !== FAV_KEY) return;
      var screen = activeScreen();
      if (screen === "home") renderHome();
      else if (screen === "favorites") renderFavorites();
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────────── */
  function init() {
    syncOwnerFromUrl();
    wireFavSync();

    // Persistent tab bar: Cookbook tab → home; Tracker tab → tracker screen.
    // The Cookbook tab reads "active" for every cookbook screen (Planner,
    // Categories, Recipes, Favorites, Mikes), not just Home — so tapping it
    // while already browsing one of those used to silently blow away whatever
    // the user was doing (e.g. mid-search) and jump to Home. Make it a no-op
    // unless the Tracker screen is what's actually active.
    var tabCookbook = document.getElementById("tab-cookbook");
    var tabTracker  = document.getElementById("tab-tracker");
    if (tabCookbook) tabCookbook.addEventListener("click", function () {
      if (activeScreen() === "tracker") setTab("home");
    });
    if (tabTracker)  tabTracker.addEventListener("click",  function () { setTab("tracker"); });

    setTab((location.hash || "#home").slice(1));
    updateAppBadge();   // corrects staleness from a day rollover while closed

    // Day-7 archive check: no background cron exists in a static PWA, so
    // this is evaluated once per app open instead. Deferred a tick so the
    // shell finishes its first paint before an overlay can appear on top.
    setTimeout(function () {
      var p = loadPlan();
      if (shouldPromptDay7(p)) openSaveWeekPrompt();
    }, 0);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  // Expose favorites API for collection.js / recipe page.
  window.MCFav = { load: loadFavs, toggle: toggleFav, has: function (id) { return loadFavs().has(id); } };
})();
