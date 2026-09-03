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
  // Authored accents range down to near-black; used as literal text/border color
  // on dark surfaces (tags, labels, icons), so floor the lightness before it's
  // ever set as a CSS var — otherwise a dark accent goes illegible.
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
  /* Recipe-card rendering lives in mc-cards.js (audit C-07) — the icon SVG
     table, CARD_PATTERNS, the accent clamp and the card itself were all
     duplicated in collection.js. Local aliases keep this file's existing call
     sites unchanged; MCCards.configure() below supplies the shell's behavior. */
  var clampAccent    = MCCards.clampAccent;
  var rgbFromHex     = MCCards.rgbFromHex;
  var hashStr        = MCCards.hashStr;
  var cardPatternFor = MCCards.cardPatternFor;
  var cardSheenDelay = MCCards.cardSheenDelay;
  var recipeIconHtml = MCCards.recipeIconHtml;
  var macroStatsHtml = MCCards.macroStatsHtml;
  function recipeCard(r, opts) { return MCCards.recipeCard(r, opts); }


  // Recipe cards have no photography — recipes-data.js has no image field,
  // and the detail page's own cover photo is opt-in/user-uploaded, so most
  // cards never get one. A deterministic (same recipe → same pattern every
  // render) subtle texture over the existing accent band gives each card
  // some visual distinction beyond "same tile, different title," without a
  // photo pipeline. Four patterns is enough variety to read as "textured,"
  // not so many it looks random/noisy across a grid.
  // Desyncs the ported category-card sheen sweep (see .rc-sheen) so a grid
  // of many recipe cards doesn't all flash in unison — same hash source as
  // the pattern above, just a different modulus.

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

  /* ── Store writes (audit C-12) ────────────────────────────────────────
     Every mc-cookbook: write in this file used to be its own
     `try { localStorage.setItem(…) } catch (e) {}` — fourteen of them,
     each swallowing a QuotaExceededError in silence. Swallowing is the
     right call for resilience (a full disk shouldn't throw a cook out of
     a recipe mid-cook) but it's the wrong call for diagnosis: the actual
     failure mode was hearts and meal plans quietly not saving, with no
     signal at all. Photos are the realistic way to fill a 5–10 MB origin
     quota — cook-log photos and recipe cover photos both live in this
     namespace.

     One helper, so the failure is reported exactly once per session
     rather than fourteen times or zero. Callers that can recover
     meaningfully still get the boolean back. */
  var storageWarned = false;
  function warnStorageFull() {
    if (storageWarned) return;
    storageWarned = true;
    // plannerToast is a hoisted function declaration further down this
    // same IIFE, so it's callable from here regardless of source order.
    plannerToast("Storage is full — that change didn't save. Remove some cook-log photos to free space.");
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { warnStorageFull(); return false; }
  }

  /* ── Favorites — the store itself is mc-fav.js (audit C-07) ───────────
     Three files carried their own copy of this over the same key. Aliases
     keep this file's call sites unchanged. The write-failure hook is wired
     in init() so a full quota still surfaces the C-12 toast. */
  var FAV_KEY = MCFav.KEY;
  function loadFavs()   { return MCFav.load(); }
  function toggleFav(id) { return MCFav.toggle(id); }

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
    writeStore(MIKE_DRAFT_KEY, JSON.stringify(list));
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
    var ok = writeStore(PLAN_KEY, JSON.stringify(p));
    updateAppBadge();   // every plan mutation funnels through here
    return ok;
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
    writeStore(AUTODRAFT_DISMISS_KEY, String(Date.now()));
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
    // savePlan()'s writeStore() already raises the storage-full toast on
    // failure — returning null here (instead of the meal that never actually
    // got persisted) stops mc-cards.js's plan button from ALSO showing
    // "Added ✓" right next to that warning.
    if (!savePlan(p)) return null;
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
    writeStore(GROC_KEY, JSON.stringify(Array.from(set)));
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
    writeStore(COOKED_KEY, JSON.stringify(map));
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
    writeStore(RECAP_DISMISS_KEY, weekKey);
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
    writeStore(PANTRY_KEY, JSON.stringify(Array.from(set)));
  }
  function pantryKey(item) { return (item || "").trim().toLowerCase(); }

  /* ── Pantry quantities (roadmap: "Real Pantry Inventory") ───────────────
     mc-cookbook:pantryqty → { [pantryKey]: { qty, unit, ts } }, a SEPARATE,
     sparse store from mc-cookbook:pantry above rather than a change to that
     store's own shape. Deliberate: the roadmap's original sketch described
     migrating :pantry's array elements from bare strings to
     {name,qty,unit,...} objects, but that would touch every existing
     consumer of loadPantry()'s Set<string> return (pantryMatchInfo,
     pantryCandidates, the low-shopping filter, the grocery-row suppression
     check) for a feature most of them don't need to know about. A companion
     map achieves the same "quantity is strictly additive, never required"
     guarantee the roadmap asked for with strictly less risk: a staple with
     no entry here behaves in every existing code path exactly as it always
     has, because none of that code path's inputs changed at all. Only a
     future caller that specifically wants a quantity (MCPantry.compare())
     needs to know this store exists.
     Wired into the This Week planner's grocery list as of the pantry-
     quantity UI slice — see renderGroceryPane()'s pantryShortfall() and
     the 📏 button in groceryRow() below, plus mc-pantry.js's own header. */
  var PANTRY_QTY_KEY = "mc-cookbook:pantryqty";
  function loadPantryQty() {
    try {
      var o = JSON.parse(localStorage.getItem(PANTRY_QTY_KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }
  function savePantryQty(map) {
    writeStore(PANTRY_QTY_KEY, JSON.stringify(map));
  }
  // qty/unit may be null (clears a previously-recorded amount back to
  // "unquantified" without removing the staple itself from the pantry Set).
  function setPantryQty(item, qty, unit) {
    var map = loadPantryQty(), k = pantryKey(item);
    if (qty == null) delete map[k];
    else map[k] = { qty: qty, unit: unit || null, ts: Date.now() };
    savePantryQty(map);
  }

  function togglePantry(item) {
    var set = loadPantry(), k = pantryKey(item);
    var removing = set.has(k);
    if (removing) set.delete(k); else set.add(k);
    savePantry(set);
    // A quantity for a staple that's no longer in the pantry at all is
    // orphaned data, not a fact worth keeping around for if it's re-added
    // later — re-adding is exactly when a stale amount would be most
    // misleading (the cook restocked; the old number is wrong on its face).
    if (removing) setPantryQty(item, null, null);
    return set.has(k);
  }
  // Pantry data previously only suppressed grocery-list rows (write-only past
  // that one screen) — this puts it to work a second way: how many of a
  // recipe's ingredients are already staples, so "cook what you have" can be
  // an actual browse filter on the Recipes screen, not just a shopping aid.
  // Quantity-aware as of the roadmap §2.2 follow-up: a staple with a
  // recorded amount that's genuinely short of THIS recipe's need counts as
  // still-needed, not "have" — same MCPantry.compare() tri-state honesty
  // used everywhere else this store is read. An unquantified staple, or one
  // MCPantry can't compare, falls straight back to the original binary
  // "marked as pantry -> have" behavior — never guessed at.
  function pantryMatchInfo(r) {
    var pantry = loadPantry(), qtyMap = loadPantryQty();
    var tier = (r.scaling_options && r.scaling_options[0]) || r.native_serving || 2;
    var by = r.ingredients_by_serving || {};
    var list = by["serving_" + tier] || by["serving_" + (r.native_serving || 2)] || by[Object.keys(by)[0]] || [];
    if (!list.length) return null;
    var have = 0;
    list.forEach(function (ing) {
      var k = pantryKey(ing.item);
      if (!pantry.has(k)) return;
      var entry = qtyMap[k];
      if (entry && entry.qty != null && window.MCPantry) {
        var needQty = MCGrocery.parseQty(ing.quantity);
        var cmp = MCPantry.compare(groceryMergeName(ing.item), needQty, ing.unit, entry.qty, entry.unit);
        if (cmp.status === "short") return; // recorded amount isn't enough here — still needed
      }
      have++;
    });
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
    writeStore(HISTORY_KEY, JSON.stringify(arr));
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
    writeStore(MACRO_HISTORY_KEY, JSON.stringify(arr));
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
    writeStore(CUSTOM_KEY, JSON.stringify(arr));
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

  /* ══ Grocery quantity math + ingredient keys ════════════════════════
     Lives in mc-grocery.js (audit C-08). Aliases keep this file's call sites
     unchanged; MCGrocery.configure() in init() supplies the plan/pantry
     readers it needs. recipeIngredientKeys/mergeIngredientKeys are here too
     because Smart Week's ingredient-overlap scoring shares the same
     ingredient identity as the grocery merge — one definition, two callers. */
  var buildGrocery         = function () { return MCGrocery.buildGrocery.apply(null, arguments); };
  var groceryItemCount     = function () { return MCGrocery.groceryItemCount.apply(null, arguments); };
  var groceryMergeName     = function () { return MCGrocery.groceryMergeName.apply(null, arguments); };
  var groceryRowAllDone    = function () { return MCGrocery.groceryRowAllDone.apply(null, arguments); };
  var recipeIngredientKeys = function () { return MCGrocery.recipeIngredientKeys.apply(null, arguments); };
  var mergeIngredientKeys  = function () { return MCGrocery.mergeIngredientKeys.apply(null, arguments); };


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

  /* ══ ONE week-generation engine, three biases (audit C-04) ═════════════
     This used to be three near-verbatim implementations — smw* (Balanced),
     msg* (Macro-Targeted) and tcw* (Time Check), ~375 lines producing the
     identical { day, slot, id } grid. Their slot pickers were the same
     function four times over: same eligible pool, same excludeId filter,
     same SMW_HARD_EXCLUDE_DAYS freshness filter with the same
     fall-back-to-the-full-pool rule, same argmax loop. Only the scorer
     differed — and Time Check already called Balanced's own scorer, which
     is what proved the seam was there. Any fix to repeat-avoidance or
     seasonality had to be found and reapplied up to three times, and a fix
     applied to two of three made the planner behave differently depending
     on which button the cook pressed.

     What differs per mode is declared in WEEK_MODES below and nothing else:
       prepare()  once-per-run context (training pattern, goals, buckets)
       skipDay()  Time Check skips days the cook gave no bucket for
       narrow()   Time Check's time-bucket pre-filter on the candidate pool
       score()    the actual bias
       track()    Balanced/Time track category + ingredient state for their
                  variety scoring; Macro doesn't read either, so it doesn't
                  pay to compute them.

     Behavior is intentionally identical to the three it replaces, including
     one asymmetry worth naming: Time Check passes no dayBias to
     smwScoreCandidate, so it has never had the training-day protein bias
     that Balanced does. That's preserved here rather than quietly
     "fixed" — changing it is a product decision, not a refactor. */

  // Shared pool → argmax. `narrow` runs before the empty check, matching
  // Time Check's original ordering (bucket filter, then bail if nothing).
  function wkPickForSlot(slot, opts) {
    var pool = mealEligibleRecipes(slot);
    if (opts.excludeId) pool = pool.filter(function (r) { return r.recipe_id !== opts.excludeId; });
    if (opts.narrow) pool = opts.narrow(pool);
    if (!pool.length) return null;
    var fresh = pool.filter(function (r) {
      var days = daysSinceCooked(r.recipe_id);
      return days == null || days > SMW_HARD_EXCLUDE_DAYS;
    });
    var candidates = fresh.length ? fresh : pool;
    var best = null, bestScore = -Infinity;
    candidates.forEach(function (r) {
      var s = opts.score(r);
      if (s > bestScore) { bestScore = s; best = r; }
    });
    return best;
  }

  function wkTrackVariety(st, pick) {
    st.prevCategoryBySlot[pick.slot] = pick.recipe.dish_category;
    mergeIngredientKeys(st.usedIngredientKeys, recipeIngredientKeys(pick.recipe));
  }

  var WEEK_MODES = {
    balanced: {
      prepare: function () { return { dayBiasPattern: smwDayBiasMap() }; },
      score: function (ctx) {
        var dayBias = smwDayBiasFor(ctx.run.dayBiasPattern, ctx.day);
        return function (r) {
          return smwScoreCandidate(r, ctx.state.usedIds, ctx.state.prevCategoryBySlot[ctx.slot],
                                   ctx.state.usedIngredientKeys, dayBias);
        };
      },
      track: wkTrackVariety
    },
    macro: {
      prepare: function () {
        var goals = loadMacroGoals();
        return { goals: goals, dayBiasPattern: smwDayBiasMap(), trendBonus: macroTrendBias(goals).bonus };
      },
      score: function (ctx) {
        var budget = msgBudgetFor(ctx);
        return function (r) { return msgScoreCandidate(r, ctx.state.usedIds, budget); };
      },
      track: null            // macro scoring reads neither category nor ingredients
    },
    time: {
      prepare: function (args) { return { dayBuckets: (args && args.dayBuckets) || {} }; },
      skipDay: function (day, run) { return !run.dayBuckets[day]; },
      narrow: function (ctx) {
        var bucket = BWQ_BUCKETS.filter(function (b) { return b.key === ctx.run.dayBuckets[ctx.day]; })[0];
        if (!bucket) return null;
        return function (pool) {
          var fit = pool.filter(function (r) { return bucket.match(bwqTotalTime(r)); });
          return fit.length ? fit : pool;
        };
      },
      // No dayBias — Time Check has never applied the training-day bias.
      score: function (ctx) {
        return function (r) {
          return smwScoreCandidate(r, ctx.state.usedIds, ctx.state.prevCategoryBySlot[ctx.slot],
                                   ctx.state.usedIngredientKeys);
        };
      },
      track: wkTrackVariety
    }
  };

  function wkMode(modeKey) { return WEEK_MODES[modeKey] || WEEK_MODES.balanced; }

  // Full 7-day grid for a scope: [{ day, slot, id }], best-effort no-repeat.
  function wkGenerateWeek(scopeKey, modeKey, args) {
    var scope = SMART_SCOPES.filter(function (s) { return s.key === scopeKey; })[0] || SMART_SCOPES[0];
    var mode = wkMode(modeKey);
    var run = mode.prepare ? mode.prepare(args || {}) : {};
    var st = { usedIds: new Set(), usedIngredientKeys: {}, prevCategoryBySlot: {}, grid: [] };
    DAYS.forEach(function (day) {
      if (mode.skipDay && mode.skipDay(day, run)) return;
      scope.slots.forEach(function (slot, slotIndex) {
        var ctx = { day: day, slot: slot, slotIndex: slotIndex, scope: scope, state: st, run: run, isRegen: false };
        var pick = wkPickForSlot(slot, {
          excludeId: null,
          narrow: mode.narrow ? mode.narrow(ctx) : null,
          score: mode.score(ctx)
        });
        if (!pick) return;
        st.usedIds.add(pick.recipe_id);
        if (mode.track) mode.track(st, { recipe: pick, slot: slot });
        st.grid.push({ day: day, slot: slot, id: pick.recipe_id });
      });
    });
    return { scope: scope, grid: st.grid };
  }

  // Re-pick a single day+slot, excluding its current recipe so the tap
  // always changes something (when an alternative exists). Used-id and
  // ingredient state is rebuilt from every OTHER slot already in the grid,
  // so a regenerated pick still tries to match the rest of the week;
  // prevCategory comes from the previous DAY's same slot.
  function wkRegenerateSlot(grid, day, slot, modeKey, args) {
    var scope = SMART_SCOPES.filter(function (s) { return s.key === (args && args.scopeKey); })[0] || SMART_SCOPES[0];
    var mode = wkMode(modeKey);
    var run = mode.prepare ? mode.prepare(args || {}) : {};
    var st = { usedIds: new Set(), usedIngredientKeys: {}, prevCategoryBySlot: {}, grid: grid };
    grid.forEach(function (g) {
      if (g.day === day && g.slot === slot) return;
      st.usedIds.add(g.id);
      if (!mode.track) return;
      var r = recipeById(g.id);
      if (r) mergeIngredientKeys(st.usedIngredientKeys, recipeIngredientKeys(r));
    });
    var dayIdx = DAYS.indexOf(day);
    var prevEntry = dayIdx > 0
      ? grid.filter(function (g) { return g.day === DAYS[dayIdx - 1] && g.slot === slot; })[0]
      : null;
    st.prevCategoryBySlot[slot] = prevEntry ? ((recipeById(prevEntry.id) || {}).dish_category) : null;

    var current = grid.filter(function (g) { return g.day === day && g.slot === slot; })[0];
    var ctx = { day: day, slot: slot, slotIndex: 0, scope: scope, state: st, run: run, isRegen: true };
    var pick = wkPickForSlot(slot, {
      excludeId: current ? current.id : null,
      narrow: mode.narrow ? mode.narrow(ctx) : null,
      score: mode.score(ctx)
    });
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
  // "smw-trend-callout" banner in openPlanWeek()'s paintGrid().
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
  // This slot's share of whatever's left of the day's kcal/protein goal.
  // Generating, the day fills left to right, so the share is over the slots
  // still to come. Regenerating, the day is already full apart from this one
  // slot, so the share is over the slots not currently filled (min 1).
  function msgBudgetFor(ctx) {
    var run = ctx.run;
    var consumed = msgDayConsumed(ctx.state.grid, ctx.day, ctx.isRegen ? ctx.slot : null);
    var remaining = {
      kcal: (run.goals ? run.goals.kcal : 0) - consumed.kcal,
      p:    msgDayProteinGoal(run.goals, ctx.day, run.dayBiasPattern, run.trendBonus) - consumed.p
    };
    var slotsLeft;
    if (ctx.isRegen) {
      var otherFilled = ctx.state.grid.filter(function (g) {
        return g.day === ctx.day && g.slot !== ctx.slot;
      }).length;
      slotsLeft = Math.max(1, ctx.scope.slots.length - otherFilled);
    } else {
      slotsLeft = ctx.scope.slots.length - ctx.slotIndex;
    }
    return { kcal: remaining.kcal / slotsLeft, p: remaining.p / slotsLeft };
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

  /* ── Shared: a recipe card (used by Categories / Recipes / Favorites) ── */

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

  /* ══ BACKUP & RESTORE — the Home card's UI over mc-export.js ═══════════
     The app is local-only: every byte of a cook's data (favorites, the weekly
     plan, grocery check-offs, their own recipes, per-recipe step/grocery
     check-offs) lives in localStorage under the mc-cookbook: namespace, plus
     the tracker's mc_macros_v1. This is the safety net — one tap writes it all
     to a portable JSON file, and a matching import restores it.

     The export/import ITSELF lives in mc-export.js (window.MCExport), not
     here. This file used to carry a second, independent implementation whose
     file format was mutually unreadable with that one even though both wrote
     mikes-cookbook-backup-<date>.json — see audit C-01, and mc-export.js's
     header for the format and its backward compatibility with files this
     code wrote. Everything below is UI: the card, the freshness line, and the
     stale-backup nudge. */
  var BACKUP_KEY = "mc-cookbook:lastBackupAt";
  var backupBannerDismissed = false;          // per-session dismissal

  /* ── First-launch Quick Tour nudge ────────────────────────────────── */
  var TOUR_SEEN_KEY = "mc-cookbook:tourSeen";
  function tourSeen() {
    try { return localStorage.getItem(TOUR_SEEN_KEY) === "1"; }
    catch (e) { return true; } // storage unavailable — fail quiet, not nagging
  }
  function markTourSeen() {
    writeStore(TOUR_SEEN_KEY, "1");
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

  /* Thin adapters over window.MCExport (mc-export.js), which owns the file
     format for the whole app. Kept as local functions so the card below reads
     the same as before, and so the Home card can keep its confirm() step —
     its copy promises a replace, and a cook tapping Import on the hub deserves
     the chance to back out. The account sheet's own Import calls MCExport
     directly without one; that asymmetry is deliberate, not drift. */
  function backupUnavailable(done) {
    if (window.MCExport) return false;
    if (done) done(false, "Backup isn't available right now — try reloading the app.");
    return true;
  }

  function exportData() {
    if (backupUnavailable(null)) return false;
    MCExport.exportJSON();                    // also stamps BACKUP_KEY
    return true;
  }

  // Read → validate → confirm → restore, reporting via done(ok, message).
  // A malformed file is rejected BEFORE anything is written, so a bad import
  // can never corrupt the data already on the device.
  function importData(file, done) {
    if (backupUnavailable(done)) return;
    var reader = new FileReader();
    reader.onerror = function () { done(false, "Couldn't read that file."); };
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (e) { done(false, "That file isn't valid JSON."); return; }
      // Dry-run the validation against a throwaway store so a file that would
      // be rejected never reaches the confirm prompt.
      var check = MCExport.restorePayload(parsed, memStore());
      if (!check.ok) { done(false, check.message); return; }
      if (!window.confirm("This replaces your current saved data with the backup. Continue?")) {
        done(false, null);                    // cancelled — no-op, not an error
        return;
      }
      var res = MCExport.restorePayload(parsed, localStorage);
      done(res.ok, res.ok ? null : res.message);
    };
    reader.readAsText(file);
  }

  // Minimal Storage-alike for the dry run above — same surface restorePayload
  // touches (length/key/getItem/setItem/removeItem), nothing more.
  function memStore() {
    var m = {};
    return {
      get length() { return Object.keys(m).length; },
      key: function (i) { return Object.keys(m)[i]; },
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
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
  // Reuses Smart Week's own generator/commit (wkGenerateWeek/commitSmartWeek) —
  // this is a new *trigger* for that existing code (shown proactively instead of
  // waiting for a button tap), not a new generator. The grid is cached in
  // homeAutoDraftGrid so Regenerate re-rolls it but a re-render (e.g. tab switch)
  // doesn't silently swap the draft out from under the cook.
  function renderAutoDraftCard() {
    if (!homeAutoDraftGrid) homeAutoDraftGrid = wkGenerateWeek("all", "balanced").grid;
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
      homeAutoDraftGrid = wkGenerateWeek("all", "balanced").grid;
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
      "check-offs, cook log, macro tracker and your own recipes safe — or to " +
      "move them to another phone. Cook-log photos are included, so a backup " +
      "with photos can be several MB. Importing replaces what&rsquo;s on this " +
      "device."));

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
        // "Cook" goes straight into hands-free Cooking Mode via ?cook=1 —
        // wake lock, big type, voice control and the timer rail, all in one
        // tap. Until this, Today's meals weren't even links: getting from
        // "this is tonight's dinner" to actually cooking it meant Browse,
        // search, open, then the third sub-tab, then Start Cooking.
        // Optimistic while the detail shards are still in flight: every
        // built-in recipe has steps, and enterCook() no-ops harmlessly on one
        // that turns out not to. Gating on r.instructions here would hide the
        // button for the first moments of every cold open, on the default
        // screen, which is worse than the edge case it would prevent.
        if (!MCData.hasDetail(r.recipe_id) || (r.instructions || []).length) {
          var cookBtn = el("a", "today-meal-cook", "▸ Cook");
          cookBtn.href = "recipe.html?id=" + encodeURIComponent(r.recipe_id) + "&cook=1";
          cookBtn.setAttribute("aria-label", "Start cooking " + r.title);
          row.appendChild(cookBtn);
        }
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

    // Multi-Dish Cook Timeline Synchronizer (roadmap §2.3) — offered right
    // where a cook already sees today's whole plan at once. `totalMins` is
    // just prep + cook time, so a dish missing either just doesn't get an
    // auto-scheduled slot (mc-timeline.js's own "manual, start whenever"
    // fallback) rather than blocking the feature for the other dishes.
    if (window.MCTimeline) {
      var timelineDishes = todays.map(function (m) {
        var tr = recipeById(m.id);
        if (!tr) return null;
        return {
          recipeId: tr.recipe_id, title: tr.title, icon: tr.icon,
          totalMins: (parseInt(tr.prep_time_mins, 10) || 0) + (parseInt(tr.cook_time_mins, 10) || 0)
        };
      }).filter(Boolean);
      if (timelineDishes.filter(function (d) { return d.totalMins > 0; }).length >= 2) {
        var timeBtn = el("button", "today-timeline-btn", "⏱ Time it together");
        timeBtn.type = "button";
        timeBtn.addEventListener("click", function () { MCTimeline.open(timelineDishes); });
        card.appendChild(timeBtn);
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

    /* ── At most ONE nudge banner (audit C-09) ────────────────────────────
       Each of these was appended independently, so a first launch with a
       stale backup showed both at once, on top of the hero, the Today card,
       the recap and the auto-draft card — up to eleven stacked calls to
       action before a cook reached "Categories". Every one was individually
       justified; nothing owned the question of what to show FIRST. Ranking
       replaces accumulation: the tour outranks the backup nudge, because a
       cook who doesn't know the app yet has nothing to lose. */
    var nudge = null;
    // First-launch: Quick Tour used to be reachable only via a Help-tier link
    // at the very bottom of Home, with no signal a new user should scroll
    // that far. Shows once, dismissed permanently by taking it or closing it.
    if (!tourSeen()) nudge = tourBanner();
    // Safety net: stale backup + data worth protecting.
    else if (!backupBannerDismissed && backupIsStale() && hasCookData()) nudge = backupBanner();
    if (nudge) s.appendChild(nudge);

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

    /* ── At most ONE suggestion card (audit C-09) ─────────────────────────
       Ranked by how immediate the cook's need is, most urgent first:
         Today      what to do RIGHT NOW — beats everything when it applies
         Auto-draft no plan at all yet; the app's best one-tap moment
         Recap      a look back, valuable but never urgent
       Previously all three could stack under the hero. Today and auto-draft
       were already mutually exclusive by construction (one needs a plan, the
       other needs an empty one) — the recap was the one that piled on. */
    var suggestion = renderTodayCard();
    if (!suggestion && !planned && homeAutoDraftEligible()) suggestion = renderAutoDraftCard();
    if (!suggestion) suggestion = renderWeeklyRecapCard();
    if (suggestion) s.appendChild(suggestion);

    var forYou = renderForYouCarousel();
    if (forYou) s.appendChild(forYou);

    // Browse modules — two labeled sections keep the Home screen scannable.
    var browse = el("div", "home-browse");

    // — Explore section: browse the full recipe library —
    // One module, not two. "Categories" and "Recipes" were separate entries
    // into two screens over the same library; a cook doesn't arrive knowing
    // which axis they want, so the axis is now a switch inside Browse.
    browse.appendChild(el("div", "tier-label", "Explore"));
    browse.appendChild(homeModule({
      icon: "📖", title: "Browse", accent: "#D9A05B",
      sub: recipes().length + " recipes · " + collections().length + " collections · " +
           presentCategories().length + " dish types",
      onTap: function () { recipesState.browse = "collection"; setTab("recipes"); }
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
        : "Create your own, or paste a link to import one",
      onTap: function () { openAddRecipeChooser(); }
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

  /* ══ Dish-category cards — a taxonomy of the Browse screen ══════════════
     These used to be their own top-level screen (#categories) that drilled
     into a per-category grid. Browse already carried every dish category as
     a filter chip, so that was a second, prettier door to a facet this app
     already had — two top-level screens over the same 318 recipes, and a cook
     doesn't arrive knowing whether they want to browse by dish type or by
     collection. The cards live on now as Browse's "By dish type" view; tapping
     one sets the category facet rather than navigating anywhere. */
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
      recipesState.category = cat;
      renderRecipes();
      window.scrollTo(0, 0);
    });
    return card;
  }

  /* ══ BROWSE screen — one library, two taxonomies + app-wide search ═══
     Was two top-level screens: "Recipes" (collection cards) and "Categories"
     (dish-type cards). Both list the same 318 recipes, differing only in the
     axis — and this screen already carried every dish category as a filter
     chip, so Categories was a second door to a facet that lived here.
     Default view is now a taxonomy switch (By collection / By dish type);
     once a search query or any facet is active, both collapse to the same
     flat grid of matching recipe cards, exactly as before. The #categories
     deep link still works (see SCREEN_ALIASES) and lands on By dish type. */
  // CI initiative 4: ranked, tokenized, bounded-fuzz search (mc-search.js)
  // replaces the old indexOf-over-five-fields substring scan, which returned
  // ZERO results for "chicken broccoli" (the words are never adjacent in any
  // one field) and ZERO for "chiken" (no typo tolerance at all) — both
  // verified against the real catalog before this file existed. Returns a
  // SORTED array (best match first), not a boolean, because ranking — not
  // just filtering — was the actual gap.
  // Side table of recipe_id -> matched fields for whichever search just ran,
  // read by recipeCard() calls below to show the "matched: ingredient"
  // provenance badge. A side table rather than threading {recipe,
  // matchedFields} pairs through the category/macro/lowShopping .filter()
  // chain that follows searchRecipes() — those filters, and the sort
  // low-shopping applies afterward, all expect plain recipe objects, and
  // wrapping/unwrapping at every step would be more code than this map.
  var lastMatchedFields = {};
  function searchRecipes(list, q) {
    if (!q) { lastMatchedFields = {}; return list.slice(); }
    var results = MCSearch.query(q, list);
    lastMatchedFields = {};
    results.forEach(function (x) { lastMatchedFields[x.recipe.recipe_id] = x.matchedFields; });
    return results.map(function (x) { return x.recipe; });
  }

  // Set by Home's search button so this screen's box grabs focus (and the
  // keyboard opens) the moment it renders, instead of landing on a static list.
  var focusRecipesSearch = false;

  // Persists only for the JS runtime (like recipesState/plannerState) — resets
  // to off on a fresh load rather than sticking on silently across visits.
  // browse: "collection" | "dish" — which taxonomy the default (unfiltered)
  // view shows. Audit: Categories and Recipes were two top-level screens over
  // the same 318 recipes, and this screen already carried every dish category
  // as a filter chip, so the Categories spoke was a second, prettier door to
  // a facet this screen already had.
  /* ── Detail-shard arrival (CI initiative 5) ───────────────────────────
     The index paints the shell; ingredients and instructions arrive a moment
     later in mc-data.js's shards. Three things on this screen genuinely need
     the whole corpus — ingredient search, the "Use it up" reverse index, and
     the low-shopping pantry filter — so they register an IN-PLACE repaint
     here rather than having init() re-render the screen when the shards land.
     Re-rendering would rebuild the DOM and blow away a half-typed search
     query; calling the screen's own paint() re-filters and leaves the box
     alone. Fired once, then dropped. */
  var detailRepaints = [];
  function onDetailReady(fn) {
    if (window.MCData && MCData.allReady()) return;   // nothing to wait for
    detailRepaints.push(fn);
  }
  function fireDetailReady() {
    ingredientIndexCache = null;      // it may have been built from nothing
    var fns = detailRepaints; detailRepaints = [];
    fns.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  var recipesState = { lowShopping: false, category: null, macro: null, browse: "collection" };

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
    s.appendChild(backTopBar("‹ Home", "Browse",
      recipes().length + " recipes · " + collections().length + " collections · " +
      presentCategories().length + " dish types",
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

    // Taxonomy switch for the default (unfiltered) view. Hidden the moment a
    // search or facet is active, because both taxonomies collapse to the same
    // result grid then and a switch that changes nothing is worse than none.
    var taxoBar = el("div", "browse-taxo-bar");
    taxoBar.appendChild(segControl("browse-taxo", [
      { value: "collection", label: "By collection" },
      { value: "dish", label: "By dish type" }
    ], recipesState.browse, function (v) {
      recipesState.browse = v;
      renderRecipes();
      window.scrollTo(0, 0);
    }));
    s.appendChild(taxoBar);

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

      if (!q && !anyFacetActive()) {                   // default: pick a taxonomy
        taxoBar.style.display = "";
        var wrap = el("div", "cards-wrap");
        if (recipesState.browse === "dish") {
          wrap.appendChild(el("div", "tier-label", "🍽️ Dish types"));
          presentCategories().forEach(function (cat) { wrap.appendChild(categoryCard(cat)); });
        } else {
          wrap.appendChild(el("div", "tier-label", "★ Collections"));
          collections().forEach(function (c) { wrap.appendChild(collectionCard(c)); });
        }
        results.appendChild(wrap);
        return;
      }
      taxoBar.style.display = "none";

      var list = searchRecipes(recipes(), q);

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
        grid.appendChild(recipeCard(r, {
          pantryInfo: recipesState.lowShopping ? pantryMatchInfo(r) : null,
          matchedFields: q ? lastMatchedFields[r.recipe_id] : null
        }));
      });
      results.appendChild(grid);
    }

    box.addEventListener("input", paint);
    onDetailReady(paint);   // ingredient search + low-shopping need the shards
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

    // One door (audit C-05). This was two sibling buttons — "✨ Smart Week"
    // and "⏱️ Time Check" — which, with Smart Week's own inner Balanced /
    // Macro-Targeted toggle, made four ways to fill a week that all produce
    // the same grid. The cook had to classify their own intent before seeing
    // a single recipe, and comparing two of them meant closing one overlay
    // and starting from a different button. Now the bias is a chip inside
    // one overlay, chosen after there's a result to look at.
    var smart = el("button", "plan-smart-btn", "✨&nbsp;&nbsp;Plan my week");
    smart.type = "button";
    smart.addEventListener("click", function () { openPlanWeek(); });
    body.appendChild(smart);

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
    // Building this before the detail shards arrive would cache an EMPTY index
    // forever — every recipe's ingredients_by_serving is still absent at that
    // point. Build it anyway (so a caller gets a real, if empty, answer) but
    // don't memoize it until the data behind it is actually complete.
    var complete = !window.MCData || MCData.allReady();
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
    if (complete) ingredientIndexCache = idx;
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

  // A "short" amount (mc-pantry.js's `compare()` result) is shaped one of two
  // ways depending on which family it resolved into — see that file's own
  // header. Format either into the same "N unit" text a cook reads elsewhere
  // in the grocery list.
  function formatShort(short) {
    if (!short) return "";
    if (short.cls) return MCGrocery.prettyMeasure(short.base, short.cls);
    return MCGrocery.prettyQty(short.qty) + (short.unit ? " " + short.unit : "");
  }
  // How much more of `row.item` is still needed, given what's recorded in
  // the pantry — or null when there's nothing to say (no comparable need,
  // no recorded amount, or the pantry amount already covers it). Never
  // treats a missing pantry amount as zero: only a real "short" result from
  // MCPantry.compare() produces a shortfall.
  function pantryShortfall(row) {
    if (!row.need) return null;
    var entry = loadPantryQty()[pantryKey(row.item)];
    if (!entry || entry.qty == null) return null;
    var cmp = MCPantry.compare(groceryMergeName(row.item),
      row.need.qty, row.need.unit, entry.qty, entry.unit);
    if (cmp.status !== "short") return null;
    return "Have " + entry.qty + (entry.unit ? " " + entry.unit : "") +
      " · need " + formatShort(cmp.short) + " more";
  }

  function closePantryQtyEditor() {
    var ov = $(".pantry-qty-overlay");
    if (ov) ov.remove();
    document.body.classList.remove("picking");
  }
  // A minimal, optional amount + unit entry for one pantry staple. Blank or
  // zero clears the recorded amount back to "unquantified" rather than
  // treating it as zero — same rule MCPantry.compare() itself enforces.
  function openPantryQtyEditor(item, onSaved) {
    closePantryQtyEditor();
    var entry = loadPantryQty()[pantryKey(item)];

    var ov = el("div", "picker pantry-qty-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "How much " + item + "?"));
    var close = el("button", "picker-close", "✕");
    close.type = "button";
    close.addEventListener("click", closePantryQtyEditor);
    top.appendChild(close);
    ov.appendChild(top);

    var body = el("div", "picker-results pantry-qty-body");
    var row = el("div", "pantry-qty-row");
    var qtyInp = document.createElement("input");
    qtyInp.type = "number"; qtyInp.step = "any"; qtyInp.min = "0";
    qtyInp.inputMode = "decimal";
    qtyInp.className = "pantry-qty-input";
    qtyInp.placeholder = "Amount";
    qtyInp.setAttribute("aria-label", "Amount of " + item + " you have");
    if (entry) qtyInp.value = entry.qty;
    var unitInp = document.createElement("input");
    unitInp.type = "text";
    unitInp.className = "pantry-qty-unit-input";
    unitInp.placeholder = "Unit (tsp, oz, packet…)";
    unitInp.setAttribute("aria-label", "Unit for the amount of " + item + " you have");
    if (entry && entry.unit) unitInp.value = entry.unit;
    row.appendChild(qtyInp);
    row.appendChild(unitInp);
    body.appendChild(row);
    body.appendChild(el("p", "pantry-qty-hint",
      "Optional — leave blank to just mark it a staple, no amount."));

    var actions = el("div", "pantry-qty-actions");
    var saveBtn = el("button", "pantry-qty-save", "Save");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function () {
      var q = parseFloat(qtyInp.value);
      if (!qtyInp.value.trim() || isNaN(q) || q <= 0) setPantryQty(item, null, null);
      else setPantryQty(item, q, unitInp.value.trim());
      closePantryQtyEditor();
      if (onSaved) onSaved();
    });
    actions.appendChild(saveBtn);
    if (entry) {
      var clearBtn = el("button", "pantry-qty-clear", "Clear amount");
      clearBtn.type = "button";
      clearBtn.addEventListener("click", function () {
        setPantryQty(item, null, null);
        closePantryQtyEditor();
        if (onSaved) onSaved();
      });
      actions.appendChild(clearBtn);
    }
    body.appendChild(actions);
    ov.appendChild(body);

    ov.addEventListener("click", function (e) { if (e.target === ov) closePantryQtyEditor(); });
    document.body.appendChild(ov);
    document.body.classList.add("picking");
    qtyInp.focus();
  }

  function groceryRow(row, checked, opts) {
    opts = opts || {};
    var isDone = checked.has(row.key);
    var el2 = el("div", "check-row grocery-row" + (isDone ? " done" : "") +
      (opts.pantry ? " is-staple" : ""));
    // A pantry-footer row shows what's actually recorded on hand instead of
    // the recipe's needed amount (which isn't the point there); everywhere
    // else the needed amount shows, same as before this slice.
    var haveEntry = opts.pantry ? loadPantryQty()[pantryKey(row.item)] : null;
    var qtyText = haveEntry
      ? "Have " + esc(String(haveEntry.qty)) + (haveEntry.unit ? " " + esc(haveEntry.unit) : "")
      : (row.qty ? esc(row.qty) : "");
    el2.innerHTML =
      '<span class="check-box">' + CHECK_SVG + "</span>" +
      '<span class="grocery-qty">' + qtyText +
        (row.derived ? '<span class="grocery-derived" aria-hidden="true"></span>' : "") + "</span>" +
      '<span class="check-text">' + esc(row.item) +
        (opts.shortfall ? '<span class="grocery-shortfall">' + esc(opts.shortfall) + "</span>" : "") +
      "</span>";
    el2.addEventListener("click", function () {
      var set = loadGroc();
      var nowDone = !set.has(row.key);
      if (nowDone) set.add(row.key); else set.delete(row.key);
      el2.classList.toggle("done", nowDone);
      saveGroc(set);
      collapseGroceryRow(el2, nowDone);
    });
    // A quiet provenance affordance (CI initiative 2): some or all of this
    // quantity came from mc-units.js's curated density table, not straight
    // from an authored amount — "1 medium onion" only becomes a buyable
    // weight by estimating what "medium" weighs. Tapping the underdotted
    // quantity says exactly what was estimated and from what, rather than
    // presenting a derived number as if it were an authored fact. Never a
    // modal — the same lightweight toast every other quiet confirmation in
    // this screen already uses.
    if (row.derived) {
      var qtyEl = el2.querySelector(".grocery-qty");
      qtyEl.classList.add("has-derived");
      qtyEl.setAttribute("tabindex", "0");
      qtyEl.setAttribute("role", "button");
      qtyEl.setAttribute("aria-label", "How this quantity was estimated");
      var showDerived = function (e) {
        e.preventDefault(); e.stopPropagation();
        plannerToast(row.derived.join(" · "));
      };
      qtyEl.addEventListener("click", showDerived);
      qtyEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") showDerived(e);
      });
    }
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
    // Quantity entry (roadmap: "Real Pantry Inventory") — only on a pantry
    // row, staple or short: this is exactly where "how much do you actually
    // have" is worth asking. Stops propagation, same as the pin.
    if (opts.pantry) {
      var qtyBtn = el("button", "grocery-setqty" + (haveEntry ? " has-qty" : ""), "📏");
      qtyBtn.type = "button";
      qtyBtn.setAttribute("aria-label", haveEntry
        ? "Change how much " + row.item + " you have — currently " + haveEntry.qty + (haveEntry.unit ? " " + haveEntry.unit : "")
        : "Record how much " + row.item + " you have");
      qtyBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        openPantryQtyEditor(row.item, refresh);
      });
      el2.appendChild(qtyBtn);
    }
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

    // The merged list is built from every planned meal's ingredients, so it is
    // empty until those recipes' detail shards land. Re-render this pane in
    // place when they do — unlike the search screens there is no typed state
    // to preserve here, so rebuilding the pane is the simplest correct thing.
    if (meals.length && !MCData.allReady()) {
      onDetailReady(function () {
        if (!body.isConnected) return;
        body.innerHTML = "";
        renderGroceryPane(body);
      });
    }

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
          if (pantry.has(pantryKey(row.item))) {
            // Pantry-quantity comparison (roadmap: "Real Pantry Inventory"):
            // a staple with an insufficient recorded amount comes back on the
            // buy list showing what's still needed, instead of being fully
            // suppressed the way the binary toggle always did. No comparable
            // need, no recorded amount, or the amount already covers it —
            // all fall straight through to the original behavior.
            var shortLabel = pantryShortfall(row);
            if (shortLabel) { row._opts = { pantry: true, shortfall: shortLabel }; buy.push(row); return; }
            staples.push(row); return;
          }
          if (groceryRowAllDone(row)) { madeRows.push(row); return; }
          buy.push(row);
        });
        if (buy.length) buyCats.push({ aisle: c.aisle, rows: buy });
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
          '<span class="dot"></span>' + esc(c.aisle) +
          '<span class="grocery-cat-count">' + c.rows.length + "</span>"));
        c.rows.forEach(function (row) { sec.appendChild(groceryRow(row, checked, row._opts)); });
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
        "Tap 🧂 to set aside a staple you always have, or 📏 to say how much — " +
        "short on a staple and it comes right back on the list."));
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
  // Macro-target on-ramp for the recipe picker (roadmap §2.4 stretch — the
  // proposal's own stated v1 scope was recipe.html-only; this is the
  // deferred follow-up). Rough per-slot split of the tracker's real daily
  // goals ("All" scope's 3 named slots — same divisor loadMacroGoals()'s
  // other consumer, msgBudgetFor(), would land on for an even split; a
  // fuller remaining-budget-across-today's-actual-slots computation is
  // exactly the kind of grid/state coupling this file's own header warns
  // against threading into a small, separable seam like pickCard). Returns
  // null whenever there's nothing honest to suggest — no goals, no macro
  // data on this recipe, or a degenerate/nonsensical scale — so a caller
  // never has to special-case "goals exist but this recipe can't use them".
  function pickerMacroSuggestion(r) {
    var goals = loadMacroGoals();
    if (!goals || !window.MCScale) return null;
    var perSlot = { calories: goals.kcal / 3, protein_g: goals.p ? goals.p / 3 : null };
    var solved = MCScale.solveScaleForTarget(r, defaultServingFor(r.recipe_id), perSlot);
    if (!solved || solved.scale == null || !isFinite(solved.scale)) return null;
    if (solved.scale < 0.25 || solved.scale > 8) return null; // not a sane real-world portion
    return solved;
  }
  function pickCard(r, ctx) {
    // A <div>, not a <button>, as of the macro-fit chip below: that chip is
    // a real, separately-tappable control, and a <button> cannot legally
    // contain another <button> (browsers hoist the inner one out of the
    // DOM, breaking its click target). role="button" + tabindex + a
    // keydown handler keep it keyboard-operable exactly like the button it
    // replaces.
    var card = el("div", "rc rc-pick");
    card.setAttribute("role", "button");
    card.tabIndex = 0;
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
    function addAtDefault() {
      addMeal(r.recipe_id, { day: ctx.day || null, slot: ctx.slot || null });
      closePicker();
      refresh();
    }
    card.addEventListener("click", addAtDefault);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addAtDefault(); }
    });
    // Opt-in only — the card body above still adds at the recipe's normal
    // default serving with no behavior change. This chip is a SEPARATE tap
    // target so a cook who doesn't use the macro tracker (no goals set)
    // never sees it, and one who does never has the default add silently
    // switch to a scaled amount underneath them.
    var suggestion = pickerMacroSuggestion(r);
    if (suggestion) {
      var scaleChip = el("button", "rc-macro-fit",
        "🎯 fit your goal · " + (Math.round(suggestion.scale * 10) / 10) + "×");
      scaleChip.type = "button";
      scaleChip.setAttribute("aria-label", "Add " + r.title + " scaled to fit your macro goal");
      scaleChip.addEventListener("click", function (e) {
        e.stopPropagation();
        addMeal(r.recipe_id, { day: ctx.day || null, slot: ctx.slot || null, serving: suggestion.scale });
        closePicker();
        refresh();
      });
      card.appendChild(scaleChip);
    }
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
      var list = searchRecipes(recipes(), q);
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
  /* ══ Plan my week — ONE overlay, three biases (audit C-05) ═════════════
     Replaces openSmartWeek + openBandwidthQuiz. Those were two full-screen
     overlays reached from two sibling buttons, and Smart Week carried its
     own Balanced / Macro-Targeted toggle on top — four entry points, one
     { day, slot, id } grid. Worse, the choice was irreversible in the UI:
     seeing a Balanced week and wondering what the Time Check version looked
     like meant cancelling out and starting from a different button.

     Now the bias is a chip row inside one overlay, so the cook picks it
     AFTER there's a result to compare against. The two overlays also carried
     a near-identical ~60-line day-grid renderer; that's `pwDayBlocks` now.

     Time is a bias like the others, but it needs input first — the day
     buckets — so it shows its quiz inline until the cook has assigned at
     least one day, then flips to the grid with an "Adjust days" way back.
     Assignments still persist in mc-cookbook:timecheck exactly as before. */
  function closePlanWeek() {
    var ov = document.querySelector(".smw-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }

  // Shared day-by-day chip grid, previously duplicated in both overlays.
  // onRegen(day, slot) returns a replacement recipe id (or null).
  function pwDayBlocks(parent, grid, scope, opts) {
    DAYS.forEach(function (day) {
      var entries = grid.filter(function (g) { return g.day === day; });
      if (!entries.length) return;
      var dayBlock = el("div", "plan-day smw-day");
      dayBlock.appendChild(el("div", "plan-day-head", esc(DAY_LONG[day])));
      if (opts.dayNote) {
        var note = opts.dayNote(day);
        if (note) dayBlock.appendChild(el("div", "smw-macro-fit", esc(note)));
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
          var newId = opts.onRegen(day, slot);
          if (!newId) { pop(regen); return; }
          opts.onReplace(day, slot, newId);
        });
        chip.appendChild(regen);
        var rm = el("button", "smw-chip-remove", "×");
        rm.type = "button";
        rm.setAttribute("aria-label", "Remove " + slot + " for " + DAY_LONG[day]);
        rm.addEventListener("click", function () { opts.onRemove(day, slot); });
        chip.appendChild(rm);
        cell.appendChild(chip);
        slotEl.appendChild(cell);
        dayBlock.appendChild(slotEl);
      });
      parent.appendChild(dayBlock);
    });
  }

  function openPlanWeek() {
    closePlanWeek();

    // Macro-Targeted is only ever offered when the cook has real goals set
    // (via the tracker's calculator) — with no goals the chip never renders
    // and nothing changes for a casual user, same gate as before.
    var macroGoals = loadMacroGoals();
    var savedTime  = loadTimeCheck();
    var scopeKey   = "all";
    var mode       = "balanced";           // "balanced" | "macro" | "time"
    var dayBuckets = {};
    DAYS.forEach(function (d) { dayBuckets[d] = savedTime.days[d] || null; });
    // Returning cooks who already answered the quiz land straight on a grid.
    var timePhase  = DAYS.some(function (d) { return !!dayBuckets[d]; }) ? "results" : "quiz";
    var grid  = [];
    var scope = SMART_SCOPES[0];
    // Dismissing the prep-day callout only sticks until the grid is
    // wholesale-regenerated (new scope/bias/Regenerate tap) — a single slot
    // edit shouldn't bring back a suggestion the cook just dismissed.
    var prepDismissed = false;

    function regenerate() {
      var res = (mode === "time")
        ? wkGenerateWeek(scopeKey, "time", { dayBuckets: dayBuckets })
        : wkGenerateWeek(scopeKey, (mode === "macro" && macroGoals) ? "macro" : "balanced");
      grid = res.grid;
      scope = res.scope;
      prepDismissed = false;
    }
    if (mode !== "time" || timePhase === "results") regenerate();

    var ov = el("div", "picker smw-overlay");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "✨ Plan my week"));
    var close = el("button", "picker-close", "Cancel");
    close.type = "button";
    close.addEventListener("click", closePlanWeek);
    top.appendChild(close);
    ov.appendChild(top);

    // Bias chips — the whole point of C-05. Switching one regenerates in
    // place instead of sending the cook back out to a different button.
    var modeBar = el("div", "smw-mode-bar");
    function paintMode() {
      modeBar.innerHTML = "";
      var items = [{ value: "balanced", label: "Balanced" }];
      if (macroGoals) items.push({ value: "macro", label: "Macro" });
      items.push({ value: "time", label: "Time" });
      modeBar.appendChild(segControl("smw-modetoggle", items, mode, function (v) {
        if (v === mode) return;
        mode = v;
        if (mode === "time" && !DAYS.some(function (d) { return !!dayBuckets[d]; })) {
          timePhase = "quiz";           // needs its input before it can generate
        } else {
          if (mode === "time") timePhase = "results";
          regenerate();
        }
        paintMode();
        paint();
      }));
    }
    paintMode();
    ov.appendChild(modeBar);

    var scopeBar = el("div", "smw-scope-bar");
    var scopeSel = el("select", "smw-scope-select");
    scopeSel.setAttribute("aria-label", "Which meals to plan");
    scopeSel.innerHTML = SMART_SCOPES.map(function (s) {
      return '<option value="' + s.key + '">' + esc(s.label) + "</option>";
    }).join("");
    scopeSel.value = scopeKey;
    scopeSel.addEventListener("change", function () {
      scopeKey = scopeSel.value;
      if (!(mode === "time" && timePhase === "quiz")) regenerate();
      paint();
    });
    scopeBar.appendChild(scopeSel);
    var regenAll = el("button", "picker-sort-btn smw-regen-all-btn", "🔀 Regenerate");
    regenAll.type = "button";
    regenAll.addEventListener("click", function () { regenerate(); paint(); });
    scopeBar.appendChild(regenAll);
    ov.appendChild(scopeBar);

    var body = el("div", "picker-results smw-body");
    ov.appendChild(body);

    function slotCount(slot) { return grid.filter(function (g) { return g.slot === slot; }).length; }

    function replaceSlot(day, slot, newId) {
      grid = grid.map(function (g) {
        return (g.day === day && g.slot === slot) ? { day: day, slot: slot, id: newId } : g;
      });
      paint();
    }
    function removeSlot(day, slot) {
      grid = grid.filter(function (g) { return !(g.day === day && g.slot === slot); });
      paint();
    }

    // Time's day-budget quiz, shown inline until at least one day is set.
    function paintTimeQuiz() {
      scopeBar.style.display = "";
      regenAll.style.display = "none";
      body.innerHTML = "";
      body.appendChild(el("p", "bwq-intro",
        "Which days need to move fast, and which have room to breathe? " +
        "We'll build the week around it."));
      DAYS.forEach(function (day) {
        var block = el("div", "tcw-day-block");
        block.appendChild(el("div", "tcw-day-label", esc(DAY_LONG[day])));
        var items = BWQ_BUCKETS.map(function (b) { return { value: b.key, label: b.emoji + " " + b.short }; });
        block.appendChild(segControl("tcw-day-toggle", items, dayBuckets[day], function (v) {
          dayBuckets[day] = v;
          paint();
        }));
        body.appendChild(block);
      });
      var cta = el("button", "cook-start bwq-continue-btn", "Generate my week →");
      cta.type = "button";
      cta.disabled = !DAYS.some(function (d) { return !!dayBuckets[d]; });
      cta.addEventListener("click", function () {
        saveTimeCheck(scopeKey, dayBuckets);
        timePhase = "results";
        regenerate();
        paint();
      });
      body.appendChild(cta);
    }

    function paintGrid() {
      scopeBar.style.display = "";
      regenAll.style.display = "";
      body.innerHTML = "";

      if (mode === "time") {
        var back = el("button", "picker-sort-btn bwq-back-btn", "‹ Adjust days");
        back.type = "button";
        back.addEventListener("click", function () { timePhase = "quiz"; paint(); });
        body.appendChild(back);
      }

      // Macro-trend bias reason (ROADMAP Pillar C fast-follow, folded into
      // roadmap B2) — only in Macro mode, and per that item's own acceptance
      // criterion it must stay visible, never silent.
      if (mode === "macro" && macroGoals) {
        var trend = macroTrendBias(macroGoals);
        if (trend.reason) {
          body.appendChild(el("div", "smw-trend-callout", "📈 " + esc(trend.reason)));
        }
      }

      if (!grid.length) {
        body.appendChild(emptyState("🧊", mode === "time"
          ? "No recipes available yet.<br>Go back and assign at least one day."
          : "No recipes available for this scope yet."));
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

        pwDayBlocks(body, grid, scope, {
          dayNote: function (day) {
            if (!(mode === "macro" && macroGoals)) return null;
            var fitPct = msgDayFitPct(grid, day, macroGoals);
            return fitPct == null ? null : "~" + fitPct + "% of daily protein goal";
          },
          onRegen: function (day, slot) {
            return wkRegenerateSlot(grid, day, slot,
              (mode === "macro" && macroGoals) ? "macro" : (mode === "time" ? "time" : "balanced"),
              { scopeKey: scopeKey, dayBuckets: dayBuckets });
          },
          onReplace: replaceSlot,
          onRemove: removeSlot
        });
      }

      var actions = el("div", "smw-actions");
      var confirm = el("button", "cook-start smw-confirm-btn", "＋ Set Weekly Meal Plan");
      confirm.type = "button";
      confirm.disabled = !grid.length;
      confirm.addEventListener("click", function () {
        commitSmartWeek(grid, scope.slots);
        closePlanWeek();
        plannerState.view = "plan";
        refresh();
        window.scrollTo(0, 0);
      });
      actions.appendChild(confirm);
      body.appendChild(actions);
    }

    function paint() {
      if (mode === "time" && timePhase === "quiz") paintTimeQuiz();
      else paintGrid();
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

  var TIME_CHECK_KEY = "mc-cookbook:timecheck"; // { scopeKey, days: { Mon: "quick", ... }, ts }
  function loadTimeCheck() {
    try {
      var v = JSON.parse(localStorage.getItem(TIME_CHECK_KEY) || "null");
      if (!v || typeof v !== "object") return { scopeKey: "all", days: {}, ts: 0 };
      return { scopeKey: v.scopeKey || "all", days: v.days || {}, ts: v.ts || 0 };
    } catch (e) { return { scopeKey: "all", days: {}, ts: 0 }; }
  }
  // ts (audit C-02): a plain write timestamp — this store now syncs via
  // mc-sync.js's 'replaceByTs' strategy (whole-object last-write-wins). It
  // was the one store C-02 flagged as blocked on a data-shape gap, not a
  // deliberate device-local exclusion like most of the rest of the namespace.
  function saveTimeCheck(scopeKey, dayBuckets) {
    writeStore(TIME_CHECK_KEY, JSON.stringify({ scopeKey: scopeKey, days: dayBuckets, ts: Date.now() }));
  }

  /* Time Check generation lives in WEEK_MODES.time (audit C-04) — it used to
     be a third copy of the generator (tcw*) whose only real contribution was
     the time-bucket pre-filter below, since it already scored with Balanced's
     own smwScoreCandidate. All that survives here is the bucket data and
     BWQ_BUCKETS/bwqTotalTime above; the loop is shared. A bucket with zero
     fits for a slot falls back to the full eligible pool, so a day/slot never
     comes back empty just because the cook's budget was narrow. */


  /* ══ ADD-RECIPE FORM ════════════════════════════════════════════════
     Lives in mc-recipe-form.js (audit C-08) — 232 lines that needed only six
     things from this file, so it was a real seam. Configured in init(). */
  function openRecipeForm() { MCRecipeForm.open(); }

  /* ══ RECIPE CAPTURE — "Paste a link" ═══════════════════════════════════
     FLAGSHIP_COOKBOOK_ROADMAP.md's "Recipe Capture & Import Pipeline,"
     third slice: wires the two pieces built separately in #146 (mc-import.js,
     the parser) and #147 (fetch-recipe-source, the edge function that gets a
     URL's HTML past CORS) into an actual entry point. Home's "Add Recipe"
     module now opens a small chooser instead of going straight to the form.

     Photo/OCR capture (the roadmap's third path) is NOT built here — this
     slice is URL-paste only, same "ship the narrowest version" discipline
     the roadmap's own risk register asks for. The chooser only offers the
     two paths that exist. */

  function openAddRecipeChooser() {
    closePicker();
    closeImportDialog();

    var ov = el("div", "picker rf-chooser");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "Add a Recipe"));
    var cancel = el("button", "picker-close", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", function () { closePicker(); });
    top.appendChild(cancel);
    ov.appendChild(top);

    var body = el("div", "rf-body");
    body.appendChild(homeModule({
      icon: "⌨️", title: "Type it in", accent: "#7D8C77",
      sub: "Build a recipe field by field",
      onTap: function () { openRecipeForm(); }
    }));
    body.appendChild(homeModule({
      icon: "🔗", title: "Paste a link", accent: "#B08D57",
      sub: "Import from a recipe website — review before saving",
      onTap: function () { openImportFromUrl(); }
    }));
    ov.appendChild(body);

    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  function closeImportDialog() {
    var ov = document.querySelector(".import-dialog");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }

  // Cook-friendly text for fetch-recipe-source's error codes (see that
  // file's own header for what each one means) and for mc-import.js coming
  // back empty. Falls back to a generic message for anything unlisted
  // rather than surfacing a raw error code.
  function importErrorMessage(reason) {
    var MAP = {
      not_a_url: "That doesn't look like a valid link.",
      unsupported_protocol: "Only http:// and https:// links are supported.",
      non_standard_port: "That link uses an unusual port and can't be imported.",
      credentials_in_url: "Remove the username/password from that link and try again.",
      blocked_host: "That link points somewhere this app won't fetch from.",
      timeout: "That page took too long to respond. Try again in a moment.",
      fetch_failed: "Couldn't reach that page. Check the link and try again.",
      not_html: "That link isn't a web page this app can read.",
      too_many_redirects: "That link redirected too many times.",
      redirect_without_location: "That link's redirect looked malformed.",
      bad_redirect: "That link's redirect looked malformed.",
      empty_body: "That page came back empty.",
      missing_url: "Enter a link first.",
      invalid_json: "Something went wrong on our end — try again."
    };
    if (MAP[reason]) return MAP[reason];
    if (/^http_\d+$/.test(reason || "")) return "That page returned an error (" + reason.slice(5) + ").";
    return "Couldn't import that link right now. Try again, or type the recipe in by hand.";
  }

  function openImportFromUrl() {
    closePicker();
    closeImportDialog();

    var ov = el("div", "picker import-dialog");
    var top = el("div", "picker-top");
    top.appendChild(el("div", "picker-title", "Paste a link"));
    var cancel = el("button", "picker-close", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", function () { closeImportDialog(); });
    top.appendChild(cancel);
    ov.appendChild(top);

    var body = el("div", "rf-body");
    body.appendChild(el("p", "rf-hint",
      "Paste a link to a recipe page. We'll fetch it and pull out the title, ingredients and steps for you to review — nothing saves until you tap Save on the next screen."));

    var urlInput = rfDialogInput();
    var urlField = el("div", "rf-field");
    urlField.appendChild(el("label", "rf-label", "Recipe link"));
    urlField.appendChild(urlInput);
    body.appendChild(urlField);

    var statusBox = el("div", "rf-error", "");
    body.appendChild(statusBox);

    var go = el("button", "cook-start rf-save", "Import");
    go.type = "button";
    body.appendChild(go);

    ov.appendChild(body);
    document.body.appendChild(ov);
    document.body.classList.add("picking");
    urlInput.focus();

    function setBusy(isBusy, label) {
      go.disabled = isBusy;
      urlInput.disabled = isBusy;
      statusBox.innerHTML = "";
      if (isBusy && label) statusBox.textContent = label;
    }
    function showError(msg) {
      setBusy(false);
      statusBox.textContent = msg;
    }
    function showSignInNeeded() {
      setBusy(false);
      statusBox.textContent = "";
      statusBox.appendChild(el("span", null, "Sign in first to import from a link. "));
      var signInBtn = el("button", "picker-close", "Open sign-in");
      signInBtn.type = "button";
      signInBtn.addEventListener("click", function () {
        closeImportDialog();
        var acctBtn = document.querySelector(".home-account-btn");
        if (acctBtn) acctBtn.click();
      });
      statusBox.appendChild(signInBtn);
    }

    function submit() {
      var raw = urlInput.value.trim();
      if (!/^https?:\/\//i.test(raw)) { showError("Enter a link starting with http:// or https://"); return; }
      if (window.MCNet && MCNet.isOffline()) { showError("You're offline — importing a recipe needs a connection."); return; }
      if (!window.MC_SB || !MC_SB.configured) { showError("Recipe import isn't available right now."); return; }

      setBusy(true, "Checking sign-in…");
      MC_SB.currentUser().then(function (user) {
        if (!user) { showSignInNeeded(); return null; }
        setBusy(true, "Fetching the page…");
        return MC_SB.callFunction("fetch-recipe-source", { url: raw });
      }).then(function (result) {
        if (!result) return; // sign-in prompt already shown
        if (!result.ok) { showError(importErrorMessage(result.error)); return; }
        var parsed = window.MCImport && MCImport.parseFromHTML(result.html, result.finalUrl || raw);
        if (!parsed || !parsed.ok) {
          showError("Couldn't find a recipe on that page. Try a different link, or type it in by hand.");
          return;
        }
        closeImportDialog();
        MCRecipeForm.open(parsed.recipe);
      }).catch(function () {
        showError("Couldn't reach that link right now. Check it and try again.");
      });
    }
    go.addEventListener("click", submit);
    urlInput.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  function rfDialogInput() {
    var i = el("input", "search-box rf-input");
    i.type = "url";
    i.placeholder = "https://example.com/recipe";
    i.setAttribute("inputmode", "url");
    i.setAttribute("autocapitalize", "off");
    i.setAttribute("autocorrect", "off");
    return i;
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
  var SCREENS = ["home", "planner", "recipes", "favorites", "mikes", "tracker"];
  // #categories used to be its own screen; keep the deep link working by
  // routing it to Browse with the dish-type taxonomy selected.
  var SCREEN_ALIASES = { categories: "recipes" };
  var COOKBOOK_SCREENS = ["home", "planner", "categories", "recipes", "favorites", "mikes"];

  function setTab(name) {
    if (SCREEN_ALIASES[name]) {
      if (name === "categories") {                    // legacy deep link
        recipesState.browse = "dish";
        recipesState.category = null;
      }
      name = SCREEN_ALIASES[name];
    }
    if (SCREENS.indexOf(name) < 0) name = "home";
    if (name !== "planner") closePicker();             // never leave the picker open

    SCREENS.forEach(function (t) {
      var sc = $("#screen-" + t);
      if (sc) sc.classList.toggle("active", t === name);
    });

    if (name === "home") renderHome();
    if (name === "planner") renderPlanner();
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
    // Read (and strip) any Web Share Target params FIRST, before anything
    // else in init() runs — setTab() below unconditionally replaces the URL
    // with just location.pathname on its way to "home" (see its own
    // history.replaceState call), which would silently wipe these before a
    // later read ever saw them. Only the actual form-open is deferred to
    // the end of init(), once MCRecipeForm.configure() has wired its hooks.
    var sharedPrefill = readSharedRecipeParams();

    syncOwnerFromUrl();

    // How the shell does the things the shared card can't know about
    // (audit C-07). collection.js configures the same hooks its own way —
    // that difference is the whole reason the card takes hooks instead of
    // being copied.
    MCCards.configure({
      isMikePick: isMikeFav,
      mikesBadge: mikesBadge,
      isOwner: isOwner,
      toggleMikePick: toggleMikeFav,
      // On the Mike's Favorites screen a curation tap re-renders the whole
      // grid, so the card must not then poke at its own (replaced) node.
      onMikePickToggled: function () {
        if (activeScreen() !== "mikes") return false;
        renderMikes();
        return true;
      },
      // Un-hearting on the Favorites screen drops the card out of the list.
      onFavToggled: function (id, on, opts) {
        if (!opts || !opts.fav) return false;
        renderFavorites();
        return true;
      },
      addToPlan: function (r, o) { return addMeal(r.recipe_id, { serving: o && o.serving }); },
      removeFromPlan: removeMeal,
      toast: plannerToast
    });
    // A full quota shouldn't silently swallow a heart (audit C-12).
    MCFav.onWriteFail = warnStorageFull;
    // Nor a hand-typed recipe (C1 — user-recipes.js's persist() had no hook
    // at all until now; mc-recipe-form.js also checks add()'s `saved` flag
    // directly and keeps the form open, so this toast is the belt to that
    // suspenders on any other MCUser.add() caller).
    MCUser.onWriteFail = warnStorageFull;

    // The two modules lifted out of this file by audit C-08. Both take only
    // what they actually need — five readers for the grocery math, four for
    // the recipe form — which is the test that decided what got extracted.
    MCGrocery.configure({
      recipes: recipes,
      recipeById: recipeById,
      planMeals: planMeals,
      loadPantry: loadPantry,
      pantryKey: pantryKey,
      loadPantryQty: loadPantryQty
    });
    MCRecipeForm.configure({
      categoryOrder: function () { return CATEGORY_ORDER; },
      closePicker: closePicker,
      recipes: recipes,
      setTab: setTab
    });
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

    // Timer rail. It rides on the shell too, not just the recipe page, so a
    // countdown started while cooking stays visible when the cook steps back
    // out to the planner or the grocery list mid-recipe.
    MCTimers.onWriteFail = warnStorageFull;
    if (window.MCTimeline) MCTimeline.onWriteFail = warnStorageFull;
    MCTimers.configure({
      onJump: function (t) {
        if (t.recipeId) location.href = "recipe.html?id=" + encodeURIComponent(t.recipeId) + "&cook=1";
      }
    });
    MCTimers.mountRail();

    // Detail shards. Requested AFTER the shell has painted from the index —
    // that ordering is the whole point of initiative 5: first paint now waits
    // on 149 KB instead of the 1.04 MB recipes-data.js used to block on. The
    // shell needs the full corpus eventually (ingredient search, "Use it up",
    // the low-shopping filter, and the planner's grocery merge), just not
    // before it can draw anything.
    MCData.ensureAll().then(function (okAll) {
      if (okAll) fireDetailReady();
    });

    // Day-7 archive check: no background cron exists in a static PWA, so
    // this is evaluated once per app open instead. Deferred a tick so the
    // shell finishes its first paint before an overlay can appear on top.
    setTimeout(function () {
      var p = loadPlan();
      if (shouldPromptDay7(p)) openSaveWeekPrompt();
    }, 0);

    // Web Share Target (runtime-invisibles audit, delight opportunity 1):
    // manifest.json registers this page as a share target, so a recipe link
    // a cook sees in Instagram/Messages/Safari can be shared straight into
    // the app instead of retyped by hand. MCRecipeForm already exists for
    // hand-typed recipes, so sharing just opens it prefilled rather than
    // needing a second, parallel entry path. Deliberately opened a tick
    // after the rest of init() so the shell has already painted — an
    // overlay appearing over a blank screen would look broken. (sharedPrefill
    // itself was read — and the URL cleaned — at the very top of init(),
    // before setTab() could wipe the query string first.)
    if (sharedPrefill) {
      setTimeout(function () { MCRecipeForm.open(sharedPrefill); }, 0);
    }
  }

  // Parses manifest.json's share_target params (see its own entry) and
  // strips them from the URL immediately, so a later reload or Back doesn't
  // re-trigger the share flow. Returns { title, description } or null.
  // Called at the very top of init() — see the comment there for why timing
  // matters here specifically.
  function readSharedRecipeParams() {
    var p = new URLSearchParams(location.search);
    var title = p.get("shared_title") || "";
    var text = p.get("shared_text") || "";
    var url = p.get("shared_url") || "";
    if (!title && !text && !url) return null;

    var clean = new URL(location.href);
    ["shared_title", "shared_text", "shared_url"].forEach(function (k) { clean.searchParams.delete(k); });
    history.replaceState(null, "", clean);

    // A share sheet's "text" is often the source's own caption, not a title
    // a cook would want to keep verbatim — so title wins when both exist,
    // and text (plus the URL, so the source isn't lost) becomes the starting
    // description instead of being discarded.
    var description = [text, url].filter(Boolean).join("\n\n");
    return { title: title, description: description };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

})();
