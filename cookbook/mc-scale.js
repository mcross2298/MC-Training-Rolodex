/* ==========================================================================
   mc-scale.js  —  bi-directional macro/ingredient scaling
   --------------------------------------------------------------------------
   FLAGSHIP_COOKBOOK_ROADMAP.md §2.4. Scaling has only ever flowed one
   direction: pick a serving count, cookbook.js's scaleQuantity() scales
   every ingredient proportionally, and macros stay flat per-serving
   (correctly — CLAUDE.md's data model: "Macros never scale with serving
   count"). This adds the reverse direction as a small, separate, pure
   function: given a macro target ("~40g protein"), how many servings'
   worth of this recipe gets you there, and what do you actually land on?

   Pure, no DOM, no storage — same posture as mc-units.js/mc-pantry.js. The
   whole thing is genuinely simple math BECAUSE macro_profiles is already
   guaranteed per-single-serving and constant across authored tiers (a
   CLAUDE.md-documented, CI-enforced invariant, tools/validate-recipes.js):
   scale = target / perServingValue for whichever field is prioritized. The
   equivalent-servings number this produces is deliberately usable as-is
   with cookbook.js's EXISTING ingredientsFor(r, serving) — it already
   falls back to scaling the native tier for any serving count with no
   authored tier, fractional included — so this file doesn't duplicate that
   scaling logic, only decides what serving count to feed it.

   Priority when more than one target field is given: protein first, then
   calories, then carbs — this app's own stated bias (see CLAUDE.md's
   macro-trend-bias work, which biases meal selection toward protein the
   same way).

   Honesty constraint (the actual point of this file, not an afterthought):
   a single linear scale factor can satisfy every requested target field at
   once only when the recipe's own macro ratios happen to match the
   requested ratios. Anything else is scaling toward the priority field
   exactly and landing wherever that puts the others — `exact: false` on
   the result says so, so a caller can show "closest achievable by scaling"
   instead of presenting an approximation as a fact (the same discipline
   mc-units.js applies by tagging a density-derived quantity as `viaDensity`
   rather than presenting an estimate as an authored one).

   Exposed as window.MCScale.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCScale) return;

  // Protein-first, per this app's own stated bias.
  var PRIORITY = ["protein_g", "calories", "carbs_g"];

  function perServingProfile(recipe, servingBase) {
    var mp = (recipe && recipe.macro_profiles) || {};
    var native = (recipe && recipe.native_serving) || 2;
    return mp["serving_" + servingBase] || mp["serving_" + native] ||
      mp[Object.keys(mp)[0]] || {};
  }

  // target — { protein_g?, calories?, carbs_g? }, all optional; at least one
  // must be a real number or there's nothing to solve for (returns null).
  // Returns { scale, achieved, exact, driver, wanted } where:
  //   scale    — the equivalent serving count that hits `driver`'s target
  //              exactly (feed this straight into ingredientsFor(r, scale)
  //              / macros scale the same way) — or null if the recipe has
  //              no usable data for the driver field at all.
  //   achieved — { calories, protein_g, fat_g, carbs_g } at that scale,
  //              rounded to one decimal; null fields stay null (no data).
  //   exact    — true only when EVERY requested field lands within 5% (or
  //              0.5, whichever is larger) of its target at that one scale
  //              factor — never true by assuming the untested fields work.
  //   driver   — which field the scale factor was actually solved from.
  //   wanted   — the requested fields, in priority order, that were usable.
  function solveScaleForTarget(recipe, servingBase, target) {
    var per = perServingProfile(recipe, servingBase);
    var wanted = PRIORITY.filter(function (k) {
      return target && target[k] != null && target[k] !== "" && !isNaN(parseFloat(target[k]));
    });
    if (!wanted.length) return null;

    var driver = wanted[0];
    var driverPer = per[driver];
    if (driverPer == null || driverPer <= 0) {
      return { scale: null, achieved: null, exact: false, driver: driver, wanted: wanted };
    }

    var scale = parseFloat(target[driver]) / driverPer;
    if (!(scale > 0) || !isFinite(scale)) {
      return { scale: null, achieved: null, exact: false, driver: driver, wanted: wanted };
    }

    var achieved = {};
    ["calories", "protein_g", "fat_g", "carbs_g"].forEach(function (k) {
      achieved[k] = per[k] != null ? Math.round(per[k] * scale * 10) / 10 : null;
    });

    var exact = true;
    wanted.forEach(function (k) {
      var t = parseFloat(target[k]);
      var a = achieved[k];
      if (a == null || Math.abs(a - t) > Math.max(0.5, t * 0.05)) exact = false;
    });

    return { scale: scale, achieved: achieved, exact: exact, driver: driver, wanted: wanted };
  }

  window.MCScale = {
    solveScaleForTarget: solveScaleForTarget
  };
})();
