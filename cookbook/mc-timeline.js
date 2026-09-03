/* ==========================================================================
   mc-timeline.js  —  Multi-Dish Cook Timeline Synchronizer
   --------------------------------------------------------------------------
   FLAGSHIP_COOKBOOK_ROADMAP.md §2.3. mc-timers.js is a well-built flat list
   of independent timers — start one, it counts down, that's it. Nothing
   back-times multiple dishes to land together. This adds a real back-timing
   sequencer ON TOP of that existing engine, without touching timer
   *execution* at all: this module only ever decides WHEN to start each
   dish's own Cooking Mode session — the timers a cook starts once there are
   still plain, unmodified mc-timers.js timers.

   `computeTimeline(dishes, targetTime)` is the pure critical-path math: give
   it `{recipeId, title, icon, totalMins}` per dish and a "ready by" instant,
   it hands back each dish's own start time, sorted earliest-first (the
   longest single dish anchors the target and starts soonest; everything
   else gets a shorter lead). `totalMins` is deliberately just
   `prep_time_mins + cook_time_mins` — both already-structured, always-
   present, CI-validated fields on every recipe — rather than re-parsing
   free-text step durations (cookbook.js's `parseDurations()`/`DUR_RE`,
   which exists for a different job: per-step timer chips inside Cooking
   Mode, tied to that page's DOM). A dish with no usable total (0 or
   missing) is left out of the schedule as "manual — no auto-schedule
   available, start whenever" rather than silently dropped or guessed at —
   this app's own "informational, not silent" degradation ethic
   (mc-net.js, mc-data.js).

   A synchronizer session is just data — `{ targetTime, dishes }` — in
   `mc-cookbook:timeline`, so closing the app and reopening restores the
   same timeline. One active session at a time (a cook coordinating more
   than one simultaneous multi-dish cook is an edge case not worth the
   complexity of concurrent sessions yet). **Not synced**, same reasoning
   `mc-timers.js` and `mc-cookbook:timecheck` already establish: a cook
   timeline is device-local by nature (the phone on the counter is the one
   cooking), and there's no honest merge for "cancel this dish's timing"
   happening on two devices at once.

   This file also owns its own minimal overlay UI (same self-contained
   pattern as mc-recipe-form.js) — `MCTimeline.open(dishes)` is the entry
   point, called today from Home's "Today" card (2+ dishes planned for
   today) via cookbook-home.js. `dishes` is built by the caller from
   `planMeals()` + `recipeById()`; this module has no data-layer hooks of
   its own, deliberately — it only ever needs the small shape it's handed.

   Exposed as window.MCTimeline.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCTimeline) return;

  var STORE_KEY = "mc-cookbook:timeline";

  /* ── Pure critical-path math ─────────────────────────────────────────── */
  // dishes: [{recipeId, title, icon, totalMins}]. targetTime: epoch ms (or
  // a Date). Returns { targetTime, dishes: [...+ startAt, sorted earliest
  // start first], manual: [dishes with no usable totalMins], anchorId }.
  function computeTimeline(dishes, targetTime) {
    var target = targetTime instanceof Date ? targetTime.getTime() : targetTime;
    var all = dishes || [];
    var timed = all.filter(function (d) { return d && typeof d.totalMins === "number" && d.totalMins > 0; });
    var manual = all.filter(function (d) { return !(d && typeof d.totalMins === "number" && d.totalMins > 0); })
      .map(function (d) { return { recipeId: d.recipeId, title: d.title, icon: d.icon }; });

    var rows = timed.map(function (d) {
      return {
        recipeId: d.recipeId, title: d.title, icon: d.icon, totalMins: d.totalMins,
        startAt: target - d.totalMins * 60000
      };
    }).sort(function (a, b) { return a.startAt - b.startAt; });

    return {
      targetTime: target,
      dishes: rows,
      manual: manual,
      anchorId: rows.length ? rows[0].recipeId : null
    };
  }

  /* ── Persistence (device-local, not synced — see header) ────────────── */
  function loadSession() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      return (raw && typeof raw === "object" && Array.isArray(raw.dishes)) ? raw : null;
    } catch (e) { return null; }
  }
  function saveSession(session) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(session));
      return true;
    } catch (e) {
      // Same posture as mc-timers.js's own onWriteFail — swallow the quota
      // failure (a full disk shouldn't break the timeline UI) but let a
      // host surface it rather than silently not persisting.
      if (typeof window.MCTimeline.onWriteFail === "function") {
        try { window.MCTimeline.onWriteFail(e); } catch (e2) {}
      }
      return false;
    }
  }
  function clearSession() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ── Tiny DOM helpers (same pattern every file in this app repeats) ──── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"\']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function sameDishSet(session, dishes) {
    if (!session || !Array.isArray(session.dishes)) return false;
    var a = session.dishes.map(function (d) { return d.recipeId; }).sort();
    var b = dishes.map(function (d) { return d.recipeId; }).sort();
    if (a.length !== b.length) return false;
    return a.every(function (id, i) { return id === b[i]; });
  }
  function maxTotal(dishes) {
    return dishes.reduce(function (m, d) { return Math.max(m, d.totalMins || 0); }, 0);
  }
  function roundUp5(ms) { return Math.ceil(ms / 300000) * 300000; }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  // "HH:MM" (24h, local time) for a <input type="time">'s value.
  function toTimeInputValue(ms) {
    var d = new Date(ms);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  // Combine a "HH:MM" string with TODAY's date. If that instant has already
  // passed by more than an hour, roll to tomorrow — a cook typing "6:30"
  // at 9pm almost certainly means tomorrow evening, not an hour ago.
  function fromTimeInputValue(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
    if (!m) return null;
    var d = new Date();
    d.setSeconds(0, 0);
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10));
    if (d.getTime() < Date.now() - 3600000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function formatClock(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  /* ── Self-contained overlay UI ───────────────────────────────────────── */
  var tickTimer = null;
  function stopTicker() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  function closeTimeline() {
    var ov = document.querySelector(".timeline-overlay");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
    stopTicker();
  }

  function timelineRow(row) {
    var now = Date.now();
    var due = row.startAt <= now;
    var wrap = el("div", "timeline-row" + (due ? " due" : ""));
    wrap.appendChild(el("div", "timeline-row-head",
      '<span class="timeline-row-icon">' + (row.icon || "🍽️") + "</span>" +
      '<span class="timeline-row-title">' + esc(row.title) + "</span>"));
    var minsLeft = Math.round((row.startAt - now) / 60000);
    wrap.appendChild(el("div", "timeline-row-when",
      due ? "Start now — ready in " + row.totalMins + " min"
          : "Start at " + formatClock(row.startAt) + " · in " + minsLeft + " min"));
    var startBtn = el("a", "timeline-row-start" + (due ? "" : " disabled"), due ? "▸ Start cooking" : "Not yet");
    startBtn.setAttribute("aria-label", (due ? "Start cooking " : "Not due yet: ") + row.title);
    if (due) {
      startBtn.href = "recipe.html?id=" + encodeURIComponent(row.recipeId) + "&cook=1";
    } else {
      startBtn.setAttribute("aria-disabled", "true");
      startBtn.addEventListener("click", function (e) { e.preventDefault(); });
    }
    wrap.appendChild(startBtn);
    return wrap;
  }

  // `dishes` — [{recipeId, title, icon, totalMins}], 2+ entries (the caller
  // decides when this feature is worth surfacing; this is defensive, not
  // the gate). Restores a saved target time only when it's the SAME set of
  // dishes as last time — a different day's plan gets a fresh default.
  function openTimeline(dishes) {
    closeTimeline();
    var usable = (dishes || []).filter(function (d) { return d && d.recipeId && d.title; });
    if (usable.length < 2) return;

    var existing = loadSession();
    var restoreTarget = sameDishSet(existing, usable) ? existing.targetTime : null;
    var defaultTarget = restoreTarget || roundUp5(Date.now() + Math.max(30, maxTotal(usable)) * 60000);

    var ov = el("div", "picker timeline-overlay");
    var top = el("div", "picker-top");
    var close = el("button", "picker-close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closeTimeline);
    top.appendChild(close);
    top.appendChild(el("div", "picker-title", "⏱ Time It Together"));
    top.appendChild(el("span", "picker-close", "")); // spacer — keeps the title visually centered
    ov.appendChild(top);

    var body = el("div", "picker-results timeline-body");
    body.appendChild(el("p", "rf-hint",
      "Pick when you want everything ready — each dish gets its own start time, worked back from how long it takes."));

    var timeRow = el("div", "timeline-target-row");
    timeRow.appendChild(el("span", "timeline-target-label", "Ready by"));
    var timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.className = "timeline-target-input";
    timeInput.value = toTimeInputValue(defaultTarget);
    timeInput.setAttribute("aria-label", "Ready-by time");
    timeRow.appendChild(timeInput);
    body.appendChild(timeRow);

    var listEl = el("div", "timeline-list");
    var manualEl = el("div", "timeline-manual");
    body.appendChild(listEl);
    body.appendChild(manualEl);

    function render() {
      var targetMs = fromTimeInputValue(timeInput.value) || defaultTarget;
      var result = computeTimeline(usable, targetMs);
      saveSession({
        targetTime: targetMs,
        dishes: usable.map(function (d) {
          return { recipeId: d.recipeId, title: d.title, icon: d.icon, totalMins: d.totalMins };
        })
      });

      listEl.innerHTML = "";
      result.dishes.forEach(function (row) { listEl.appendChild(timelineRow(row)); });

      manualEl.innerHTML = "";
      if (result.manual.length) {
        manualEl.appendChild(el("p", "rf-hint",
          "No timing data for these — manual, start whenever:"));
        result.manual.forEach(function (d) {
          manualEl.appendChild(el("p", "timeline-manual-row",
            (d.icon || "🍽️") + " " + esc(d.title)));
        });
      }
    }

    timeInput.addEventListener("input", render);
    render();
    stopTicker();
    // Live countdown + the moment a row flips from "not yet" to "start now".
    tickTimer = setInterval(render, 20000);

    ov.appendChild(body);
    ov.addEventListener("click", function (e) { if (e.target === ov) closeTimeline(); });
    document.body.appendChild(ov);
    document.body.classList.add("picking");
  }

  window.MCTimeline = {
    computeTimeline: computeTimeline,
    open: openTimeline,
    close: closeTimeline,
    loadSession: loadSession,
    clearSession: clearSession,
    onWriteFail: null
  };
})();
