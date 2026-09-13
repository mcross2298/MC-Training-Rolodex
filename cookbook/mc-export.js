/* ==========================================================================
   mc-export.js  —  the app's ONE manual backup: export/import all cookbook
                    data as a JSON file
   --------------------------------------------------------------------------
   Phase 1.3 durability: signing in (mc-account.js/mc-sync.js) is the primary
   safety net against "one browser wipe loses everything," but accounts are
   invite-only, so most cooks stay signed out. This gives them a manual way
   out — a JSON file they can save anywhere and restore from, no account
   needed.

   Exports every localStorage key that's this app's data: the mc-cookbook:
   namespace (favorites, meal plan + history + custom items + macro history,
   user recipes, pantry, cook log + photos, per-recipe check-off state) plus
   mc_macros_v1 (the tracker — deliberately unprefixed since Phase 1.2, see
   tracker-store.js). A prefix scan rather than a hardcoded key list, so a
   future mc-cookbook: store is captured automatically. The workout app's
   CONSUME-only stores (mc_activity, mc_workout_log_v1) match neither pattern
   and so are never exported or imported — this app is not their writer, and
   one-writer-per-store has to hold through a manual backup round-trip too
   (roadmap B5).

   ── Format (v2) ──────────────────────────────────────────────────────────
   { app:"mikes-cookbook", version:2, exportedAt:ISO, data:{ key: rawString } }

   Values are the RAW localStorage strings, byte for byte. This matters:
   localStorage only ever holds strings, and not all of this app's stores hold
   *JSON* strings — mc-cookbook:lastBackupAt is a bare ISO timestamp,
   :mealplan:recap-dismissed is a bare week key, :cookfont and :owner are bare
   scalars. An exporter that JSON.parse-es on the way out and JSON.stringify-es
   on the way back in silently rewrites those (an ISO string returns wrapped in
   quotes) and double-encodes the JSON ones (an array returns as a string that
   merely looks like an array). Copying the raw string is the only round trip
   that is correct for every store, so that is what this does.

   ── Compatibility (audit C-01) ───────────────────────────────────────────
   Until this consolidation the app shipped TWO backup implementations, both
   reachable from Home, both writing a file named
   mikes-cookbook-backup-<date>.json stamped app:"mikes-cookbook", in mutually
   unreadable formats. All legacy shapes are accepted here so that no backup
   already sitting on a cook's phone is orphaned:

     version 2   (this module, current)   values are raw strings
     version 1   (old cookbook-home.js)   values are raw strings — same shape,
                                          narrower key set (no mc_macros_v1)
     no version  (old mc-export.js)       values are JSON.parse-ed, i.e. real
                                          objects/arrays/numbers, except where
                                          that parse failed and left a string

   v1 and v2 are byte-compatible on read, which is why v1 files restore
   exactly. The unversioned legacy shape is reconstructed per value by type.

   Exposed as window.MCExport = { exportJSON(), importJSON(file),
   buildPayload(), restorePayload() }. The last two are pure and are what
   tools/test-mc-export.js asserts against.
   ========================================================================== */
(function () {
  "use strict";

  // Declared before the guards below, not after: the exported functions read
  // FORMAT, and in Node the window guard returns early, so a `var FORMAT = 2`
  // sitting below it would stay hoisted-but-unassigned and every version
  // check would silently compare against undefined. Constants first, then the
  // Node hook, then the browser guards.
  var FORMAT     = 2;
  var BACKUP_KEY = 'mc-cookbook:lastBackupAt';

  // Node-side hook so CI can regression-test the real format logic rather
  // than a duplicated copy (same convention as mc-sync.js, roadmap B5).
  // Placed before the window guard on purpose: the functions it references
  // are hoisted `function` declarations further down this same closure, so
  // they are defined here regardless of how the guard resolves.
  // See tools/test-mc-export.js.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildPayload:   function () { return buildPayload.apply(null, arguments); },
      restorePayload: function () { return restorePayload.apply(null, arguments); },
      isOwnKey:       function () { return isOwnKey.apply(null, arguments); },
      FORMAT: FORMAT
    };
  }

  if (typeof window === 'undefined') return;
  if (window.MCExport) return;

  // The two key patterns this app owns. Anything else in localStorage —
  // notably the workout app's mc_activity / mc_workout_log_v1, which this app
  // only ever consumes read-only — is not ours to export or restore.
  function isOwnKey(k) {
    return k === 'mc_macros_v1' || String(k).indexOf('mc-cookbook:') === 0;
  }

  function ownKeys(store) {
    var out = [];
    for (var i = 0; i < store.length; i++) {
      var k = store.key(i);
      if (k && isOwnKey(k)) out.push(k);
    }
    return out;
  }

  /* ── Export ─────────────────────────────────────────────────────────── */

  // Pure: build the file payload from a Storage-like object. Raw strings only.
  function buildPayload(store) {
    var data = {};
    ownKeys(store).forEach(function (k) { data[k] = store.getItem(k); });
    return {
      app: 'mikes-cookbook',
      version: FORMAT,
      exportedAt: new Date().toISOString(),
      data: data
    };
  }

  function stamp(d) {
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function exportJSON() {
    var payload = buildPayload(localStorage);
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mikes-cookbook-backup-' + stamp(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    // Feeds Home's "Last backup: …" line and the stale-backup nudge banner.
    try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch (e) {}
  }

  /* ── Import ─────────────────────────────────────────────────────────── */

  // Turn one exported value back into the raw string localStorage should hold.
  // v1/v2 already stored the raw string; the unversioned legacy shape stored
  // whatever JSON.parse produced, so it has to be re-serialized — except where
  // that parse failed back then and left the original string, which must be
  // written through untouched.
  function rawValueFor(value, versioned) {
    if (versioned) return String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  // Pure: validate a parsed payload and apply it to a Storage-like object.
  // Returns { ok, restored, message }. Never throws on bad input, and never
  // writes anything when validation fails — a malformed file cannot half-apply.
  function restorePayload(payload, store) {
    var data = payload && payload.data;
    if (!payload || typeof data !== 'object' || data === null || Array.isArray(data)) {
      return { ok: false, restored: 0,
               message: "This doesn't look like a Mike's Cookbook backup file." };
    }
    var version = typeof payload.version === 'number' ? payload.version : 0;
    if (version > FORMAT) {
      return { ok: false, restored: 0,
               message: 'This backup was made by a newer version of the app. Update the app, then import again.' };
    }
    var versioned = version >= 1;            // v1 and v2 both hold raw strings
    var keys = Object.keys(data).filter(isOwnKey);
    if (!keys.length) {
      return { ok: false, restored: 0, message: 'That backup file has no cookbook data in it.' };
    }

    // A v2 file is a complete picture of this app's storage, so restoring one
    // is a true replace: clear our keys first, then write. Older files are
    // partial by construction (v1 predates the tracker being included), so they
    // only overwrite the keys they actually carry — clearing everything for a
    // v1 file would wipe a tracker that file has no way to restore.
    try {
      if (version >= FORMAT) {
        ownKeys(store).forEach(function (k) { store.removeItem(k); });
      }
      keys.forEach(function (k) { store.setItem(k, rawValueFor(data[k], versioned)); });
    } catch (e) {
      return { ok: false, restored: 0,
               message: "Couldn't restore — your device storage may be full." };
    }
    return { ok: true, restored: keys.length, message: null };
  }

  // Reads the file, then applies it. Resolves with restorePayload's result on
  // success; rejects with an Error carrying a cook-readable message otherwise.
  // The caller reloads the page to pick up restored state everywhere.
  function importJSON(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Couldn't read that file.")); };
      reader.onload = function () {
        var payload;
        try { payload = JSON.parse(reader.result); }
        catch (e) { reject(new Error("That file isn't valid JSON.")); return; }
        var res = restorePayload(payload, localStorage);
        if (!res.ok) { reject(new Error(res.message)); return; }
        resolve(res);
      };
      reader.readAsText(file);
    });
  }

  window.MCExport = {
    exportJSON: exportJSON,
    importJSON: importJSON,
    buildPayload: buildPayload,
    restorePayload: restorePayload,
    FORMAT: FORMAT
  };
})();
