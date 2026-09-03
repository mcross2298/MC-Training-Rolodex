/* ==========================================================================
   mc-timers.js  —  the kitchen timer store + the rail that shows it
   --------------------------------------------------------------------------
   CI initiative 1 ("The Continuous Cook Session"). Before this file, a timer
   was a `setInterval` id closed over by `timerChip()` in cookbook.js and bound
   to a DOM node inside the Cooking Mode overlay. `renderCook()` blanks that
   overlay (`o.innerHTML = ""`) on every step advance AND on every done-toggle,
   so the interval was orphaned and its chip destroyed: start a 20-minute
   braise, swipe forward to read ahead, and the timer is silently gone. It also
   could not survive leaving the page, and a 1-second interval is throttled in
   a backgrounded tab and suspended outright when the phone locks.

   Three properties fix that, and they are the whole design:

   1. **A timer is an absolute instant, not a countdown.** We persist `endsAt`
      (epoch ms) and derive "remaining" from Date.now() on every read. Nothing
      decrements, so nothing can drift: a timer that expired while the phone
      was locked reports itself correctly the moment the screen wakes, because
      it was never counting in the first place — it was just a point in time.

   2. **The store is the truth, not the DOM.** State lives in
      `mc-cookbook:timers`, so a re-render, a tab switch, or a full navigation
      from recipe.html to index.html cannot destroy a running timer. The rail
      re-renders from the store; it never owns state.

   3. **One ticker, not one per timer.** A single 250 ms interval repaints all
      of them, and stops entirely when none are running.

   Deliberately a 250 ms `setInterval` and NOT requestAnimationFrame, despite
   rAF being the usual "throttled ticker" answer: rAF is paused completely in a
   backgrounded tab, which is exactly when we still want to notice an expiry
   and alert. The interval keeps firing (slowly) in a backgrounded-but-alive
   tab; and correctness never depends on either, because of property 1.

   **Not synced by mc-sync.js, on purpose.** A running timer is device-local —
   the phone on the counter is cooking, the laptop is not — and there is no
   merge strategy that makes sense for one ("union" would resurrect cancelled
   timers on the other device; "replace" would let a backgrounded device wipe
   the one you're actually cooking on). Same reasoning as `:timecheck`.

   Exposed as window.MCTimers. Load it before any page controller, next to
   mc-fav.js / mc-cards.js.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCTimers) return;

  var KEY = "mc-cookbook:timers";
  var MAX_TIMERS = 8;          // bounds the store; oldest finished one is evicted first
  var TICK_MS = 250;

  /* ── store ──────────────────────────────────────────────────────────── */
  // Shape: { v: 1, timers: [ {
  //   id, recipeId, recipeTitle, stepNumber, label, seconds,
  //   endsAt,          // epoch ms — null while paused
  //   pausedLeft,      // ms remaining — null while running
  //   alerted          // have we already pinged for this expiry?
  // } ] }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!o || !Array.isArray(o.timers)) return [];
      return o.timers.filter(function (t) {
        return t && t.id && (typeof t.endsAt === "number" || typeof t.pausedLeft === "number");
      });
    } catch (e) { return []; }
  }

  function save(timers) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, timers: timers }));
      return true;
    } catch (e) {
      // Swallowing is right — a full disk shouldn't throw a cook out of a
      // recipe — but swallowing SILENTLY is what made a full quota look like
      // things simply not saving (audit C-12). Hosts can surface it.
      if (typeof window.MCTimers.onWriteFail === "function") {
        try { window.MCTimers.onWriteFail(e); } catch (e2) {}
      }
      return false;
    }
  }

  /* ── derived state ──────────────────────────────────────────────────── */
  function remainingMs(t) {
    if (t.pausedLeft != null) return Math.max(0, t.pausedLeft);
    return Math.max(0, t.endsAt - Date.now());
  }
  function isPaused(t)  { return t.pausedLeft != null; }
  function isRinging(t) { return !isPaused(t) && Date.now() >= t.endsAt; }

  // A read-only view with the derived fields already resolved, so callers
  // never recompute "is this one ringing" three different ways.
  function decorate(t) {
    return {
      id: t.id,
      recipeId: t.recipeId,
      recipeTitle: t.recipeTitle,
      stepNumber: t.stepNumber,
      label: t.label,
      seconds: t.seconds,
      remainingMs: remainingMs(t),
      paused: isPaused(t),
      ringing: isRinging(t)
    };
  }
  function list() { return load().map(decorate); }
  function get(id) {
    var all = list();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function count() { return load().length; }

  /* ── subscribers ────────────────────────────────────────────────────── */
  var subs = [];
  function onChange(fn) {
    subs.push(fn);
    return function () { subs = subs.filter(function (f) { return f !== fn; }); };
  }
  function emit() {
    var snapshot = list();
    subs.forEach(function (fn) { try { fn(snapshot); } catch (e) {} });
    renderRail();
    updateBadge(snapshot);
  }

  // App Badging (runtime-invisibles audit, delight opportunity 2): the
  // honest answer to alertExpired()'s own documented limit above — a
  // suspended page (iOS, screen locked) can't fire a Notification, but the
  // OS-level badge on the home-screen icon persists through suspension, so
  // "a timer is done" is visible without ever unlocking. Badge count is the
  // number of timers currently ringing (fired, not yet dismissed); it clears
  // itself back to nothing once every ringing timer is cancelled or
  // restarted, so no separate visibilitychange handling is needed. Guarded
  // to fire the OS call only when that count actually changes — emit() runs
  // every 250ms tick while any timer is live, and setAppBadge() has no
  // business being called that often.
  var lastBadgeCount = -1;
  function updateBadge(snapshot) {
    if (!("setAppBadge" in navigator)) return;
    var n = (snapshot || list()).filter(function (t) { return t.ringing; }).length;
    if (n === lastBadgeCount) return;
    lastBadgeCount = n;
    if (n > 0) navigator.setAppBadge(n).catch(function () {});
    else if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(function () {});
  }

  /* ── mutations ──────────────────────────────────────────────────────── */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Keep the store bounded. Prefer evicting something already finished (it has
  // served its purpose) over a timer still counting down for a cook mid-recipe.
  function makeRoom(timers) {
    while (timers.length >= MAX_TIMERS) {
      var victim = -1;
      for (var i = 0; i < timers.length; i++) {
        if (isRinging(timers[i])) { victim = i; break; }
      }
      timers.splice(victim >= 0 ? victim : 0, 1);
    }
    return timers;
  }

  function start(opts) {
    opts = opts || {};
    // Validate BEFORE clamping: Math.max(1, …) would happily turn a missing or
    // zero duration into a live 1-second timer that rings immediately.
    var secs = Math.round(opts.seconds);
    if (!isFinite(secs) || secs <= 0) return null;
    secs = Math.min(secs, 86400);          // same 24h ceiling parseDurations uses
    var timers = makeRoom(load());
    var t = {
      id: uid(),
      recipeId: opts.recipeId || null,
      recipeTitle: opts.recipeTitle || null,
      stepNumber: opts.stepNumber == null ? null : opts.stepNumber,
      label: opts.label || fmtClock(secs * 1000),
      seconds: secs,
      endsAt: Date.now() + secs * 1000,
      pausedLeft: null,
      alerted: false
    };
    timers.push(t);
    save(timers);
    ensureTicking();
    requestNotifyPermission();   // lazy, on a real gesture — never at page load
    primeAudio();                // same: an AudioContext needs a gesture to start
    emit();
    return decorate(t);
  }

  function mutate(id, fn) {
    var timers = load(), changed = false;
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { changed = fn(timers, i) !== false; break; }
    }
    if (changed) { save(timers); ensureTicking(); emit(); }
    return changed;
  }

  function cancel(id) {
    return mutate(id, function (timers, i) { timers.splice(i, 1); });
  }
  function pause(id) {
    return mutate(id, function (timers, i) {
      var t = timers[i];
      if (isPaused(t) || isRinging(t)) return false;
      t.pausedLeft = remainingMs(t);
      t.endsAt = null;
    });
  }
  function resume(id) {
    return mutate(id, function (timers, i) {
      var t = timers[i];
      if (!isPaused(t)) return false;
      t.endsAt = Date.now() + t.pausedLeft;
      t.pausedLeft = null;
    });
  }
  // Restart a timer from its original duration — what the old chip's
  // "tap to reset" did, kept because a cook often wants the same 20 minutes again.
  function restart(id) {
    return mutate(id, function (timers, i) {
      var t = timers[i];
      t.endsAt = Date.now() + t.seconds * 1000;
      t.pausedLeft = null;
      t.alerted = false;
    });
  }
  function clearRinging() {
    var timers = load();
    var kept = timers.filter(function (t) { return !isRinging(t); });
    if (kept.length === timers.length) return false;
    save(kept); emit();
    return true;
  }
  function clearAll() { save([]); emit(); return true; }

  /* ── the tick: detect expiry, alert exactly once, repaint ───────────── */
  var tickId = null;

  function ensureTicking() {
    var live = load().some(function (t) { return !isPaused(t); });
    if (live && tickId == null && typeof window.setInterval === "function") {
      tickId = window.setInterval(tick, TICK_MS);
    } else if (!live && tickId != null) {
      window.clearInterval(tickId); tickId = null;
    }
  }

  // Public, not private: the tick is the module's clock-advance step, and the
  // CI test drives it directly rather than waiting on real wall time.
  function tick() {
    var timers = load(), fired = [], dirty = false;
    timers.forEach(function (t) {
      if (isRinging(t) && !t.alerted) { t.alerted = true; dirty = true; fired.push(t); }
    });
    if (dirty) save(timers);
    if (fired.length) alertExpired(fired);
    if (dirty || timers.length) emit();
    ensureTicking();
    return fired.length;
  }

  function alertExpired(fired) {
    ping(); buzz();
    // A notification is only useful when the cook isn't looking at the page.
    // NOTE: with no Push service and no backend, this can only fire while the
    // document is still alive (backgrounded tab). If the OS has suspended the
    // page — iOS with the screen locked, most commonly — nothing fires until
    // the app is reopened, and then the wall-clock anchor above makes the timer
    // correctly report itself as already done. That degradation is the honest
    // limit of a no-backend PWA, not a bug to chase.
    if (typeof document !== "undefined" && document.hidden) {
      fired.forEach(function (t) {
        notify(
          "⏰ " + (t.label || "Timer") + " — time!",
          t.recipeTitle ? t.recipeTitle + (t.stepNumber ? " · step " + t.stepNumber : "") : "Mike's Cookbook"
        );
      });
    }
  }

  /* ── alert channels (moved here from cookbook.js: the rail now owns them,
     and a shared module shouldn't duplicate what a page already had) ───── */
  var audioCtx = null;
  function primeAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx && AC) audioCtx = new AC();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function ping() {
    try {
      if (!audioCtx) return;
      var t = audioCtx.currentTime;
      [0, 0.3, 0.6].forEach(function (off) {
        var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = "sine"; osc.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t + off);
        g.gain.exponentialRampToValueAtTime(0.3, t + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.22);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(t + off); osc.stop(t + off + 0.24);
      });
    } catch (e) {}
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {} }

  function requestNotifyPermission() {
    try {
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "default") Notification.requestPermission();
    } catch (e) {}
  }
  function notify(title, body) {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      // Prefer the service worker: its notifications survive the page and can
      // be clicked back into the app. Fall back to a page notification.
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "MC_TIMER_DONE", title: title, body: body
        });
      } else {
        new Notification(title, { body: body, icon: "icon.svg", tag: "mc-timer" });
      }
    } catch (e) {}
  }

  /* ── formatting ─────────────────────────────────────────────────────── */
  // Rounds UP, so a timer started for 20 minutes reads "20:00", never "19:59".
  function fmtClock(ms) {
    var s = Math.ceil(Math.max(0, ms) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = (h && m < 10 ? "0" : "") + m;
    return (h ? h + ":" : "") + mm + ":" + (sec < 10 ? "0" : "") + sec;
  }

  /* ── the rail ───────────────────────────────────────────────────────────
     Rendered by this module rather than by each page, so the shell, recipe
     pages and Cooking Mode get the identical thing from one definition. It
     publishes its own height as --mc-rail-h on :root; the bottom-anchored
     things in cookbook.css (the Home/Back FABs, the Cooking Mode controls,
     the tab bar's spacer) add that variable to their own offset, so the rail
     never covers a control. Height is 0 when there are no timers. */
  var railEl = null;
  var hooks = { onJump: null };

  function configure(h) {
    Object.keys(h || {}).forEach(function (k) {
      if (typeof h[k] === "function") hooks[k] = h[k];
    });
  }

  function mountRail() {
    if (railEl || typeof document === "undefined" || !document.body) return;
    railEl = document.createElement("div");
    railEl.className = "mc-rail";
    railEl.setAttribute("role", "region");
    railEl.setAttribute("aria-label", "Kitchen timers");
    var main = document.querySelector("main.app");
    if (main && main.getAttribute("data-tabbar") === "shell") railEl.classList.add("on-shell");
    document.body.appendChild(railEl);
    renderRail();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ids of the timers currently rendered, in order — a cheap way to tell
  // "still the same pills, just tick further" from "a timer started, was
  // cancelled, or expired" without diffing full timer objects.
  var railIds = null;

  function pillPct(t) {
    return t.seconds > 0 ? Math.max(0, Math.min(1, t.remainingMs / (t.seconds * 1000))) : 0;
  }
  function pillAriaLabel(t) {
    return (t.ringing ? "Timer finished: " : "Timer: ") + t.label +
      (t.recipeTitle ? ", " + t.recipeTitle : "") +
      (t.ringing ? "" : ", " + fmtClock(t.remainingMs) + " remaining");
  }

  // The 250ms ticker calls this on every running timer — updating text and a
  // CSS custom property in place, never touching the DOM tree or forcing a
  // layout read. The full rebuild below (renderRail) only runs when the set
  // of rendered ids actually changes (add / cancel / a reorder), which is
  // also the only time the rail's height can change.
  function updateRailPills(timers) {
    timers.forEach(function (t) {
      var pill = railEl.querySelector('[data-timer-id="' + t.id + '"]');
      if (!pill) return;
      pill.classList.toggle("ringing", !!t.ringing);
      pill.classList.toggle("paused", !!t.paused);
      pill.classList.toggle("soon", !t.ringing && !t.paused && t.remainingMs <= 60000);
      pill.style.setProperty("--mc-pct", (pillPct(t) * 100).toFixed(1) + "%");
      var timeEl = pill.querySelector(".mc-pill-time");
      if (timeEl) timeEl.textContent = t.ringing ? "Time!" : fmtClock(t.remainingMs);
      var labelEl = pill.querySelector(".mc-pill-label");
      // textContent, not innerHTML — no re-escaping needed and none of the
      // markup in the full render below is reconstructed here.
      if (labelEl) labelEl.textContent = t.paused ? "Paused · " + t.label : t.label;
      pill.setAttribute("aria-label", pillAriaLabel(t));
    });
  }

  function renderRail() {
    if (!railEl) return;
    var timers = list();
    var ids = timers.map(function (t) { return t.id; }).join(",");
    railEl.classList.toggle("empty", timers.length === 0);
    if (!timers.length) {
      railEl.innerHTML = "";
      railIds = "";
      document.documentElement.style.setProperty("--mc-rail-h", "0px");
      return;
    }
    if (ids === railIds) { updateRailPills(timers); return; }
    railIds = ids;

    railEl.innerHTML = "";
    timers.forEach(function (t) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.dataset.timerId = t.id;
      pill.className = "mc-pill" + (t.ringing ? " ringing" : "") + (t.paused ? " paused" : "") +
        (!t.ringing && !t.paused && t.remainingMs <= 60000 ? " soon" : "");
      // The ring drains as a conic sweep driven by one custom property, so the
      // repaint is a variable write rather than a DOM rebuild.
      pill.style.setProperty("--mc-pct", (pillPct(t) * 100).toFixed(1) + "%");
      pill.innerHTML =
        '<span class="mc-pill-ring" aria-hidden="true"></span>' +
        '<span class="mc-pill-body">' +
          '<span class="mc-pill-time">' + (t.ringing ? "Time!" : fmtClock(t.remainingMs)) + "</span>" +
          '<span class="mc-pill-label">' + esc(t.paused ? "Paused · " + t.label : t.label) + "</span>" +
        "</span>";
      pill.setAttribute("aria-label", pillAriaLabel(t));

      // Tap: a ringing timer is dismissed (that's the only thing you want);
      // a running one jumps to the step that started it. Re-reads live state
      // via get(t.id) rather than closing over this render's `t` — this
      // listener is attached once at full-rebuild time but stays live for
      // every tick after, including the tick where the timer starts ringing.
      pill.addEventListener("click", function () {
        var cur = get(t.id) || t;
        if (cur.ringing) { cancel(cur.id); return; }
        if (hooks.onJump) hooks.onJump(cur);
      });

      var x = document.createElement("span");
      x.className = "mc-pill-x";
      x.setAttribute("aria-hidden", "true");
      x.textContent = "✕";
      x.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        cancel(t.id);
      });
      pill.appendChild(x);

      railEl.appendChild(pill);
    });

    document.documentElement.style.setProperty("--mc-rail-h", railEl.offsetHeight + "px");
  }

  /* ── wake-ups ───────────────────────────────────────────────────────────
     Returning from a background tab, another tab mutating the store, or a
     bfcache restore all need the same thing: re-derive from the wall clock
     and repaint. There is no "catch up" to do — that's the point of endsAt. */
  if (typeof window.addEventListener === "function") {
    window.addEventListener("visibilitychange", tick);
    document.addEventListener && document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("storage", function (e) {
      if (!e || e.key === KEY || e.key == null) { ensureTicking(); emit(); }
    });
  }

  window.MCTimers = {
    KEY: KEY,
    MAX_TIMERS: MAX_TIMERS,
    list: list,
    get: get,
    count: count,
    start: start,
    cancel: cancel,
    pause: pause,
    resume: resume,
    restart: restart,
    clearRinging: clearRinging,
    clearAll: clearAll,
    tick: tick,
    fmtClock: fmtClock,
    onChange: onChange,
    configure: configure,
    mountRail: mountRail,
    renderRail: renderRail,
    onWriteFail: null
  };

  ensureTicking();
})();
