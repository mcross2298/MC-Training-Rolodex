/* ==========================================================================
   mc-net.js  —  the one shared online/offline signal
   --------------------------------------------------------------------------
   Runtime-invisibles audit (2026-08-31), finding C3. A separate pass
   (C-I3/F-I2) already vendored the Supabase SDK locally and taught the
   account sheet to say "you're offline" instead of a misleading "not
   configured" — and tracker-foodapi.js already flags a network failure
   (`networkError`) separately from a real zero-result food search. What
   neither of those touched, and what was still genuinely missing anywhere
   in the app: a `MCData.ensureDetail()` shard that failed while offline
   (`recipe.html`'s "Couldn't load this recipe's ingredients" message) had no
   way to notice the network came back — the cook had to manually reload.

   This is the one shared listener that closes that gap, for every page that
   loads it: toggles `.offline` on `<html>` (any page's own CSS/JS can read
   it), and the moment the browser reports `online`, retries every detail
   shard that hasn't loaded yet (mc-data.js's own `loadShard()` already
   resets a failed shard's state to idle specifically so "a later call can
   retry" — nothing was ever making that later call) and republishes an
   `mc:datareloaded` DOM event so a page controller can re-render whatever it
   had shown as a load failure, without a manual reload.

   Exposed as window.MCNet = { isOffline(), onChange(fn) }.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCNet) return;

  function apply() {
    document.documentElement.classList.toggle("offline", !navigator.onLine);
  }
  apply();

  var subs = [];
  function onChange(fn) {
    subs.push(fn);
    return function () { subs = subs.filter(function (f) { return f !== fn; }); };
  }

  function emit(isOnline) {
    apply();
    subs.forEach(function (fn) { try { fn(isOnline); } catch (e) {} });
  }

  window.addEventListener("online", function () {
    emit(true);
    // Retry whatever detail shard(s) failed while offline. MCData may not be
    // on every page that loads this file (the quick-tour pages, for
    // instance), and allReady() is only meaningful once it exists.
    if (window.MCData && typeof window.MCData.ensureAll === "function" && !window.MCData.allReady()) {
      window.MCData.ensureAll().then(function (ok) {
        if (ok) document.dispatchEvent(new CustomEvent("mc:datareloaded"));
      });
    }
  });
  window.addEventListener("offline", function () { emit(false); });

  window.MCNet = {
    isOffline: function () { return !navigator.onLine; },
    onChange: onChange
  };
})();
