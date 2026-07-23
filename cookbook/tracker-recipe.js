/* ==========================================================================
   tracker-recipe.js — "Log to tracker" on the recipe page (recipe.html)
   --------------------------------------------------------------------------
   Adds a floating "＋ Log to tracker" pill to the recipe detail page. Tapping
   it logs the recipe's per-serving macros straight into the cookbook's own
   macro tracker (tracker-store.js) — no login, works for any cookbook user.

   Per the "Both" plan it can ALSO hand off to the workout app's Nutrition tab
   via deep-link, for people who track there. That option only appears once the
   workout app's public URL is set in WORKOUT_URL below (left blank by default
   so we never ship a broken link).

   Standalone + self-contained (its own small styles); depends only on
   window.RECIPES and window.MCTrackerStore.
   ========================================================================== */
(function () {
  "use strict";

  // Set this to the workout app's public base URL (e.g.
  // "https://your-workout-app.example/dashboard.html") to enable the
  // "Send to Workout app" hand-off. Blank = option hidden.
  var WORKOUT_URL = "https://mcross2298.github.io/4-Weeks-to-Open-/dashboard.html";

  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function qparam(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }

  // resolve the current recipe (built-in RECIPES, then user library if present)
  function currentRecipe() {
    var id = qparam("id"); if (!id) return null;
    var list = window.RECIPES || [];
    for (var i = 0; i < list.length; i++) if (list[i].recipe_id === id) return list[i];
    if (window.MCUser && MCUser.get) { try { var u = MCUser.get(id); if (u) return u; } catch (e) {} }
    return null;
  }

  // per-single-serving macros → {kcal,p,f,c} (macros are constant per serving)
  function perServing(recipe) {
    var mp = recipe.macro_profiles || {};
    var m = mp.serving_2 || mp.serving_4 || mp.serving_1 || null;
    if (!m) { for (var k in mp) { m = mp[k]; break; } }
    if (!m) return null;
    // User-authored recipes store macro_profiles as { serving_2: {}, serving_4: {} }
    // by design (macro-free) — {} is truthy, so the checks above don't catch it.
    // Without this, a recipe with no macro data would still log a fake "0 kcal"
    // entry into the tracker instead of just not offering to log at all.
    var hasMacros = ["calories", "protein_g", "fat_g", "carbs_g"].some(function (k) { return m[k] != null; });
    if (!hasMacros) return null;
    return { kcal: num(m.calories), p: num(m.protein_g), f: num(m.fat_g), c: num(m.carbs_g) };
  }

  function injectStyles() {
    if (document.getElementById("ckr-styles")) return;
    var css =
      ".ckr-fab{position:fixed;right:16px;z-index:50;bottom:calc(78px + env(safe-area-inset-bottom));" +
        "display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:999px;border:1px solid var(--accent);" +
        "background:var(--accent);color:#fff;font-size:13px;font-weight:800;letter-spacing:0.03em;cursor:pointer;font-family:inherit;" +
        "box-shadow:0 6px 20px rgba(0,0,0,0.40);transition:transform var(--dur-fast,120ms) var(--ease-out,ease);}" +
      ".ckr-fab:active{transform:scale(0.95);}" +
      "body.cooking .ckr-fab{display:none;}" +
      /* The fab sits at bottom:78px and stands ~39px tall (top edge ~117px),
         well above the page's default 64px content clearance (--tab-h) — so
         scrolling content (e.g. the Cook Log's "Cooked it" button) regularly
         lands underneath it. Reusing --tab-h (already read by every fixed
         bottom element on the page, including the SW update toast) lifts
         everything that needs to clear the fab, not just the content. */
      "body.has-ckr-fab{--tab-h:130px;}" +
      ".ckr-ov{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);" +
        "display:flex;align-items:flex-end;justify-content:center;z-index:1200;opacity:0;transition:opacity 0.2s;}" +
      ".ckr-ov.open{opacity:1;}" +
      ".ckr-sheet{width:100%;max-width:560px;background:var(--surface);border-radius:var(--r-lg,16px) var(--r-lg,16px) 0 0;" +
        "padding:14px 18px calc(28px + env(safe-area-inset-bottom));transform:translateY(16px);transition:transform 0.2s;}" +
      ".ckr-ov.open .ckr-sheet{transform:translateY(0);}" +
      ".ckr-handle{width:36px;height:4px;background:rgba(0,0,0,0.15);border-radius:2px;margin:0 auto 14px;}" +
      ".ckr-title{font-size:19px;font-weight:900;color:var(--ink);font-family:var(--serif,Georgia,serif);}" +
      ".ckr-sub{font-size:13px;color:var(--ink-dim);margin:4px 0 16px;line-height:1.5;}" +
      ".ckr-macros{display:flex;gap:8px;margin-bottom:16px;}" +
      ".ckr-chip{flex:1;text-align:center;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm,8px);padding:9px 4px;}" +
      ".ckr-chip-v{font-size:16px;font-weight:900;color:var(--ink);}" +
      ".ckr-chip-l{font-size:10px;font-weight:700;color:var(--ink-dim);margin-top:2px;}" +
      ".ckr-qty{display:flex;align-items:center;justify-content:space-between;padding:10px 0 16px;}" +
      ".ckr-qty-lbl{font-size:14px;font-weight:800;color:var(--ink);}" +
      ".ckr-qty-ctl{display:flex;align-items:center;gap:14px;}" +
      ".ckr-qbtn{width:38px;height:38px;border-radius:var(--r-sm,8px);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:20px;font-weight:800;cursor:pointer;font-family:inherit;line-height:1;}" +
      ".ckr-qval{min-width:48px;text-align:center;font-size:18px;font-weight:900;color:var(--ink);}" +
      ".ckr-btn{width:100%;box-sizing:border-box;padding:14px;border-radius:var(--r-md,12px);border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;margin-top:6px;}" +
      ".ckr-btn.alt{background:transparent;color:var(--ink);border-color:var(--line);}" +
      ".ckr-toast{position:fixed;left:50%;bottom:calc(140px + env(safe-area-inset-bottom));transform:translateX(-50%);" +
        "background:rgba(30,32,34,0.97);color:var(--on-dark);border:1px solid var(--line-dark);border-radius:999px;" +
        "padding:10px 18px;font-size:13px;font-weight:800;z-index:1300;display:flex;align-items:center;gap:12px;box-shadow:0 6px 20px rgba(0,0,0,0.4);}" +
      ".ckr-toast a{color:var(--accent);text-decoration:none;font-weight:800;}";
    var st = document.createElement("style");
    st.id = "ckr-styles"; st.textContent = css;
    document.head.appendChild(st);
  }

  function toast(msg, linkText, href) {
    var t = document.createElement("div");
    t.className = "ckr-toast";
    t.innerHTML = "<span>" + esc(msg) + "</span>" + (href ? '<a href="' + href + '">' + esc(linkText) + "</a>" : "");
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }

  function openSheet(recipe, per) {
    var ov = document.createElement("div");
    ov.className = "ckr-ov";
    var qty = 1;
    var deep = WORKOUT_URL
      ? '<button class="ckr-btn alt" id="ckrSend">Send to Workout app →</button>' : "";
    ov.innerHTML =
      '<div class="ckr-sheet">' +
        '<div class="ckr-handle"></div>' +
        '<div class="ckr-title">' + esc(recipe.title) + "</div>" +
        '<div class="ckr-sub">Log to your cookbook tracker · per serving</div>' +
        '<div class="ckr-macros">' +
          '<div class="ckr-chip"><div class="ckr-chip-v" id="ckrK">' + per.kcal + '</div><div class="ckr-chip-l">KCAL</div></div>' +
          '<div class="ckr-chip"><div class="ckr-chip-v" id="ckrP">' + per.p + '</div><div class="ckr-chip-l">PROTEIN</div></div>' +
          '<div class="ckr-chip"><div class="ckr-chip-v" id="ckrF">' + per.f + '</div><div class="ckr-chip-l">FAT</div></div>' +
          '<div class="ckr-chip"><div class="ckr-chip-v" id="ckrC">' + per.c + '</div><div class="ckr-chip-l">CARBS</div></div>' +
        "</div>" +
        '<div class="ckr-qty"><div class="ckr-qty-lbl">Servings</div>' +
          '<div class="ckr-qty-ctl"><button class="ckr-qbtn" id="ckrMinus">−</button>' +
          '<div class="ckr-qval" id="ckrQ">1</div>' +
          '<button class="ckr-qbtn" id="ckrPlus">+</button></div></div>' +
        '<button class="ckr-btn" id="ckrAdd">Add to my tracker</button>' + deep +
      "</div>";
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("open"); });
    function close() { ov.classList.remove("open"); setTimeout(function () { ov.remove(); }, 200); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });

    function refresh() {
      ov.querySelector("#ckrQ").textContent = String(qty);
      ov.querySelector("#ckrK").textContent = Math.round(per.kcal * qty);
      ov.querySelector("#ckrP").textContent = Math.round(per.p * qty);
      ov.querySelector("#ckrF").textContent = Math.round(per.f * qty);
      ov.querySelector("#ckrC").textContent = Math.round(per.c * qty);
    }
    ov.querySelector("#ckrMinus").onclick = function () { qty = Math.max(0.5, Math.round((qty - 0.5) * 2) / 2); refresh(); };
    ov.querySelector("#ckrPlus").onclick = function () { qty = Math.round((qty + 0.5) * 2) / 2; refresh(); };

    ov.querySelector("#ckrAdd").onclick = function () {
      if (!window.MCTrackerStore) { alert("Tracker unavailable."); return; }
      MCTrackerStore.addEntry({ name: recipe.title, source: "recipe", unit: "serving", qty: qty, per: per }, Date.now());
      close();
      toast("Added to tracker ✓", "Open tracker", "index.html#tracker");
    };

    if (WORKOUT_URL) {
      ov.querySelector("#ckrSend").onclick = function () {
        var u = WORKOUT_URL + (WORKOUT_URL.indexOf("?") < 0 ? "?" : "&") +
          "tab=nutrition&log=1&name=" + encodeURIComponent(recipe.title) +
          "&kcal=" + Math.round(per.kcal * qty) + "&p=" + Math.round(per.p * qty) +
          "&f=" + Math.round(per.f * qty) + "&c=" + Math.round(per.c * qty);
        location.href = u;
      };
    }
  }

  function init() {
    var recipe = currentRecipe(); if (!recipe) return;
    var per = perServing(recipe); if (!per) return;   // no macros → no button
    injectStyles();
    var mount = document.querySelector("main.app");
    if (!mount || mount.querySelector(".ckr-fab")) return;
    var btn = document.createElement("button");
    btn.className = "ckr-fab"; btn.type = "button";
    btn.innerHTML = "＋ Log to tracker";
    btn.onclick = function () { openSheet(recipe, per); };
    mount.appendChild(btn);
    document.body.classList.add("has-ckr-fab");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
