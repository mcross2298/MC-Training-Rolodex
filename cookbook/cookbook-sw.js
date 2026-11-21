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

    // A deploy landing while a cook is mid-recipe (cookbook.js's Cooking
    // Mode, body.cooking) would otherwise reload the page out from under
    // them — wake lock released, voice control stopped, dropped back on the
    // Overview tab with wet hands. Cooking Mode is the one state on this
    // page worth protecting; everything else (a scroll position, an open
    // menu) is fine to lose to an update reload same as before. Deferred
    // reloads flush on the next visibilitychange, by which point Cooking
    // Mode's own exitCook() has already cleared the class if the cook left.
    var reloadPending = false;
    function shouldDeferReload() {
      return document.body && document.body.classList.contains("cooking");
    }
    function reloadNow() {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
    // "mc:cookingchange" is dispatched by cookbook.js's enterCook()/
    // exitCook() the instant body.cooking toggles — needed because leaving
    // Cooking Mode with the tab still in the foreground the whole time never
    // fires visibilitychange at all, and a deferred reload should apply the
    // moment the cook is actually done, not wait for an unrelated tab switch.
    document.addEventListener("visibilitychange", function () {
      if (reloadPending && !shouldDeferReload()) reloadNow();
    });
    document.addEventListener("mc:cookingchange", function () {
      if (reloadPending && !shouldDeferReload()) reloadNow();
    });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) {
        // First install completed — the app is now fully cached for offline use.
        hadController = true;
        var t = toast("Ready to use offline 🟢");
        setTimeout(function () { dismiss(t); }, 3200);
        return;
      }
      // An accepted update took control — reload once to pick it up, unless
      // Cooking Mode is active right now.
      if (reloading) return;
      if (shouldDeferReload()) { reloadPending = true; return; }
      reloadNow();
    });
  });
})();
