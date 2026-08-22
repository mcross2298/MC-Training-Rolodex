/* ==========================================================================
   mc-cards.js  —  the recipe card, in one place
   --------------------------------------------------------------------------
   Audit C-07. The `.rc` recipe card existed twice — 117 lines in
   cookbook-home.js and 101 in collection.js — along with every helper it
   needs: the 121-line recipe-icon SVG table, CARD_PATTERNS, hashStr,
   cardPatternFor, cardSheenDelay, rgbFromHex, macroStatsHtml and the
   30-line clampAccent (that one triplicated, into cookbook.js as well).
   Roughly 300 lines carried in duplicate, and already drifting: collection
   pages had grown a delete control for user-authored recipes while the shell
   had grown a pantry badge, a serving override, an owner double-tap curation
   gesture and a favorites-screen removal path. A card fix applied on one
   surface silently never reached the other — no error, nothing in CI. It is
   the same defect class the cross-repo drift gate (LS-1) exists to catch,
   except these two files sat in the same folder.

   One card renders every surface now, with the differences declared instead
   of duplicated:

     per-call `opts`     what THIS card shows and does
     configure(hooks)    how THIS PAGE adds to the plan, toasts, curates

   Hooks all default to no-ops, so a page that just wants a static card gets
   one. Behavior is identical to the two implementations this replaces,
   asymmetries included: the delete control still appears only where it did
   (`opts.allowDelete`), the owner curation gesture still only on the shell,
   and collection pages still get their flat "Toggle favorite" heart label
   (`opts.favLabels: false`). Making any of those uniform is a product
   decision, not a refactor.

   Depends on window.MCFav (mc-fav.js). Load both before the page controller.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCCards) return;

  /* ── local helpers (each host file has its own; these are the card's) ── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"\']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Retrigger a one-shot animation: drop the class, force reflow, re-add.
  function pop(node) {
    node.classList.remove("pop");
    void node.offsetWidth;
    node.classList.add("pop");
  }

  /* ── host behavior hooks ─────────────────────────────────────────────── */
  var H = {
    isMikePick: function () { return false; },
    mikesBadge: function () { return null; },
    isOwner: function () { return false; },
    toggleMikePick: function () { return false; },
    // Return true when the host fully handled the change (e.g. re-rendered
    // the whole grid) so the card stops mutating a node that may be gone.
    onMikePickToggled: function () { return false; },
    onFavToggled: function () { return false; },
    addToPlan: function () { return null; },
    removeFromPlan: function () {},
    toast: function () {}
  };
  function configure(hooks) {
    Object.keys(hooks || {}).forEach(function (k) {
      if (typeof hooks[k] === "function") H[k] = hooks[k];
    });
  }

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

  // Staggers the sheen sweep so a grid of cards doesn't shimmer in lockstep —
  // same hash as the pattern above, just a different modulus.
  function cardSheenDelay(recipeId) {
    return ((hashStr(recipeId) >>> 3) % 7) * 0.8 + "s";
  }

  function rgbFromHex(hex) {
    var h = (hex || "").replace("#", "");
    if (h.length !== 6) return "200,122,83";
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join(",");
  }

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

  function recipeIconHtml(icon) {
    if (!icon) return DEFAULT_RECIPE_ICON;
    var group = EMOJI_ICON_GROUP[icon];
    return group ? RECIPE_ICON_SVGS[group] : DEFAULT_RECIPE_ICON;
  }

  /* ── Photo resolution chain (CI initiative 3, "The Photographic Layer") ──
     `cookbook-home.js`'s own header comment used to read "Recipe cards have
     no photography — recipes-data.js has no image field." Both halves of
     that were true and both were waste: the field was simply never wired,
     and meanwhile the app was ALREADY storing real photos the cook took —
     a cover photo per recipe (`mc-cookbook:photos`, set from recipe.html)
     and a photo per dated cook-log entry (`mc-cookbook:cooked[id][].photo`)
     — and showing them in exactly one place, recipe.html's own header.

     Three sources, checked in order, so a recipe with none of them falls
     through to the existing emoji/pattern band **completely unchanged** —
     no visual regression is possible for a recipe with no photo:
       1. `r.photo` — an authored path (`images/recipes/<id>.jpg`), the
          field CLAUDE.md's photo hand-off rule already specifies.
       2. The user's own cover photo for this recipe, if they set one.
       3. The most recent cook-log photo for this recipe, if any — the
          highest-leverage source, since it costs the cook nothing extra:
          every dish they've already photographed while cooking becomes
          card art automatically, with zero new effort.
     Read directly from localStorage (not through a shared module) the same
     way MCFav reads its own key — this file is loaded on every page these
     keys exist on, and a fourth module for two `getItem` calls would be
     more code than the thing it wraps. */
  var RECIPE_COVER_KEY = "mc-cookbook:photos";
  var COOKED_KEY = "mc-cookbook:cooked";
  function loadJSONMap(key) {
    try {
      var o = JSON.parse(localStorage.getItem(key) || "{}");
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  // Precedence (audit C-13): authored r.photo > the cook's own explicit
  // cover > the most recent cook-log photo > none. Every caller of this
  // function — cards, recipe.html's hero, the eyebrow cover widget — must
  // stay on this one chain rather than reading r.photo or a store directly,
  // or a second, drifting definition creeps back in (see CLAUDE.md's
  // mc-cards.js entry).
  function photoFor(r) {
    if (r.photo) return { url: r.photo, source: "authored" };
    var covers = loadJSONMap(RECIPE_COVER_KEY);
    if (covers[r.recipe_id]) return { url: covers[r.recipe_id], source: "cover" };
    var entries = loadJSONMap(COOKED_KEY)[r.recipe_id];
    if (Array.isArray(entries)) {
      for (var i = entries.length - 1; i >= 0; i--) {
        var e = entries[i];
        if (e && typeof e === "object" && e.photo) {
          return { url: e.photo, source: "cooklog", at: e.at };
        }
      }
    }
    return null;
  }
  // Short relative date for the cook-log provenance chip ("Mar 14"), not the
  // full relTime() prose cookbook.js's cook log uses — the chip has room for
  // a date, not a sentence.
  function shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

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

  /* ── the card ──────────────────────────────────────────────────────── */
  // opts: serving | pantryInfo | fav | allowDelete | favLabels | onChange |
  //       photo (default true — pass false to keep the compact emoji band
  //       even when a photo exists, for a future dense-list context; no
  //       current caller needs this, but the escape hatch costs nothing)
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
    var photo = opts.photo === false ? null : photoFor(r);

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

    // Match provenance — only passed in during an active search (CI
    // initiative 4, mc-search.js). Ranking alone doesn't say WHY a result
    // matched, which matters most for the case ranking exists to surface:
    // a recipe whose ingredients name the query but whose title doesn't.
    var matchBadge = "";
    if (opts.matchedFields && opts.matchedFields.length) {
      var label = opts.matchedFields.indexOf("title") >= 0 ? "title"
        : opts.matchedFields.indexOf("ingredient") >= 0 ? "ingredient"
        : opts.matchedFields[0];
      matchBadge = '<div class="rc-match-badge">matched: ' + esc(label.replace("_", " ")) + "</div>";
    }

    // A card with a photo gets a taller band so the image actually reads as
    // a photo rather than a sliver — the compact 52px band is the right
    // height for an icon, not a dish. Cards with no photo are byte-for-byte
    // the band this always rendered; this is additive, not a redesign.
    var bandHtml = photo
      ? '<div class="rc-band has-photo">' +
          '<img class="rc-photo-img" src="' + esc(photo.url) + '" alt="" loading="lazy" decoding="async">' +
          (photo.source === "cooklog"
            ? '<span class="rc-photo-chip">📸 Your cook' + (photo.at ? " · " + esc(shortDate(photo.at)) : "") + "</span>"
            : "") +
        "</div>"
      : '<div class="rc-band">' +
          '<span class="rc-sheen" style="animation-delay:' + cardSheenDelay(r.recipe_id) + '"></span>' +
          '<span class="rc-icon">' + recipeIconHtml(r.icon) + "</span>" +
        "</div>";

    card.innerHTML =
      bandHtml +
      '<div class="rc-body">' +
        '<h3 class="rc-title">' + esc(r.title) + "</h3>" +
        macroStatsHtml(m) +
        pantryBadge +
        matchBadge +
      "</div>";

    // A heart in the card's upper-right corner — favorite straight from the
    // grid. Filled when saved, outline when not; tapping flips it in place. On
    // the Favorites screen, un-saving also drops the card out of the list.
    var saved = MCFav.has(r.recipe_id);
    var heart = el("button", "fav-toggle" + (saved ? " on" : ""), saved ? "❤" : "♡");
    heart.type = "button";
    heart.setAttribute("aria-label", opts.favLabels === false
      ? "Toggle favorite"
      : (saved ? "Remove from favorites" : "Add to favorites"));
    heart.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var on = MCFav.toggle(r.recipe_id);
      if (H.onFavToggled(r.recipe_id, on, opts)) return;   // host re-rendered the grid
      heart.classList.toggle("on", on);
      heart.textContent = on ? "❤" : "♡";
      if (opts.favLabels !== false) {
        heart.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
      }
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
      var meal = H.addToPlan(r, { serving: opts.serving });
      planBtn.classList.add("added");
      planBtn.textContent = "✓";
      pop(planBtn);
      H.toast("Added “" + r.title + "” to This Week", "Undo", function () {
        if (meal && meal.uid) H.removeFromPlan(meal.uid);
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
    if (H.isMikePick(r.recipe_id)) {
      card.classList.add("mikes-pick");
      var badge = H.mikesBadge();
      if (badge) card.appendChild(badge);
    }

    // User-authored recipes get a delete control so the personal library is
    // manageable. Only rendered where the host asks for it (collection pages
    // today) — turning it on everywhere would be a product change.
    if (opts.allowDelete && r.user && window.MCUser) {
      var del = el("button", "rc-delete", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Delete this recipe");
      del.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (window.confirm("Delete “" + r.title + "” from your recipes?")) {
          window.MCUser.remove(r.recipe_id);
          if (opts.onChange) opts.onChange();
        }
      });
      card.appendChild(del);
    }

    // Owner-only curation: double-tap a card to add/remove it from Mike's
    // Favorites. Single tap still opens the recipe — but because the card is a
    // link, in owner mode we hold navigation ~280ms to see if a second tap
    // (the curate gesture) lands first. Visitors never enter this branch.
    if (H.isOwner()) {
      card.classList.add("owner-curatable");
      var tapTimer = null;
      card.addEventListener("click", function (e) {
        if (e.defaultPrevented) return;          // heart (stopPropagation) handled it
        e.preventDefault();
        if (tapTimer) {                          // second tap → curate
          clearTimeout(tapTimer); tapTimer = null;
          var on = H.toggleMikePick(r.recipe_id);
          if (H.onMikePickToggled(r.recipe_id, on, card)) return;
          card.classList.toggle("mikes-pick", on);
          var b = card.querySelector(".mikes-badge");
          if (on && !b) { var nb = H.mikesBadge(); if (nb) card.appendChild(nb); }
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
  window.MCCards = {
    configure: configure,
    recipeCard: recipeCard,
    macroStatsHtml: macroStatsHtml,
    recipeIconHtml: recipeIconHtml,
    cardPatternFor: cardPatternFor,
    cardSheenDelay: cardSheenDelay,
    hashStr: hashStr,
    rgbFromHex: rgbFromHex,
    clampAccent: clampAccent,
    photoFor: photoFor
  };
})();
