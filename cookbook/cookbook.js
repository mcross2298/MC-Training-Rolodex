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
  // Accent clamp lives in mc-cards.js (audit C-07) — it was triplicated across
  // this file, cookbook-home.js and collection.js.
  var clampAccent = MCCards.clampAccent;
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

  /* ── Storage-full warning (audit VOC/VOA wave 7) ──────────────────────
     cookbook-home.js's C-12 fix surfaces a toast when a full quota
     silently swallows a write, but it only wired MCFav.onWriteFail /
     MCTimers.onWriteFail on the shell — this page also toggles favorites
     and, via Cooking Mode, starts the app's flagship kitchen timers.
     Before this, a full quota on recipe.html failed both exactly as
     silently as the C-12 writeup describes on the shell, pre-fix: nothing
     told the cook their heart tap or their timer didn't actually save.
     Same one-shot-per-session shape as warnStorageFull() there. */
  var storageWarned = false;
  function warnStorageFull() {
    if (storageWarned) return;
    storageWarned = true;
    toast("Storage is full — that change didn't save. Remove some cook-log photos to free space.");
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
  // A chip is now a VIEW over mc-timers.js, not an owner of state.
  //
  // It used to hold its own setInterval in a closure bound to this node — and
  // renderCook()/renderRecipe() destroy their whole subtree on every re-render,
  // which silently killed running timers. The store owns the timer now; the
  // chip only starts one and reflects whether one is already running for this
  // step. Audio, vibration and expiry all moved to MCTimers with it, so the
  // alert behaves identically no matter which surface started the countdown.
  function timerChip(seconds, label, r, stepNumber) {
    var chip = el("button", "timer-chip", "⏱ " + label);
    chip.type = "button";

    // Is one of MY timers (this recipe + step + duration) already running?
    function mine() {
      var all = MCTimers.list();
      for (var i = 0; i < all.length; i++) {
        var t = all[i];
        if (t.recipeId === r.recipe_id && t.stepNumber === stepNumber && t.seconds === seconds) return t;
      }
      return null;
    }
    function paint() {
      var t = mine();
      chip.className = "timer-chip" + (t ? (t.ringing ? " ringing" : " running") : "");
      chip.textContent = t
        ? (t.ringing ? "⏰ Time! · tap to clear" : "⏱ " + MCTimers.fmtClock(t.remainingMs))
        : "⏱ " + label;
    }

    chip.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();        // never toggle the step itself
      var t = mine();
      if (t) { MCTimers.cancel(t.id); }                // tap a live chip to cancel/clear
      else {
        MCTimers.start({
          seconds: seconds, label: label,
          recipeId: r.recipe_id, recipeTitle: r.title, stepNumber: stepNumber
        });
      }
      paint();
    });

    // Repaint on every store change, and drop the subscription when this chip
    // leaves the document — re-renders create new chips, and without this the
    // old ones would accumulate as live subscribers.
    var off = MCTimers.onChange(function () {
      if (!chip.isConnected) { off(); return; }
      paint();
    });

    paint();
    return chip;
  }
  function appendTimers(parent, text, r, stepNumber) {
    var times = parseDurations(text);
    if (!times.length) return;
    var wrap = el("div", "timer-wrap");
    times.forEach(function (t) { wrap.appendChild(timerChip(t.seconds, t.label, r, stepNumber)); });
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
  // The favorites store itself is mc-fav.js (audit C-07).
  function loadFavs() { return MCFav.load(); }
  function isFav(id) { return MCFav.has(id); }
  function toggleFav(id) { return MCFav.toggle(id); }

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
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(p));
      return true;
    } catch (e) {
      // A full quota used to fail here with no sign anything went wrong: the
      // button still flipped to "Added" and the toast still said so, while
      // the plan itself never changed (audit C-12's fix never reached this
      // write path). The caller checks this return value now.
      warnStorageFull();
      return false;
    }
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
    } catch (e) {
      // A full quota here used to silently drop a check-off — a cook could
      // tick off ten ingredients mid-shop, hit quota, and find them all
      // unchecked again on the next load with no idea why.
      warnStorageFull();
    }
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
    // Silently unrecorded used to mean the streak, Smart Week's repeat-
    // avoidance, and the weekly recap's cooked count all quietly drifted
    // from what the cook actually did, with nothing on screen explaining why.
    if (!saveCooked(map)) warnStorageFull();
  }
  function removeCooked(id, at) {
    var map = loadCooked();
    if (!Array.isArray(map[id])) return;
    map[id] = map[id].map(normalizeEntry).filter(function (e) { return e.at !== at; });
    if (!map[id].length) delete map[id];
    if (!saveCooked(map)) warnStorageFull();
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
    // This may be the most recent cook-log entry with a photo — the exact
    // thing the hero falls back to when there's no explicit cover — so it
    // can change what the hero shows even though the hero has no button here.
    renderHero(r);
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
     pipeline, same mc-cookbook: namespace so it rides along in backups.

     Audit C-12: each photo was already size-bounded by downscaleImage
     (PHOTO_EDGE / PHOTO_QUALITY) and a failed write already alerts — but
     unlike the cook log, which caps at MAX_PHOTOS, there was no ceiling on
     HOW MANY recipes could hold a cover photo. With 318 recipes that's an
     unbounded slice of a 5–10 MB origin quota shared with everything else
     in the mc-cookbook: namespace. MAX_RECIPE_PHOTOS applies the cook log's
     own pattern here: keep the N most recent, drop the oldest.

     "Oldest" is insertion order. These keys are recipe_id slugs (never
     numeric), so JS preserves insertion order for them, re-saving the map
     keeps that order, and overwriting an existing key keeps its original
     position — so the first key really is the least-recently-added. */
  var RECIPE_PHOTOS_KEY  = "mc-cookbook:photos";
  var MAX_RECIPE_PHOTOS  = 24;

  function loadRecipePhotos() {
    try {
      var o = JSON.parse(localStorage.getItem(RECIPE_PHOTOS_KEY) || "{}");
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  // Drop oldest-first until the map is within budget. Returns how many went.
  function enforceRecipePhotoCap(map, keepId) {
    var keys = Object.keys(map), dropped = 0;
    for (var i = 0; i < keys.length && Object.keys(map).length > MAX_RECIPE_PHOTOS; i++) {
      if (keys[i] === keepId) continue;       // never evict the one just added
      delete map[keys[i]];
      dropped++;
    }
    return dropped;
  }
  function saveRecipePhotos(map) {
    try { localStorage.setItem(RECIPE_PHOTOS_KEY, JSON.stringify(map)); return true; }
    catch (e) { return false; }      // QuotaExceededError → caller alerts
  }
  function loadRecipePhoto(id) { return loadRecipePhotos()[id] || null; }

  function attachRecipePhoto(r, dataUrl) {
    var map = loadRecipePhotos();
    map[r.recipe_id] = dataUrl;
    var dropped = enforceRecipePhotoCap(map, r.recipe_id);
    if (!saveRecipePhotos(map)) {
      window.alert("Storage is full — couldn’t save the photo. Remove another photo and try again.");
      return;
    }
    if (dropped) {
      toast("Keeping your " + MAX_RECIPE_PHOTOS + " most recent recipe photos to save space.");
    }
    renderHeader(r);
    renderHero(r);
  }
  function removeRecipePhoto(r) {
    var map = loadRecipePhotos();
    delete map[r.recipe_id];
    if (!saveRecipePhotos(map)) warnStorageFull();
    renderHeader(r);
    renderHero(r);
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

  // The small eyebrow control is only the "add a photo" entry point now —
  // once a photo exists (from any source), the hero below owns display, edit
  // and remove, and this returns null so the caller skips it. A recipe with
  // no photo at all sees exactly the widget that was already here.
  function renderPhotoWidget(r) {
    if (MCCards.photoFor(r)) return null;
    var wrap = el("div", "r-photo");
    var add = el("button", "r-photo-add", "📷");
    add.type = "button";
    add.setAttribute("aria-label", "Add a photo");
    add.addEventListener("click", function () { pickRecipePhoto(r); });
    wrap.appendChild(add);
    return wrap;
  }

  /* ── Hero photo (CI initiative 3) ─────────────────────────────────────
     Renders BEFORE the sticky #header, in its own non-sticky #hero block, so
     it scrolls away naturally and the existing sticky title/tags bar takes
     over beneath it — a hero belongs to the top of the page, not permanently
     pinned there eating screen space while a cook scrolls the steps.

     Uses the SAME MCCards.photoFor() chain the cards use (authored → cover
     → cook-log), so recipe.html and every card agree on what "this recipe's
     photo" means. Renders nothing — zero height, zero markup — for the 318
     recipes that have none; this is purely additive.

     Controls depend on where the photo came from: an authored photo
     (`r.photo`, data-file content) is display-only here; a cook-log photo
     gets a "set as cover" affordance (promotes it to an explicit, stable
     cover rather than depending on that cook-log entry surviving the
     MAX_PHOTOS eviction); only an explicit cover gets the full replace +
     remove pair recipe.html has always offered. */
  function renderHero(r) {
    var host = $("#hero");
    if (!host) return;
    host.innerHTML = "";
    var photo = MCCards.photoFor(r);
    if (!photo) { host.className = "r-hero empty"; return; }
    host.className = "r-hero";

    var img = el("img", "r-hero-img");
    img.src = photo.url;
    img.alt = "Photo of " + r.title;
    img.addEventListener("click", function () { openPhotoView(photo.url); });
    host.appendChild(img);

    if (photo.source === "cooklog") {
      var chip = el("span", "r-hero-chip",
        "📸 Your cook" + (photo.at ? " · " + esc(fmtDate(photo.at)) : ""));
      host.appendChild(chip);
    }

    if (photo.source !== "authored") {
      var edit = el("button", "r-photo-btn r-hero-edit",
        photo.source === "cooklog" ? "☆ Set as cover" : "✎ Replace");
      edit.type = "button";
      edit.setAttribute("aria-label", photo.source === "cooklog" ? "Set as cover photo" : "Replace photo");
      edit.addEventListener("click", function (e) { e.stopPropagation(); pickRecipePhoto(r); });
      host.appendChild(edit);
    }
    if (photo.source === "cover") {
      var rm = el("button", "r-photo-btn r-hero-remove", "✕");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove cover photo");
      rm.addEventListener("click", function (e) {
        e.stopPropagation();
        if (window.confirm("Remove this cover photo?")) removeRecipePhoto(r);
      });
      host.appendChild(rm);
    }
  }

  /* ── App state ────────────────────────────────────────────────────── */
  // macroMode/macroTarget/macroSolved — bi-directional scaling (roadmap
  // §2.4). Independent of `serving`/check-off state on purpose: switching
  // into macro-target mode doesn't touch or reset the grocery/step
  // checklists, which stay keyed by the nominal `serving` count exactly as
  // before — only the ingredient AMOUNTS shown (via effectiveServing()
  // below) change while a target is active. macroTarget holds the raw
  // input strings so a half-typed field isn't lost on re-render.
  var state = {
    recipe: null, serving: 2, tab: "overview",
    macroMode: false, macroTarget: {}, macroSolved: null
  };

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
  function hasMacroData(r) {
    var m = macrosFor(r, nativeServing(r));
    return ["calories", "protein_g", "fat_g", "carbs_g"].some(function (k) { return m[k] != null; });
  }
  // Bi-directional scaling (roadmap §2.4). When a macro target is active and
  // solved, ingredient quantities/weight estimates use the solved equivalent
  // serving count instead of the stepper's nominal `serving` — reusing
  // ingredientsFor()'s existing fractional-serving scaling path unchanged
  // (it already falls back to scaling the native tier for any count with no
  // authored tier, integer or not). Falls back to state.serving whenever
  // there's no active/solved target, so this is a pure no-op for every
  // recipe and cook that never touches the macro-target toggle.
  function effectiveServing(r) {
    if (state.macroMode && state.macroSolved && state.macroSolved.scale != null) {
      return state.macroSolved.scale;
    }
    return state.serving;
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
      if (!addToPlan(r, state.serving)) return;   // warnStorageFull() already told the cook why
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
    var photoWidget = renderPhotoWidget(r);
    if (photoWidget) eyebrow.appendChild(photoWidget);
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

    // Bi-directional scaling (roadmap §2.4) — only offered when this recipe
    // actually has macro data to solve against; a macro-free recipe (every
    // user-authored one, by default) just never shows the toggle, and the
    // servings stepper below behaves exactly as it always has.
    if (hasMacroData(r)) h.appendChild(renderScaleModeToggle(r));

    if (!state.macroMode) {
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
    } else {
      h.appendChild(renderScaleTargetPanel(r));
    }
  }

  /* ── Bi-directional macro/ingredient scaling (roadmap §2.4) ─────────── */
  // Re-solves against the current state.macroTarget and re-renders every
  // pane that reads effectiveServing() — mirrors changeServing()'s own
  // "touch every dependent pane" pattern above.
  function macroTargetChanged(r) {
    var t = state.macroTarget;
    var hasAny = t && (t.protein_g || t.calories || t.carbs_g);
    state.macroSolved = hasAny ? MCScale.solveScaleForTarget(r, nativeServing(r), t) : null;
    renderHeader(r);
    renderMacros(r);
    renderGrocery(r);
    renderRecipe(r);
  }
  function renderScaleModeToggle(r) {
    var tabs = el("div", "scale-mode-tabs");
    var srvTab = el("button", "scale-mode-tab" + (!state.macroMode ? " active" : ""), "Servings");
    srvTab.type = "button";
    srvTab.addEventListener("click", function () {
      if (!state.macroMode) return;
      state.macroMode = false;
      renderHeader(r); renderMacros(r); renderGrocery(r); renderRecipe(r);
    });
    var macTab = el("button", "scale-mode-tab" + (state.macroMode ? " active" : ""), "Hit a macro target");
    macTab.type = "button";
    macTab.addEventListener("click", function () {
      if (state.macroMode) return;
      state.macroMode = true;
      renderHeader(r); renderMacros(r); renderGrocery(r); renderRecipe(r);
    });
    tabs.appendChild(srvTab);
    tabs.appendChild(macTab);
    return tabs;
  }
  // Up to three optional target fields; leaving all blank falls straight
  // back to servings-mode behavior (macroTargetChanged() only solves when
  // at least one is filled in) — no separate "cancel" control needed.
  function renderScaleTargetPanel(r) {
    var wrap = el("div", "scale-target-panel");
    var fields = el("div", "scale-target-fields");
    function targetInput(key, ph) {
      var i = el("input", "search-box scale-target-input");
      i.type = "number"; i.min = "0"; i.setAttribute("inputmode", "decimal");
      i.placeholder = ph;
      if (state.macroTarget && state.macroTarget[key] != null) i.value = state.macroTarget[key];
      i.addEventListener("input", function () {
        state.macroTarget = state.macroTarget || {};
        state.macroTarget[key] = i.value;
        macroTargetChanged(r);
      });
      return i;
    }
    fields.appendChild(targetInput("protein_g", "Protein (g)"));
    fields.appendChild(targetInput("calories", "Calories"));
    fields.appendChild(targetInput("carbs_g", "Carbs (g)"));
    wrap.appendChild(fields);

    var solved = state.macroSolved;
    if (solved && solved.scale != null) {
      var m = solved.achieved, parts = [];
      if (m.protein_g != null) parts.push(m.protein_g + "g protein");
      if (m.calories != null) parts.push(m.calories + " kcal");
      if (m.carbs_g != null) parts.push(m.carbs_g + "g carbs");
      var servings = Math.round(solved.scale * 10) / 10;
      var portionText = "≈ " + servings + " serving" + (Math.abs(servings - 1) < 0.05 ? "" : "s") + " of this recipe at this scale";
      var msg = "≈ " + parts.join(" · ") + " — " + portionText;
      if (!solved.exact) {
        msg += ". Closest achievable by scaling — hitting every target exactly isn't possible for this recipe by scaling alone.";
      }
      wrap.appendChild(el("p", "scale-result" + (solved.exact ? "" : " scale-result-approx"), esc(msg)));
    } else if (solved && solved.scale == null) {
      wrap.appendChild(el("p", "scale-result scale-result-approx",
        "This recipe doesn't have " + esc(solved.driver.replace("_g", "").replace("_", " ")) +
        " data to scale against — try a different target, or switch back to Servings."));
    } else {
      wrap.appendChild(el("p", "rf-hint",
        "Enter a target and the ingredient list scales to match — leave everything blank to go back to picking a serving count."));
    }
    return wrap;
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
    var weightG = estimateServingWeightG(r, effectiveServing(r));
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
        if (e.photo) renderHero(r);   // may have been the hero's fallback photo
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
  // Shows only what you BUY (quantity + item), grouped by aisle (mc-units.js
  // — CI initiative 2). This used to group by the raw `category` field
  // (Meat/Dairy/Produce/Pantry) despite this very comment already claiming
  // "aisle" — that four-value enum is a data-integrity field enforced by
  // tools/validate-recipes.js, never a store layout, and it put frozen peas
  // under the same "Produce" header as fresh herbs. `aisleFor()` derives a
  // real aisle from category + a keyword check without touching the enum.
  // Prep details (e.g. "cooked and chopped") deliberately live on the Recipe
  // tab, not here.
  // Placeholder shown in the Grocery/Recipe panes until the detail shard
  // arrives (init() sets this before MCData.ensureDetail() resolves).
  // Content-agnostic on purpose — one shape covers both panes, since neither
  // pane's real content exists yet to mimic.
  function groceryRecipeSkeleton() {
    return '<div class="card skel-card" aria-hidden="true">' +
      '<div class="skel-bar skel-bar-label"></div>' +
      '<div class="skel-bar"></div>' +
      '<div class="skel-bar"></div>' +
      '<div class="skel-bar skel-bar-short"></div>' +
      "</div>";
  }

  /* ── Pantry read (roadmap: "Real Pantry Inventory", tri-state substitution
     slice) — recipe.html previously had no pantry read at all (see
     mc-pantry.js's own header). This reads the same two localStorage stores
     cookbook-home.js owns (mc-cookbook:pantry, mc-cookbook:pantryqty)
     read-only, so the substitution card below can tell "have enough" from
     "have some, not enough" from "don't have it" — never writes either
     store from this page. */
  function pantryKeyLocal(item) { return (item || "").trim().toLowerCase(); }
  function loadPantryLocal() {
    try { return new Set(JSON.parse(localStorage.getItem("mc-cookbook:pantry") || "[]")); }
    catch (e) { return new Set(); }
  }
  function loadPantryQtyLocal() {
    try {
      var o = JSON.parse(localStorage.getItem("mc-cookbook:pantryqty") || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }

  function renderGrocery(r) {
    var pane = $("#pane-grocery");
    pane.innerHTML = "";

    // Checklist state stays keyed by the nominal `serving` count even in
    // macro-target mode (see the `state` comment above) — only the amounts
    // shown scale with the solved target.
    var list = ingredientsFor(r, effectiveServing(r));
    var done = loadSet(r.recipe_id, state.serving, "grocery");

    // Group by aisle, preserving AISLE_ORDER then any extras.
    var groups = {};
    list.forEach(function (ing, i) {
      var aisle = MCUnits.aisleFor(ing.item, ing.category);
      (groups[aisle] = groups[aisle] || []).push({ ing: ing, idx: i });
    });
    var aisles = MCUnits.AISLE_ORDER.filter(function (a) { return groups[a]; })
      .concat(Object.keys(groups).filter(function (a) { return MCUnits.AISLE_ORDER.indexOf(a) < 0; }));

    var card = el("div", "card grocery-card");
    card.appendChild(el("p", "card-label",
      "Shopping list · " + list.length + " items · " + state.serving + " servings"));

    aisles.forEach(function (aisle) {
      var sec = el("div", "grocery-cat");
      sec.appendChild(el("div", "grocery-cat-head",
        '<span class="dot"></span>' + esc(aisle) +
        '<span class="grocery-cat-count">' + groups[aisle].length + "</span>"));
      groups[aisle].forEach(function (entry) {
        sec.appendChild(groceryRow(r, entry.ing, entry.idx, done));
      });
      card.appendChild(sec);
    });
    pane.appendChild(card);

    // Missing-ingredient substitution (CI initiative 4; pantry-aware as of
    // the "Real Pantry Inventory" roadmap's tri-state slice). Still
    // informational, not interactive, and still doesn't touch the shopping
    // list above (Phase 3 §3.1 — the Grocery tab stays a pure list, no
    // per-row pantry badges) — only this card now checks the cook's own
    // recorded pantry state before deciding what to say:
    //   • pantry qty ≥ this recipe's need → skip the note (reduces noise for
    //     the common case: the cook already has enough, no swap needed).
    //   • pantry qty recorded but short → name both amounts specifically.
    //   • no qty recorded, or not in the pantry at all → today's original
    //     generic note, unchanged (mc-pantry.js's own "unquantified"/
    //     "unknown" honesty posture: never guess, fall back).
    // One note per applicable ingredient, deduplicated so two "sour cream"
    // lines in one recipe don't repeat the same tip twice.
    var seenSub = {}, subs = [];
    var pantrySet = loadPantryLocal(), pantryQty = loadPantryQtyLocal();
    list.forEach(function (ing) {
      var s = MCSearch.substitutionFor(ing.item);
      if (!s || seenSub[s.match]) return;
      seenSub[s.match] = 1;

      var entry = pantrySet.has(pantryKeyLocal(ing.item)) ? pantryQty[pantryKeyLocal(ing.item)] : null;
      var shortfallText = null;
      if (entry && entry.qty != null) {
        var mergeName = MCGrocery.groceryMergeName(ing.item);
        var needQty = MCGrocery.parseQty(ing.quantity);
        var cmp = MCPantry.compare(mergeName, needQty, ing.unit, entry.qty, entry.unit);
        if (cmp.status === "enough") return; // have enough — no note at all
        if (cmp.status === "short") {
          var have = entry.qty + (entry.unit ? " " + entry.unit : "");
          var need = [ing.quantity, ing.unit].filter(Boolean).join(" ") || "some";
          shortfallText = "You have " + esc(have) + ", this recipe needs " + esc(need) +
            " of <b>" + esc(s.match) + "</b> — try " + esc(s.swap) + ".";
        }
      }
      subs.push(shortfallText || ("No <b>" + esc(s.match) + "</b>? Try " + esc(s.swap) + "."));
    });
    if (subs.length) {
      var subCard = el("div", "card sub-card");
      subCard.appendChild(el("p", "card-label", "Don't have it on hand?"));
      var subList = el("div", "sub-list");
      subs.forEach(function (text) {
        subList.appendChild(el("p", "sub-row", text));
      });
      subCard.appendChild(subList);
      pane.appendChild(subCard);
    }
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

    var list = ingredientsFor(r, effectiveServing(r));
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
    appendTimers(row.querySelector(".step-body"), st.detail, r, st.step_number);
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

  // Counter Mode (CI initiative 3) — an explicit override for maximum
  // luminance/contrast, independent of the ambient light/dark theme. The
  // light theme tracks the room; this tracks a decision — a cook standing at
  // the counter under bright daylight may want max contrast even if the OS
  // itself is in dark mode (or vice versa at night), so it's a manual toggle
  // that WINS over whichever theme is otherwise active, not a third theme
  // tied to a media query. Persisted per device, defaults off.
  var COOK_COUNTER_KEY = "mc-cookbook:countermode";
  function counterMode() { return localStorage.getItem(COOK_COUNTER_KEY) === "1"; }
  function setCounterMode(on) {
    try { localStorage.setItem(COOK_COUNTER_KEY, on ? "1" : "0"); } catch (e) {}
    var o = $("#cook");
    if (o) o.classList.toggle("counter-mode", on);
    return on;
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
    var list = ingredientsFor(r, effectiveServing(r)) || [];
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

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  // Spoken timer control. The whole point of Cooking Mode is not touching the
  // screen, and setting a timer was the one thing that still required a tap —
  // the chips only exist where a duration happens to appear in the step text.
  function voiceSetTimer(m) {
    var n = parseFloat(m[1]);
    if (!n || n <= 0) return;
    var unit = (m[2] || "minute").toLowerCase();
    var secs = unit.charAt(0) === "h" ? Math.round(n * 3600)
      : unit.charAt(0) === "s" ? Math.round(n)
        : Math.round(n * 60);
    if (secs <= 0 || secs > 86400) return;
    var label = n + " " + unit + (n === 1 ? "" : unit.slice(-1) === "s" ? "" : "s");
    var st = (cook.recipe.instructions || [])[cook.index];
    MCTimers.start({
      seconds: secs, label: label,
      recipeId: cook.recipe.recipe_id, recipeTitle: cook.recipe.title,
      stepNumber: st ? st.step_number : null
    });
    speak("Timer set for " + label + ".");
    cookAnnounce("Timer set for " + label);
  }
  function voiceTimerStatus() {
    var live = MCTimers.list().filter(function (t) { return !t.ringing; });
    if (!live.length) { speak("No timers running."); return; }
    speak(live.map(function (t) {
      return MCTimers.fmtClock(t.remainingMs).replace(":", " minutes ") + " seconds left on " + t.label;
    }).join(". "));
  }
  function voiceStopTimer() {
    var all = MCTimers.list();
    if (!all.length) { speak("No timers running."); return; }
    MCTimers.cancel(all[all.length - 1].id);   // the most recently started one
    speak("Timer stopped.");
  }

  var COOK_VOICE_COMMANDS = [
    // Timer commands come FIRST: "set a timer for 5 minutes" also contains
    // "set", and a looser pattern below must never shadow it.
    { re: /\b(?:set|start)\b.*?\btimer\b.*?\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)?\b/i, run: voiceSetTimer },
    { re: /\b(how (long|much time)|time) (is )?(left|remaining)\b/i, run: voiceTimerStatus },
    { re: /\b(stop|cancel|clear)( the)? timer\b/i, run: voiceStopTimer },
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
    // Lets cookbook-sw.js defer an update reload while cooking, and apply it
    // the instant this toggles back off (see that file's own comment).
    document.dispatchEvent(new Event("mc:cookingchange"));
    // Mirror Cooking Mode into the URL (?cook=1) — it's already the way IN
    // (afterDetail() reads this same param), so entering it any other way
    // (the button, not a deep link) left the URL not reflecting reality. A
    // deploy landing mid-cook reloads this exact URL (cookbook-sw.js), so
    // the SW-reload guard below can tell "was cooking" apart from "was
    // reading" without any extra state.
    if (new URLSearchParams(location.search).get("cook") !== "1") {
      var u = new URL(location.href);
      u.searchParams.set("cook", "1");
      history.replaceState(null, "", u);
    }
    wake.set(true);
    renderCook();
  }
  function exitCook() {
    cook.active = false;
    stopCookVoice(); // no reason to keep the mic open once Cooking Mode is closed
    document.body.classList.remove("cooking");
    // Strip ?cook=1 BEFORE dispatching mc:cookingchange: cookbook-sw.js's
    // listener for that event may call location.reload() synchronously
    // (an update was deferred while cooking, and this is the moment it
    // applies) — reloading a URL that still said ?cook=1 would land right
    // back in Cooking Mode on the fresh load, undoing the exit entirely.
    if (new URLSearchParams(location.search).get("cook") === "1") {
      var u = new URL(location.href);
      u.searchParams.delete("cook");
      history.replaceState(null, "", u);
    }
    document.dispatchEvent(new Event("mc:cookingchange"));
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
      o = el("div", "cook" + (counterMode() ? " counter-mode" : ""));
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
    var counterBtn = el("button", "cook-counter-btn" + (counterMode() ? " on" : ""), "☀︎");
    counterBtn.type = "button";
    counterBtn.setAttribute("aria-label", "Toggle daylight mode");
    counterBtn.setAttribute("aria-pressed", counterMode() ? "true" : "false");
    counterBtn.title = "Daylight mode — max contrast for a sunlit counter";
    counterBtn.addEventListener("click", function () {
      var on = setCounterMode(!counterMode());
      counterBtn.classList.toggle("on", on);
      counterBtn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    top.appendChild(counterBtn);
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
    appendTimers(body, st.detail, r, st.step_number);
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
  // Set only by an actual tap/swipe (never by setTab() itself, which also
  // runs programmatically from init() and afterDetail()'s own deep-link
  // jump) — afterDetail() checks this so a cook who navigated away from
  // Overview while the detail shard was still loading doesn't get yanked
  // back into Cooking Mode the moment it lands.
  var userChangedTab = false;
  function wireTabs() {
    TABS.forEach(function (t) {
      $("#tab-" + t).addEventListener("click", function () { userChangedTab = true; setTab(t); });
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
        if (dx < 0 && i < TABS.length - 1) { userChangedTab = true; setTab(TABS[i + 1]); }
        if (dx > 0 && i > 0) { userChangedTab = true; setTab(TABS[i - 1]); }
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

    // Header and macros come entirely from the index (title, tags, times,
    // accent, per-serving macros), so they paint immediately — before the
    // detail shard carrying this recipe's ingredients and steps has even been
    // requested. That ordering IS initiative 5's win on this page: the cook
    // sees the recipe, not a blank screen, while ~70 KB lands instead of the
    // 1.04 MB the page used to parse before drawing anything at all.
    renderHeader(r);
    renderHero(r);
    renderMacros(r);
    wireTabs();
    setTab("overview");
    // The Grocery and Recipe panes have nothing in them until the detail
    // shard lands (below) — on a slow connection that's an empty pane with
    // no explanation if the cook swipes/taps over before it arrives. A
    // skeleton is replaced outright the moment renderGrocery()/renderRecipe()
    // run (both clear their container first), so this never lingers or
    // fights the real content for layout.
    $("#pane-grocery").innerHTML = groceryRecipeSkeleton();
    $("#pane-recipe").innerHTML = groceryRecipeSkeleton();

    // A full quota shouldn't silently swallow a heart or a timer (audit
    // VOC/VOA wave 7 — see warnStorageFull() above).
    MCFav.onWriteFail = warnStorageFull;
    MCTimers.onWriteFail = warnStorageFull;

    // The rail mounts immediately, not behind the detail load: a timer running
    // for a DIFFERENT recipe must stay visible here regardless of whether this
    // recipe's own shard ever arrives.
    MCTimers.configure({
      // Tapping a running pill goes back to the step that started it — across
      // recipes, which is why it may be a navigation rather than a jump.
      onJump: function (t) {
        if (!t.recipeId) return;
        if (t.recipeId !== r.recipe_id) {
          location.href = "recipe.html?id=" + encodeURIComponent(t.recipeId) + "&cook=1";
          return;
        }
        if (!cook.active) enterCook(r);
        var steps = r.instructions || [];
        for (var i = 0; i < steps.length; i++) {
          if (steps[i].step_number === t.stepNumber) { cookGo(i - cook.index); return; }
        }
      }
    });
    MCTimers.mountRail();

    MCData.ensureDetail(r.recipe_id).then(function (okDetail) {
      if (!okDetail) {
        // The shard genuinely failed (cold cache + dead network). Say so in
        // the two panes that need it rather than rendering empty lists that
        // look like a recipe with no ingredients. mc-net.js retries this
        // automatically the instant the network comes back (see the
        // mc:datareloaded listener below) — no manual reload needed once
        // connectivity actually returns, so the copy says that honestly
        // instead of just telling the cook to go reload.
        $("#pane-grocery").innerHTML =
          '<div class="card"><p class="card-label">Ingredients</p>' +
          "<p class=\"desc\">Couldn't load this recipe's ingredients. Check your connection — this reloads on its own once you're back online.</p></div>";
        $("#pane-recipe").innerHTML =
          '<div class="card"><p class="card-label">Method</p>' +
          "<p class=\"desc\">Couldn't load this recipe's steps. Check your connection — this reloads on its own once you're back online.</p></div>";
        return;
      }
      renderDetailReady(r);
    });

    // mc-net.js fires this once MCData.ensureAll() succeeds after a spell
    // offline — the retry it's already running for the shell's own "Use it
    // up"/ingredient search. hasDetail() re-checks THIS recipe specifically:
    // ensureAll() succeeding means every shard loaded, so if this one is
    // among them the error copy above is now stale.
    document.addEventListener("mc:datareloaded", function () {
      if (MCData.hasDetail(r.recipe_id)) renderDetailReady(r);
    });
  }

  // Re-run the two panes that were already painted, because each reads one
  // detail field above the fold: the header's serving note checks whether
  // this exact tier is authored (`ingredients_by_serving`), and the About
  // card in renderMacros() prints `description`. Every renderer clears its
  // container first, so re-running is a replace, not an append. Shared by
  // the initial ensureDetail().then() and the mc:datareloaded retry above.
  function renderDetailReady(r) {
    renderHeader(r);
    renderMacros(r);
    renderGrocery(r);
    renderRecipe(r);
    afterDetail(r);
  }

  // Everything that can only run once the recipe's steps exist.
  function afterDetail(r) {
    // ?cook=1 — hands-free mode as an addressable destination. Cooking Mode
    // holds the wake lock, the large type and voice control, but it used to be
    // reachable only from a button inside the third sub-tab, so every "cook
    // this tonight" tap from the planner landed in a reading view four taps
    // short of the thing the cook actually wanted.
    //
    // Guarded on !userChangedTab: on a slow shard load the cook may have
    // already tapped Grocery (or swiped) before this resolves — jumping them
    // into Cooking Mode anyway would steal that tap out from under them.
    // Guarded on !cook.active too: renderDetailReady() (and so this
    // function) can run a second time via the mc:datareloaded retry above —
    // re-entering Cooking Mode while it's already open would reset
    // cook.index back to the first undone step, discarding real progress.
    if (!userChangedTab && !cook.active &&
        new URLSearchParams(location.search).get("cook") === "1" &&
        (r.instructions || []).length) {
      setTab("recipe");
      enterCook(r);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  // Expose scaler for future use / testing.
  window.MCCookbook = { scaleQuantity: scaleQuantity };
})();
