/* ==========================================================================
   cookbook.js  —  Phase 1
   --------------------------------------------------------------------------
   Render + state logic for the unified recipe-detail view (recipe.html).
   Consumes RECIPES from recipes-data.js. No framework, no build step.

   State:
     • serving  — chosen serving count (1..12 via the stepper). Authored tiers
                  (e.g. 2 / 4) are exact; other counts are scaled live from the
                  native tier. Re-renders macros + ingredients.
     • tab      — active sub-tab ('overview' | 'grocery' | 'steps').
   Check-off state (groceries + steps) persists in localStorage, keyed by
   recipe + serving count so each count keeps an independent list.

   scaleQuantity() powers arbitrary serving counts: when a count has no authored
   tier, ingredientsFor() scales the native tier by (target / native). Macros
   are per single serving and constant, so they never scale.
   ========================================================================== */
(function () {
  "use strict";

  /* ── Tiny helpers ─────────────────────────────────────────────────── */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
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
    void node.offsetWidth; // eslint-disable-line no-unused-expressions
    node.classList.add("pop");
  };
  // Authored accents range down to near-black; --accent is used as literal
  // text/border color on the dark theme, so floor the lightness before it's
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
  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  // Brief, informational auto-dismissing toast (no action) — used to flag
  // that switching servings landed on a fresh, unchecked checklist.
  function toast(msg) {
    var t = el("div", "mc-toast");
    t.appendChild(el("span", "mc-toast-msg", esc(msg)));
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, 3200);
  }

  /* ── Inline step timers ───────────────────────────────────────────── */
  // Cooks reach for a separate timer app for "simmer 20 minutes". Parse real
  // durations out of step text and offer a tappable countdown chip that pings
  // and vibrates on completion. A time UNIT is required, so quantities like
  // "20g" or "425°F" never become timers. Everything works offline.
  var DUR_RE = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;

  function durToSeconds(numStr, unit) {
    var n, m = numStr.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
    else if ((m = numStr.match(/^(\d+)\/(\d+)$/))) n = parseInt(m[1], 10) / parseInt(m[2], 10);
    else n = parseFloat(numStr);
    unit = unit.toLowerCase();
    if (unit.charAt(0) === "h") return Math.round(n * 3600);
    if (unit.charAt(0) === "m") return Math.round(n * 60);
    return Math.round(n);
  }
  function parseDurations(text) {
    var out = [], seen = {}, m;
    DUR_RE.lastIndex = 0;
    while ((m = DUR_RE.exec(text || ""))) {
      var secs = durToSeconds(m[1], m[2]);
      if (secs <= 0 || secs > 86400 || seen[secs]) continue; // sane bounds, dedupe
      seen[secs] = 1;
      out.push({ label: m[0].replace(/\s+/g, " ").trim(), seconds: secs });
    }
    return out;
  }
  function fmtClock(s) {
    var m = Math.floor(s / 60), sec = s % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  // Lazy, gesture-primed alert tone (Web Audio) — no asset, works offline.
  var audioCtx = null;
  function primeAudio() {
    try {
      if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function ping() {
    try {
      if (!audioCtx) return;
      var t = audioCtx.currentTime;
      [0, 0.3, 0.6].forEach(function (off) {
        var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = "sine"; osc.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t + off);
        g.gain.exponentialRampToValueAtTime(0.3, t + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.22);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(t + off); osc.stop(t + off + 0.24);
      });
    } catch (e) {}
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {} }

  // A self-contained countdown chip. Tap to start; tap again to cancel/reset.
  function timerChip(seconds, label) {
    var chip = el("button", "timer-chip", "⏱ " + label);
    chip.type = "button";
    var remaining = seconds, intId = null;
    function clear() { if (intId) { clearInterval(intId); intId = null; } }
    function reset() {
      clear(); remaining = seconds;
      chip.className = "timer-chip"; chip.textContent = "⏱ " + label;
    }
    chip.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();        // never toggle the step itself
      if (intId || chip.classList.contains("ringing")) { reset(); return; }
      primeAudio();
      chip.classList.add("running");
      chip.textContent = "⏱ " + fmtClock(remaining);
      intId = setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) {
          clear();
          chip.classList.remove("running");
          chip.classList.add("ringing");
          chip.textContent = "⏰ Time! · tap to reset";
          ping(); buzz();
          return;
        }
        chip.textContent = "⏱ " + fmtClock(remaining);
      }, 1000);
    });
    return chip;
  }
  function appendTimers(parent, text) {
    var times = parseDurations(text);
    if (!times.length) return;
    var wrap = el("div", "timer-wrap");
    times.forEach(function (t) { wrap.appendChild(timerChip(t.seconds, t.label)); });
    parent.appendChild(wrap);
  }

  /* ── Quantity scaling (future single-tier recipes) ────────────────── */
  // Parses common fraction/decimal quantities, scales by a factor, and returns
  // a tidy string ("1/2", "1 1/2", "3", "0.75"). Non-numeric quantities (e.g.
  // "to taste") pass through unchanged.
  function parseQtyNumber(qty) {
    if (qty == null) return null;
    var s = String(qty).trim();
    var m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); // mixed: "1 1/2"
    if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return parseInt(m[1], 10) / parseInt(m[2], 10); // simple fraction
    if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s); // integer / decimal
    return null; // not numeric
  }

  function scaleQuantity(qty, factor) {
    if (qty == null) return qty;
    var val = parseQtyNumber(qty);
    if (val == null) return String(qty).trim(); // not numeric — leave alone
    return prettyNumber(val * factor);
  }

  function prettyNumber(v) {
    var whole = Math.floor(v + 1e-9);
    var frac = v - whole;
    var FRACTIONS = [
      [1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"],
      [2 / 3, "2/3"], [3 / 4, "3/4"]
    ];
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

  /* ── Favorites (shared store with the home/Favorites tab) ─────────── */
  var FAV_KEY = "mc-cookbook:favorites";
  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function isFav(id) { return loadFavs().has(id); }
  function toggleFav(id) {
    var set = loadFavs();
    if (set.has(id)) set.delete(id); else set.add(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
    return set.has(id);
  }

  /* ── This Week planner (shared store with cookbook-home.js) ────────
     recipe.html doesn't load cookbook-home.js, so this mirrors just enough
     of its addMeal() shape ({uid,id,serving,day,slot,completed,completedAt}
     in mc-cookbook:mealplan) to add a recipe from the detail page without
     scheduling it to a day — the planner's own "Add a meal" flow still owns
     day/slot assignment. */
  var PLAN_KEY = "mc-cookbook:mealplan";
  function addToPlan(r, serving) {
    var p;
    try { p = JSON.parse(localStorage.getItem(PLAN_KEY) || "null"); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.meals)) p = { meals: [] };
    p.meals.push({
      uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      id: r.recipe_id,
      serving: serving || nativeServing(r),
      day: null, slot: null,
      completed: false, completedAt: null
    });
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* ── Persistence ──────────────────────────────────────────────────── */
  function storeKey(recipeId, serving, kind) {
    return "mc-cookbook:" + recipeId + ":s" + serving + ":" + kind;
  }
  function loadSet(recipeId, serving, kind) {
    try {
      return new Set(JSON.parse(localStorage.getItem(storeKey(recipeId, serving, kind)) || "[]"));
    } catch (e) { return new Set(); }
  }
  function saveSet(recipeId, serving, kind, set) {
    try {
      localStorage.setItem(storeKey(recipeId, serving, kind), JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  /* ── Cook log (shared store: dated cook history + optional photo) ──────
     mc-cookbook:cooked → { [recipe_id]: [ { at: ISO, photo: dataURL|null } ] }.
     Entries are stored chronologically (most recent appended last). A legacy
     bare-string entry is tolerated and read as { at, photo: null }. The whole
     mc-cookbook: namespace is already picked up by Home's backup export/import,
     so cook history (and photos) round-trip through a backup for free. */
  var COOKED_KEY   = "mc-cookbook:cooked";
  var MAX_PHOTOS   = 12;       // keep only the N most-recent photos (storage budget)
  var PHOTO_EDGE   = 1024;     // longest-edge px after downscale
  var PHOTO_QUALITY = 0.7;     // JPEG quality

  function loadCooked() {
    try { var o = JSON.parse(localStorage.getItem(COOKED_KEY) || "{}"); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
    catch (e) { return {}; }
  }
  function saveCooked(map) {
    try { localStorage.setItem(COOKED_KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }      // QuotaExceededError → caller recovers
  }
  function normalizeEntry(e) {
    return (typeof e === "string") ? { at: e, photo: null }
                                   : { at: e && e.at, photo: (e && e.photo) || null };
  }
  function cookedEntries(id) {
    var list = loadCooked()[id];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeEntry).filter(function (e) { return e.at; });
  }
  function logCooked(id) {
    var map = loadCooked();
    if (!Array.isArray(map[id])) map[id] = [];
    map[id] = map[id].map(normalizeEntry);
    map[id].push({ at: new Date().toISOString(), photo: null });
    saveCooked(map);
  }
  function removeCooked(id, at) {
    var map = loadCooked();
    if (!Array.isArray(map[id])) return;
    map[id] = map[id].map(normalizeEntry).filter(function (e) { return e.at !== at; });
    if (!map[id].length) delete map[id];
    saveCooked(map);
  }

  // Relative + absolute date strings for the log.
  function relTime(iso) {
    var then = Date.parse(iso || "");
    if (isNaN(then)) return "";
    var days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    if (days < 14) return "last week";
    if (days < 60) return Math.round(days / 7) + " weeks ago";
    return Math.round(days / 30) + " months ago";
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /* ── Photos on a cooked entry (downscaled, capped, quota-aware) ─────── */
  function allPhotoEntries(map) {
    var arr = [];
    Object.keys(map).forEach(function (id) {
      if (!Array.isArray(map[id])) return;
      map[id].forEach(function (e) { if (e && typeof e === "object" && e.photo) arr.push(e); });
    });
    return arr;
  }
  function photoCount() { return allPhotoEntries(loadCooked()).length; }

  // Keep only the MAX_PHOTOS newest photos; null out the rest in place.
  function enforcePhotoCap(map) {
    var withPhotos = allPhotoEntries(map);
    if (withPhotos.length <= MAX_PHOTOS) return;
    withPhotos.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
    for (var i = 0; i < withPhotos.length - MAX_PHOTOS; i++) withPhotos[i].photo = null;
  }
  // Last-ditch save under quota pressure: drop oldest photos until it fits.
  function shrinkAndSave(map) {
    var withPhotos = allPhotoEntries(map);
    withPhotos.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
    for (var i = 0; i < withPhotos.length; i++) {
      withPhotos[i].photo = null;
      if (saveCooked(map)) return true;
    }
    return saveCooked(map);
  }

  // Decode → cover-fit downscale to PHOTO_EDGE → JPEG data URL. done(url, err).
  function downscaleImage(file, done) {
    var reader = new FileReader();
    reader.onerror = function () { done(null, "read"); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { done(null, "decode"); };
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { done(null, "empty"); return; }
        var scale = Math.min(1, PHOTO_EDGE / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var canvas = el("canvas"); canvas.width = cw; canvas.height = ch;
        try {
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          done(canvas.toDataURL("image/jpeg", PHOTO_QUALITY), null);
        } catch (e) { done(null, "encode"); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function pickPhoto(r, at) {
    var input = el("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) return;
      downscaleImage(file, function (dataUrl, err) {
        if (err || !dataUrl) { window.alert("Couldn’t process that image — try another."); return; }
        attachPhoto(r, at, dataUrl);
      });
    });
    input.click();
  }

  function attachPhoto(r, at, dataUrl) {
    var map = loadCooked();
    if (!Array.isArray(map[r.recipe_id])) return;
    var found = false;
    map[r.recipe_id] = map[r.recipe_id].map(function (e) {
      var entry = normalizeEntry(e);
      if (entry.at === at) { entry.photo = dataUrl; found = true; }
      return entry;
    });
    if (!found) return;
    enforcePhotoCap(map);
    if (!saveCooked(map) && !shrinkAndSave(map)) {
      window.alert("Storage is full — couldn’t save the photo. Remove some older photos and try again.");
      return;
    }
    renderMacros(r);
  }

  // Tap a thumbnail to view it full-screen; tap anywhere to dismiss.
  function openPhotoView(url) {
    var ov = el("div", "photo-view");
    var img = el("img"); img.src = url; img.alt = "Cooked photo";
    ov.appendChild(img);
    ov.addEventListener("click", function () { if (ov.parentNode) ov.parentNode.removeChild(ov); });
    document.body.appendChild(ov);
  }

  /* ── Recipe header photo (one cover photo per recipe, any recipe) ────
     mc-cookbook:photos → { [recipe_id]: dataURL }. Separate from the
     cook-log photos above (those are per dated cook entry); this is a
     single cover image shown in the sticky header. Same downscale
     pipeline, same mc-cookbook: namespace so it rides along in backups. */
  var RECIPE_PHOTOS_KEY = "mc-cookbook:photos";

  function loadRecipePhotos() {
    try {
      var o = JSON.parse(localStorage.getItem(RECIPE_PHOTOS_KEY) || "{}");
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  function saveRecipePhotos(map) {
    try { localStorage.setItem(RECIPE_PHOTOS_KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }      // QuotaExceededError → caller alerts
  }
  function loadRecipePhoto(id) { return loadRecipePhotos()[id] || null; }

  function attachRecipePhoto(r, dataUrl) {
    var map = loadRecipePhotos();
    map[r.recipe_id] = dataUrl;
    if (!saveRecipePhotos(map)) {
      window.alert("Storage is full — couldn’t save the photo. Remove another photo and try again.");
      return;
    }
    renderHeader(r);
  }
  function removeRecipePhoto(r) {
    var map = loadRecipePhotos();
    delete map[r.recipe_id];
    saveRecipePhotos(map);
    renderHeader(r);
  }

  function pickRecipePhoto(r) {
    var input = el("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) return;
      downscaleImage(file, function (dataUrl, err) {
        if (err || !dataUrl) { window.alert("Couldn’t process that image — try another."); return; }
        attachRecipePhoto(r, dataUrl);
      });
    });
    input.click();
  }

  function renderPhotoWidget(r) {
    var wrap = el("div", "r-photo");
    var url = loadRecipePhoto(r.recipe_id);
    if (url) {
      var img = el("img", "r-photo-img");
      img.src = url;
      img.alt = "Photo of " + r.title;
      img.addEventListener("click", function () { openPhotoView(url); });
      wrap.appendChild(img);

      var edit = el("button", "r-photo-btn r-photo-edit", "✎");
      edit.type = "button";
      edit.setAttribute("aria-label", "Replace photo");
      edit.addEventListener("click", function (e) { e.stopPropagation(); pickRecipePhoto(r); });
      wrap.appendChild(edit);

      var rm = el("button", "r-photo-btn r-photo-remove", "✕");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove photo");
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        if (window.confirm("Remove this photo?")) removeRecipePhoto(r);
      });
      wrap.appendChild(rm);
    } else {
      var add = el("button", "r-photo-add", "📷");
      add.type = "button";
      add.setAttribute("aria-label", "Add a photo");
      add.addEventListener("click", function () { pickRecipePhoto(r); });
      wrap.appendChild(add);
    }
    return wrap;
  }

  /* ── App state ────────────────────────────────────────────────────── */
  var state = { recipe: null, serving: 2, tab: "overview" };

  function pickRecipe() {
    var id = new URLSearchParams(location.search).get("id");
    var list = window.RECIPES || [];
    return list.filter(function (r) { return r.recipe_id === id; })[0] || list[0] || null;
  }

  /* ── Serving scaling (arbitrary counts) ───────────────────────────── */
  // Authored tiers (e.g. serving_2 / serving_4) are used verbatim. Any other
  // serving count is generated on the fly by scaling the recipe's native tier,
  // which is exactly what scaleQuantity() was written (and tested-by-shape) for.
  // Macros are per single serving and constant, so they never scale.
  var SERVING_MIN = 1, SERVING_MAX = 12;

  function nativeServing(r) {
    return r.native_serving || (r.scaling_options && r.scaling_options[0]) || 2;
  }
  function ingredientsFor(r, serving) {
    var by = r.ingredients_by_serving || {};
    var authored = by["serving_" + serving];
    if (authored) return authored;                 // hand-rounded tier — use as-is
    var base = nativeServing(r);
    var baseList = by["serving_" + base] || by[Object.keys(by)[0]] || [];
    var factor = serving / base;
    return baseList.map(function (ing) {
      return {
        item: ing.item,
        prep: ing.prep,
        quantity: scaleQuantity(ing.quantity, factor),
        unit: ing.unit,
        category: ing.category
      };
    });
  }
  function macrosFor(r, serving) {
    var mp = r.macro_profiles || {};
    return mp["serving_" + serving] || mp["serving_" + nativeServing(r)] || {};
  }

  /* ── Estimated serving weight (grams) ─────────────────────────────────
     There's no authored gram weight anywhere in recipes-data.js, so this is
     computed live from each ingredient's quantity/unit/category — a best-
     effort estimate for people weighing food, not a lab-verified figure.
     Priority per ingredient: an explicit weight already written into the
     item/unit text (e.g. "Salmon fillets (about 8 oz each)", "(14-oz) can")
     beats the generic unit table, which beats a per-category default for
     bare counts (e.g. "2" jalapeños, unit ""). Non-numeric quantities
     ("to taste", "a little") contribute 0 g rather than guessing. */
  var UNIT_GRAMS = {
    g: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000,
    oz: 28.3, lb: 453.6, lbs: 453.6,
    cup: 224, cups: 224, tbsp: 14.2, tablespoon: 14.2, tsp: 4.9, teaspoon: 4.9,
    pinch: 0.4, pinches: 0.4, "big pinch": 0.8, "big pinches": 0.8, splash: 15,
    clove: 3, cloves: 3, slice: 25, slices: 25, stick: 113, sticks: 113,
    scoop: 30, scoops: 30, packet: 7, sachet: 28, can: 425, cans: 425,
    bunch: 30, bunches: 30, "small bunch": 20, "small bunches": 20,
    stalk: 40, stalks: 40, head: 500, heads: 500,
    "small head": 350, "small heads": 350, "medium head": 500,
    lemon: 100, lemons: 100, orange: 150, oranges: 150,
    wedge: 30, wedges: 30, whole: 90, section: 30, container: 200,
    handful: 20, handfuls: 20, leaf: 2, leaves: 2,
    pack: 85, packs: 85, package: 150, packages: 150,
    block: 225, box: 150, bag: 300, bags: 300, pint: 480,
    small: 90, medium: 150, large: 200
  };
  var CATEGORY_DEFAULT_G = { Meat: 140, Dairy: 50, Produce: 80, Pantry: 5 };
  var WEIGHT_ANNOTATION_RE = /([\d.]+)\s*-?\s*(oz|lb|lbs|kg|g|ml)\b/i;
  // Bare counts (blank unit) default to a per-category "whole piece" weight,
  // which is wrong for small counted items like pepperoni slices or olives —
  // these override the category default when the ingredient name matches.
  var ITEM_KEYWORD_GRAMS = [
    [/pepperoni/i, 2], [/\bclove/i, 3], [/\bolive(?!.*\boil\b)/i, 4],
    [/cracker/i, 7], [/pizzelle/i, 6]
  ];

  function gramsPerUnit(ing) {
    var annotated = (ing.item + " " + ing.unit).match(WEIGHT_ANNOTATION_RE);
    if (annotated) {
      var n = parseFloat(annotated[1]);
      return n * (UNIT_GRAMS[annotated[2].toLowerCase()] || 1);
    }
    var unit = (ing.unit || "").trim().toLowerCase();
    if (UNIT_GRAMS[unit] != null) return UNIT_GRAMS[unit];
    if (unit.charAt(unit.length - 1) === "s" && UNIT_GRAMS[unit.slice(0, -1)] != null) {
      return UNIT_GRAMS[unit.slice(0, -1)];
    }
    for (var i = 0; i < ITEM_KEYWORD_GRAMS.length; i++) {
      if (ITEM_KEYWORD_GRAMS[i][0].test(ing.item)) return ITEM_KEYWORD_GRAMS[i][1];
    }
    return CATEGORY_DEFAULT_G[ing.category] || 0;
  }
  function estimateServingWeightG(r, serving) {
    var list = ingredientsFor(r, serving);
    if (!list || !list.length) return null;
    var total = 0;
    list.forEach(function (ing) {
      var qty = parseQtyNumber(ing.quantity);
      if (qty == null) return; // "to taste" etc. — negligible, skip
      total += qty * gramsPerUnit(ing);
    });
    if (!total) return null;
    var perServing = total / serving;
    return Math.max(5, Math.round(perServing / 5) * 5);
  }

  /* ── Header (title, tags, times, servings stepper) ────────────────── */
  function renderHeader(r) {
    var h = $("#header");
    h.innerHTML = "";

    // Back link + favorite toggle row.
    var nav = el("div", "r-nav");
    var back = el("a", "r-back", "‹ Back");
    back.href = document.referrer && /collection\.html|index\.html/.test(document.referrer)
      ? "javascript:history.back()" : "index.html#recipes";
    nav.appendChild(back);
    // Labeled pill so the save control is obvious (not just a bare icon).
    function favLabel(on) {
      return (on ? "❤" : "♡") +
        ' <span class="r-fav-text">' + (on ? "Saved" : "Save") + "</span>";
    }
    var heart = el("button", "fav-toggle r-fav" + (isFav(r.recipe_id) ? " on" : ""),
      favLabel(isFav(r.recipe_id)));
    heart.type = "button";
    heart.setAttribute("aria-label", "Toggle favorite");
    heart.addEventListener("click", function () {
      var on = toggleFav(r.recipe_id);
      heart.classList.toggle("on", on);
      heart.innerHTML = favLabel(on);
      pop(heart);
    });

    // One-tap plan-add, right beside the heart — previously the only way onto
    // This Week's plan was leaving the recipe, going Home, and re-searching
    // for it by name in the planner's picker.
    var planBtn = el("button", "plan-toggle r-plan", "+ Week");
    planBtn.type = "button";
    planBtn.setAttribute("aria-label", "Add to This Week");
    var planBtnTimer = null;
    planBtn.addEventListener("click", function () {
      addToPlan(r, state.serving);
      planBtn.classList.add("added");
      planBtn.textContent = "Added";
      pop(planBtn);
      toast("Added to This Week — open the Planner to schedule it");
      clearTimeout(planBtnTimer);
      planBtnTimer = setTimeout(function () {
        planBtn.classList.remove("added");
        planBtn.textContent = "+ Week";
      }, 1800);
    });

    var actions = el("div", "r-nav-actions");
    actions.appendChild(heart);
    actions.appendChild(planBtn);
    nav.appendChild(actions);
    h.appendChild(nav);

    var eyebrow = el("div", "r-eyebrow");
    var tags = el("div", "r-eyebrow-tags");
    if (r.dish_category) tags.appendChild(el("span", "r-tag", esc(r.dish_category)));
    if (r.category) tags.appendChild(el("span", "r-tag sage", esc(r.category)));
    eyebrow.appendChild(tags);
    eyebrow.appendChild(renderPhotoWidget(r));
    h.appendChild(eyebrow);

    h.appendChild(el("h1", "r-title", esc(r.title)));

    var meta = el("div", "r-meta");
    meta.innerHTML =
      "<span>Prep <b>" + r.prep_time_mins + " min</b></span>" +
      "<span>Cook <b>" + r.cook_time_mins + " min</b></span>" +
      "<span>Total <b>" + (r.prep_time_mins + r.cook_time_mins) + " min</b></span>";
    h.appendChild(meta);

    // Serving-size stepper — any count from SERVING_MIN..SERVING_MAX. Authored
    // tiers are exact; in-between counts are scaled live from the native tier.
    function changeServing(n) {
      n = Math.max(SERVING_MIN, Math.min(SERVING_MAX, n));
      if (n === state.serving) return;
      var prevServing = state.serving;
      // Check-off state is kept per serving count, so a cook mid-checklist who
      // bumps the count lands on a checklist that looks wiped (it isn't — the
      // old count's progress is still there if they switch back). Flag it so
      // that doesn't read as silent data loss.
      var hadProgress = loadSet(r.recipe_id, prevServing, "grocery").size > 0 ||
        loadSet(r.recipe_id, prevServing, "steps").size > 0;
      var newIsFresh = loadSet(r.recipe_id, n, "grocery").size === 0 &&
        loadSet(r.recipe_id, n, "steps").size === 0;
      state.serving = n;
      renderHeader(r);          // refresh count + disabled states + note
      renderMacros(r);
      renderGrocery(r);
      renderRecipe(r);
      if (hadProgress && newIsFresh) {
        toast("Checklist reset for " + n + " serving" + (n === 1 ? "" : "s"));
      }
    }

    var ladder = el("div", "servings serving-stepper");

    var minus = el("button", "serving-step", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "Fewer servings");
    minus.disabled = state.serving <= SERVING_MIN;
    minus.addEventListener("click", function () { changeServing(state.serving - 1); });

    var count = el("div", "serving-count",
      '<span class="serving-num">' + state.serving + "</span>" +
      '<span class="serving-word">Serving' + (state.serving === 1 ? "" : "s") + "</span>");

    var plus = el("button", "serving-step", "+");
    plus.type = "button";
    plus.setAttribute("aria-label", "More servings");
    plus.disabled = state.serving >= SERVING_MAX;
    plus.addEventListener("click", function () { changeServing(state.serving + 1); });

    ladder.appendChild(minus);
    ladder.appendChild(count);
    ladder.appendChild(plus);
    h.appendChild(ladder);

    // Transparency: say whether the amounts are exact or scaled.
    var authored = (r.ingredients_by_serving || {})["serving_" + state.serving];
    h.appendChild(el("p", "serving-note",
      authored ? "Exact amounts from the recipe"
               : "Scaled live from " + nativeServing(r) + " servings"));
  }

  /* ── Tab 1: Overview & Macros ─────────────────────────────────────── */
  function renderMacros(r) {
    var pane = $("#pane-overview");
    pane.innerHTML = "";

    var about = el("div", "card");
    about.appendChild(el("p", "card-label", "About"));
    about.appendChild(el("p", "desc", esc(r.description)));
    if (r.tags && r.tags.length) {
      var tw = el("div", "culinary-tags");
      r.tags.forEach(function (t) { tw.appendChild(el("span", "culinary-tag", esc(t))); });
      about.appendChild(tw);
    }
    pane.appendChild(about);

    pane.appendChild(cookLogCard(r));

    // macro_profiles are stored PER SINGLE SERVING and are identical across
    // both tiers — the book's printed macros describe one portion, and the
    // serving size only changes how much the recipe makes, not the macros.
    // User-authored recipes are macro-free, so omit the card entirely when
    // there's nothing to show rather than rendering a grid of em-dashes.
    var m = macrosFor(r, state.serving);
    var hasMacros = ["calories", "protein_g", "fat_g", "carbs_g"].some(function (k) {
      return m[k] != null;
    });
    if (!hasMacros) return;
    var card = el("div", "card");
    card.appendChild(el("p", "card-label", "Macro Profile · Per Serving"));
    var grid = el("div", "macro-grid");
    grid.appendChild(macroCell("cals", m.calories, "kcal", "Calories"));
    grid.appendChild(macroCell("", m.protein_g, "g", "Protein"));
    grid.appendChild(macroCell("", m.fat_g, "g", "Fat"));
    grid.appendChild(macroCell("", m.carbs_g, "g", "Carbs"));
    card.appendChild(grid);
    var weightG = estimateServingWeightG(r, state.serving);
    if (weightG != null) {
      card.appendChild(el("p", "macro-weight",
        "≈ " + weightG + " g per serving <span class=\"macro-weight-note\">(estimated from ingredients — for weighing food)</span>"));
    }
    card.appendChild(el("p", "macro-foot",
      "Per single serving. The serving size changes how much the recipe makes, not the macros."));
    pane.appendChild(card);
  }
  /* ── Cook log card (Overview tab): "Cooked it" + dated history + photos ─ */
  function cookLogCard(r) {
    var card = el("div", "card cook-log");
    card.appendChild(el("p", "card-label", "Cook Log"));

    var entries = cookedEntries(r.recipe_id);
    if (entries.length) {
      var last = entries[entries.length - 1];
      card.appendChild(el("p", "cook-log-last",
        "Last cooked " + esc(relTime(last.at)) + " · " +
        entries.length + (entries.length === 1 ? " time" : " times")));
    } else {
      card.appendChild(el("p", "cook-log-empty",
        "Tap below the first time you make this — build a little history (and snap a photo)."));
    }

    var btn = el("button", "cook-log-btn", "🍳 Cooked it");
    btn.type = "button";
    btn.addEventListener("click", function () {
      logCooked(r.recipe_id);
      renderMacros(r);
    });
    card.appendChild(btn);

    if (entries.length) {
      var hist = el("div", "cook-hist");
      // Most recent first; cap the rendered list so long histories stay tidy.
      entries.slice().reverse().slice(0, 8).forEach(function (e) {
        hist.appendChild(cookEntryRow(r, e));
      });
      card.appendChild(hist);

      if (photoCount() >= MAX_PHOTOS) {
        card.appendChild(el("p", "cook-log-note",
          "Keeping your " + MAX_PHOTOS + " most recent photos to save space."));
      }
    }
    return card;
  }

  function cookEntryRow(r, e) {
    var row = el("div", "cook-entry");

    if (e.photo) {
      var img = el("img", "cook-entry-photo");
      img.src = e.photo;
      img.alt = "Photo from " + fmtDate(e.at);
      img.addEventListener("click", function () { openPhotoView(e.photo); });
      row.appendChild(img);
    } else {
      var add = el("button", "cook-entry-add", "📷");
      add.type = "button";
      add.setAttribute("aria-label", "Add a photo to this entry");
      add.addEventListener("click", function () { pickPhoto(r, e.at); });
      row.appendChild(add);
    }

    var meta = el("div", "cook-entry-meta");
    meta.appendChild(el("span", "cook-entry-date", esc(fmtDate(e.at))));
    meta.appendChild(el("span", "cook-entry-rel", esc(relTime(e.at))));
    row.appendChild(meta);

    var del = el("button", "cook-entry-del", "✕");
    del.type = "button";
    del.setAttribute("aria-label", "Remove this entry");
    del.addEventListener("click", function () {
      if (window.confirm("Remove this cooked entry" + (e.photo ? " and its photo?" : "?"))) {
        removeCooked(r.recipe_id, e.at);
        renderMacros(r);
      }
    });
    row.appendChild(del);
    return row;
  }

  function macroCell(extra, num, unit, key) {
    var c = el("div", "macro" + (extra ? " " + extra : ""));
    c.innerHTML =
      '<div class="macro-num">' + (num != null ? num : "—") + "</div>" +
      '<div class="macro-unit">' + unit + "</div>" +
      '<div class="macro-key">' + key + "</div>";
    return c;
  }

  /* ── Tab 2: Grocery — a pure shopping list ────────────────────────── */
  // Shows only what you BUY (quantity + item), grouped by aisle. Prep details
  // (e.g. "cooked and chopped") deliberately live on the Recipe tab, not here.
  var CAT_ORDER = ["Meat", "Dairy", "Produce", "Pantry"];
  function renderGrocery(r) {
    var pane = $("#pane-grocery");
    pane.innerHTML = "";

    var list = ingredientsFor(r, state.serving);
    var done = loadSet(r.recipe_id, state.serving, "grocery");

    // Group by category, preserving CAT_ORDER then any extras.
    var groups = {};
    list.forEach(function (ing, i) {
      (groups[ing.category] = groups[ing.category] || []).push({ ing: ing, idx: i });
    });
    var cats = CAT_ORDER.filter(function (c) { return groups[c]; })
      .concat(Object.keys(groups).filter(function (c) { return CAT_ORDER.indexOf(c) < 0; }));

    var card = el("div", "card grocery-card");
    card.appendChild(el("p", "card-label",
      "Shopping list · " + list.length + " items · " + state.serving + " servings"));

    cats.forEach(function (cat) {
      var sec = el("div", "grocery-cat");
      sec.appendChild(el("div", "grocery-cat-head",
        '<span class="dot"></span>' + esc(cat) +
        '<span class="grocery-cat-count">' + groups[cat].length + "</span>"));
      groups[cat].forEach(function (entry) {
        sec.appendChild(groceryRow(r, entry.ing, entry.idx, done));
      });
      card.appendChild(sec);
    });
    pane.appendChild(card);
  }
  // Auto-collapse: a checked row drops to the bottom of its own category
  // section, leaving the still-need-to-buy rows together at the top.
  // Un-checking reinserts it just above the first still-checked row rather
  // than restoring its exact original position.
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
  function groceryRow(r, ing, idx, done) {
    var isDone = done.has(idx);
    var row = el("div", "check-row grocery-row" + (isDone ? " done" : ""));
    // Phase 3 (§3.1): the grocery tab is a pure shopping list — you buy standard
    // package sizes, not "8 oz of bacon". Exact quantities live in the Recipe
    // tab's mise en place; here we show only the item to buy.
    row.innerHTML =
      '<span class="check-box">' + CHECK_SVG + "</span>" +
      '<span class="check-text">' + esc(ing.item) + "</span>";
    row.addEventListener("click", function () {
      var set = loadSet(r.recipe_id, state.serving, "grocery");
      var nowDone = !set.has(idx);
      if (nowDone) set.add(idx); else set.delete(idx);
      row.classList.toggle("done", nowDone);
      saveSet(r.recipe_id, state.serving, "grocery", set);
      collapseGroceryRow(row, nowDone);
    });
    return row;
  }

  /* ── Tab 3: Recipe — mise en place (ingredients + prep) then method ── */
  function renderRecipe(r) {
    var pane = $("#pane-recipe");
    pane.innerHTML = "";

    var list = ingredientsFor(r, state.serving);
    var miseDone = loadSet(r.recipe_id, state.serving, "mise");
    var stepDone = loadSet(r.recipe_id, state.serving, "steps");
    var steps = r.instructions || [];

    // Mise en place: full ingredient line WITH prep detail.
    var ing = el("div", "card");
    ing.appendChild(el("p", "card-label",
      "Ingredients · " + state.serving + " servings"));
    list.forEach(function (it, i) {
      ing.appendChild(miseRow(r, it, i, miseDone));
    });
    pane.appendChild(ing);

    // Method: the numbered, checkable stepper.
    var method = el("div", "card");
    method.appendChild(el("p", "card-label", "Method"));
    var wakeInd = el("div", "wake-indicator", '<span class="wake-dot"></span>Screen staying on while you cook');
    wakeInd.id = "wake-indicator";
    wakeInd.setAttribute("aria-hidden", "true");
    method.appendChild(wakeInd);
    method.appendChild(el("p", "step-progress",
      stepDone.size + " of " + steps.length + " steps complete"));
    if (steps.length) {
      var startBtn = el("button", "cook-start", "▸ Start Cooking");
      startBtn.type = "button";
      startBtn.addEventListener("click", function () { enterCook(r); });
      method.appendChild(startBtn);
    }
    var wrap = el("div", "steps");
    steps.forEach(function (st) { wrap.appendChild(stepRow(r, st, stepDone)); });
    method.appendChild(wrap);
    pane.appendChild(method);
  }
  function miseRow(r, ing, idx, done) {
    var isDone = done.has(idx);
    var row = el("div", "check-row" + (isDone ? " done" : ""));
    var qty = [ing.quantity, ing.unit].filter(Boolean).join(" ");
    var label =
      (qty ? '<span class="check-qty">' + esc(qty) + "</span> " : "") +
      esc(ing.item) +
      (ing.prep ? '<span class="check-prep">, ' + esc(ing.prep) + "</span>" : "");
    row.innerHTML =
      '<span class="check-box">' + CHECK_SVG + "</span>" +
      '<span class="check-text">' + label + "</span>";
    row.addEventListener("click", function () {
      var set = loadSet(r.recipe_id, state.serving, "mise");
      if (set.has(idx)) { set.delete(idx); row.classList.remove("done"); }
      else { set.add(idx); row.classList.add("done"); }
      saveSet(r.recipe_id, state.serving, "mise", set);
    });
    return row;
  }
  function stepRow(r, st, done) {
    var isDone = done.has(st.step_number);
    var row = el("div", "step" + (isDone ? " done" : ""));
    row.innerHTML =
      '<div class="step-rail">' +
        '<div class="step-num">' + st.step_number + "</div>" +
        '<div class="step-line"></div>' +
      "</div>" +
      '<div class="step-body">' +
        '<p class="step-title">' + esc(st.title) + "</p>" +
        '<p class="step-detail">' + esc(st.detail) + "</p>" +
      "</div>";
    appendTimers(row.querySelector(".step-body"), st.detail);
    row.addEventListener("click", function () {
      var set = loadSet(r.recipe_id, state.serving, "steps");
      if (set.has(st.step_number)) { set.delete(st.step_number); }
      else { set.add(st.step_number); }
      saveSet(r.recipe_id, state.serving, "steps", set);
      renderRecipe(r); // refresh progress count + completed marks
    });
    return row;
  }

  /* ── Screen Wake Lock — keep the screen awake on the Method tab ─────── */
  // Greasy hands shouldn't have to wake a sleeping screen mid-cook. We hold a
  // wake lock only while the Recipe (Method) tab is active, release it on every
  // other tab, and re-acquire when the user returns to the tab (browsers drop
  // the lock whenever the page is hidden). Silently no-op where unsupported.
  var wake = (function () {
    var supported = "wakeLock" in navigator;
    var sentinel = null;
    var want = false; // whether we currently want the lock held

    function indicator(on) {
      var ind = $("#wake-indicator");
      if (!ind) return;
      ind.classList.toggle("on", !!on);
      ind.setAttribute("aria-hidden", on ? "false" : "true");
    }
    function acquire() {
      if (!supported || sentinel) return;
      navigator.wakeLock.request("screen").then(function (s) {
        sentinel = s;
        indicator(true);
        s.addEventListener("release", function () {
          sentinel = null;
          indicator(false);
        });
      }).catch(function () { indicator(false); }); // denied / low battery → no-op
    }
    function release() {
      indicator(false);
      if (sentinel) { sentinel.release().catch(function () {}); sentinel = null; }
    }
    function set(on) {
      want = !!on;
      if (want) acquire(); else release();
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && want) acquire();
    });
    return { set: set };
  })();

  /* ── Cooking Mode (full-screen, one big step at a time) ────────────── */
  // The sanctioned exception to the persistent bottom bar: a distraction-free
  // stepper for hands-busy cooking. Wake lock is on; the bar is hidden; type is
  // large and user-scalable (persisted). Step done-state is the SAME store as
  // the checklist, so progress stays in sync when you exit.
  var COOK_FONT_KEY = "mc-cookbook:cookfont";
  var cook = { active: false, index: 0, recipe: null, _lastAnnounced: -1 };

  // Screen-reader announcer for Cooking Mode — lives on <body>, outside the
  // #cook overlay renderCook() rebuilds, so announcements survive re-renders.
  // Polite: step changes and done-toggles only.
  function cookAnnounce(msg) {
    var n = document.getElementById("cookLive");
    if (!n) {
      n = document.createElement("div");
      n.id = "cookLive";
      n.setAttribute("role", "status");
      n.setAttribute("aria-live", "polite");
      n.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";
      document.body.appendChild(n);
    }
    n.textContent = "";
    n.textContent = msg;
  }

  function cookFont() {
    var v = parseFloat(localStorage.getItem(COOK_FONT_KEY));
    return isNaN(v) ? 1 : Math.max(0.8, Math.min(1.6, v));
  }
  function setCookFont(v) {
    v = Math.max(0.8, Math.min(1.6, Math.round(v * 10) / 10));
    try { localStorage.setItem(COOK_FONT_KEY, String(v)); } catch (e) {}
    var o = $("#cook");
    if (o) o.style.setProperty("--cook-font", v);
    return v;
  }
  function stepsDone(r) { return loadSet(r.recipe_id, state.serving, "steps"); }
  function markStep(r, num, on) {
    var set = stepsDone(r);
    if (on) set.add(num); else set.delete(num);
    saveSet(r.recipe_id, state.serving, "steps", set);
  }

  /* ── Cooking Mode voice control (roadmap 4.4) ──────────────────────────
     Opt-in, scoped to Cooking Mode only: off by default, mic button lives in
     the .cook-top bar, and recognition stops the moment Cooking Mode exits —
     no reason to keep a mic open once you've left. Small fixed grammar, not
     free-form parsing: "next step", "previous step", "read ingredients"
     (spoken aloud via SpeechSynthesis so a cook with messy hands never has to
     touch the screen), "exit"/"stop cooking". Commands call the SAME
     cookGo()/exitCook() the on-screen buttons use — no duplicated logic. */
  var cookVoiceSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var cookRecognition = null;
  var cookListening = false;

  function cookVoiceSupported() { return !!cookVoiceSR; }

  function speakIngredients() {
    if (!("speechSynthesis" in window)) return;
    var r = cook.recipe;
    var list = ingredientsFor(r, state.serving) || [];
    if (!list.length) { window.speechSynthesis.speak(new SpeechSynthesisUtterance("No ingredients listed for this recipe.")); return; }
    var text = "You'll need: " + list.map(function (ing) {
      var qty = ing.quantity ? ing.quantity + " " : "";
      var unit = ing.unit ? ing.unit + " " : "";
      return qty + unit + ing.item;
    }).join(", ") + ".";
    window.speechSynthesis.cancel(); // don't stack utterances if tapped/said twice
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    cookAnnounce("Reading ingredients");
  }

  var COOK_VOICE_COMMANDS = [
    { re: /\b(next|done)( step)?\b/i, run: function () { cookGo(1); } },
    { re: /\b(previous|prev|back|go back)( step)?\b/i, run: function () { cookGo(-1); } },
    { re: /\bread( the)? ingredients?\b/i, run: function () { speakIngredients(); } },
    { re: /\b(exit|stop cooking|done cooking|finish cooking)\b/i, run: function () { exitCook(); } }
  ];
  function handleCookTranscript(text) {
    text = (text || "").trim();
    if (!text) return;
    for (var i = 0; i < COOK_VOICE_COMMANDS.length; i++) {
      var m = text.match(COOK_VOICE_COMMANDS[i].re);
      if (m) { COOK_VOICE_COMMANDS[i].run(m); return; }
    }
  }

  function setCookListening(on) {
    cookListening = on;
    var btn = document.getElementById("cookVoiceBtn");
    if (btn) btn.classList.toggle("listening", on);
  }
  function startCookVoice() {
    if (!cookVoiceSupported()) return;
    if (!cookRecognition) {
      cookRecognition = new cookVoiceSR();
      cookRecognition.continuous = true;
      cookRecognition.interimResults = false;
      cookRecognition.lang = "en-US";
      cookRecognition.onresult = function (ev) {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) handleCookTranscript(ev.results[i][0].transcript);
        }
      };
      cookRecognition.onerror = function (ev) {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          setCookListening(false);
          cookAnnounce("Microphone permission denied");
        }
      };
      cookRecognition.onend = function () {
        if (cookListening && cook.active) { try { cookRecognition.start(); } catch (e) {} } // mobile drops continuous mode; resume
        else setCookListening(false);
      };
    }
    try { cookRecognition.start(); setCookListening(true); cookAnnounce("Voice control on"); } catch (e) {}
  }
  function stopCookVoice() {
    setCookListening(false);
    if (cookRecognition) { try { cookRecognition.stop(); } catch (e) {} }
  }
  function toggleCookVoice() {
    if (cookListening) stopCookVoice(); else startCookVoice();
  }
  function mountCookVoiceBtn(top) {
    if (!cookVoiceSupported()) return;
    var btn = el("button", "cook-voice-btn" + (cookListening ? " listening" : ""), "🎙️");
    btn.id = "cookVoiceBtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle voice control");
    btn.title = 'Voice control — try "next step", "read ingredients", "exit"';
    btn.addEventListener("click", toggleCookVoice);
    top.appendChild(btn);
  }

  function enterCook(r) {
    var steps = r.instructions || [];
    if (!steps.length) return;
    cook.active = true; cook.recipe = r;
    // Resume at the first not-yet-done step.
    var done = stepsDone(r), start = 0;
    for (var i = 0; i < steps.length; i++) {
      if (!done.has(steps[i].step_number)) { start = i; break; }
    }
    cook.index = start;
    cook._lastAnnounced = -1;
    document.body.classList.add("cooking");
    wake.set(true);
    renderCook();
  }
  function exitCook() {
    cook.active = false;
    stopCookVoice(); // no reason to keep the mic open once Cooking Mode is closed
    document.body.classList.remove("cooking");
    var o = $("#cook");
    if (o) o.parentNode.removeChild(o);
    wake.set(state.tab === "recipe");
    if (cook.recipe) renderRecipe(cook.recipe); // refresh checklist marks + count
  }
  function cookGo(delta) {
    var steps = cook.recipe.instructions || [];
    var n = cook.index + delta;
    if (n < 0) return;
    if (n >= steps.length) { exitCook(); return; } // past the last step → finish
    cook.index = n;
    renderCook();
  }

  function renderCook() {
    var r = cook.recipe, steps = r.instructions || [];
    var st = steps[cook.index];
    var isDone = stepsDone(r).has(st.step_number);
    var last = cook.index === steps.length - 1;

    var o = $("#cook");
    if (!o) {
      o = el("div", "cook");
      o.id = "cook";
      o.style.setProperty("--cook-font", cookFont());
      $("main.app").appendChild(o);
      wireCookSwipe(o);
    }
    o.innerHTML = "";

    // Top: exit · counter · font scale
    var top = el("div", "cook-top");
    var exit = el("button", "cook-exit", "✕ Exit");
    exit.type = "button";
    exit.addEventListener("click", exitCook);
    top.appendChild(exit);
    top.appendChild(el("div", "cook-count", "Step " + (cook.index + 1) + " of " + steps.length));
    var fonts = el("div", "cook-fonts");
    var aMinus = el("button", "cook-font-btn", "A−");
    aMinus.type = "button"; aMinus.setAttribute("aria-label", "Smaller text");
    aMinus.addEventListener("click", function () { setCookFont(cookFont() - 0.1); });
    var aPlus = el("button", "cook-font-btn", "A+");
    aPlus.type = "button"; aPlus.setAttribute("aria-label", "Larger text");
    aPlus.addEventListener("click", function () { setCookFont(cookFont() + 0.1); });
    fonts.appendChild(aMinus); fonts.appendChild(aPlus);
    top.appendChild(fonts);
    mountCookVoiceBtn(top);
    o.appendChild(top);

    // Progress
    var prog = el("div", "cook-progress");
    var bar = el("div", "cook-progress-bar");
    bar.style.width = ((cook.index + 1) / steps.length * 100) + "%";
    prog.appendChild(bar);
    o.appendChild(prog);

    // Body — the big step (tap to toggle done, like the checklist)
    var body = el("div", "cook-body" + (isDone ? " done" : ""));
    body.appendChild(el("div", "cook-step-num", isDone ? "✓" : String(st.step_number)));
    body.appendChild(el("h2", "cook-step-title", esc(st.title)));
    body.appendChild(el("p", "cook-step-detail", esc(st.detail)));
    appendTimers(body, st.detail);
    body.appendChild(el("p", "cook-tap-hint", isDone ? "Done · tap to undo" : "Tap to mark this step done"));
    body.addEventListener("click", function () {
      markStep(r, st.step_number, !stepsDone(r).has(st.step_number));
      renderCook();
    });
    o.appendChild(body);

    // Controls — prev · primary (done & next / finish)
    var ctl = el("div", "cook-controls");
    var prev = el("button", "cook-nav", "‹ Prev");
    prev.type = "button"; prev.disabled = cook.index === 0;
    prev.addEventListener("click", function () { cookGo(-1); });
    var next = el("button", "cook-nav primary", last ? "Finish ✓" : "Done & Next ›");
    next.type = "button";
    next.addEventListener("click", function () {
      markStep(r, st.step_number, true); // advancing completes the current step
      cookGo(1);
    });
    ctl.appendChild(prev);
    ctl.appendChild(next);
    o.appendChild(ctl);

    // Announce the step on navigation; on a same-step re-render (done toggle)
    // announce the state change instead of repeating the whole step.
    if (cook._lastAnnounced !== cook.index) {
      cook._lastAnnounced = cook.index;
      cookAnnounce("Step " + (cook.index + 1) + " of " + steps.length + ": " + st.title);
    } else {
      cookAnnounce(isDone ? "Step marked done" : "Step unmarked");
    }
  }

  // Horizontal swipe inside cooking mode: left → next, right → prev (no marking).
  function wireCookSwipe(o) {
    var x0 = null, y0 = null;
    o.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    o.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        if (dx < 0) cookGo(1); else cookGo(-1);
      }
      x0 = y0 = null;
    }, { passive: true });
  }

  /* ── Sub-tab switching (+ swipe) ──────────────────────────────────── */
  var TABS = ["overview", "grocery", "recipe"];
  function setTab(name) {
    state.tab = name;
    TABS.forEach(function (t) {
      $("#tab-" + t).classList.toggle("active", t === name);
      $("#pane-" + t).classList.toggle("active", t === name);
    });
    wake.set(name === "recipe"); // hold the screen awake only while cooking
  }
  function wireTabs() {
    TABS.forEach(function (t) {
      $("#tab-" + t).addEventListener("click", function () { setTab(t); });
    });
    // Horizontal swipe across the panes (spec §1.2: swipeable sub-tabs).
    var panes = $("#panes"), x0 = null, y0 = null;
    panes.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    panes.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        var i = TABS.indexOf(state.tab);
        if (dx < 0 && i < TABS.length - 1) setTab(TABS[i + 1]);
        if (dx > 0 && i > 0) setTab(TABS[i - 1]);
      }
      x0 = y0 = null;
    }, { passive: true });
  }

  /* ── Boot ─────────────────────────────────────────────────────────── */
  function init() {
    var r = pickRecipe();
    if (!r) {
      $("#header").innerHTML =
        '<h1 class="r-title">No recipe found</h1>' +
        '<p class="r-meta">Check recipes-data.js.</p>';
      return;
    }
    state.recipe = r;
    state.serving = (r.scaling_options && r.scaling_options[0]) || 2;
    if (r.accent) {
      // Deliberately a global override, not a scoped custom property —
      // recipe.html only ever themes ONE recipe per page load, so overriding
      // --accent's :root default at the document level is the correct tool
      // here (58 rules across cookbook.css already cascade from it). This
      // differs from cookbook-home.js's per-card scoped vars (--rc-accent
      // etc.), which exist because Home/Categories/Recipes show many
      // differently-accented cards on one screen at once — a case a single
      // global override can't solve. The two "look" inconsistent but are
      // each the right fit for their own single-item-page vs. multi-card-grid
      // context; unifying them would break one or the other.
      var accentHex = clampAccent(r.accent);
      document.documentElement.style.setProperty("--accent", accentHex);
      // derive rgb for translucent fills
      var hex = accentHex.replace("#", "");
      if (hex.length === 6) {
        document.documentElement.style.setProperty("--accent-rgb",
          [0, 2, 4].map(function (i) { return parseInt(hex.substr(i, 2), 16); }).join(","));
      }
    }
    document.title = r.title + " · Mike's Cookbook";

    renderHeader(r);
    renderMacros(r);
    renderGrocery(r);
    renderRecipe(r);
    wireTabs();
    setTab("overview");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  // Expose scaler for future use / testing.
  window.MCCookbook = { scaleQuantity: scaleQuantity };
})();
