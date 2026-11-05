/* ==========================================================================
   mc-photos.js  —  the photo library (re-audit critical gap #04)
   --------------------------------------------------------------------------
   Every user-attached photo in this app — a recipe cover (`mc-cookbook:
   photos`) and every cook-log photo embedded in `mc-cookbook:cooked[id][].
   photo` — has always been a base64 JPEG **string** living inside
   `localStorage`, the one storage primitive in this app that is
   synchronous, string-only, and shares a single ~5–10 MB origin budget with
   sixteen other stores. `MAX_RECIPE_PHOTOS` (24) and `MAX_PHOTOS` (12,
   cookbook.js) were never product decisions about how many photos a cook
   should keep — they are the ceiling of that budget, worked backward into a
   count. A cook who photographs their cooking has always eventually lost
   their oldest photo, silently, to a limit that exists only because the
   data was in the wrong place.

   It is worse than a local-storage-budget problem. `mc-cookbook:cooked` —
   photo bytes and all — is in mc-sync.js's synced STORES whitelist
   (Phase 2.6, for the planned-vs-cooked adherence stat), and push() sends
   whatever JSON.parse(localStorage.getItem(key)) returns, unmodified. That
   file's own header comment claims "the cook-log photos [:photos] sits
   alongside are already device-local by design" — untrue of the code as
   shipped: every cook-log photo's full base64 body has been pushed to
   Supabase's user_sync table on every sync cycle, for every signed-in cook
   who has ever attached one. Moving the bytes here removes them from
   mc-cookbook:cooked's own JSON entirely, so mc-sync.js's comment becomes a
   true description of the code again rather than an aspiration; no change
   to mc-sync.js itself was needed to close it.

   ── What lives here ──────────────────────────────────────────────────────
   IndexedDB, database `mc-cookbook-photos`, one object store `photos`
   (keyPath `id`). Two kinds of record share it:
     cover  id = "cover:" + recipeId                — one per recipe, at most
     cook   id = "cook:"  + recipeId + ":" + at      — one per cook-log entry
   Each record is `{ id, kind, recipeId, at, bytes, type, ts }` — `bytes` is
   an ArrayBuffer, not a Blob. Older WebKit (pre-iOS 14) has a documented bug
   storing Blobs directly via structured clone in IndexedDB; an ArrayBuffer
   sidesteps it entirely and costs one extra `blob.arrayBuffer()` on write
   and one `new Blob([bytes], {type})` on read — cheap insurance on exactly
   the platform this PWA targets most.

   ── The synchronous half (why photoFor() didn't have to change shape) ───
   mc-cards.js's photoFor() is called synchronously, deep inside every card-
   render loop across three page controllers — making IT async would mean
   making every render path that builds N cards async too, the same
   architectural cost mc-data.js's own split explicitly chose to avoid for
   the recipe corpus. So this module opens IndexedDB and warms an in-memory
   `Map<id, objectURL>` ONCE, as early as possible, and `urlFor()` reads that
   warm map synchronously — `null` while still warming or genuinely absent,
   which is exactly the "no photo" case photoFor()'s existing fallback chain
   already handles. `ready` (a Promise) and an `mc:photosready` DOM event
   exist for the same reason mc-data.js's own ensureAll()/fireDetailReady()
   pattern does: first paint shows whatever's already warm (the emoji/
   pattern band, or — see below — a not-yet-migrated raw string still
   sitting in localStorage), then the three controllers each re-run their
   EXISTING repaint entry point once this module's cache is warm, same as
   they already do for MCData's shards. No new repaint mechanism invented.

   ── Migration, and why old data never goes dark mid-transition ──────────
   runMigration() is the one-time (flag-gated: mc-cookbook:photosMigratedV1)
   conversion of whatever's still sitting in mc-cookbook:photos / :cooked's
   embedded .photo strings into real IndexedDB records, then STRIPS the
   base64 back out of those two localStorage values — a cover map entry is
   deleted; a cook-log entry's `.photo` becomes the boolean `true` (a marker
   that a photo exists in the library for this entry, not the entry itself —
   every existing truthy check on `e.photo` — allPhotoEntries(), the
   cook-log fallback in photoFor() — keeps working unchanged on `true`
   exactly as it did on a real string). Photos never disappear during the
   window between page load and migration completing: mc-cards.js's
   photoFor() checks for a raw string still in localStorage FIRST and uses
   it directly if present, falling through to this module's warm cache only
   once that string is gone (i.e. once migration has actually moved it) —
   so an existing cook's photos render exactly as before at every point in
   the transition, never blocked on IndexedDB warming up.

   runMigration() is also called unconditionally (not flag-gated) by
   mc-export.js's own restore path, since importing an OLD backup file
   (downloaded before this shipped) reintroduces raw base64 into those same
   two keys on a device that already migrated once — a second pass is a
   fast no-op when there's nothing left to convert, so calling it
   unconditionally on restore is simpler and safer than trying to reason
   about whether THIS restore needs it.

   ── What did NOT change ──────────────────────────────────────────────────
   The four-step precedence chain in mc-cards.js's photoFor() (authored >
   cover > cook-log > none) is untouched — only where the cover/cook-log
   URLs come from. Every caller of photoFor() (cards, recipe.html's hero,
   the eyebrow "add a photo" widget) needed zero changes. mc-grocery.js,
   mc-pantry.js, the meal planner, the tracker — nothing here touches any
   of them; this is strictly the photo library.

   ── The backup decision, made deliberately ───────────────────────────────
   mc-export.js's JSON backup already only ever captured raw localStorage
   strings; it now naturally captures an EMPTY cover map and boolean-only
   cook-log photo markers, since that's what those keys hold on disk. Doing
   this "properly" — pulling every IndexedDB blob into the backup file too —
   would mean re-inflating every photo back to base64 inside a JSON
   document, undoing the entire point of this move for exactly the file a
   cook is most likely to keep several copies of. Declined; the account
   sheet's backup copy says so. A restored backup still gets every photo it
   was made with, IF that backup predates this change (see runMigration()
   above) — what it will not carry, from here on, is a NEW photo taken
   after the backup was made and never exported again, same as it never
   captured a photo taken after the backup for any other reason either.

   Exposed as window.MCPhotos. Also exports its pure, Node-testable half
   (id construction/parsing, the "does this legacy value need migrating"
   check) via module.exports, same convention as mc-sync.js/mc-setlog.js —
   the IndexedDB-dependent half can only be exercised by a real browser
   (tools/smoke-test.js), which is where it's proven.
   ========================================================================== */
(function () {
  "use strict";

  var DB_NAME = "mc-cookbook-photos";
  var DB_VERSION = 1;
  var STORE = "photos";
  var MIGRATED_FLAG = "mc-cookbook:photosMigratedV1";
  var COVER_KEY = "mc-cookbook:photos";
  var COOKED_KEY = "mc-cookbook:cooked";

  /* ── Pure helpers — id scheme + legacy-value detection, no IndexedDB ──── */

  function coverId(recipeId) { return "cover:" + recipeId; }
  function cookId(recipeId, at) { return "cook:" + recipeId + ":" + at; }
  // A cook-log entry's `.photo` is "legacy" (needs migrating, or — before
  // migration has run — still directly usable as a URL) when it's a real
  // string long enough to be actual image data, not the `true` marker this
  // module writes once a photo has moved into IndexedDB, and not `null`/
  // absent (no photo at all). The length floor rules out any future bare
  // marker value shorter than a real data: URI could ever be, without
  // hard-coding "data:" as the only acceptable shape (a restored old backup
  // saved before an unrelated format tweak should still be recognized).
  function isLegacyPhotoValue(v) {
    return typeof v === "string" && v.length > 32;
  }

  /* ── Node hook — before the window guard, same convention as
     mc-sync.js/mc-setlog.js: the pure half is real logic worth pinning in
     CI without a browser; the IndexedDB half genuinely cannot run under
     Node and is proven by tools/smoke-test.js instead. ── */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DB_NAME: DB_NAME, DB_VERSION: DB_VERSION, STORE: STORE,
      MIGRATED_FLAG: MIGRATED_FLAG, COVER_KEY: COVER_KEY, COOKED_KEY: COOKED_KEY,
      coverId: coverId, cookId: cookId, isLegacyPhotoValue: isLegacyPhotoValue
    };
  }

  if (typeof window === "undefined" || window.MCPhotos) return;

  var hasIDB = "indexedDB" in window;
  var cache = {};          // id -> objectURL, the warm synchronous read path
  var dbPromise = null;
  var readyResolve;
  var ready = new Promise(function (res) { readyResolve = res; });

  function openDb() {
    if (!hasIDB) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return openDb().then(function (db) {
      if (!db) return null;
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function idbGetAll() {
    return tx("readonly").then(function (store) {
      if (!store) return [];
      return new Promise(function (resolve) {
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    });
  }

  function idbPut(record) {
    return tx("readwrite").then(function (store) {
      if (!store) return false;
      return new Promise(function (resolve) {
        var req;
        try { req = store.put(record); }
        catch (e) { resolve(false); return; }
        req.onsuccess = function () { resolve(true); };
        // Includes QuotaExceededError — IndexedDB's quota is far larger than
        // localStorage's, but it is not infinite, and a full disk on a
        // constrained device is real; fail closed and let the caller show
        // the same storage-full toast every other write path in this app
        // already uses (onWriteFail below).
        req.onerror = function () { resolve(false); };
      });
    });
  }

  function idbDelete(id) {
    return tx("readwrite").then(function (store) {
      if (!store) return false;
      return new Promise(function (resolve) {
        var req;
        try { req = store.delete(id); }
        catch (e) { resolve(false); return; }
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    });
  }

  function idbDeletePrefix(prefix) {
    return idbGetAll().then(function (all) {
      var toDelete = all.filter(function (r) { return r.id.indexOf(prefix) === 0; });
      return Promise.all(toDelete.map(function (r) { return idbDelete(r.id); }))
        .then(function () { return toDelete.map(function (r) { return r.id; }); });
    });
  }

  function recordToBlob(r) {
    return new Blob([r.bytes], { type: r.type || "image/jpeg" });
  }
  function cacheRecord(r) {
    var old = cache[r.id];
    cache[r.id] = URL.createObjectURL(recordToBlob(r));
    if (old) { try { URL.revokeObjectURL(old); } catch (e) {} }
  }
  function uncacheId(id) {
    var old = cache[id];
    if (old) { try { URL.revokeObjectURL(old); } catch (e) {} }
    delete cache[id];
  }

  /* ── localStorage JSON helpers — same defensive shape every other
     store in this app already uses. ── */
  function loadJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* ── Migration: old base64 strings -> IndexedDB records, then stripped
     out of localStorage. See this file's header for the "never goes dark"
     reasoning and why this is also called unconditionally on restore. ── */
  function blobFromDataUrl(dataUrl) {
    return fetch(dataUrl).then(function (r) { return r.blob(); });
  }

  function migrateCovers() {
    var covers = loadJSON(COVER_KEY, {});
    var ids = Object.keys(covers).filter(function (id) { return isLegacyPhotoValue(covers[id]); });
    if (!ids.length) return Promise.resolve(0);
    return Promise.all(ids.map(function (recipeId) {
      return blobFromDataUrl(covers[recipeId]).then(function (blob) {
        return blob.arrayBuffer();
      }).then(function (bytes) {
        return idbPut({ id: coverId(recipeId), kind: "cover", recipeId: recipeId,
          at: null, bytes: bytes, type: "image/jpeg", ts: Date.now() });
      }).then(function (ok) {
        if (ok) delete covers[recipeId];
        return ok;
      }).catch(function () { return false; });
    })).then(function () {
      saveJSON(COVER_KEY, covers);
      return ids.length;
    });
  }

  function migrateCooked() {
    var map = loadJSON(COOKED_KEY, {});
    var jobs = [];
    Object.keys(map).forEach(function (recipeId) {
      var list = map[recipeId];
      if (!Array.isArray(list)) return;
      list.forEach(function (entry) {
        if (!entry || typeof entry !== "object" || !isLegacyPhotoValue(entry.photo)) return;
        var raw = entry.photo, at = entry.at;
        jobs.push(
          blobFromDataUrl(raw).then(function (blob) { return blob.arrayBuffer(); })
            .then(function (bytes) {
              return idbPut({ id: cookId(recipeId, at), kind: "cook", recipeId: recipeId,
                at: at, bytes: bytes, type: "image/jpeg", ts: Date.now() });
            })
            .then(function (ok) { if (ok) entry.photo = true; return ok; })
            .catch(function () { return false; })
        );
      });
    });
    if (!jobs.length) return Promise.resolve(0);
    return Promise.all(jobs).then(function () {
      saveJSON(COOKED_KEY, map);
      return jobs.length;
    });
  }

  // Idempotent by construction (both halves are no-ops once nothing legacy
  // is left), so it's safe to call more than once — see the restore-path
  // note in this file's header for why that matters.
  function runMigration() {
    if (!hasIDB) return Promise.resolve(0);
    return Promise.all([migrateCovers(), migrateCooked()]).then(function (counts) {
      var total = counts[0] + counts[1];
      try { localStorage.setItem(MIGRATED_FLAG, "1"); } catch (e) {}
      return total;
    });
  }

  function warmCache() {
    return idbGetAll().then(function (all) {
      all.forEach(cacheRecord);
      return true;
    });
  }

  function boot() {
    if (!hasIDB) { readyResolve(false); return; }
    var already = (function () { try { return localStorage.getItem(MIGRATED_FLAG) === "1"; } catch (e) { return false; } })();
    var migrate = already ? Promise.resolve(0) : runMigration();
    migrate.then(warmCache).then(function () {
      readyResolve(true);
      try { document.dispatchEvent(new CustomEvent("mc:photosready")); } catch (e) {}
    }).catch(function () { readyResolve(false); });
  }
  boot();

  /* ── Public read: synchronous, warm-cache-only ─────────────────────────
     kind: "cover" (recipeId only) or "cook" (recipeId + at). Returns an
     objectURL string, or null — never blocks, never throws. `null` is
     exactly what "no photo yet, or not warm yet" already means to every
     existing caller via photoFor()'s own fallthrough chain. */
  function urlFor(kind, recipeId, at) {
    var id = kind === "cover" ? coverId(recipeId) : cookId(recipeId, at);
    return cache[id] || null;
  }

  /* ── Public writes ──────────────────────────────────────────────────── */
  // Every write follows the same shape: turn the blob into an ArrayBuffer
  // (see the file header on why not a Blob directly), put() it, and on
  // success re-derive the cached objectURL from the ORIGINAL blob passed
  // in — cheaper and simpler than reading the bytes back out of IndexedDB
  // just to rebuild the same Blob a second time. A failed put() calls the
  // same onWriteFail() hook every write path in this app already exposes
  // (MCFav, MCSetLog) so a full quota surfaces the one existing toast
  // pattern instead of a second, novel error message.
  function fail() {
    if (typeof window.MCPhotos.onWriteFail === "function") {
      try { window.MCPhotos.onWriteFail(); } catch (e) {}
    }
  }
  function put(id, kind, recipeId, at, blob) {
    return blob.arrayBuffer().then(function (bytes) {
      return idbPut({ id: id, kind: kind, recipeId: recipeId, at: at,
        bytes: bytes, type: blob.type || "image/jpeg", ts: Date.now() });
    }).then(function (ok) {
      if (ok) cache[id] = (function () {
        var old = cache[id];
        if (old) { try { URL.revokeObjectURL(old); } catch (e) {} }
        return URL.createObjectURL(blob);
      })();
      else fail();
      return ok;
    });
  }
  function remove(id) {
    return idbDelete(id).then(function (ok) {
      if (ok) uncacheId(id); else fail();
      return ok;
    });
  }

  function setCover(recipeId, blob) { return put(coverId(recipeId), "cover", recipeId, null, blob); }
  function removeCover(recipeId) { return remove(coverId(recipeId)); }
  function addCookPhoto(recipeId, at, blob) { return put(cookId(recipeId, at), "cook", recipeId, at, blob); }
  function removeCookPhoto(recipeId, at) { return remove(cookId(recipeId, at)); }
  // Every cook-log photo for a recipe at once — used when its whole cook
  // history is cleared, not just one dated entry. No current caller needs
  // this (removeCooked()/removeCookEntry() both take a specific `at`), but
  // it costs nothing to expose alongside the per-entry version and closes
  // the same kind of orphaned-blob gap a future bulk-clear feature would
  // otherwise reopen.
  function removeAllCookPhotos(recipeId) {
    return idbDeletePrefix(cookId(recipeId, "")).then(function (ids) {
      ids.forEach(uncacheId);
      return true;
    });
  }

  window.MCPhotos = {
    ready: ready,
    urlFor: urlFor,
    setCover: setCover,
    removeCover: removeCover,
    addCookPhoto: addCookPhoto,
    removeCookPhoto: removeCookPhoto,
    removeAllCookPhotos: removeAllCookPhotos,
    runMigration: runMigration,
    onWriteFail: null
  };
})();
