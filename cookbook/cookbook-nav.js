/* ==========================================================================
   cookbook-nav.js  —  Phase 3 (Home anchor for deep pages)
   --------------------------------------------------------------------------
   The app is hub-and-spoke: index.html is the Home hub and there is no bottom
   tab bar. The two standalone deep pages (recipe.html / collection.html) live
   outside the shell, so they get a single persistent "Home" button — the
   anchor that keeps the user one tap from the hub.

   A page opts in with `data-tabbar` on <main class="app">:
     data-tabbar="shell"  → the index.html hub; this file renders nothing.
     data-tabbar="page"   → standalone deep page; render the Home button.

   No framework, no build step.
   ========================================================================== */
(function () {
  "use strict";

  // Render (once) a fixed Home button into <main.app>. Returns to whichever
  // shell screen the user was last on (via a sessionStorage breadcrumb
  // cookbook-home.js's setTab() writes on every switch), not always a hard
  // reset to Home — reached via Favorites, it should land back on Favorites.
  function renderHomeLink() {
    var mount = document.querySelector("main.app");
    if (!mount || mount.querySelector(".home-fab")) return null;
    var a = document.createElement("a");
    a.className = "home-fab";
    var lastScreen = null;
    try { lastScreen = sessionStorage.getItem("mc-cookbook:lastScreen"); } catch (e) {}
    a.href = (lastScreen && lastScreen !== "home") ? ("index.html#" + lastScreen) : "index.html";
    a.setAttribute("aria-label", "Home");
    a.innerHTML = '<span class="home-fab-icon">🏠</span>Home';
    mount.appendChild(a);
    return a;
  }

  // Render (once) a fixed Back button — bottom-left mirror of the Home button.
  // Goes back in history when there's somewhere to go, else falls back to Home
  // so a directly-opened deep link still has a working exit.
  function renderBackLink() {
    var mount = document.querySelector("main.app");
    if (!mount || mount.querySelector(".back-fab")) return null;
    var b = document.createElement("button");
    b.className = "back-fab";
    b.type = "button";
    b.setAttribute("aria-label", "Back");
    b.innerHTML = '<span class="back-fab-icon">‹</span>Back';
    b.addEventListener("click", function () {
      if (history.length > 1 && document.referrer) history.back();
      else window.location.href = "index.html";
    });
    mount.appendChild(b);
    return b;
  }

  // Deep pages opt in via data-tabbar; the shell ("shell") renders nothing.
  function autoInit() {
    var mount = document.querySelector("main.app[data-tabbar]");
    if (!mount || mount.getAttribute("data-tabbar") === "shell") return;
    renderHomeLink();
    renderBackLink();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  window.MCNav = { renderHomeLink: renderHomeLink, renderBackLink: renderBackLink };
})();
