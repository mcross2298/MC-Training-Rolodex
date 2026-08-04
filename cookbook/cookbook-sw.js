/* ==========================================================================
   cookbook-sw.js  —  Phase 9 (offline level-up)
   --------------------------------------------------------------------------
   Shared service-worker registration + lightweight toasts, included on every
   page (replaces the per-page inline registration snippets).

     • First install  → "Ready to use offline" confirmation (auto-dismiss).
     • New version     → "Update available · Refresh" toast. Tapping Refresh
                         tells the waiting worker to activate, then reloads once
                         it takes control.

   Controlled-update flow: sw.js no longer skipWaiting()s on install, so a new
   version waits until the user opts in here. No framework, no build step.
   ========================================================================== */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  function toast(msg, actionLabel, onAction) {
    var t = document.createElement("div");
    t.className = "sw-toast";
    var span = document.createElement("span");
    span.className = "sw-toast-msg";
    span.textContent = msg;
    t.appendChild(span);
    if (actionLabel) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sw-toast-btn";
      btn.textContent = actionLabel;
      btn.addEventListener("click", onAction);
      t.appendChild(btn);
    }
    (document.body || document.documentElement).appendChild(t);
    // Next frame so the entrance transition runs.
    requestAnimationFrame(function () { t.classList.add("show"); });
    return t;
  }
  function dismiss(t) {
    if (!t) return;
    t.classList.remove("show");
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }

  window.addEventListener("load", function () {
    // No controller on the very first visit; used to tell first-install from update.
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;

    navigator.serviceWorker.register("sw.js").then(function (reg) {
      reg.addEventListener("updatefound", function () {
        var installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", function () {
          // Installed while a controller exists → an update is ready. The new
          // worker self-activates (skipWaiting), so we just flash a brief
          // notice; controllerchange below reloads the page onto the new code.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            var t = toast("Updating…");
            setTimeout(function () { dismiss(t); }, 2500);
          }
        });
      });
    }).catch(function () { /* offline / unsupported — silent */ });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) {
        // First install completed — the app is now fully cached for offline use.
        hadController = true;
        var t = toast("Ready to use offline 🟢");
        setTimeout(function () { dismiss(t); }, 3200);
        return;
      }
      // An accepted update took control — reload once to pick it up.
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
})();
