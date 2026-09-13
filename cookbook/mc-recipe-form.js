/* ==========================================================================
   mc-recipe-form.js  —  "Add Recipe": create your own / add to your library
   --------------------------------------------------------------------------
   Audit C-08, second extraction. A full-screen overlay (reusing the picker
   overlay shell) holding a "Medium" recipe form: title, icon, category,
   structured ingredients (item / qty / unit / Meat·Dairy·Produce·Pantry),
   numbered steps, and an optional per-serving Nutrition section (roadmap:
   "Recipe Capture & Import Pipeline" — this form used to only *show* a
   parsed import's detected macros, with nowhere to actually save them; now
   it does). On save the recipe is persisted via MCUser and merged into the
   live data layer, so it appears immediately in the "My Recipes" collection,
   search, Browse and the planner.

   Lifted out because it is genuinely separable: 232 lines that reference only
   six things defined elsewhere (`CATEGORY_ORDER`, `closePicker`, `el`, `esc`,
   `recipes`, `setTab`) and hand back exactly one entry point. Compare the
   planner, which is five times bigger, sits in one contiguous block, and
   references 66 — see mc-grocery.js's header for why that one stayed put.

   Wire it up with MCRecipeForm.configure({...}); call MCRecipeForm.open().

   Exposed as window.MCRecipeForm.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCRecipeForm) return;

  /* ── host hooks ──────────────────────────────────────────────────────── */
  var H = {
    categoryOrder: function () { return []; },
    closePicker:   function () {},
    recipes:       function () { return window.RECIPES || []; },
    setTab:        function () {}
  };
  function configure(hooks) {
    Object.keys(hooks || {}).forEach(function (k) {
      if (typeof hooks[k] === "function") H[k] = hooks[k];
    });
  }

  /* ── local copies of the two DOM helpers every file in this app keeps ── */
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
  // Aliases so the moved code below reads exactly as it did in place.
  function closePicker() { H.closePicker(); }
  function recipes()     { return H.recipes(); }
  function setTab(n)     { H.setTab(n); }

  /* ══ ADD-RECIPE FORM — create your own / add to library ═════════════ */
  // A full-screen overlay (reuses the picker overlay shell) holding a "Medium"
  // recipe form: title, icon, category, structured ingredients (item / qty /
  // unit / Meat·Dairy·Produce·Pantry) and numbered steps — no macros. On save
  // the recipe is persisted via MCUser and merged into the live data layer, so
  // it appears immediately in the "My Recipes" collection, search, Categories
  // and the planner.
  var GROC_CATS = ["Meat", "Dairy", "Produce", "Pantry"];
  var FORM_ACCENTS = ["#7D8C77", "#C87A53", "#B08D57", "#B23A48", "#C0633F", "#E0A458", "#5E6B8C"];

  function rfLabel(text) { return el("label", "rf-label", esc(text)); }
  function rfText(ph, value) {
    var i = el("input", "search-box rf-input");
    i.type = "text";
    i.placeholder = ph || "";
    if (value != null) i.value = value;
    return i;
  }
  function rfNumber(ph) {
    var i = el("input", "search-box rf-input rf-num");
    i.type = "number"; i.min = "0"; i.placeholder = ph || "";
    i.setAttribute("inputmode", "numeric");
    return i;
  }
  function rfArea(ph, value) {
    var t = el("textarea", "search-box rf-textarea");
    t.placeholder = ph || ""; t.rows = 3;
    if (value != null) t.value = value;
    return t;
  }
  function rfField(labelText, control, hint) {
    var f = el("div", "rf-field");
    f.appendChild(rfLabel(labelText));
    f.appendChild(control);
    if (hint) f.appendChild(el("p", "rf-hint", esc(hint)));
    return f;
  }

  // `prefill` — { quantity, unit, item, category } — optional; populates a
  // row from a parsed import (mc-import.js) instead of starting it blank.
  function rfIngredientRow(prefill) {
    var row = el("div", "rf-ing");
    var qty  = rfText("Qty", prefill && prefill.quantity);  qty.classList.add("rf-ing-qty");
    var unit = rfText("Unit", prefill && prefill.unit); unit.classList.add("rf-ing-unit");
    var item = rfText("Ingredient", prefill && prefill.item); item.classList.add("rf-ing-item");
    var cat  = el("select", "plan-select rf-ing-cat");
    GROC_CATS.forEach(function (c) {
      var o = el("option", null, esc(c)); o.value = c; cat.appendChild(o);
    });
    if (prefill && prefill.category) cat.value = prefill.category;
    var rm = el("button", "rf-row-remove", "✕");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove ingredient");
    rm.addEventListener("click", function () { if (row.parentNode) row.parentNode.removeChild(row); });
    row.appendChild(qty); row.appendChild(unit); row.appendChild(item);
    row.appendChild(cat); row.appendChild(rm);
    row._read = function () {
      return { quantity: qty.value, unit: unit.value, item: item.value, category: cat.value };
    };
    return row;
  }

  // `prefill` — { title, detail } — optional; populates a row from a parsed
  // import (mc-import.js) instead of starting it blank.
  function rfStepRow(stepWrap, prefill) {
    var row = el("div", "rf-step");
    var head = el("div", "rf-step-head");
    head.appendChild(el("span", "rf-step-num", ""));
    var rm = el("button", "rf-row-remove", "✕");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove step");
    rm.addEventListener("click", function () {
      if (row.parentNode) { row.parentNode.removeChild(row); rfRenumber(stepWrap); }
    });
    head.appendChild(rm);
    row.appendChild(head);
    var title  = rfText("Step title (optional)", prefill && prefill.title);
    var detail = rfArea("What to do… (durations like “simmer 20 minutes” become tap-to-start timers)", prefill && prefill.detail);
    row.appendChild(title); row.appendChild(detail);
    row._read = function () { return { title: title.value, detail: detail.value }; };
    return row;
  }
  function rfRenumber(stepWrap) {
    var n = 1;
    Array.prototype.forEach.call(stepWrap.children, function (row) {
      var num = row.querySelector(".rf-step-num");
      if (num) num.textContent = String(n++);
    });
  }

  function closeRecipeForm() {
    var ov = document.querySelector(".recipe-form");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove("picking");
  }

  // `prefill` is optional. The Web Share Target flow (cookbook-home.js's
  // handleSharedRecipe()) passes just { title, description }. The URL-import
  // flow (cookbook-home.js's runUrlImport(), via mc-import.js's parsed
  // shape) can pass the fuller { title, description, prep_time_mins,
  // cook_time_mins, base_serving, ingredients, steps, macros, via } — every
  // field is optional and missing ones just leave that part of the form
  // blank for the cook to fill in themselves, same as today. `category`,
  // `icon` and `accent` are never prefilled from either source — a parser
  // can't reliably guess them, and they're one tap each to set.
  function openRecipeForm(prefill) {
    closePicker();
    closeRecipeForm();

    var selectedAccent = FORM_ACCENTS[0];

    var ov = el("div", "picker recipe-form");

    // Top bar: Cancel · title · Save
    var top = el("div", "picker-top");
    var cancel = el("button", "picker-close rf-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", closeRecipeForm);
    top.appendChild(cancel);
    top.appendChild(el("div", "picker-title", "Add a Recipe"));
    var saveTop = el("button", "picker-close rf-save-top", "Save");
    saveTop.type = "button";
    top.appendChild(saveTop);
    ov.appendChild(top);

    var body = el("div", "rf-body");

    // ── Basics ──
    var titleInput = rfText("e.g. Grandma's Pot Roast", prefill && prefill.title);
    body.appendChild(rfField("Title", titleInput));

    if (prefill && prefill.via) {
      body.appendChild(el("p", "rf-hint rf-via-hint",
        "Imported from " + esc(prefill.via) + " — everything below is a best-effort read of that page. Check it over before saving."));
    }

    var iconInput = rfText("🍽️", "🍽️");
    iconInput.classList.add("rf-icon-input");
    body.appendChild(rfField("Icon", iconInput, "An emoji for the card. Tap to change it."));

    var catSel = el("select", "plan-select rf-select");
    var ph = el("option", null, "Choose a category…"); ph.value = ""; catSel.appendChild(ph);
    H.categoryOrder().forEach(function (c) {
      var o = el("option", null, esc(c)); o.value = c; catSel.appendChild(o);
    });
    body.appendChild(rfField("Category", catSel));

    var descInput = rfArea("A short description (optional)", prefill && prefill.description);
    body.appendChild(rfField("Description", descInput));

    // Nutrition — optional, per single serving (never scaled with the
    // serving count, same invariant recipes-data.js's built-ins follow).
    // Prefilled from an imported page's schema.org data when present; a
    // hand-typed recipe starts blank. All four fields optional — leaving
    // every one blank keeps this recipe macro-free, exactly like before
    // this section existed.
    var mm = (prefill && prefill.macros) || {};
    var macCal   = rfNumber("kcal");    if (mm.calories   != null) macCal.value   = mm.calories;
    var macProt  = rfNumber("g");       if (mm.protein_g  != null) macProt.value  = mm.protein_g;
    var macFat   = rfNumber("g");       if (mm.fat_g      != null) macFat.value   = mm.fat_g;
    var macCarbs = rfNumber("g");       if (mm.carbs_g    != null) macCarbs.value = mm.carbs_g;
    body.appendChild(el("div", "tier-label rf-section", "Nutrition (optional)"));
    body.appendChild(el("p", "rf-hint rf-section-hint",
      (prefill && prefill.macros)
        ? "Detected from the imported page, per serving — check it over."
        : "Per serving. Leave blank to skip — this recipe just won't show a macro card."));
    var macRow = el("div", "rf-times");
    macRow.appendChild(rfField("Calories", macCal));
    macRow.appendChild(rfField("Protein (g)", macProt));
    macRow.appendChild(rfField("Fat (g)", macFat));
    macRow.appendChild(rfField("Carbs (g)", macCarbs));
    body.appendChild(macRow);

    var tagsInput = rfText("Spicy, One-Dish, High-Protein");
    body.appendChild(rfField("Tags", tagsInput, "Comma-separated (optional)."));

    // Accent swatches
    var swatches = el("div", "rf-swatches");
    FORM_ACCENTS.forEach(function (hex, i) {
      var sw = el("button", "rf-swatch" + (i === 0 ? " active" : ""));
      sw.type = "button";
      sw.style.background = hex;
      sw.style.setProperty("--sw", hex);   // lets the active ring match this swatch's own color
      sw.setAttribute("aria-label", "Accent color " + (i + 1));
      sw.addEventListener("click", function () {
        selectedAccent = hex;
        Array.prototype.forEach.call(swatches.children, function (n) { n.classList.remove("active"); });
        sw.classList.add("active");
      });
      swatches.appendChild(sw);
    });
    body.appendChild(rfField("Accent color", swatches));

    // Times + serving size
    var times = el("div", "rf-times");
    var prepInput = rfNumber("0");
    if (prefill && prefill.prep_time_mins != null) prepInput.value = prefill.prep_time_mins;
    var cookInput = rfNumber("0");
    if (prefill && prefill.cook_time_mins != null) cookInput.value = prefill.cook_time_mins;
    var servInput = rfNumber("2");
    servInput.value = (prefill && prefill.base_serving) ? prefill.base_serving : "2";
    times.appendChild(rfField("Prep (min)", prepInput));
    times.appendChild(rfField("Cook (min)", cookInput));
    times.appendChild(rfField("Makes (servings)", servInput));
    body.appendChild(times);

    // ── Ingredients ──
    body.appendChild(el("div", "tier-label rf-section", "Ingredients"));
    body.appendChild(el("p", "rf-hint rf-section-hint",
      "Amounts are for the serving count above; the app scales them automatically."));
    var ingWrap = el("div", "rf-ing-wrap");
    if (prefill && prefill.ingredients && prefill.ingredients.length) {
      prefill.ingredients.forEach(function (ing) { ingWrap.appendChild(rfIngredientRow(ing)); });
    } else {
      ingWrap.appendChild(rfIngredientRow());
      ingWrap.appendChild(rfIngredientRow());
    }
    body.appendChild(ingWrap);
    var addIng = el("button", "rf-add", "＋ Add ingredient");
    addIng.type = "button";
    addIng.addEventListener("click", function () { ingWrap.appendChild(rfIngredientRow()); });
    body.appendChild(addIng);

    // ── Steps ──
    body.appendChild(el("div", "tier-label rf-section", "Method"));
    var stepWrap = el("div", "rf-step-wrap");
    body.appendChild(stepWrap);
    function addStepRow(stepPrefill) { stepWrap.appendChild(rfStepRow(stepWrap, stepPrefill)); rfRenumber(stepWrap); }
    if (prefill && prefill.steps && prefill.steps.length) {
      prefill.steps.forEach(function (s) { addStepRow(s); });
    } else {
      addStepRow();
    }
    var addStep = el("button", "rf-add", "＋ Add step");
    addStep.type = "button";
    addStep.addEventListener("click", addStepRow);
    body.appendChild(addStep);

    // Error line + primary Save
    var errBox = el("p", "rf-error", "");
    body.appendChild(errBox);
    var save = el("button", "cook-start rf-save", "Save recipe");
    save.type = "button";
    body.appendChild(save);

    ov.appendChild(body);

    function doSave() {
      errBox.textContent = "";
      var title = titleInput.value.trim();
      if (!title) { errBox.textContent = "Give your recipe a title."; titleInput.focus(); return; }
      if (!catSel.value) { errBox.textContent = "Choose a category."; catSel.focus(); return; }

      var ings = Array.prototype.map.call(ingWrap.children, function (r) {
        return r._read ? r._read() : null;
      }).filter(function (x) { return x && x.item.trim(); });
      if (!ings.length) { errBox.textContent = "Add at least one ingredient."; return; }

      var steps = Array.prototype.map.call(stepWrap.children, function (r) {
        return r._read ? r._read() : null;
      }).filter(function (x) { return x && x.detail.trim(); });
      if (!steps.length) { errBox.textContent = "Add at least one step (with instructions)."; return; }

      var result = window.MCUser.add({
        title: title,
        icon: iconInput.value,
        dish_category: catSel.value,
        description: descInput.value,
        tags: tagsInput.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean),
        accent: selectedAccent,
        prep_time_mins: prepInput.value,
        cook_time_mins: cookInput.value,
        base_serving: servInput.value,
        ingredients: ings,
        steps: steps,
        macros: {
          calories: macCal.value, protein_g: macProt.value,
          fat_g: macFat.value, carbs_g: macCarbs.value
        }
      });

      if (!result.saved) {
        // Storage is full: the recipe is visible for the rest of this
        // session (MCUser.add still merges it into window.RECIPES) but
        // won't survive a refresh. Say so and leave the form open rather
        // than closing on what looks like a successful save.
        errBox.textContent = "Storage is full — this recipe won't be saved after you close the app. Free up space (Backup & Restore → remove some cook-log photos) and try again.";
        return;
      }

      closeRecipeForm();
      setTab("recipes");   // land on the Recipes screen → My Recipes card updated
    }
    save.addEventListener("click", doSave);
    saveTop.addEventListener("click", doSave);

    document.body.appendChild(ov);
    document.body.classList.add("picking");
    titleInput.focus();
  }

  window.MCRecipeForm = {
    configure: configure,
    open: openRecipeForm
  };
})();
