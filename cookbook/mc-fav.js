/* ==========================================================================
   mc-fav.js  —  the ❤ favorites store, in one place
   --------------------------------------------------------------------------
   Audit C-07. `mc-cookbook:favorites` is read and written by three separate
   screens — the shell (cookbook-home.js), collection pages (collection.js)
   and the recipe detail page (cookbook.js) — and each carried its own
   loadFavs/toggleFav pair over the same key. CLAUDE.md already described the
   store as `window.MCFav`, but that was only an export cookbook-home.js
   published at the very bottom of its IIFE; the other two files never used
   it and kept their own copies instead. This makes the documented thing the
   real thing.

   Values are a JSON array of recipe_ids. **Sets are serialized with
   Array.from()** before JSON.stringify — a Set does not JSON-serialize
   directly, which was a real bug here once; keep the pattern.

   Synced across devices by mc-sync.js (`stringSet` union) when signed in —
   see audit C-02, which found this store had never been in the whitelist.

   Write failures: localStorage can throw QuotaExceededError, and swallowing
   it is correct (a full disk shouldn't throw a cook out of a recipe). But
   swallowing it *silently* is what made a full quota look like hearts simply
   not saving, so a host can set MCFav.onWriteFail to surface it — the shell
   points it at cookbook-home.js's one-toast-per-session warning (audit C-12).
   All three hosts wire this now (audit VOC/VOA wave 7 closed the gap on
   recipe.html and collection.html, which had shipped without it); a page
   that doesn't set it falls back to swallowing silently, same as before.

   Exposed as window.MCFav = { KEY, load(), save(set), toggle(id), has(id) }.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCFav) return;

  var KEY = "mc-cookbook:favorites";

  function load() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); }
    catch (e) { return new Set(); }
  }

  function save(set) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
      return true;
    } catch (e) {
      if (typeof window.MCFav.onWriteFail === "function") {
        try { window.MCFav.onWriteFail(e); } catch (e2) {}
      }
      return false;
    }
  }

  function toggle(id) {
    var set = load();
    if (set.has(id)) set.delete(id); else set.add(id);
    save(set);
    return set.has(id);
  }

  function has(id) { return load().has(id); }

  window.MCFav = {
    KEY: KEY,
    load: load,
    save: save,
    toggle: toggle,
    has: has,
    onWriteFail: null
  };
})();
