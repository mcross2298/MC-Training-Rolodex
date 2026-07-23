/* ==========================================================================
   mc-export.js  —  logged-out backup: export/import all cookbook data as JSON
   --------------------------------------------------------------------------
   Phase 1.3 durability: signing in (mc-account.js/mc-sync.js) is the primary
   safety net against "one browser wipe loses everything," but accounts are
   invite-only, so most cooks stay signed out. This gives them a manual way
   out — a JSON file they can save anywhere and restore from, no account
   needed.

   Exports every localStorage key that's this app's data: the mc-cookbook:
   namespace (favorites, meal plan + history + custom items + macro history,
   user recipes, per-recipe check-off state) plus mc_macros_v1 (the tracker —
   deliberately unprefixed since Phase 1.2, see tracker-store.js). A prefix
   scan rather than a hardcoded key list, so a future mc-cookbook: store is
   captured automatically.

   Exposed as window.MCExport = { exportJSON(), importJSON(file) }.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCExport) return;

  function ownKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k === 'mc_macros_v1' || k.indexOf('mc-cookbook:') === 0) out.push(k);
    }
    return out;
  }

  function exportJSON() {
    var data = {};
    ownKeys().forEach(function (k) {
      try { data[k] = JSON.parse(localStorage.getItem(k)); }
      catch (e) { data[k] = localStorage.getItem(k); }
    });
    var payload = { app: 'mikes-cookbook', exportedAt: new Date().toISOString(), data: data };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mikes-cookbook-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Resolves once the file is read and localStorage is written; caller
  // reloads the page to pick up the restored state everywhere.
  function importJSON(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the file.')); };
      reader.onload = function () {
        var payload;
        try { payload = JSON.parse(reader.result); }
        catch (e) { reject(new Error('Not a valid backup file.')); return; }
        var data = payload && payload.data;
        if (!data || typeof data !== 'object') { reject(new Error('Not a valid backup file.')); return; }
        Object.keys(data).forEach(function (k) {
          if (k !== 'mc_macros_v1' && k.indexOf('mc-cookbook:') !== 0) return;   // ignore unrelated keys
          try { localStorage.setItem(k, JSON.stringify(data[k])); } catch (e) {}
        });
        resolve();
      };
      reader.readAsText(file);
    });
  }

  window.MCExport = { exportJSON: exportJSON, importJSON: importJSON };
})();
