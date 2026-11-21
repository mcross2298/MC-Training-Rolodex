/* ==========================================================================
   mc-setlog.js  —  per-item add/remove states for the three set-shaped stores
   --------------------------------------------------------------------------
   Re-audit critical gap #01. `mc-cookbook:favorites`, `mc-cookbook:pantry`
   and `mc-cookbook:mealplan:grocery` are all plain `Array.from(Set)` id
   lists synced by mc-sync.js's `stringSet` strategy, which is a pure UNION.
   Union is the right merge for additions and the WRONG one for removals:
   measured directly against the real merge function, un-checking a grocery
   row on the phone (local `["eggs"]`, remote `["milk","eggs"]`) merges back
   to `["eggs","milk"]` — milk returns to the cart. Same for un-favouriting a
   recipe and for removing a pantry staple. The information is destroyed in
   the store itself before sync ever runs, so no retry or reconnect recovers
   it, and the app's own summary meanwhile promises favourites and pantry
   "follow you across devices".

   The fix is a per-item last-write-wins register — the standard resolution
   for a set that needs removals to propagate — stored as a SEPARATE,
   SPARSE COMPANION rather than a change to those three stores' own shape.
   That is the same call `mc-cookbook:pantryqty` made against
   `mc-cookbook:pantry` and for the same measured reason: the array shape is
   read by MCFav.load(), loadPantry(), loadGroc(), pantryMatchInfo(),
   pantryCandidates(), the low-shopping filter, the grocery-row suppression,
   mc-grocery.js's configure() hooks and mc-export.js, and every one of them
   keeps working untouched. An id with no entry here behaves in every
   existing code path exactly as it always has.

   ── Shape ────────────────────────────────────────────────────────────────
   mc-cookbook:setlog → { "<kind>:<id>": { on: 0|1, ts: epochMs } }

     kind   "fav" | "pan" | "gro"   (KINDS below — the three set stores)
     on     1 = added, 0 = removed  (a real state, NOT a bare tombstone)
     ts     when this device last changed that item

   `on:1` is not redundant bookkeeping and dropping it breaks the store: a
   bare tombstone map has no way to express "removed, then added back", so
   the stale `on:0` would strip the item again the moment it was re-added.
   Recording both states makes the entry an ordinary LWW register that
   converges under mc-sync.js's existing `mapByTs` strategy — per-key,
   newest-ts-wins, already shipped and already tested. No new merge function.

   ── How it is written ────────────────────────────────────────────────────
   By DIFFING, at each store's single save() choke point, rather than at
   every call site that adds or removes something. mc-fav.js's save(),
   cookbook-home.js's savePantry() and saveGroc() each take a whole Set, so
   a caller-side hook would have to be threaded through every toggle, every
   bulk clear and anything added later; diffing the set actually written
   against the one already on disk catches all of them, including callers
   that don't know this file exists. Cost is one extra localStorage read per
   save, at user-gesture frequency.

   Only CHANGED ids get an entry, so the log stays sparse: it is a record of
   edits, not a mirror of the three stores.

   ── Known limits, both deliberate ────────────────────────────────────────
   - `prune()` drops entries older than PRUNE_DAYS. A device that has been
     offline longer than that, still holding an id another device removed,
     will resurrect it — the old behaviour, but now bounded to a 90-day
     window instead of being permanent and unconditional.
   - Two devices changing the SAME id in the same millisecond resolve by
     mergeMapByTs's `>=` tiebreak, which favours whichever copy arrives as
     `remote`, so the two can disagree. Inherited from the existing strategy
     (`:pantryqty` has always shared it), not introduced here.

   Exposed as window.MCSetLog. Also exports its pure helpers under Node for
   tools/test-mc-setlog.js, same convention as mc-sync.js.
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "mc-cookbook:setlog";

  // Which set store each kind belongs to. mc-sync.js reads this to know what
  // to reconcile, so the mapping lives here with the shape it describes
  // rather than being spelled out a second time over there.
  var KINDS = {
    fav: "mc-cookbook:favorites",
    pan: "mc-cookbook:pantry",
    gro: "mc-cookbook:mealplan:grocery"
  };

  var PRUNE_DAYS  = 90;
  var PRUNE_MS    = PRUNE_DAYS * 86400000;
  var MAX_ENTRIES = 2000;

  /* ── Pure helpers (no storage) ──────────────────────────────────────── */

  function entryKey(kind, id) { return kind + ":" + id; }

  // Set | Array | null → Array. The three stores all hand their save()
  // a Set, but loadGroc()/loadPantry() callers occasionally pass arrays.
  function idList(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (typeof Set !== "undefined" && v instanceof Set) return Array.from(v);
    if (typeof v.forEach === "function") { var out = []; v.forEach(function (x) { out.push(x); }); return out; }
    return [];
  }

  // The edits between two versions of one store, as log entries. Unchanged
  // ids produce nothing — this is a record of changes, not a snapshot.
  function diff(kind, before, after, now) {
    now = now == null ? Date.now() : now;
    var b = {}, a = {}, out = {};
    idList(before).forEach(function (id) { b[id] = 1; });
    idList(after).forEach(function (id) { a[id] = 1; });
    Object.keys(a).forEach(function (id) {
      if (!b[id]) out[entryKey(kind, id)] = { on: 1, ts: now };
    });
    Object.keys(b).forEach(function (id) {
      if (!a[id]) out[entryKey(kind, id)] = { on: 0, ts: now };
    });
    return out;
  }

  // Drop entries this device no longer needs to carry: anything past the
  // prune horizon, then oldest-first if the log is still over the cap.
  // Returns a new object; never mutates the input.
  function prune(log, now) {
    now = now == null ? Date.now() : now;
    var keys = Object.keys(log || {}).filter(function (k) {
      var e = log[k];
      return e && typeof e === "object" && (now - (e.ts || 0)) < PRUNE_MS;
    });
    if (keys.length > MAX_ENTRIES) {
      keys.sort(function (x, y) { return (log[y].ts || 0) - (log[x].ts || 0); });
      keys = keys.slice(0, MAX_ENTRIES);
    }
    var out = {};
    keys.forEach(function (k) { out[k] = log[k]; });
    return out;
  }

  // The reconciliation itself: an id the log says is OFF is dropped from the
  // merged array. Order is preserved for everything that stays, so a store
  // with no removals to apply comes back identical (and mc-sync.js's
  // "did anything change" check stays meaningful).
  function applyRemovals(log, kind, ids) {
    log = log || {};
    return idList(ids).filter(function (id) {
      var e = log[entryKey(kind, id)];
      return !(e && e.on === 0);
    });
  }

  /* ── Node hook — before the window guard, same as mc-sync.js ─────────── */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      KEY: KEY, KINDS: KINDS,
      PRUNE_DAYS: PRUNE_DAYS, MAX_ENTRIES: MAX_ENTRIES,
      entryKey: entryKey, idList: idList,
      diff: diff, prune: prune, applyRemovals: applyRemovals
    };
  }

  if (typeof window === "undefined" || window.MCSetLog) return;

  /* ── Storage ────────────────────────────────────────────────────────── */

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "{}");
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }

  function save(log) {
    try {
      localStorage.setItem(KEY, JSON.stringify(log));
      return true;
    } catch (e) {
      // Same contract as MCFav.onWriteFail (audit C-12): swallowing a full
      // quota is correct, swallowing it silently is not. A host that hasn't
      // wired the hook behaves exactly as before.
      if (typeof window.MCSetLog.onWriteFail === "function") {
        try { window.MCSetLog.onWriteFail(e); } catch (e2) {}
      }
      return false;
    }
  }

  // The one call a store's save() makes. Deliberately a no-op when nothing
  // changed, so re-saving an unchanged set costs a read and no write.
  function record(kind, before, after, now) {
    var edits = diff(kind, before, after, now);
    var ks = Object.keys(edits);
    if (!ks.length) return false;
    var log = load();
    ks.forEach(function (k) { log[k] = edits[k]; });
    return save(prune(log, now));
  }

  window.MCSetLog = {
    KEY: KEY,
    KINDS: KINDS,
    PRUNE_DAYS: PRUNE_DAYS,
    MAX_ENTRIES: MAX_ENTRIES,
    entryKey: entryKey,
    load: load,
    save: save,
    diff: diff,
    prune: prune,
    applyRemovals: applyRemovals,
    record: record,
    onWriteFail: null
  };
})();
