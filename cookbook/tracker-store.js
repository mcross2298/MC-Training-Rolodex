/* ==========================================================================
   tracker-store.js — Mike's Cookbook macro tracker · storage + helpers
   --------------------------------------------------------------------------
   The standalone (no-login, offline) data layer for the cookbook's own macro
   tracker. Shared by the Tracker screen (tracker.js) and the recipe-page "Log
   to tracker" button (tracker-recipe.js), so both write the same store.

   localStorage, in the cookbook's namespace:

     mc-cookbook:tracker:v1 = {
       v: 1,
       ts: <ms>,                       // bumped when profile/goals change
       profile: { sex, age, heightCm, weightLb, activity, goal },
       goals:   { kcal, p, f, c },     // per-day targets
       days: { "YYYY-MM-DD": { entries: [
         { id, ts, at, name, source, unit, qty, per:{kcal,p,f,c} }
       ] } }
     }

   `at` is the slot time (ms) a food sits at on the hourly timeline.

   Phase 1.2: this is now the SAME store the workout app uses (mc_macros_v1),
   so a signed-in trainee's tracker data reconciles across both apps via
   mc-sync.js. Signed out, it's still purely device-local — nothing changes
   for a cook who never logs in. A one-time migration copies any data left
   under the old cookbook-only key (mc-cookbook:tracker:v1) the first time
   this file runs post-upgrade, so nobody's existing log is stranded by the
   key rename. Exposed as window.MCTrackerStore.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCTrackerStore) return;

  var KEY = "mc_macros_v1";
  var OLD_KEY = "mc-cookbook:tracker:v1";

  (function migrateOldKey() {
    try {
      if (localStorage.getItem(KEY) != null) return;          // already migrated / fresh install
      var old = localStorage.getItem(OLD_KEY);
      if (old == null) return;                                 // nothing to migrate
      localStorage.setItem(KEY, old);
      localStorage.removeItem(OLD_KEY);
    } catch (e) {}
  })();

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }
  function pad(n) { return String(n).padStart(2, "0"); }

  // ---- dates ---------------------------------------------------------------
  function keyFromDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dateFromKey(k) { var p = String(k).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return keyFromDate(new Date()); }
  function addDays(k, n) { var d = dateFromKey(k); d.setDate(d.getDate() + n); return keyFromDate(d); }
  function mondayOf(k) { var d = dateFromKey(k); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return keyFromDate(d); }
  function hourLabel(h) { var ap = h < 12 ? "AM" : "PM"; var hh = h % 12; if (hh === 0) hh = 12; return hh + " " + ap; }
  function timeLabel(ms) { var d = new Date(ms); var h = d.getHours(); var ap = h < 12 ? "AM" : "PM"; var hh = h % 12; if (hh === 0) hh = 12; return hh + ":" + pad(d.getMinutes()) + " " + ap; }
  function prettyDay(k) {
    if (k === todayKey()) return "Today";
    return dateFromKey(k).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  // ---- store ---------------------------------------------------------------
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; }
    catch (e) { return {}; }
  }
  function write(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function getDay(obj, key) {
    obj.days = obj.days || {};
    if (!obj.days[key]) obj.days[key] = { entries: [] };
    if (!Array.isArray(obj.days[key].entries)) obj.days[key].entries = [];
    return obj.days[key];
  }
  function totalsOf(entries) {
    var t = { kcal: 0, p: 0, f: 0, c: 0 };
    (entries || []).forEach(function (e) {
      var q = num(e.qty, 1), per = e.per || {};
      t.kcal += num(per.kcal) * q; t.p += num(per.p) * q; t.f += num(per.f) * q; t.c += num(per.c) * q;
    });
    t.kcal = Math.round(t.kcal); t.p = Math.round(t.p); t.f = Math.round(t.f); t.c = Math.round(t.c);
    return t;
  }

  function getGoals() { return read().goals || null; }
  function getProfile() { return read().profile || {}; }
  function saveGoals(profile, goals) {
    var obj = read();
    obj.v = 1; obj.ts = Date.now();
    if (profile) obj.profile = profile;
    obj.goals = goals;
    write(obj);
  }

  // weight pre-fill from the cookbook (no bodyweight log here, but keep the
  // hook symmetrical with the workout app — returns 0 when unknown).
  function latestWeightLb() { return 0; }

  // ---- add / edit / remove -------------------------------------------------
  // `slotMs` decides the day bucket + the timeline hour. Returns the new entry.
  function addEntry(entry, slotMs) {
    var slot = (typeof slotMs === "number") ? slotMs : Date.now();
    var dk = keyFromDate(new Date(slot));
    var obj = read(), day = getDay(obj, dk);
    entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    entry.ts = Date.now();
    entry.at = slot;
    day.entries.push(entry);
    write(obj);
    return entry;
  }
  function updateQty(dayKey, id, qty) {
    var obj = read(), d = getDay(obj, dayKey);
    d.entries.forEach(function (e) { if (e.id === id) { e.qty = qty; e.ts = Date.now(); } });
    write(obj);
  }
  function removeEntry(dayKey, id) {
    var obj = read(), d = getDay(obj, dayKey);
    d.entries = d.entries.filter(function (e) { return e.id !== id; });
    write(obj);
  }
  function entriesFor(dayKey) { return getDay(read(), dayKey).entries; }

  window.MCTrackerStore = {
    KEY: KEY,
    num: num,
    read: read, write: write, getDay: getDay,
    keyFromDate: keyFromDate, dateFromKey: dateFromKey, todayKey: todayKey,
    addDays: addDays, mondayOf: mondayOf, hourLabel: hourLabel, timeLabel: timeLabel, prettyDay: prettyDay,
    totalsOf: totalsOf, entriesFor: entriesFor,
    getGoals: getGoals, getProfile: getProfile, saveGoals: saveGoals, latestWeightLb: latestWeightLb,
    addEntry: addEntry, updateQty: updateQty, removeEntry: removeEntry
  };
})();
