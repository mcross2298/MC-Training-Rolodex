/* ==========================================================================
   mc-pantry.js  —  the pantry quantity comparison engine
   --------------------------------------------------------------------------
   First slice of FLAGSHIP_COOKBOOK_ROADMAP.md's "Real Pantry Inventory +
   Dynamic Substitution." Today `mc-cookbook:pantry` (cookbook-home.js) is a
   flat Set of staple names — binary have/don't-have, no quantity. This
   module answers the question that gap makes impossible: given a recipe
   needs "3 cloves garlic" and the pantry has "1 clove" recorded, is that
   enough, short, or not comparable at all?

   Pure, no DOM, no storage — same posture as mc-units.js, which this module
   is built directly on top of rather than duplicating: both the recipe's
   need and the pantry's have amount go through the exact same
   MCUnits.resolveUnit(mergeName, unit, num) bucketing mc-grocery.js already
   uses to merge a shopping list, so "are these two amounts the same kind of
   thing" is answered identically here and there — one definition, not two
   that can quietly drift apart.

   Four possible results, not three, because "the pantry entry exists but
   has no recorded quantity" is a real, common, and deliberately different
   case from "not enough":
     - "enough"        have >= need, in a comparable unit.
     - "short"         have < need, in a comparable unit — `short` carries
                        how much more is needed, in whatever form the two
                        resolved to (a base-unit amount for a real vol/wt
                        measurement, or a plain qty+unit for a raw/count
                        mismatch that couldn't convert further).
     - "unquantified"  the pantry has this staple, but with no qty/unit ever
                        recorded for it — the binary case every existing
                        caller (pantryMatchInfo, the low-shopping filter,
                        grocery-row suppression) already handles today, and
                        must keep behaving exactly as it does now. Callers
                        should fall back to that existing behavior on this
                        result, not treat a missing quantity as zero.
     - "unknown"       either side didn't resolve to a comparable bucket (a
                        genuine unit-family mismatch, or an unparseable
                        quantity like "to taste") — mc-units.js's own
                        "leave it fragmented rather than guess" posture,
                        applied to comparison instead of summing.

   **Wired as of the "This Week" planner's grocery list** (the first UI
   slice): `cookbook-home.js`'s `renderGroceryPane()` calls `compare()` for
   any pantry-flagged row that `mc-grocery.js`'s `buildGrocery()` could
   reduce to a single comparable `need` (see that file's own header) against
   a recorded `mc-cookbook:pantryqty` entry. `"enough"` keeps a staple off
   the buy list exactly as the binary toggle always did; `"short"` puts it
   back on the list with how much more is needed; `"unquantified"` /
   `"unknown"` — including the multi-bucket-per-row case buildGrocery()
   itself declines to reduce — fall back to that same original binary
   behavior, never inventing a number. A 📏 button on any pantry-footer row
   opens `openPantryQtyEditor()` to record or change the amount.

   **`recipe.html`'s Grocery tab reads the pantry now too** (tri-state
   substitution slice) — but only inside its existing "Don't have it on
   hand?" substitution card, not as per-row badges on the shopping list
   itself: that list stays a pure list, unchanged ("a pure shopping list,"
   Phase 3 §3.1). `cookbook.js`'s `renderGrocery()` calls `compare()` for
   any ingredient with a known `mc-search.js` substitution and a recorded
   pantry quantity — `"enough"` drops the note entirely (reduces noise),
   `"short"` names both amounts, and `"unquantified"`/`"unknown"` (including
   no pantry entry at all) fall back to the original generic note, same
   honesty posture as everywhere else this module is used.
   `pantryMatchInfo()`, `pantryCandidates()` and `groceryItemCount()` stay
   binary-only — extending each to be quantity-aware is real, separate
   design work, not a mechanical follow-up.

   Exposed as window.MCPantry.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCPantry) return;

  // compare(mergeName, needQty, needUnit, haveQty, haveUnit)
  //   mergeName        — MCGrocery.groceryMergeName(item); DENSITY lookups
  //                       key on this, not the raw item text.
  //   needQty/needUnit — the recipe's (already-scaled) required amount.
  //   haveQty/haveUnit — the pantry's recorded amount, or (null, null) for
  //                       an unquantified entry.
  // Returns { status, short } — `short` is non-null only when status is
  // "short": either { base, cls } (both sides resolved to the same real
  // vol/wt measurement family — `base` is in that family's base unit,
  // tsp for vol / oz for wt, same as mc-units.js's own `resolveUnit`
  // output, left unformatted on purpose — see this file's header) or
  // { qty, unit } (both sides resolved to the same raw unit, or both were
  // bare counts, in which case `unit` is null).
  function compare(mergeName, needQty, needUnit, haveQty, haveUnit) {
    if (needQty == null) return { status: "unknown", short: null };
    if (haveQty == null) return { status: "unquantified", short: null };

    var need = MCUnits.resolveUnit(mergeName, needUnit, needQty);
    var have = MCUnits.resolveUnit(mergeName, haveUnit, haveQty);

    if (need.kind === "conv" && have.kind === "conv" && need.cls === have.cls) {
      var needBase = need.base == null ? 0 : need.base;
      var haveBase = have.base == null ? 0 : have.base;
      if (haveBase + 1e-9 >= needBase) return { status: "enough", short: null };
      return { status: "short", short: { base: needBase - haveBase, cls: need.cls } };
    }

    if (need.kind === "count" && have.kind === "count") {
      if (haveQty + 1e-9 >= needQty) return { status: "enough", short: null };
      return { status: "short", short: { qty: needQty - haveQty, unit: null } };
    }

    if (need.kind === "raw" && have.kind === "raw" && need.unit && need.unit === have.unit) {
      if (haveQty + 1e-9 >= needQty) return { status: "enough", short: null };
      return { status: "short", short: { qty: needQty - haveQty, unit: need.unit } };
    }

    return { status: "unknown", short: null };
  }

  window.MCPantry = {
    compare: compare
  };
})();
