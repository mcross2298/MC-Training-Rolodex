/* ==========================================================================
   mc-sync.js  —  cross-device sync of the signed-in user's cookbook data
   --------------------------------------------------------------------------
   Trimmed port of 4-Weeks-to-Open-'s mc-sync.js, same mechanism: mirrors a
   whitelist of localStorage stores to the shared Supabase table
     user_sync(user_id, store_key, data jsonb, updated_at, device_id)
   keyed by (user_id, store_key), RLS-isolated per user. A trainee signed in
   here is the same identity as in the workout app, so mc_macros_v1 (the
   tracker) reconciles across both apps instead of living in two places that
   never talk to each other. Phase 1.3 adds the cookbook's own meal-plan,
   macro-history, and user-recipe stores — no workout-app equivalent, so
   these keep their existing mc-cookbook: namespaced keys; only the sync
   mechanism is new. Phase 2.6 adds the cook log (mc-cookbook:cooked) — it
   feeds the weekly planned-vs-cooked adherence stat, so it needs to survive
   a device switch same as everything else adherence is computed from.

   Runs ONLY when a Supabase user is signed in (MC_SB.currentUser()). When
   nobody is signed in, the app stays exactly as it was — local only — and
   this module is a no-op, same as today.

   Cycle: on load → pull (merge server into local) → push (upload changed
   stores). Also pushes on tab-hide / pagehide and on a periodic timer.
   ========================================================================== */
(function () {
  "use strict";
  // Roadmap B5 — Node-side hook so CI can regression-test the real
  // sync-conflict merge functions (same convention as 4-Weeks-to-Open-'s
  // mc-sync.js and mc-suggest.js), instead of a duplicated inline copy that
  // could silently drift from the real logic. Placed before the early-return
  // guards below on purpose: the merge functions are `function` declarations
  // further down this same closure, so they're hoisted and already defined
  // at this point regardless of whether MC_SB ends up configured — see
  // tools/test-mc-sync-merge.js.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mergeMacros: function () { return mergeMacros.apply(null, arguments); },
      mergeArrayByField: function () { return mergeArrayByField.apply(null, arguments); },
      mergePlan: function () { return mergePlan.apply(null, arguments); },
      mergeStringSet: function () { return mergeStringSet.apply(null, arguments); },
      mergeHistoryBySavedAt: function () { return mergeHistoryBySavedAt.apply(null, arguments); },
      mergeCookedByRecipe: function () { return mergeCookedByRecipe.apply(null, arguments); },
      mergeReplaceByTs: function () { return mergeReplaceByTs.apply(null, arguments); },
      mergeMapByTs: function () { return mergeMapByTs.apply(null, arguments); },
      // C2 regression coverage (tools/test-mc-sync-merge.js): pull/push and
      // the snapshot/blocked bookkeeping close over `client`/`user`, which
      // only exist once the MC_SB.configured guard below passes — so unlike
      // the merge fns above, these are only usable from a sandbox that
      // supplies a working fake MC_SB + Supabase client, not the
      // `MC_SB: null` short-circuit the pure merge-function tests use.
      pull: function () { return pull(); },
      push: function () { return push(); },
      _snapshot: function () { return snapshot; },
      _blocked: function () { return blocked; }
    };
  }
  if (window.__mcSync) return;
  window.__mcSync = true;
  if (!window.MC_SB || !MC_SB.configured) return;

  var TABLE = 'user_sync';
  // store_key -> merge strategy.
  var STORES = {
    'mc_macros_v1':                     'macros',
    'mc-cookbook:mealplan':             'plan',
    'mc-cookbook:mealplan:grocery':     'stringSet',
    'mc-cookbook:mealplan:history':     'historyBySavedAt',
    'mc-cookbook:mealplan:custom':      'arrayByUid',
    'mc-cookbook:mealplan:macrohistory': 'arrayByUid',
    'mc-cookbook:userrecipes':          'arrayByRecipeId',
    'mc-cookbook:cooked':               'cookedByRecipe',
    // Audit C-02. Both are JSON arrays of ids written via Array.from(Set),
    // so union is the correct resolution and 'stringSet' — already proven on
    // :mealplan:grocery — applies unchanged. Favorites in particular were the
    // sharpest gap: three screens write them, the storage event wires live
    // cross-tab updates for them, and Home advertises "☁️ Backed up" while
    // they never left the device.
    'mc-cookbook:favorites':            'stringSet',
    'mc-cookbook:pantry':               'stringSet',
    // { scopeKey, days, ts } — days maps a weekday to one bucket string
    // ("quick"/"standard"/"none"), so there is no meaningful per-day union:
    // two devices disagreeing on Monday's bucket isn't two facts to combine,
    // it's one cook re-answering the quiz. Whole-object replace-by-ts (the
    // same rule mergeMacros already uses for its scalar profile/goals half)
    // is the only strategy that makes sense for this shape.
    'mc-cookbook:timecheck':            'replaceByTs',
    // { [pantryKey]: {qty, unit, ts} } — a flat map, not a single scalar
    // object like :timecheck, so whole-object replaceByTs is the wrong
    // shape here: two devices updating DIFFERENT staples' quantities at
    // the same time would have one device's edit silently discard the
    // other's. Per-key replace-by-ts (mapByTs, below) resolves each
    // ingredient's amount independently instead.
    'mc-cookbook:pantryqty':            'mapByTs'
  };
  // Deliberately NOT synced, so the omissions read as decisions:
  //   :photos          user-attached recipe images as data URLs — image data
  //                    has no business in a jsonb row, and the cook-log photos
  //                    it sits alongside are already device-local by design.
  //   :lastBackupAt · :lastScreen · :tourSeen · :cookfont · :owner ·
  //   :mealplan:autodraft-dismissed · :mealplan:recap-dismissed ·
  //   :mikesFavorites:draft · per-recipe :s<n>:<kind> check-offs
  //                    device- or session-local preferences and ephemera.
  //                    Syncing them would push one phone's UI state onto
  //                    another, which is a regression, not a feature.
  // Roadmap B0 (cookbook↔workout bridge) — stores this app CONSUMES read-only
  // from 4-Weeks-to-Open- via the shared user_sync table. PULLED into local
  // localStorage (so mc-bridge.js can read today's workout + the training
  // recap) but NEVER pushed: this app is not their writer, and
  // one-writer-per-store is what keeps the widened whitelist conflict-free.
  // Merge is 'replace' — the owning app (workout) is authoritative. Macro
  // targets aren't here: they live in mc_macros_v1.goals, already shared above.
  var CONSUME = {
    'mc_activity':        'replace',
    'mc_workout_log_v1':  'replace'
  };
  var PUSH_MS = 30000;

  var client = null, user = null;
  var snapshot = {};            // store_key -> JSON string last in sync with server
  // store_key -> true when a pulled merge failed to write locally (a full
  // quota). push() must never upload the un-merged local value over what
  // the server already has for that key — see writeVal()/pullKey() below.
  var blocked = {};
  var pulledChange = false;
  var status = { lastPush: 0, lastPull: 0, signedIn: false };

  function pendingCount() {
    var n = 0;
    Object.keys(STORES).forEach(function (key) {
      var cur = readRaw(key);
      if (cur != null && cur !== snapshot[key]) n++;
    });
    return n;
  }

  function readRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function writeVal(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  function deviceId() {
    try {
      var d = localStorage.getItem('mc_device_id');
      if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('mc_device_id', d); }
      return d;
    } catch (e) { return 'dev'; }
  }
  var DEVICE = deviceId();

  // macros: { ts, profile, goals, days:{ "date":{entries:[{id,ts,...}]} } }.
  // Scalar parts (profile + goals) resolve by the top-level ts (last edit wins);
  // each day's entries union by id, and within an id the greater entry.ts wins.
  function mergeMacros(local, remote) {
    local = local || {}; remote = remote || {};
    var lts = local.ts || 0, rts = remote.ts || 0;
    var newer = rts > lts ? remote : local;
    var out = { v: 1, ts: Math.max(lts, rts), profile: newer.profile, goals: newer.goals, days: {} };
    var ld = local.days || {}, rd = remote.days || {}, dates = {}, d;
    for (d in ld) dates[d] = 1;
    for (d in rd) dates[d] = 1;
    for (d in dates) {
      var le = (ld[d] && ld[d].entries) || [], re = (rd[d] && rd[d].entries) || [];
      var seen = {}, list = [];
      le.concat(re).forEach(function (e) {
        var id = e && e.id;
        if (id == null) { list.push(e); return; }
        if (seen[id] == null) { seen[id] = list.length; list.push(e); }
        else if ((e.ts || 0) > (list[seen[id]].ts || 0)) list[seen[id]] = e;
      });
      out.days[d] = { entries: list };
    }
    return out;
  }

  // Generic union-by-field array merge: append-only stores with no in-place
  // edit path (or where an edit losing to a stale copy on true cross-device
  // conflict is an acceptable v1 tradeoff — same one mc-sync.js documents
  // for macros' sibling stores upstream). First occurrence of a given id wins.
  function mergeArrayByField(local, remote, field) {
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var seen = {}, out = [];
    local.concat(remote).forEach(function (e) {
      var id = e && e[field];
      if (id == null) { out.push(e); return; }
      if (!seen[id]) { seen[id] = 1; out.push(e); }
    });
    return out;
  }

  // mealplan: { meals: [ {uid,...} ] } — merge the meals array by uid.
  function mergePlan(local, remote) {
    local = local || {}; remote = remote || {};
    return { meals: mergeArrayByField(local.meals, remote.meals, 'uid') };
  }

  // grocery: [ "checked merge-key", ... ] — plain string array, union+dedupe.
  function mergeStringSet(local, remote) {
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var seen = {}, out = [];
    local.concat(remote).forEach(function (k) {
      if (k == null || seen[k]) return;
      seen[k] = 1; out.push(k);
    });
    return out;
  }

  // saved week blocks: [ {savedAt,label,meals} ] — archival snapshots, never
  // edited in place once saved, so union by savedAt is exact.
  function mergeHistoryBySavedAt(local, remote) {
    return mergeArrayByField(local, remote, 'savedAt');
  }

  // cook log: { [recipe_id]: [{at,photo}] } — a dict of per-recipe arrays.
  // Legacy entries may be bare ISO strings rather than {at,photo} objects
  // (cookbook-home.js's own readers already handle this defensively); union
  // each recipe's entries by `at`, their only real identity, after
  // normalizing both shapes to the same object form.
  function normalizeCookedEntry(e) {
    return typeof e === 'string' ? { at: e, photo: null } : e;
  }
  function mergeCookedByRecipe(local, remote) {
    local = local || {}; remote = remote || {};
    var out = {}, ids = {}, id;
    for (id in local) ids[id] = 1;
    for (id in remote) ids[id] = 1;
    for (id in ids) {
      var l = (local[id] || []).map(normalizeCookedEntry);
      var r = (remote[id] || []).map(normalizeCookedEntry);
      out[id] = mergeArrayByField(l, r, 'at');
    }
    return out;
  }

  // Whole-object last-write-wins by top-level ts. For a store that's a flat
  // scalar map (no id-keyed list to union field-by-field), this is the only
  // honest merge — see mc-cookbook:timecheck's STORES comment above. A
  // missing ts (pre-migration data) defaults to 0, so any ts'd write wins
  // over it, same as the rest of this file treats an absent value as oldest.
  function mergeReplaceByTs(local, remote) {
    local = local || {}; remote = remote || {};
    return (remote.ts || 0) >= (local.ts || 0) ? remote : local;
  }

  // Per-key last-write-wins on a flat map of {qty, unit, ts} entries — the
  // same rule mergeReplaceByTs applies to a whole object, applied instead
  // to each key independently so two devices editing different staples at
  // once don't clobber each other. A key present on only one side survives
  // as-is (nothing to compare it against). Known, accepted limitation
  // shared with :pantry's own 'stringSet' strategy above: a DELETION (a
  // cook clearing a quantity back to unquantified) doesn't propagate as a
  // removal, only additions/updates merge — same tradeoff already made for
  // that store, not a new one introduced here.
  function mergeMapByTs(local, remote) {
    local = local || {}; remote = remote || {};
    var out = {}, keys = {}, k;
    for (k in local) keys[k] = 1;
    for (k in remote) keys[k] = 1;
    for (k in keys) {
      var l = local[k], r = remote[k];
      if (l == null) { out[k] = r; continue; }
      if (r == null) { out[k] = l; continue; }
      out[k] = (r.ts || 0) >= (l.ts || 0) ? r : l;
    }
    return out;
  }

  function mergeStore(strategy, local, remote) {
    if (strategy === 'macros') return mergeMacros(local, remote);
    if (strategy === 'replaceByTs') return mergeReplaceByTs(local, remote);
    if (strategy === 'mapByTs') return mergeMapByTs(local, remote);
    if (strategy === 'plan') return mergePlan(local, remote);
    if (strategy === 'stringSet') return mergeStringSet(local, remote);
    if (strategy === 'historyBySavedAt') return mergeHistoryBySavedAt(local, remote);
    if (strategy === 'cookedByRecipe') return mergeCookedByRecipe(local, remote);
    if (strategy === 'arrayByUid') return mergeArrayByField(local, remote, 'uid');
    if (strategy === 'arrayByRecipeId') return mergeArrayByField(local, remote, 'recipe_id');
    if (strategy === 'replace') return remote != null ? remote : local; // consumer store: owner is authoritative
    return remote != null ? remote : local;
  }

  // ---- sync cycle ----------------------------------------------------------
  function pull() {
    return client.from(TABLE).select('store_key, data').eq('user_id', user.id)
      .then(function (r) {
        if (r.error) throw r.error;
        var remoteByKey = {};
        (r.data || []).forEach(function (row) { remoteByKey[row.store_key] = row.data; });
        // Owned stores (STORES) are pulled+merged and later pushed; consumed
        // stores (CONSUME) are pulled read-only and never pushed (push() below
        // only ever iterates STORES). Both kinds now have real rendered
        // surfaces (roadmap B2's training-aware Smart Week / Home nudge read
        // the pulled CONSUME data), so a change in either arms the one-shot
        // reload — a fresh sign-in shouldn't need a manual navigation to show
        // cross-app data that just arrived.
        function pullKey(key, strategy) {
          var local = parse(readRaw(key));
          var remote = remoteByKey[key];
          var before = readRaw(key);
          if (remote != null) {
            if (writeVal(key, mergeStore(strategy, local, remote))) {
              snapshot[key] = JSON.stringify(remote);
              blocked[key] = false;
            } else {
              // The merge never reached disk (full quota). Leaving snapshot
              // alone — instead of advancing it to the remote value, as if
              // the write had landed — and marking the key blocked stops
              // push() below from later uploading the STALE, un-merged
              // local value over what the server already has: that upload
              // is what used to silently clobber a good remote merge.
              blocked[key] = true;
            }
          } else {
            snapshot[key] = null;
          }
          if (readRaw(key) !== before) pulledChange = true;
        }
        Object.keys(STORES).forEach(function (key) { pullKey(key, STORES[key]); });
        Object.keys(CONSUME).forEach(function (key) { pullKey(key, CONSUME[key]); });
        status.lastPull = Date.now();
      });
  }

  function push() {
    var ops = [];
    Object.keys(STORES).forEach(function (key) {
      // A blocked key's last pulled merge never made it to disk — the local
      // value on this device is stale relative to what the server already
      // has, so pushing it now would silently overwrite the good remote
      // data with an older one. Stays blocked until a future pull() writes
      // successfully and clears it.
      if (blocked[key]) return;
      var cur = readRaw(key);
      if (cur == null) return;
      if (cur === snapshot[key]) return;
      var data = parse(cur);
      if (data == null) return;
      ops.push(client.from(TABLE).upsert({
        user_id: user.id, store_key: key, data: data,
        updated_at: new Date().toISOString(), device_id: DEVICE
      }, { onConflict: 'user_id,store_key' }).then(function (r) {
        if (!r.error) { snapshot[key] = cur; status.lastPush = Date.now(); }
      }));
    });
    return ops.length ? Promise.all(ops) : Promise.resolve();
  }

  // a fresh device pulls data the already-rendered page can't show; reload once
  function maybeReload() {
    if (!pulledChange) return;
    try {
      if (sessionStorage.getItem('mc_sync_reloaded') === '1') return;
      sessionStorage.setItem('mc_sync_reloaded', '1');
      location.reload();
    } catch (e) {}
  }

  // Web Locks (runtime-invisibles audit, delight opportunity 3): with two
  // tabs open on the same device, each ran its own pull() on load and its
  // own setInterval(flush) — interleaved merges, and two upserts racing for
  // the same store_key. `ifAvailable: true` means a tab that loses the race
  // just skips that one cycle rather than queuing behind the other tab (the
  // periodic timer covers it 30s later regardless, and the tab that's
  // actually running the cycle already covers the same data). Falls straight
  // through to running unlocked wherever the Locks API doesn't exist.
  function withSyncLock(fn) {
    if (typeof navigator === 'undefined' || !(navigator.locks && navigator.locks.request)) return fn();
    return navigator.locks.request('mc-cookbook-sync', { ifAvailable: true }, function (lock) {
      return lock ? fn() : null;
    });
  }

  function start() {
    withSyncLock(function () {
      return pull().then(function () { maybeReload(); return push(); });
    }).catch(function () {});
    var flush = function () { withSyncLock(push).catch(function () {}); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
    setInterval(flush, PUSH_MS);
  }

  // public hook for manual triggering: kick() starts syncing after a
  // mid-session sign-in (from the account sheet) without a page reload.
  window.MC_SYNC = {
    pull: function () { return pull(); },
    push: function () { return push(); },
    status: function () {
      return { lastPush: status.lastPush, lastPull: status.lastPull,
               pending: pendingCount(), signedIn: !!user };
    },
    kick: function () {
      if (user || !client) return;
      MC_SB.currentUser().then(function (u) { if (u) { user = u; start(); } }).catch(function () {});
    }
  };

  MC_SB.ready
    .then(function (c) { if (!c) return null; client = c; return MC_SB.currentUser(); })
    .then(function (u) { if (u && client) { user = u; start(); } })
    .catch(function () {});
})();
