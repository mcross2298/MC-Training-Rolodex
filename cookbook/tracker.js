/* ==========================================================================
   tracker.js — Mike's Cookbook macro tracker (standalone, in-app)
   --------------------------------------------------------------------------
   The cookbook's own macro tracker screen (#screen-tracker), mounted by
   cookbook-home.js. Mirrors the workout app's day-based flow but themed to the
   cookbook (cream cards, terracotta accent) and fully standalone — localStorage
   only, no login (see tracker-store.js).

   Layout:
     1. a live WEEK CALENDAR strip (past / future days),
     2. the MACRO TRACKER bar (calories + P/F/C vs. goals) for the picked day,
     3. an HOUR-BY-HOUR TIMELINE where foods log into the hour eaten.

   Add food via Open Food Facts search (tracker-foodapi.js), barcode scan
   (tracker-barcode.js), or manual entry; goals come from the suggest-then-
   adjust calculator (tracker-calc.js). Recipes are logged straight in from the
   recipe page (tracker-recipe.js). Exposed as window.MCTracker.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCTracker) return;

  var S = window.MCTrackerStore;
  var host = null;

  // Read from cookbook.css's :root tokens instead of hardcoding hex here —
  // these used to be a stock kcal/purple/gold/green set with no relation to
  // the rest of the app's palette.
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  var COL = {
    kcal: cssVar("--accent", "#C87A53"),
    p: cssVar("--macro-protein", "#A8562E"),
    f: cssVar("--macro-fat", "#C99A2E"),
    c: cssVar("--macro-carb", "#7D8C77")
  };
  var WD = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }

  // Same visual language as the SW update toast (cookbook-sw.js), but its own
  // .mc-toast class so the two never stack if both are on screen at once.
  function toast(msg, actionLabel, onAction) {
    var t = el("div", "mc-toast");
    t.appendChild(el("span", "mc-toast-msg", esc(msg)));
    if (actionLabel) {
      var btn = el("button", "mc-toast-btn", esc(actionLabel));
      btn.type = "button";
      btn.addEventListener("click", function () {
        onAction();
        t.classList.remove("show");
        setTimeout(function () { t.remove(); }, 300);
      });
      t.appendChild(btn);
    }
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, 5000);
  }

  var selKey = S.todayKey();
  var addSlotMs = null;

  function defaultSlot() {
    if (selKey === S.todayKey()) return Date.now();
    var d = S.dateFromKey(selKey); d.setHours(12, 0, 0, 0); return d.getTime();
  }
  function hourSlot(hour) { var d = S.dateFromKey(selKey); d.setHours(hour, 0, 0, 0); return d.getTime(); }
  function entryHour(e) { return new Date(e.at || e.ts || Date.now()).getHours(); }

  // ====================================================================== //
  //  MOUNT / RENDER                                                         //
  // ====================================================================== //
  function mount(container) { host = container; injectStyles(); render(); }

  function render() {
    if (!host) return;
    var goals = S.getGoals();
    var entries = S.entriesFor(selKey);
    var totals = S.totalsOf(entries);

    host.innerHTML = "";
    var root = el("div", "ckt");
    root.appendChild(renderToolbar());
    root.appendChild(renderCalendar());
    root.appendChild(renderSummary(totals, goals));
    var fit = renderFitPicks(totals, goals);
    if (fit) root.appendChild(fit);
    var freq = renderFrequent();
    if (freq) root.appendChild(freq);
    root.appendChild(renderFind());
    root.appendChild(renderTimeline(entries));
    host.appendChild(root);
  }

  function renderToolbar() {
    var bar = el("div", "ckt-toolbar");
    bar.appendChild(el("div", "ckt-toolbar-date", esc(S.prettyDay(selKey))));
    var actions = el("div", "ckt-toolbar-actions");
    var today = el("button", "ckt-ico", "◎"); today.title = "Jump to today";
    today.onclick = function () { selKey = S.todayKey(); render(); };
    var fav = el("button", "ckt-ico", "★"); fav.title = "Favorite foods";
    fav.onclick = function () { addSlotMs = defaultSlot(); openFavorites(); };
    var gear = el("button", "ckt-ico", "⚙"); gear.title = "Goals";
    gear.onclick = openCalculator;
    actions.appendChild(today); actions.appendChild(fav); actions.appendChild(gear);
    bar.appendChild(actions);
    return bar;
  }

  function renderCalendar() {
    var cal = el("div", "ckt-cal");
    var prev = el("button", "ckt-cal-nav", "‹");
    prev.onclick = function () { selKey = S.addDays(selKey, -7); render(); };
    var next = el("button", "ckt-cal-nav", "›");
    next.onclick = function () { selKey = S.addDays(selKey, 7); render(); };
    var days = el("div", "ckt-cal-days");
    var start = S.mondayOf(selKey), tk = S.todayKey();
    for (var i = 0; i < 7; i++) {
      (function (k) {
        var d = S.dateFromKey(k);
        var cls = "ckt-day" + (k === selKey ? " sel" : "") + (k === tk ? " today" : "");
        var cell = el("div", cls,
          '<div class="ckt-day-wd">' + WD[(d.getDay() + 6) % 7] + "</div>" +
          '<div class="ckt-day-num">' + d.getDate() + "</div>" +
          '<div class="ckt-day-dot"></div>');
        cell.onclick = function () { selKey = k; render(); };
        days.appendChild(cell);
      })(S.addDays(start, i));
    }
    cal.appendChild(prev); cal.appendChild(days); cal.appendChild(next);
    return cal;
  }

  function renderSummary(totals, goals) {
    var sum = el("div", "ckt-sum");
    sum.title = "Edit goals";
    var metrics = el("div", "ckt-sum-metrics");
    metrics.appendChild(metric("🔥", totals.kcal, goals && goals.kcal, COL.kcal));
    metrics.appendChild(metric("P", totals.p, goals && goals.p, COL.p));
    metrics.appendChild(metric("F", totals.f, goals && goals.f, COL.f));
    metrics.appendChild(metric("C", totals.c, goals && goals.c, COL.c));
    sum.appendChild(metrics);
    sum.appendChild(el("div", "ckt-sum-exp", "›"));
    sum.onclick = openCalculator;
    return sum;
  }

  // A conic-gradient ring (pure CSS, no library) replaces the old flat 3px
  // bar — the app already had a well-considered three-color macro palette
  // (--macro-protein/-fat/-carb) but nothing but text/swatches to show it
  // with; this is the "premium tracker" visual cue that palette was missing.
  function metric(ic, have, goal, color) {
    var pct = goal ? Math.min(100, Math.round((have / goal) * 100)) : 0;
    var over = goal && have > goal;
    var ringColor = over ? "#C0473B" : color;
    var m = el("div", "ckt-met");
    m.innerHTML =
      '<div class="ckt-met-ring" style="--pct:' + pct + '%;--rc:' + ringColor + '">' +
        '<div class="ckt-met-ring-hole"><span class="ckt-met-ring-ic" style="color:' + color + '">' + ic + "</span></div>" +
      "</div>" +
      '<div class="ckt-met-val">' + have + '<span class="ckt-met-goal">/' + (goal || "—") + "</span></div>";
    return m;
  }

  // ---- "fits your remaining macros" (today only) ---------------------------
  // Real-time "what do I eat right now" — distinct from Smart Week's weekly
  // generator. Ranks by protein-per-calorie so a tight remaining budget still
  // surfaces something worth eating, not just whatever's smallest. A ≥80kcal
  // floor keeps this a "what's my next meal" list, not condiments/salsas —
  // it also happens to guard against a couple of known-bad authored macro
  // rows (e.g. a chicken dish sitting at 45kcal/serving) without this feature
  // silently trusting an implausible outlier as its top pick.
  function fitPickRecipes(remaining) {
    if (!remaining || !(remaining.kcal > 40)) return [];
    return (window.RECIPES || [])
      .map(function (r) { return { r: r, per: recipePerServing(r) }; })
      .filter(function (x) { return x.per && x.per.kcal >= 80 && x.per.kcal <= remaining.kcal + 60; })
      .sort(function (a, b) { return (b.per.p / b.per.kcal) - (a.per.p / a.per.kcal); })
      .slice(0, 4);
  }
  function renderFitPicks(totals, goals) {
    if (!goals || selKey !== S.todayKey()) return null;
    var remaining = {
      kcal: goals.kcal - totals.kcal, p: goals.p - totals.p,
      f: goals.f - totals.f, c: goals.c - totals.c
    };
    var picks = fitPickRecipes(remaining);
    if (!picks.length) return null;

    var card = el("div", "ckt-fit");
    card.appendChild(el("div", "ckt-fit-head", "Fits your remaining macros"));
    var list = el("div", "ckt-fit-list");
    picks.forEach(function (x) {
      var row = el("div", "ckt-fit-row");
      row.innerHTML =
        '<div class="ckt-fit-main">' +
          '<div class="ckt-fit-name">' + esc(x.r.title) + "</div>" +
          '<div class="ckt-fit-sub">' + Math.round(x.per.kcal) + " kcal · " + Math.round(x.per.p) + "g protein</div>" +
        "</div>";
      var btn = el("button", "ckt-fit-log", "Log");
      btn.type = "button";
      btn.onclick = function () { addSlotMs = defaultSlot(); openFacts(foodFromRecipe(x.r), {}); };
      row.appendChild(btn);
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  // ---- frequent-foods quick-log shelf ---------------------------------------
  // Coffee, eggs, shakes get logged dozens of times but each used to need a
  // fresh search or scan. Excludes recipe entries (already one tap via
  // search/fit-picks above) so this stays a shelf for actual repeat foods.
  function frequentFoods(limit) {
    var obj = S.read(), tally = {};
    Object.keys(obj.days || {}).forEach(function (dk) {
      (obj.days[dk].entries || []).forEach(function (e) {
        if (e.source === "recipe") return;
        var key = e.code ? ("c:" + e.code) : ("n:" + String(e.name).toLowerCase());
        if (!tally[key]) tally[key] = { count: 0, entry: e };
        tally[key].count++;
      });
    });
    return Object.keys(tally).map(function (k) { return tally[k]; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 8)
      .map(function (t) { return t.entry; });
  }
  function renderFrequent() {
    var freq = frequentFoods(8);
    if (!freq.length) return null;
    var wrap = el("div", "ckt-freq");
    wrap.appendChild(el("div", "ckt-freq-head", "Log again"));
    var row = el("div", "ckt-freq-row");
    freq.forEach(function (e) {
      var chip = el("button", "ckt-freq-chip", esc(e.name));
      chip.type = "button";
      chip.onclick = function () { addSlotMs = defaultSlot(); openFacts(foodFromEntry(e), {}); };
      row.appendChild(chip);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function renderFind() {
    var bar = el("div", "ckt-find");
    bar.appendChild(el("span", "ckt-find-ic", "🔍"));
    var txt = el("button", "ckt-find-txt", "Search foods & recipes");
    txt.onclick = function () { addSlotMs = defaultSlot(); openSearch(); };
    bar.appendChild(txt);
    if (window.MCBarcode && MCBarcode.supported()) {
      var scan = el("button", "ckt-find-scan", "▦"); scan.title = "Scan barcode";
      scan.onclick = function () { addSlotMs = defaultSlot(); openScan(); };
      bar.appendChild(scan);
    }
    return bar;
  }

  function renderTimeline(entries) {
    var byHour = {};
    (entries || []).forEach(function (e) { (byHour[entryHour(e)] = byHour[entryHour(e)] || []).push(e); });
    Object.keys(byHour).forEach(function (h) {
      byHour[h].sort(function (a, b) { return (a.at || a.ts || 0) - (b.at || b.ts || 0); });
    });

    var nowHour = (selKey === S.todayKey()) ? new Date().getHours() : -1;
    var time = el("div", "ckt-time");
    for (var h = 0; h < 24; h++) {
      var list = byHour[h] || [];
      var row = el("div", "ckt-hr" + (list.length ? " has" : "") + (h === nowHour ? " now" : ""));
      var rail = el("div", "ckt-hr-rail");
      rail.appendChild(el("div", "ckt-hr-lbl", S.hourLabel(h)));
      var add = el("button", "ckt-hr-add", "+");
      (function (hour) { add.onclick = function () { openHourAdd(hour); }; })(h);
      rail.appendChild(add);
      row.appendChild(rail);

      var body = el("div", "ckt-hr-body");
      list.forEach(function (e) {
        var q = num(e.qty, 1), per = e.per || {};
        var card = el("div", "ckt-fcard");
        card.innerHTML =
          '<div class="ckt-fcard-top">' +
            '<div class="ckt-fcard-name">' + esc(e.name) + (q !== 1 ? " ×" + q : "") + "</div>" +
            '<div class="ckt-fcard-time">' + S.timeLabel(e.at || e.ts || Date.now()) + "</div>" +
          "</div>" +
          '<div class="ckt-fcard-macros">' +
            '<b style="color:' + COL.kcal + '">🔥' + Math.round(num(per.kcal) * q) + "</b>  " +
            "P " + Math.round(num(per.p) * q) + "  F " + Math.round(num(per.f) * q) + "  C " + Math.round(num(per.c) * q) +
          "</div>";
        (function (entry) { card.onclick = function () { openFacts(foodFromEntry(entry), { entryId: entry.id, qty: num(entry.qty, 1) }); }; })(e);
        body.appendChild(card);
      });
      row.appendChild(body);
      time.appendChild(row);
    }
    return time;
  }

  // ====================================================================== //
  //  SHEETS                                                                 //
  // ====================================================================== //
  var sheetIdCounter = 0;
  function sheet(title, sub) {
    var ov = el("div", "ckt-overlay");
    var sh = el("div", "ckt-sheet");
    sh.setAttribute("role", "dialog");
    sh.setAttribute("aria-modal", "true");
    var titleId = "ckt-sheet-title-" + (++sheetIdCounter);
    var handle = el("div", "ckt-handle");
    sh.appendChild(handle);
    var titleEl = el("div", "ckt-sheet-title", esc(title));
    titleEl.id = titleId;
    sh.setAttribute("aria-labelledby", titleId);
    sh.appendChild(titleEl);
    if (sub) sh.appendChild(el("div", "ckt-sheet-sub", esc(sub)));
    ov.appendChild(sh);
    ov.addEventListener("click", function (ev) { if (ev.target === ov) close(); });
    document.body.appendChild(ov);

    var prevFocus = document.activeElement;
    var FOCUSABLE_SEL = 'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])';
    requestAnimationFrame(function () {
      ov.classList.add("open");
      // Callers append their own fields/buttons right after sheet() returns,
      // so this runs after that synchronous work is done — find the first
      // real field/button (skip the drag handle) rather than the handle.
      var items = sh.querySelectorAll(FOCUSABLE_SEL);
      for (var i = 0; i < items.length; i++) {
        if (!handle.contains(items[i])) { items[i].focus(); break; }
      }
    });

    function trapFocus(e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      var items = sh.querySelectorAll(FOCUSABLE_SEL);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trapFocus);

    function close() {
      document.removeEventListener("keydown", trapFocus);
      ov.classList.remove("open");
      setTimeout(function () { ov.remove(); }, 200);
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    }

    // swipe-down to dismiss on the drag handle
    var startY = 0;
    handle.addEventListener("touchstart", function (e) {
      startY = e.touches[0].clientY;
      sh.style.transition = "none";
    }, { passive: true });
    handle.addEventListener("touchmove", function (e) {
      var delta = e.touches[0].clientY - startY;
      if (delta > 0 && sh.scrollTop === 0) {
        sh.style.transform = "translateY(" + delta + "px)";
      }
    }, { passive: true });
    handle.addEventListener("touchend", function (e) {
      var delta = e.changedTouches[0].clientY - startY;
      sh.style.transition = "";
      if (delta >= 50) {
        close();
      } else {
        sh.style.transform = "";
      }
    });
    handle.addEventListener("click", function () { close(); });

    return { ov: ov, sh: sh, close: close };
  }

  function stepper(label, value, step, min, onChange) {
    var row = el("div", "ckt-step");
    row.innerHTML = '<div class="ckt-step-lbl">' + esc(label) + "</div>";
    var ctl = el("div", "ckt-step-ctl");
    var minus = el("button", "ckt-step-btn", "−");
    var val = el("div", "ckt-step-val", String(value));
    var plus = el("button", "ckt-step-btn", "+");
    function set(v) { v = Math.max(min, Math.round(v)); val.textContent = String(v); onChange(v); }
    minus.onclick = function () { set(num(val.textContent) - step); };
    plus.onclick = function () { set(num(val.textContent) + step); };
    ctl.appendChild(minus); ctl.appendChild(val); ctl.appendChild(plus);
    row.appendChild(ctl);
    row.setVal = function (v) { val.textContent = String(Math.round(v)); };
    return row;
  }

  function stepperFloat(label, value) {
    var row = el("div", "ckt-step");
    row.innerHTML = '<div class="ckt-step-lbl">' + esc(label) + "</div>";
    var ctl = el("div", "ckt-step-ctl");
    var minus = el("button", "ckt-step-btn", "−");
    var val = el("div", "ckt-step-val", String(value));
    var plus = el("button", "ckt-step-btn", "+");
    function set(v) { v = Math.max(0.5, Math.round(v * 2) / 2); val.textContent = String(v); }
    minus.onclick = function () { set(num(val.textContent) - 0.5); };
    plus.onclick = function () { set(num(val.textContent) + 0.5); };
    ctl.appendChild(minus); ctl.appendChild(val); ctl.appendChild(plus);
    row.appendChild(ctl);
    row.value = function () { return num(val.textContent, 1); };
    return row;
  }

  function openHourAdd(hour) {
    addSlotMs = hourSlot(hour);
    var s = sheet("Add food · " + S.hourLabel(hour), S.prettyDay(selKey));
    var w = el("div", "ckt-actions-wrap");
    if (window.MCBarcode && MCBarcode.supported()) {
      var b1 = el("button", "ckt-btn ckt-btn-accent", "📷 Scan barcode");
      b1.onclick = function () { s.close(); openScan(); };
      w.appendChild(b1);
    }
    var row = el("div", "ckt-actions");
    var b2 = el("button", "ckt-btn", "🔍 Search");
    b2.onclick = function () { s.close(); openSearch(); };
    var b3 = el("button", "ckt-btn", "✏️ Manual");
    b3.onclick = function () { s.close(); openManual(); };
    row.appendChild(b2); row.appendChild(b3);
    w.appendChild(row);
    s.sh.appendChild(w);
  }

  // ---- calculator ----------------------------------------------------------
  function openCalculator() {
    var p = S.getProfile();
    var existing = S.getGoals();
    var s = sheet("Macro calculator", "Suggested from your stats — adjust to taste.");

    var ftStart = p.heightCm ? Math.floor((p.heightCm / 2.54) / 12) : 5;
    var inStart = p.heightCm ? Math.round((p.heightCm / 2.54) % 12) : 10;

    var form = el("div", "ckt-form");
    form.innerHTML =
      '<div class="ckt-seg" id="ckSex">' +
        '<button data-v="male" class="' + (p.sex !== "female" ? "on" : "") + '">Male</button>' +
        '<button data-v="female" class="' + (p.sex === "female" ? "on" : "") + '">Female</button>' +
      "</div>" +
      '<div class="ckt-grid2">' +
        '<label class="ckt-field"><span>Age</span><input id="ckAge" type="number" inputmode="numeric" value="' + (p.age || "") + '" placeholder="30"></label>' +
        '<label class="ckt-field"><span>Weight (lb)</span><input id="ckWt" type="number" inputmode="decimal" value="' + (p.weightLb || "") + '" placeholder="180"></label>' +
      "</div>" +
      '<div class="ckt-grid2">' +
        '<label class="ckt-field"><span>Height (ft)</span><input id="ckFt" type="number" inputmode="numeric" value="' + ftStart + '"></label>' +
        '<label class="ckt-field"><span>Height (in)</span><input id="ckIn" type="number" inputmode="numeric" value="' + inStart + '"></label>' +
      "</div>" +
      '<label class="ckt-field"><span>Activity</span><select id="ckAct">' +
        MCMacroCalc.ACTIVITY.map(function (a) { return '<option value="' + a.id + '"' + (p.activity === a.id ? " selected" : "") + ">" + a.label + " — " + a.sub + "</option>"; }).join("") +
      "</select></label>" +
      '<div class="ckt-seg ckt-seg-3" id="ckGoal">' +
        MCMacroCalc.GOALS.map(function (g) { return '<button data-v="' + g.id + '" class="' + (p.goal === g.id ? "on" : "") + '">' + g.label + "</button>"; }).join("") +
      "</div>";
    s.sh.appendChild(form);

    function seg(id, fallback) {
      var box = $("#" + id, s.sh);
      box.addEventListener("click", function (ev) {
        var b = ev.target.closest("button"); if (!b) return;
        Array.prototype.forEach.call(box.querySelectorAll("button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
      });
      return function () { var on = box.querySelector("button.on"); return on ? on.getAttribute("data-v") : fallback; };
    }
    var getSex = seg("ckSex", "male");
    var getGoal = seg("ckGoal", "maintain");

    function readProfile() {
      var ft = num($("#ckFt", s.sh).value), inch = num($("#ckIn", s.sh).value);
      return {
        sex: getSex(), age: num($("#ckAge", s.sh).value),
        heightCm: Math.round((ft * 12 + inch) * 2.54),
        weightLb: num($("#ckWt", s.sh).value),
        activity: $("#ckAct", s.sh).value, goal: getGoal()
      };
    }

    var calcBtn = el("button", "ckt-btn ckt-btn-accent", "Calculate suggested macros");
    s.sh.appendChild(calcBtn);
    var adjust = el("div", "ckt-adjust"); adjust.style.display = "none";
    s.sh.appendChild(adjust);

    var cur = existing ? { kcal: existing.kcal, p: existing.p, f: existing.f, c: existing.c } : null;
    var profSnapshot = null;
    var kcalStep, pStep, fStep, cStep, summary;

    function buildAdjust() {
      adjust.innerHTML = "";
      adjust.appendChild(el("div", "ckt-adjust-head", "Fine-tune your targets"));
      summary = el("div", "ckt-calsum");
      adjust.appendChild(summary);

      kcalStep = stepper("Calories", cur.kcal, 50, 0, function (v) {
        cur.kcal = v;
        var sp = MCMacroCalc.splitFromCalories(v, profSnapshot.weightLb, profSnapshot.goal);
        cur.p = sp.p; cur.f = sp.f; cur.c = sp.c;
        pStep.setVal(cur.p); fStep.setVal(cur.f); cStep.setVal(cur.c);
        refreshSummary();
      });
      pStep = stepper("Protein (g)", cur.p, 5, 0, function (v) { cur.p = v; cur.kcal = MCMacroCalc.kcalFromMacros(cur.p, cur.f, cur.c); kcalStep.setVal(cur.kcal); refreshSummary(); });
      fStep = stepper("Fat (g)", cur.f, 5, 0, function (v) { cur.f = v; cur.kcal = MCMacroCalc.kcalFromMacros(cur.p, cur.f, cur.c); kcalStep.setVal(cur.kcal); refreshSummary(); });
      cStep = stepper("Carbs (g)", cur.c, 5, 0, function (v) { cur.c = v; cur.kcal = MCMacroCalc.kcalFromMacros(cur.p, cur.f, cur.c); kcalStep.setVal(cur.kcal); refreshSummary(); });
      adjust.appendChild(kcalStep); adjust.appendChild(pStep); adjust.appendChild(fStep); adjust.appendChild(cStep);

      var save = el("button", "ckt-btn ckt-btn-accent", "Save as my goals");
      save.onclick = function () {
        S.saveGoals(profSnapshot, { kcal: cur.kcal, p: cur.p, f: cur.f, c: cur.c });
        s.close(); render();
      };
      adjust.appendChild(save);
      refreshSummary();
    }

    function refreshSummary() {
      var pc = MCMacroCalc.macroPercents(cur.p, cur.f, cur.c);
      summary.innerHTML =
        '<span class="ckt-calsum-k">' + cur.kcal + " kcal</span>" +
        '<span class="ckt-calsum-split">' + pc.p + "P / " + pc.f + "F / " + pc.c + "C</span>";
    }

    calcBtn.onclick = function () {
      profSnapshot = readProfile();
      if (!profSnapshot.weightLb || !profSnapshot.age || !profSnapshot.heightCm) {
        calcBtn.textContent = "Enter age, height & weight first";
        setTimeout(function () { calcBtn.textContent = "Calculate suggested macros"; }, 1800);
        return;
      }
      var rec = MCMacroCalc.recommend(profSnapshot);
      cur = { kcal: rec.kcal, p: rec.p, f: rec.f, c: rec.c };
      calcBtn.textContent = "Recalculate";
      buildAdjust(); adjust.style.display = "block";
      adjust.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    if (cur) { profSnapshot = S.getProfile().heightCm ? S.getProfile() : readProfile(); calcBtn.textContent = "Recalculate"; buildAdjust(); adjust.style.display = "block"; }
  }

  // ---- cookbook recipe matches (searched first, before Open Food Facts) ----
  // Logging a built-in recipe used to require leaving the Tracker entirely for
  // the separate "Log to tracker" sheet on the recipe page (tracker-recipe.js)
  // — the tracker's own search never checked window.RECIPES. Mirrors that
  // file's perServing() (including its macro-free-user-recipe guard) so a
  // recipe with no macro data is silently excluded rather than logging 0 kcal.
  function recipePerServing(r) {
    var mp = r.macro_profiles || {};
    var m = mp.serving_2 || mp.serving_4 || mp.serving_1 || null;
    if (!m) { for (var k in mp) { m = mp[k]; break; } }
    if (!m) return null;
    var hasMacros = ["calories", "protein_g", "fat_g", "carbs_g"].some(function (k) { return m[k] != null; });
    if (!hasMacros) return null;
    return { kcal: num(m.calories), p: num(m.protein_g), f: num(m.fat_g), c: num(m.carbs_g) };
  }
  function foodFromRecipe(r) {
    var per = recipePerServing(r);
    if (!per) return null;
    return { name: r.title, brand: "", basis: "serving", servingLabel: "serving", grams: null, per: per, nutr: {}, source: "recipe", code: "" };
  }
  function searchRecipes(q) {
    var ql = q.toLowerCase();
    return (window.RECIPES || [])
      .filter(function (r) { return (r.title || "").toLowerCase().indexOf(ql) >= 0; })
      .filter(function (r) { return recipePerServing(r) != null; })
      .slice(0, 5);
  }

  // ---- search --------------------------------------------------------------
  function tokenFilter(items, q) {
    var tokens = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return items;
    var threshold = tokens.length >= 4 ? tokens.length : Math.ceil(tokens.length / 2);
    var scored = items.map(function (it) {
      var hay = ((it.name || "") + " " + (it.brand || "")).toLowerCase();
      var score = tokens.filter(function (t) { return hay.indexOf(t) >= 0; }).length;
      return { item: it, score: score };
    }).filter(function (x) { return x.score >= threshold; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (x) { return x.item; });
  }

  function openSearch() {
    var s = sheet("Search foods", "Your cookbook, then Open Food Facts.");
    var input = el("input", "ckt-input");
    input.type = "search"; input.placeholder = 'e.g. "chobani yogurt", "chili"…';
    s.sh.appendChild(input);
    var recipeResults = el("div", "ckt-results ckt-results-recipes");
    var results = el("div", "ckt-results");
    s.sh.appendChild(recipeResults);
    s.sh.appendChild(results);

    // Cookbook matches render instantly (no network) above the food-database
    // results, so a recipe someone actually cooks doesn't lose to a slower
    // Open Food Facts round-trip for the same words.
    function runRecipes(q) {
      var matches = searchRecipes(q);
      recipeResults.innerHTML = "";
      if (!matches.length) return;
      recipeResults.appendChild(el("div", "ckt-results-head", "From your cookbook"));
      matches.forEach(function (r) {
        var per = recipePerServing(r);
        var row = el("div", "ckt-result ckt-result-recipe");
        row.innerHTML =
          '<div class="ckt-result-main">' +
            '<div class="ckt-result-name">' + esc(r.title) + "</div>" +
            '<div class="ckt-result-sub">From your cookbook · per serving</div>' +
          "</div>" +
          '<div class="ckt-result-kcal">' + Math.round(per.kcal) + "<span>kcal</span></div>";
        row.onclick = function () { s.close(); openFacts(foodFromRecipe(r), {}); };
        recipeResults.appendChild(row);
      });
    }

    function showEmpty() {
      results.innerHTML = '<div class="ckt-results-msg">🔍 Type at least 2 characters to search the food database.</div>';
    }
    showEmpty();

    var timer = null;
    function run() {
      var q = input.value.trim();
      if (q.length < 2) { recipeResults.innerHTML = ""; showEmpty(); return; }
      runRecipes(q);
      results.innerHTML = '<div class="ckt-results-msg">Searching…</div>';
      MCFoodAPI.search(q).then(function (items) {
        var filtered = tokenFilter(items, q);
        if (!filtered.length) {
          // items.networkError (set by tracker-foodapi.js when both the
          // aggregator and the direct-OFF retry failed) means this is a
          // connectivity problem, not a real zero-match search — a
          // "no matches" message is actively misleading on flaky kitchen
          // Wi-Fi, since the food may well exist.
          var msg = items.networkError
            ? "Can't reach the food database — check your connection or add it manually."
            : (items.length && q.split(/\s+/).length > 1
                ? "No exact matches — try fewer keywords."
                : "No matches. Try a different term or add it manually.");
          results.innerHTML = '<div class="ckt-results-msg">' + esc(msg) + "</div>";
          return;
        }
        results.innerHTML = "";
        filtered.forEach(function (it) {
          var row = el("div", "ckt-result");
          row.innerHTML =
            '<div class="ckt-result-main">' +
              '<div class="ckt-result-name">' + esc(it.name) + "</div>" +
              '<div class="ckt-result-sub">' + (it.brand ? esc(it.brand) + " · " : "") + "per " + esc(it.servingLabel) + "</div>" +
            "</div>" +
            '<div class="ckt-result-kcal">' + it.kcal + "<span>kcal</span></div>";
          row.onclick = function () { s.close(); openFacts(foodFromItem(it), {}); };
          results.appendChild(row);
        });
      });
    }
    input.addEventListener("input", function () {
      clearTimeout(timer);
      if (!input.value.trim()) { recipeResults.innerHTML = ""; showEmpty(); return; }
      timer = setTimeout(run, 350);
    });
    setTimeout(function () { input.focus(); }, 250);
  }

  // ---- barcode -------------------------------------------------------------
  function openScan() {
    if (!(window.MCBarcode && MCBarcode.supported())) { openManual(); return; }
    MCBarcode.scan().then(function (code) {
      if (!code) return;
      var s = sheet("Looking up…", "Barcode " + code);
      MCFoodAPI.lookup(code).then(function (it) {
        s.close();
        if (it) {
          openFacts(foodFromItem({ name: it.name, brand: it.brand, basis: it.basis, servingLabel: it.servingLabel, grams: it.grams, kcal: it.kcal, p: it.p, f: it.f, c: it.c, nutr: it.nutr, source: "barcode", code: it.code }), {});
        } else {
          openManual({ source: "barcode", note: "No match for barcode " + code + ". Enter its macros manually." });
        }
      }).catch(function () { s.close(); openManual({ source: "barcode", note: "Lookup failed (offline?). Enter macros manually." }); });
    }).catch(function (err) {
      openManual({ source: "barcode", note: (err && err.message) || "Could not open the scanner. Enter macros manually." });
    });
  }

  // ---- manual --------------------------------------------------------------
  function openManual(prefill) {
    prefill = prefill || {};
    var s = sheet("Manual entry", prefill.note || ("Adding to " + S.prettyDay(selKey) + " · " + S.timeLabel(addSlotMs || defaultSlot())));
    var form = el("div", "ckt-form");
    form.innerHTML =
      '<label class="ckt-field"><span>Food name</span><input id="ckmName" type="text" value="' + esc(prefill.name || "") + '" placeholder="Ribeye steak"></label>' +
      '<div class="ckt-grid2">' +
        '<label class="ckt-field"><span>Calories</span><input id="ckmK" type="number" inputmode="numeric" value="' + (prefill.kcal != null ? esc(prefill.kcal) : "") + '"></label>' +
        '<label class="ckt-field"><span>Servings</span><input id="ckmQ" type="number" inputmode="decimal" value="' + (prefill.qty || 1) + '"></label>' +
      "</div>" +
      '<div class="ckt-grid3">' +
        '<label class="ckt-field"><span>Protein g</span><input id="ckmP" type="number" inputmode="numeric" value="' + (prefill.p != null ? esc(prefill.p) : "") + '"></label>' +
        '<label class="ckt-field"><span>Fat g</span><input id="ckmF" type="number" inputmode="numeric" value="' + (prefill.f != null ? esc(prefill.f) : "") + '"></label>' +
        '<label class="ckt-field"><span>Carbs g</span><input id="ckmC" type="number" inputmode="numeric" value="' + (prefill.c != null ? esc(prefill.c) : "") + '"></label>' +
      "</div>";
    s.sh.appendChild(form);
    var add = el("button", "ckt-btn ckt-btn-accent", "Add");
    add.onclick = function () {
      var name = $("#ckmName", s.sh).value.trim();
      if (!name) { add.textContent = "Enter a name first"; setTimeout(function () { add.textContent = "Add"; }, 1500); return; }
      S.addEntry({
        name: name, source: prefill.source || "manual", unit: "serving", qty: num($("#ckmQ", s.sh).value, 1),
        per: { kcal: num($("#ckmK", s.sh).value), p: num($("#ckmP", s.sh).value), f: num($("#ckmF", s.sh).value), c: num($("#ckmC", s.sh).value) }
      }, addSlotMs);
      addSlotMs = null; s.close(); render();
    };
    s.sh.appendChild(add);
  }

  // ---- edit ----------------------------------------------------------------
  function openEdit(id) {
    var entry = null;
    S.entriesFor(selKey).forEach(function (e) { if (e.id === id) entry = e; });
    if (!entry) return;
    var s = sheet(entry.name, "Logged at " + S.timeLabel(entry.at || entry.ts || Date.now()) + " · adjust quantity or remove.");
    var qWrap = el("div", "ckt-form"); s.sh.appendChild(qWrap);
    var qStep = stepperFloat("Servings", num(entry.qty, 1));
    qWrap.appendChild(qStep);

    var save = el("button", "ckt-btn ckt-btn-accent", "Save");
    save.onclick = function () { S.updateQty(selKey, id, qStep.value()); s.close(); render(); };
    var del = el("button", "ckt-btn ckt-btn-danger", "Remove from log");
    del.onclick = function () {
      S.removeEntry(selKey, id); s.close(); render();
      toast(entry.name + " removed", "Undo", function () {
        S.addEntry({ name: entry.name, source: entry.source, unit: entry.unit, qty: entry.qty, per: entry.per }, entry.at);
        render();
      });
    };
    s.sh.appendChild(save); s.sh.appendChild(del);
  }

  // ====================================================================== //
  //  NUTRITION FACTS SHEET  (Phase 3 — UOM toggle · keypad · micronutrients) //
  // ====================================================================== //
  var OZ_G = 28.3495;
  function foodFromItem(it) {
    return {
      name: it.name + (it.brand ? " (" + it.brand + ")" : ""), brand: it.brand || "",
      basis: it.basis || "serving", servingLabel: it.servingLabel || "serving",
      grams: (it.grams && it.grams > 0) ? it.grams : null,
      per: { kcal: it.kcal, p: it.p, f: it.f, c: it.c }, nutr: it.nutr || {},
      source: it.source || "search", code: it.code || ""
    };
  }
  function foodFromEntry(e) {
    return {
      name: e.name, brand: "", basis: e.unit || "serving",
      servingLabel: e.unit === "100g" ? "100 g" : "serving",
      grams: (e.grams && e.grams > 0) ? e.grams : null,
      per: e.per || {}, nutr: e.nutr || {}, source: e.source || "manual", code: e.code || ""
    };
  }
  function baseGramsOf(food) {
    if (food.basis === "100g") return 100;
    return (food.grams && food.grams > 0) ? food.grams : null;
  }
  function fmt(n, dp) { var v = num(n, 0); return dp ? (+v.toFixed(dp)) : Math.round(v); }

  // ---- favorites (lives inside the tracker store) --------------------------
  function favKey(food) { return food.code ? ("c:" + food.code) : ("n:" + String(food.name).toLowerCase()); }
  function getFavs() { var d = S.read(); return d.favorites || []; }
  function isFav(food) { var k = favKey(food); return getFavs().some(function (f) { return favKey(f) === k; }); }
  function toggleFav(food) {
    var d = S.read(); d.favorites = d.favorites || [];
    var k = favKey(food), i = -1;
    d.favorites.forEach(function (f, idx) { if (favKey(f) === k) i = idx; });
    if (i >= 0) { d.favorites.splice(i, 1); }
    else {
      d.favorites.unshift({
        name: food.name, brand: food.brand, basis: food.basis, servingLabel: food.servingLabel,
        grams: food.grams, per: food.per, nutr: food.nutr, code: food.code,
        source: food.source || "fav", kind: food.kind || "food"
      });
    }
    S.write(d); return i < 0;
  }

  function openFacts(food, opts) {
    opts = opts || {};
    var editId = opts.entryId || null;
    var baseG = baseGramsOf(food);
    var unit = (opts.unit === "g" || opts.unit === "oz") && baseG ? opts.unit : "base";
    var qty = (opts.qty != null) ? String(opts.qty) : "1";
    var goals = S.getGoals();

    var s = sheet(food.name, (food.brand ? esc(food.brand) + " · " : "") + "Nutrition facts");
    var body = el("div", "ckt-facts");
    s.sh.appendChild(body);

    function multBase() {
      var q = num(qty, 0);
      if (unit === "base" || !baseG) return q;
      var grams = unit === "oz" ? q * OZ_G : q;
      return grams / baseG;
    }
    function pct(have, goal) { return goal ? Math.min(999, Math.round((have / goal) * 100)) : null; }
    function ringTile(lbl, val, suf, color, p) {
      return '<div class="ckt-ring" style="--rc:' + color + '">' +
        '<div class="ckt-ring-dot"></div>' +
        '<div class="ckt-ring-val">' + val + "<span>" + suf + "</span></div>" +
        '<div class="ckt-ring-lbl">' + lbl + "</div>" +
        '<div class="ckt-ring-pct">' + (p == null ? "" : p + "%") + "</div></div>";
    }
    function nutrRow(lbl, val, suf) {
      var has = val !== "" && val != null;
      return '<div class="ckt-nrow"><span>' + lbl + "</span><b>" + (has ? val + " " + suf : "—") + "</b></div>";
    }
    function keypadHtml() {
      var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
      return '<div class="ckt-keypad" id="cktPad">' + keys.map(function (k) {
        return '<button data-k="' + k + '">' + k + "</button>";
      }).join("") + "</div>";
    }
    function refresh() {
      var m = multBase(), per = food.per || {}, nu = food.nutr || {};
      var kcal = fmt(per.kcal * m), p = fmt(per.p * m), f = fmt(per.f * m), c = fmt(per.c * m);
      var fav = isFav(food);
      body.innerHTML =
        '<div class="ckt-rings">' +
          ringTile("Cal", kcal, "", COL.kcal, pct(kcal, goals && goals.kcal)) +
          ringTile("Protein", p, "g", COL.p, pct(p, goals && goals.p)) +
          ringTile("Fat", f, "g", COL.f, pct(f, goals && goals.f)) +
          ringTile("Carbs", c, "g", COL.c, pct(c, goals && goals.c)) +
        "</div>" +
        '<div class="ckt-nutrients"><div class="ckt-nutrients-h">Nutrients</div>' +
          nutrRow("Fiber", nu.fiber != null ? fmt(nu.fiber * m, 1) : "", "g") +
          nutrRow("Sugars", nu.sugar != null ? fmt(nu.sugar * m, 1) : "", "g") +
          nutrRow("Cholesterol", nu.chol != null ? fmt(nu.chol * m) : "", "mg") +
          nutrRow("Sodium", nu.sodium != null ? fmt(nu.sodium * m) : "", "mg") +
        "</div>" +
        '<div class="ckt-uomrow"><div class="ckt-uom" id="cktUom">' +
            '<button data-u="base"' + (unit === "base" ? ' class="on"' : "") + ">" + esc(food.servingLabel || "serving") + "</button>" +
            (baseG ? '<button data-u="g"' + (unit === "g" ? ' class="on"' : "") + ">grams</button>" +
                     '<button data-u="oz"' + (unit === "oz" ? ' class="on"' : "") + ">oz</button>" : "") +
          "</div>" +
          '<div class="ckt-qty"><span id="cktQty">' + esc(qty) + "</span><small>" + (unit === "base" ? "×" : unit) + "</small></div>" +
        "</div>" +
        keypadHtml() +
        '<div class="ckt-facts-btns">' +
          '<button class="ckt-fav' + (fav ? " on" : "") + '" id="cktFav">' + (fav ? "★" : "☆") + "</button>" +
          '<button class="ckt-btn ckt-btn-accent" id="cktLog">' + (editId ? "Update" : "Log Food") + "</button>" +
        "</div>" +
        (editId ? '<button class="ckt-btn ckt-btn-danger" id="cktDel">Remove from log</button>' : "");
      wire();
    }
    function refreshNumbers() {
      var m = multBase(), per = food.per || {}, nu = food.nutr || {};
      var rings = s.sh.querySelectorAll(".ckt-ring-val");
      if (rings.length === 4) {
        rings[0].innerHTML = fmt(per.kcal * m) + "<span></span>";
        rings[1].innerHTML = fmt(per.p * m) + "<span>g</span>";
        rings[2].innerHTML = fmt(per.f * m) + "<span>g</span>";
        rings[3].innerHTML = fmt(per.c * m) + "<span>g</span>";
      }
      var goalsArr = [goals && goals.kcal, goals && goals.p, goals && goals.f, goals && goals.c];
      var vals = [fmt(per.kcal * m), fmt(per.p * m), fmt(per.f * m), fmt(per.c * m)];
      var pcts = s.sh.querySelectorAll(".ckt-ring-pct");
      pcts.forEach(function (e, i) { var pc = pct(vals[i], goalsArr[i]); e.textContent = pc == null ? "" : pc + "%"; });
      var nrows = s.sh.querySelectorAll(".ckt-nrow b");
      if (nrows.length === 4) {
        nrows[0].textContent = nu.fiber != null ? fmt(nu.fiber * m, 1) + " g" : "—";
        nrows[1].textContent = nu.sugar != null ? fmt(nu.sugar * m, 1) + " g" : "—";
        nrows[2].textContent = nu.chol != null ? fmt(nu.chol * m) + " mg" : "—";
        nrows[3].textContent = nu.sodium != null ? fmt(nu.sodium * m) + " mg" : "—";
      }
    }
    function press(k) {
      if (k === "⌫") { qty = qty.length > 1 ? qty.slice(0, -1) : "0"; }
      else if (k === ".") { if (qty.indexOf(".") < 0) qty += "."; }
      else { qty = (qty === "0") ? k : (qty.length < 6 ? qty + k : qty); }
      $("#cktQty", s.sh).textContent = qty;
      refreshNumbers();
    }
    function setUnit(u) {
      if (u === unit) return;
      var curMult = multBase();
      if (u === "base") { qty = String(+curMult.toFixed(2)); }
      else { var grams = curMult * baseG; qty = String(u === "oz" ? +(grams / OZ_G).toFixed(1) : Math.round(grams)); }
      unit = u; refresh();
    }
    function wire() {
      $("#cktPad", s.sh).onclick = function (e) { var b = e.target.closest("[data-k]"); if (b) press(b.dataset.k); };
      $("#cktUom", s.sh).onclick = function (e) { var b = e.target.closest("[data-u]"); if (b) setUnit(b.dataset.u); };
      $("#cktFav", s.sh).onclick = function () { toggleFav(food); var on = isFav(food); this.textContent = on ? "★" : "☆"; this.classList.toggle("on", on); };
      $("#cktLog", s.sh).onclick = function () {
        var m = multBase(); if (!(m > 0)) return;
        if (editId) { S.updateQty(selKey, editId, m); }
        else { S.addEntry({ name: food.name, source: food.source || "manual", unit: food.basis, qty: m, per: food.per, nutr: food.nutr, grams: food.grams, code: food.code }, addSlotMs); addSlotMs = null; }
        s.close(); render();
      };
      if (editId) $("#cktDel", s.sh).onclick = function () {
        var removed = null;
        S.entriesFor(selKey).forEach(function (e) { if (e.id === editId) removed = e; });
        S.removeEntry(selKey, editId); s.close(); render();
        if (removed) {
          toast(removed.name + " removed", "Undo", function () {
            S.addEntry({
              name: removed.name, source: removed.source, unit: removed.unit, qty: removed.qty,
              per: removed.per, nutr: removed.nutr, grams: removed.grams, code: removed.code
            }, removed.at);
            render();
          });
        }
      };
    }
    refresh();
  }

  // ====================================================================== //
  //  FAVORITES LIBRARY  (Phase 3)                                            //
  // ====================================================================== //
  function openFavorites() {
    addSlotMs = addSlotMs || defaultSlot();
    var s = sheet("Favorite Foods", "Quick-log the foods you eat most.");
    var tab = "food", pending = [];
    var wrap = el("div", "ckt-fav-wrap"); s.sh.appendChild(wrap);
    var bar = el("div", "ckt-fav-bar"); s.sh.appendChild(bar);
    function favsOf(kind) { return getFavs().filter(function (f) { return (f.kind || "food") === kind; }); }
    function paintBar() {
      bar.innerHTML =
        '<div class="ckt-fav-count">' + pending.length + " item" + (pending.length === 1 ? "" : "s") + " added</div>" +
        '<button class="ckt-btn ckt-btn-accent ckt-fav-log"' + (pending.length ? "" : " disabled") + ">Log Food</button>";
      var lg = bar.querySelector(".ckt-fav-log");
      if (lg) lg.onclick = function () {
        pending.forEach(function (f) { S.addEntry({ name: f.name, source: "favorite", unit: f.basis, qty: 1, per: f.per, nutr: f.nutr, grams: f.grams, code: f.code }, addSlotMs); });
        addSlotMs = null; s.close(); render();
      };
    }
    function paint() {
      var favs = favsOf(tab);
      wrap.innerHTML =
        '<div class="ckt-seg ckt-fav-tabs">' +
          '<button data-t="food"' + (tab === "food" ? ' class="on"' : "") + ">🍽 Foods</button>" +
          '<button data-t="meal"' + (tab === "meal" ? ' class="on"' : "") + ">🥗 Meals</button>" +
        "</div>" +
        (favs.length ? '<div class="ckt-fav-list">' + favs.map(function (f, i) {
          var per = f.per || {};
          return '<div class="ckt-fav-row" data-i="' + i + '"><div class="ckt-fav-main">' +
            '<div class="ckt-fav-name">' + esc(f.name) + "</div>" +
            '<div class="ckt-fav-macros">🔥' + fmt(per.kcal) + " · P" + fmt(per.p) + " F" + fmt(per.f) + " C" + fmt(per.c) + "</div></div>" +
            '<button class="ckt-fav-add" data-add="' + i + '">+</button></div>';
        }).join("") + "</div>"
        : '<div class="ckt-results-msg">No ' + (tab === "meal" ? "saved meals" : "favorite foods") + " yet. Tap ☆ on any food’s nutrition facts to save it here.</div>");
      paintBar();
    }
    wrap.onclick = function (e) {
      var t = e.target.closest("[data-t]");
      if (t) { tab = t.dataset.t; pending = []; paint(); return; }
      var add = e.target.closest("[data-add]");
      if (add) { var f = favsOf(tab)[+add.dataset.add]; if (f) { pending.push(f); paintBar(); add.textContent = "✓"; setTimeout(function () { add.textContent = "+"; }, 700); } return; }
      var row = e.target.closest(".ckt-fav-row");
      if (row) { var ff = favsOf(tab)[+row.dataset.i]; if (ff) openFacts(ff, {}); }
    };
    paint();
  }

  // ====================================================================== //
  //  STYLES (cookbook-themed: cream cards, terracotta accent, dark page)    //
  // ====================================================================== //
  function injectStyles() {
    if (document.getElementById("ckt-styles")) return;
    var css =
      ".ckt{padding:0 2px 24px;}" +
      /* toolbar */
      ".ckt-toolbar{display:flex;align-items:center;justify-content:space-between;margin:4px 2px 12px;}" +
      ".ckt-toolbar-date{font-size:15px;font-weight:800;color:var(--on-dark);}" +
      ".ckt-toolbar-actions{display:flex;gap:8px;}" +
      ".ckt-ico{width:38px;height:38px;border-radius:11px;border:1px solid var(--line-dark);background:var(--bg-elev);" +
        "color:var(--on-dark);font-size:16px;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;}" +
      /* calendar (on dark page) */
      ".ckt-cal{display:flex;align-items:center;gap:2px;margin-bottom:14px;}" +
      ".ckt-cal-nav{flex:0 0 auto;width:24px;height:48px;border:none;background:none;color:var(--on-dark-dim);font-size:20px;font-weight:700;cursor:pointer;font-family:inherit;}" +
      ".ckt-cal-days{flex:1;display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}" +
      ".ckt-day{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0 5px;border-radius:12px;cursor:pointer;border:1.5px solid transparent;}" +
      ".ckt-day-wd{font-size:9px;font-weight:800;letter-spacing:0.04em;color:var(--on-dark-dim);}" +
      ".ckt-day-num{font-size:15px;font-weight:800;color:var(--on-dark);}" +
      ".ckt-day-dot{width:4px;height:4px;border-radius:50%;background:transparent;}" +
      ".ckt-day.today .ckt-day-dot{background:var(--accent);}" +
      ".ckt-day.sel{border-color:var(--accent);background:rgba(var(--accent-rgb),0.16);}" +
      ".ckt-day.sel .ckt-day-num{color:var(--accent);}" +
      /* summary (cream card) */
      ".ckt-sum{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);" +
        "border-radius:var(--r-lg);padding:12px;margin-bottom:14px;cursor:pointer;}" +
      ".ckt-sum-metrics{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;min-width:0;}" +
      ".ckt-met{min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;}" +
      ".ckt-met-ring{width:36px;height:36px;border-radius:50%;flex:0 0 auto;" +
        "background:conic-gradient(var(--rc) var(--pct), rgba(0,0,0,0.09) 0);" +
        "display:flex;align-items:center;justify-content:center;transition:background 0.3s ease;}" +
      ".ckt-met-ring-hole{width:26px;height:26px;border-radius:50%;background:var(--surface);" +
        "display:flex;align-items:center;justify-content:center;}" +
      ".ckt-met-ring-ic{font-size:10px;font-weight:900;line-height:1;}" +
      ".ckt-met-val{font-size:11.5px;font-weight:900;color:var(--ink);white-space:nowrap;}" +
      ".ckt-met-goal{font-size:10px;color:var(--ink-dim);font-weight:700;}" +
      ".ckt-sum-exp{flex:0 0 auto;color:var(--ink-dim);font-size:20px;font-weight:800;line-height:1;}" +
      /* find bar (cream) */
      ".ckt-find{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);" +
        "border-radius:var(--r-md);padding:10px 12px;margin-bottom:16px;}" +
      ".ckt-find-ic{font-size:14px;}" +
      ".ckt-find-txt{flex:1;text-align:left;background:none;border:none;color:var(--ink-dim);font-size:14px;cursor:pointer;font-family:inherit;padding:0;}" +
      ".ckt-find-scan{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:15px;cursor:pointer;font-family:inherit;}" +
      /* "fits your remaining macros" (today only) */
      ".ckt-fit{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;margin-bottom:16px;}" +
      ".ckt-fit-head{font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:10px;}" +
      ".ckt-fit-list{display:flex;flex-direction:column;gap:8px;}" +
      ".ckt-fit-row{display:flex;align-items:center;gap:10px;background:var(--surface-2);border-radius:var(--r-sm);padding:9px 11px;}" +
      ".ckt-fit-main{flex:1;min-width:0;}" +
      ".ckt-fit-name{font-size:13.5px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".ckt-fit-sub{font-size:11px;color:var(--ink-dim);font-weight:600;margin-top:2px;}" +
      ".ckt-fit-log{flex:0 0 auto;appearance:none;cursor:pointer;font-family:inherit;background:var(--accent);color:#fff;border:0;" +
        "border-radius:8px;padding:7px 13px;font-size:12px;font-weight:800;}" +
      /* frequent-foods quick-log shelf */
      ".ckt-freq{margin-bottom:16px;}" +
      ".ckt-freq-head{font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--on-dark-dim);margin-bottom:8px;}" +
      ".ckt-freq-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch;}" +
      ".ckt-freq-chip{flex:0 0 auto;appearance:none;cursor:pointer;font-family:inherit;background:var(--bg-elev);color:var(--on-dark);" +
        "border:1px solid var(--line-dark);border-radius:999px;padding:8px 14px;font-size:12.5px;font-weight:700;white-space:nowrap;}" +
      ".ckt-freq-chip:active{transform:scale(0.96);}" +
      /* timeline */
      ".ckt-time{position:relative;}" +
      ".ckt-hr{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:stretch;}" +
      ".ckt-hr-rail{display:flex;flex-direction:column;align-items:center;padding-top:5px;border-right:1px dashed var(--line-dark);}" +
      ".ckt-hr-lbl{font-size:10px;font-weight:800;color:var(--on-dark-dim);white-space:nowrap;}" +
      ".ckt-hr-add{margin-top:6px;width:26px;height:26px;border-radius:50%;border:1px solid var(--line-dark);background:var(--bg-elev);color:var(--accent);font-size:17px;line-height:1;cursor:pointer;font-family:inherit;}" +
      ".ckt-hr-body{padding:4px 0 12px;display:flex;flex-direction:column;gap:6px;min-width:0;}" +
      ".ckt-hr.has .ckt-hr-rail{border-right-color:rgba(var(--accent-rgb),0.5);}" +
      ".ckt-hr.now .ckt-hr-lbl{color:var(--accent);}" +
      ".ckt-fcard{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:9px 12px;cursor:pointer;}" +
      ".ckt-fcard-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}" +
      ".ckt-fcard-name{font-size:13px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}" +
      ".ckt-fcard-time{font-size:10px;color:var(--ink-dim);font-weight:700;flex:0 0 auto;}" +
      ".ckt-fcard-macros{font-size:11px;color:var(--ink-dim);font-weight:600;margin-top:3px;}" +
      ".ckt-fcard-macros b{font-weight:800;}" +
      /* buttons */
      ".ckt-btn{width:100%;box-sizing:border-box;padding:14px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;}" +
      ".ckt-btn-accent{background:var(--accent);border-color:var(--accent);color:#fff;}" +
      ".ckt-btn-danger{background:transparent;border-color:rgba(192,71,59,0.4);color:#C0473B;margin-top:8px;}" +
      ".ckt-actions-wrap{display:flex;flex-direction:column;gap:10px;}" +
      ".ckt-actions{display:flex;gap:10px;}" +
      /* sheets (cream) */
      ".ckt-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;z-index:1200;opacity:0;transition:opacity 0.2s;}" +
      ".ckt-overlay.open{opacity:1;}" +
      ".ckt-sheet{width:100%;max-width:560px;background:var(--surface);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:14px 18px calc(28px + env(safe-area-inset-bottom));max-height:90vh;overflow-y:auto;transform:translateY(16px);transition:transform 0.2s;}" +
      ".ckt-overlay.open .ckt-sheet{transform:translateY(0);}" +
      ".ckt-handle{width:36px;height:4px;background:rgba(0,0,0,0.15);border-radius:2px;margin:0 auto 16px;padding:12px 0;box-sizing:content-box;cursor:pointer;-webkit-tap-highlight-color:transparent;}" +
      ".ckt-sheet-title{font-size:19px;font-weight:900;color:var(--ink);font-family:var(--serif);}" +
      ".ckt-sheet-sub{font-size:13px;color:var(--ink-dim);margin:4px 0 16px;line-height:1.5;}" +
      ".ckt-form{display:flex;flex-direction:column;gap:12px;margin-bottom:16px;}" +
      ".ckt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}" +
      ".ckt-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}" +
      ".ckt-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--ink-dim);}" +
      ".ckt-field input,.ckt-field select,.ckt-input{width:100%;box-sizing:border-box;background:#fff;border:1px solid var(--line);border-radius:var(--r-sm);padding:12px;color:var(--ink);font-size:15px;font-family:inherit;}" +
      ".ckt-input{margin-bottom:12px;}" +
      ".ckt-seg{display:flex;gap:8px;}" +
      ".ckt-seg button{flex:1;padding:12px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface-2);color:var(--ink-dim);font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;}" +
      ".ckt-seg button.on{background:var(--accent);border-color:var(--accent);color:#fff;}" +
      ".ckt-results{display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow-y:auto;}" +
      ".ckt-results-msg{font-size:13px;color:var(--ink-dim);text-align:center;padding:18px;}" +
      ".ckt-result{display:flex;align-items:center;gap:12px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px;cursor:pointer;}" +
      ".ckt-result-main{flex:1;min-width:0;}" +
      ".ckt-result-name{font-size:14px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".ckt-result-sub{font-size:11px;color:var(--ink-dim);font-weight:600;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".ckt-result-kcal{font-size:15px;font-weight:900;color:var(--ink);flex-shrink:0;text-align:center;}" +
      ".ckt-result-kcal span{display:block;font-size:9px;color:var(--ink-dim);font-weight:700;}" +
      ".ckt-results-recipes{margin-bottom:2px;}" +
      ".ckt-results-head{font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim);margin:2px 0 8px;}" +
      ".ckt-result-recipe{border-left:3px solid var(--accent);}" +
      ".ckt-adjust{margin-top:8px;}" +
      ".ckt-adjust-head{font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:10px;}" +
      ".ckt-calsum{display:flex;align-items:baseline;gap:10px;margin-bottom:14px;}" +
      ".ckt-calsum-k{font-family:var(--serif);font-size:28px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;}" +
      ".ckt-calsum-split{font-size:13px;font-weight:700;color:var(--ink-dim);}" +
      ".ckt-step{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--line);}" +
      ".ckt-step-lbl{font-size:14px;font-weight:800;color:var(--ink);}" +
      ".ckt-step-ctl{display:flex;align-items:center;gap:14px;}" +
      ".ckt-step-btn{width:38px;height:38px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:20px;font-weight:800;cursor:pointer;font-family:inherit;line-height:1;}" +
      ".ckt-step-val{min-width:54px;text-align:center;font-size:18px;font-weight:900;color:var(--ink);}" +
      /* ── Nutrition Facts sheet (Phase 3) ── */
      ".ckt-facts{display:flex;flex-direction:column;gap:14px;}" +
      ".ckt-rings{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;}" +
      ".ckt-ring{position:relative;border:1.5px solid color-mix(in srgb, var(--rc) 55%, transparent);border-radius:var(--r-md);" +
        "padding:12px 6px 9px;text-align:center;background:color-mix(in srgb, var(--rc) 10%, transparent);}" +
      ".ckt-ring-dot{position:absolute;top:8px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--rc);}" +
      ".ckt-ring-val{font-family:var(--serif);font-size:20px;font-weight:700;color:var(--ink);line-height:1;font-variant-numeric:tabular-nums;}" +
      ".ckt-ring-val span{font-size:11px;font-weight:800;color:var(--ink-dim);}" +
      ".ckt-ring-lbl{font-size:10px;font-weight:800;color:var(--ink);margin-top:5px;}" +
      ".ckt-ring-pct{font-size:11px;font-weight:900;color:var(--rc);margin-top:3px;min-height:13px;}" +
      ".ckt-nutrients{border:1px solid var(--line);border-radius:var(--r-md);padding:4px 14px;}" +
      ".ckt-nutrients-h{font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim);padding:10px 0 4px;}" +
      ".ckt-nrow{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px;font-weight:800;color:var(--ink);}" +
      ".ckt-nrow b{color:var(--ink);font-weight:800;}" +
      ".ckt-uomrow{display:flex;align-items:center;gap:12px;}" +
      ".ckt-uom{flex:1;display:flex;gap:6px;}" +
      ".ckt-uom button{flex:1;padding:10px 4px;border-radius:10px;border:1px solid var(--line-dark);background:var(--bg-elev);" +
        "color:var(--on-dark-dim);font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".ckt-uom button.on{background:var(--accent);border-color:var(--accent);color:#fff;}" +
      ".ckt-qty{flex:0 0 auto;display:flex;align-items:baseline;gap:4px;font-size:26px;font-weight:900;color:var(--ink);min-width:74px;justify-content:flex-end;}" +
      ".ckt-qty small{font-size:13px;font-weight:800;color:var(--ink-dim);}" +
      ".ckt-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}" +
      ".ckt-keypad button{padding:15px 0;border-radius:12px;border:1px solid var(--line-dark);background:var(--bg-elev);" +
        "color:var(--on-dark);font-size:20px;font-weight:800;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;}" +
      ".ckt-keypad button:active{background:rgba(var(--accent-rgb),0.22);}" +
      ".ckt-facts-btns{display:flex;gap:10px;align-items:stretch;}" +
      ".ckt-fav{flex:0 0 52px;border-radius:13px;border:1px solid var(--line-dark);background:var(--bg-elev);" +
        "color:var(--on-dark-dim);font-size:22px;cursor:pointer;font-family:inherit;}" +
      ".ckt-fav.on{color:var(--accent);border-color:var(--accent);}" +
      /* ── Favorites library (Phase 3) ── */
      ".ckt-fav-tabs{margin-bottom:12px;}" +
      ".ckt-fav-list{display:flex;flex-direction:column;gap:8px;max-height:54vh;overflow-y:auto;}" +
      ".ckt-fav-row{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:11px 13px;cursor:pointer;}" +
      ".ckt-fav-main{flex:1;min-width:0;}" +
      ".ckt-fav-name{font-size:14px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".ckt-fav-macros{font-size:11px;color:var(--ink-dim);font-weight:700;margin-top:2px;}" +
      ".ckt-fav-add{flex:0 0 38px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);" +
        "color:var(--accent);font-size:20px;font-weight:800;cursor:pointer;font-family:inherit;line-height:1;}" +
      ".ckt-fav-bar{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-dark);position:sticky;bottom:0;background:var(--bg-elev);}" +
      ".ckt-fav-count{flex:1;font-size:13px;font-weight:800;color:var(--on-dark-dim);}" +
      ".ckt-fav-log{width:auto;flex:0 0 auto;padding:13px 26px;}" +
      ".ckt-fav-log:disabled{opacity:0.4;}" +
      "@media (prefers-reduced-motion: reduce){.ckt-overlay,.ckt-sheet,.ckt-met-ring{transition:none;}}";
    var st = document.createElement("style");
    st.id = "ckt-styles"; st.textContent = css;
    document.head.appendChild(st);
  }

  // re-render if the store changes in another document (e.g. recipe page logged)
  window.addEventListener("storage", function (ev) {
    if (ev.key === S.KEY && host && host.offsetParent !== null) render();
  });

  window.MCTracker = { mount: mount, render: render, openCalculator: openCalculator };
})();
