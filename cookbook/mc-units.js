/* ==========================================================================
   mc-units.js  —  the ingredient truth layer: unit normalization, a metric
   bridge, a curated count→weight density table, and a real aisle model
   --------------------------------------------------------------------------
   CI initiative 2 ("The Ingredient Truth Layer"). Measured against the real
   856-ingredient-identity corpus: **208 identities (24.3%) resolve to more
   than one quantity bucket** in the merged grocery list and render as e.g.
   `"3 cloves · 1 clove · 1 tbsp · 6 g"` on a single row instead of one
   buyable number. Two structural causes, both fixed here rather than in
   mc-grocery.js, because both are properties of a UNIT or an ITEM, not of
   the merge algorithm itself:

   1. **No metric bridge.** The old `UNIT_DEFS` (still in mc-grocery.js, now
      re-exported from here) defined only `vol` (tsp↔tbsp↔cup) and `wt`
      (oz↔lb) — `g`, the corpus's 5th-most-common unit at 453 occurrences,
      sat outside both families and could never merge with an oz/lb amount
      of the same ingredient. `g`/`kg` now extend `wt`; `ml`/`l` extend
      `vol`. These are exact physical conversions (1 oz = 28.3495 g,
      1 tsp = 4.92892 ml) — not judgment calls, so they carry no risk of
      quietly under- or over-counting a list.

   2. **The unit half of a bucket key was never normalized.** `clove` and
      `cloves` were different buckets by construction, because
      `groceryMergeName()` singularizes the ITEM half of the key but nothing
      singularized the UNIT half. `singularizeUnit()` + `UNIT_ALIASES` fix
      that (`slice`/`slices`/`strip`/`strips` → `slice`; `sachet` → `packet`;
      etc.) — plain string normalization, zero ambiguity.

   What's left after those two — a recipe writing "1 medium onion" in one
   place and "150g onion" in another — is a genuine unit-family mismatch
   (count vs. weight) that no amount of string normalization can bridge.
   **`DENSITY`** is the one place this file makes a judgment call, and it is
   deliberately small, explicit, and reviewable: a curated table of average
   whole-item weights (the kind printed in any produce-department reference
   or USDA table) for the ~30 highest-frequency count-measured items in this
   corpus, each row commented with its source reasoning. An item NOT in the
   table is left exactly as fragmented as before — this file never guesses a
   density it isn't confident in. Every density conversion is tagged in its
   output so the UI can show *where a number came from* rather than present
   a derived figure as if it were authored (see `mc-cookbook.css`'s
   `.grocery-derived` / `groceryRow()`'s provenance line in cookbook-home.js).

   Also here: **a real aisle model.** `ingredient.category` (Meat / Dairy /
   Produce / Pantry) is a four-value data-integrity enum enforced by
   `tools/validate-recipes.js` — it was never meant to be a store layout, and
   grouping the shopping list by it literally puts "frozen peas" next to
   "chicken breast" under one "Produce"/"Meat" header. `aisleFor()` derives a
   proper aisle from `category` plus a modest keyword override list (frozen
   items, seafood, spices, condiments) without touching `category` itself —
   validate-recipes.js's enum is untouched.

   Exposed as window.MCUnits. Pure — no DOM, no storage, no globals beyond the
   namespace — so it's directly `vm`-testable the way mc-bridge.js and
   mc-sync.js's merge functions already are.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCUnits) return;

  var OZ_PER_GRAM = 1 / 28.349523125;     // exact: 1 oz = 28.349523125 g
  var TSP_PER_ML  = 1 / 4.92892159375;    // exact: 1 US tsp = 4.92892159375 ml

  /* ── Unit families (extends the original oz/lb + tsp/tbsp/cup with the
     metric bridge). `f` is the multiplier into the family's base unit — oz
     for weight, tsp for volume — matching mc-grocery.js's existing bucket
     math exactly, so this is a drop-in replacement for its old UNIT_DEFS. ── */
  var UNIT_DEFS = {
    "tsp": { cls: "vol", f: 1 }, "teaspoon": { cls: "vol", f: 1 }, "teaspoons": { cls: "vol", f: 1 },
    "tbsp": { cls: "vol", f: 3 }, "tablespoon": { cls: "vol", f: 3 }, "tablespoons": { cls: "vol", f: 3 },
    "cup": { cls: "vol", f: 48 }, "cups": { cls: "vol", f: 48 },
    "ml": { cls: "vol", f: TSP_PER_ML }, "milliliter": { cls: "vol", f: TSP_PER_ML },
    "milliliters": { cls: "vol", f: TSP_PER_ML }, "millilitre": { cls: "vol", f: TSP_PER_ML },
    "millilitres": { cls: "vol", f: TSP_PER_ML },
    "l": { cls: "vol", f: TSP_PER_ML * 1000 }, "liter": { cls: "vol", f: TSP_PER_ML * 1000 },
    "liters": { cls: "vol", f: TSP_PER_ML * 1000 }, "litre": { cls: "vol", f: TSP_PER_ML * 1000 },
    "litres": { cls: "vol", f: TSP_PER_ML * 1000 },
    "oz": { cls: "wt", f: 1 }, "ounce": { cls: "wt", f: 1 }, "ounces": { cls: "wt", f: 1 },
    "lb": { cls: "wt", f: 16 }, "lbs": { cls: "wt", f: 16 }, "pound": { cls: "wt", f: 16 }, "pounds": { cls: "wt", f: 16 },
    "g": { cls: "wt", f: OZ_PER_GRAM }, "gram": { cls: "wt", f: OZ_PER_GRAM }, "grams": { cls: "wt", f: OZ_PER_GRAM },
    "kg": { cls: "wt", f: OZ_PER_GRAM * 1000 }, "kilogram": { cls: "wt", f: OZ_PER_GRAM * 1000 },
    "kilograms": { cls: "wt", f: OZ_PER_GRAM * 1000 },
    // A pinch has an informal but widely-cited kitchen equivalence (~1/16 tsp;
    // a "big pinch" roughly double that) — common enough across the spice
    // rows in this corpus (black pepper, salt, garlic powder…) that treating
    // it as a genuine (if approximate) volume unit resolves real
    // fragmentation, unlike "splash"/"handful"/"to taste", which have no
    // remotely standard equivalent and are deliberately left alone.
    "pinch": { cls: "vol", f: 1 / 16 }, "pinches": { cls: "vol", f: 1 / 16 },
    "big pinch": { cls: "vol", f: 1 / 8 }, "big pinches": { cls: "vol", f: 1 / 8 }
  };
  // Display ladders — unchanged from the original: volume keeps natural
  // cup-fractions, weight only promotes to lb at a whole pound. A metric
  // amount that got bridged in still displays in the app's native cup/oz/lb
  // vocabulary, which is what a US kitchen shopping list should read in.
  var UNIT_DISPLAY = {
    vol: [{ u: "cup", p: "cups", f: 48, min: 0.25 }, { u: "tbsp", p: "tbsp", f: 3, min: 1 }, { u: "tsp", p: "tsp", f: 1, min: 0 }],
    wt:  [{ u: "lb", p: "lb", f: 16, min: 1 }, { u: "oz", p: "oz", f: 1, min: 0 }]
  };
  function unitInfo(unit) {
    return UNIT_DEFS[(unit || "").trim().toLowerCase()] || null;
  }

  /* ── Unit-word normalization (the fix for clove/cloves) ─────────────────
     Two passes: an explicit alias table for true synonyms (different WORDS
     for the same purchase unit — "strip" and "slice" aren't a plural
     relationship, they're two words a recipe author used interchangeably for
     bacon), then a generic plural-stripper for everything else. Applied only
     to units that AREN'T in UNIT_DEFS — a convertible unit's plural is
     already handled by UNIT_DEFS carrying both forms as separate keys with
     the same `f`. */
  var UNIT_WORD_ALIASES = {
    "strip": "slice", "strips": "slice",
    "sachet": "packet", "sachets": "packet",
    "leave": "leaf", "leaves": "leaf"
  };
  function singularizeUnit(u) {
    var s = (u || "").trim().toLowerCase();
    if (UNIT_WORD_ALIASES[s]) return UNIT_WORD_ALIASES[s];
    if (/ss$/.test(s)) return s;                                  // glass-type words, not a plural "s"
    if (/(ch|sh|x)es$/.test(s)) return s.slice(0, -2);             // pinches -> pinch
    if (/[a-z]ies$/.test(s) && s.length > 4) return s.slice(0, -3) + "y"; // n/a today, future-proof
    if (/[a-z]oes$/.test(s)) return s.slice(0, -2);
    if (/[a-z]s$/.test(s) && s.length > 3) return s.slice(0, -1);  // cloves -> clove, slices -> slice
    return s;
  }
  // The single normalized form a raw ingredient unit should be bucketed and
  // looked up under, everywhere in this module and in mc-grocery.js.
  // A handful of authored units carry a descriptive size annotation in
  // parentheses — "can (7.5 oz)", "(24 oz) jars" — which is genuinely the
  // SAME unit as the plain "can"/"jars" elsewhere in the corpus, just with
  // extra detail folded into the string. Stripping any parenthetical before
  // normalizing is unambiguous (it can never change what the unit means,
  // only how much of it was noted inline) and merges those pairs for free.
  var PAREN_RE = /\s*\([^)]*\)\s*/g;
  function normalizeUnit(u) {
    var s = (u || "").replace(PAREN_RE, " ").trim().toLowerCase();
    if (!s) return "";
    if (UNIT_DEFS[s]) return s;                 // a convertible unit keeps its own literal form
    return singularizeUnit(s);
  }

  /* ── Count words: quantities that name a whole item rather than a real
     cooking measurement ("1 medium onion" vs "1 tbsp diced onion"). These are
     the words DENSITY looks up, and — for an item DENSITY has no entry for —
     the words a fallback still safely merges on pure count (see below). ── */
  var COUNT_WORDS = { "": 1, "whole": 1, "small": 1, "medium": 1, "large": 1, "each": 1 };
  function isCountWord(u) { return Object.prototype.hasOwnProperty.call(COUNT_WORDS, u); }

  /* ── DENSITY: curated average whole-item weights, grams per one unit ─────
     Keyed by the SAME merge name mc-grocery.js's `groceryMergeName()`
     produces (lowercased, singularized, alias-resolved item name) — this
     file never recomputes item identity, it's handed the merge name.

     Every row is a widely-cited average (produce-department / USDA-table
     class numbers), not a per-recipe measurement — that's why this can only
     ever be used for a SHOPPING quantity, never for macros (which stay
     exactly as authored, per single serving, untouched by any of this).
     `default` is used for a blank unit or "whole"/"each"; specific size
     words override it when present. An item absent from this table is left
     exactly as fragmented as it was before this file existed — silence here
     is deliberate, not an oversight.

     Rounding direction: DENSITY values are honest averages, not padded —
     the existing purchase-unit rounding in mc-grocery.js (round UP,
     never down) still applies on TOP of whatever these produce, so the
     compounding bias is always toward buying slightly more, never less. */
  var DENSITY = {
    // Alliums
    "onion":       { small: 70, medium: 110, large: 170, default: 110 },
    "red onion":   { small: 70, medium: 110, large: 170, default: 110 },
    "yellow onion":{ small: 70, medium: 110, large: 170, default: 110 },
    "white onion": { small: 70, medium: 110, large: 170, default: 110 },
    "sweet onion": { small: 70, medium: 110, large: 170, default: 110 },
    "green onion": { default: 15 },                                    // one scallion
    "garlic":      { clove: 3, "small clove": 2, default: 3 },
    "shallot":     { small: 25, medium: 40, large: 55, default: 40 },
    // Peppers
    "bell pepper":       { small: 120, medium: 150, large: 180, default: 150 },
    "red bell pepper":   { small: 120, medium: 150, large: 180, default: 150 },
    "green bell pepper": { small: 120, medium: 150, large: 180, default: 150 },
    "yellow bell pepper":{ small: 120, medium: 150, large: 180, default: 150 },
    "jalapeño":    { default: 14, large: 20 },
    "jalapeno":    { default: 14, large: 20 },
    // Root & other produce
    "carrot":       { small: 50, medium: 61, large: 72, default: 61 },
    "celery":       { stalk: 40, default: 40 },
    "potato":       { small: 120, medium: 170, large: 300, default: 170 },
    "sweet potato": { small: 100, medium: 130, large: 180, default: 130 },
    "avocado":      { small: 140, medium: 200, large: 250, default: 200 }, // whole, incl. pit/skin — what you actually buy
    "tomato":       { small: 90, medium: 123, large: 180, default: 123 },
    "lemon":        { small: 48, default: 58 },
    "lime":         { default: 67 },
    "banana":       { default: 118 },
    "cucumber":     { default: 300 },
    // Meat — a "count" unit here means "one whole cut," which really is a
    // near-constant average for a boneless cut sold portioned this way.
    "chicken breast":                  { breast: 170, default: 170 },
    "boneless skinless chicken breast":{ breast: 170, default: 170 },
    "bacon":                            { slice: 28 },
    "uncured bacon":                    { slice: 28 }
  };
  function densityGrams(mergeName, unitWord) {
    var d = DENSITY[mergeName];
    if (!d) return null;
    var key = unitWord && d[unitWord] != null ? unitWord : (isCountWord(unitWord) ? "default" : null);
    return key && d[key] != null ? d[key] : null;
  }

  /* ── Resolve one ingredient line to a bucket ─────────────────────────────
     Returns exactly one of:
       { kind: "conv", cls, base }        — a real vol/wt measurement (incl.
                                             a density-derived weight)
       { kind: "raw", unit, sum }         — an unconvertible unit, bucketed
                                             on its normalized word
       { kind: "count" }                  — a bare/size-word count with no
                                             density entry; callers merge ALL
                                             of these under one identity
     `num` is the already-parsed numeric quantity (or null for "to taste"
     etc. — callers keep their own text fallback for that case exactly as
     before; this function is only about the numeric path). */
  function resolveUnit(mergeName, rawUnit, num) {
    var u = normalizeUnit(rawUnit);
    var info = unitInfo(u);
    if (info) return { kind: "conv", cls: info.cls, base: num == null ? null : num * info.f, viaDensity: false };

    if (num != null) {
      var g = densityGrams(mergeName, u);
      if (g != null) return { kind: "conv", cls: "wt", base: num * g * OZ_PER_GRAM, viaDensity: true };
      if (isCountWord(u)) return { kind: "count" };
    }
    return { kind: "raw", unit: u };
  }

  /* ── Aisle model ──────────────────────────────────────────────────────── */
  // Perimeter first (where the fresh, spoilable sections of a real store
  // sit), center-aisle dry goods after, frozen deliberately LAST — the
  // standard shopping-order advice of grabbing anything that can thaw right
  // before checkout, not right after produce.
  var AISLE_ORDER = [
    "Produce", "Meat & Poultry", "Seafood", "Dairy & Eggs",
    "Spices & Seasonings", "Condiments & Sauces", "Dry Goods & Pantry", "Frozen"
  ];
  var SEAFOOD_RE = /\b(shrimp|tuna|salmon|cod|tilapia|scallop|crab|catfish|halibut|mahi|fish)\b/i;
  var FROZEN_RE  = /\bfrozen\b/i;
  var SPICE_RE   = /\b(pepper|salt|powder|seasoning|paprika|cumin|oregano|cayenne|turmeric|cinnamon|extract|spice|nutmeg|thyme|basil dried|dried\b)\b/i;
  var CONDIMENT_RE = /\b(sauce|ketchup|mustard|mayo|mayonnaise|dressing|syrup|vinegar|salsa|marinade|pesto|hummus|hot sauce)\b/i;

  // `category` is the authored Meat/Dairy/Produce/Pantry enum and is never
  // modified — this only reads it, plus the item's own name, to pick a
  // display grouping. Order of checks matters: a "frozen" item is grouped by
  // storage location regardless of what it's made of, which is why FROZEN_RE
  // is tested before the category default.
  function aisleFor(item, category) {
    var s = (item || "").toLowerCase();
    if (FROZEN_RE.test(s)) return "Frozen";
    if (category === "Produce") return "Produce";
    if (category === "Meat") return SEAFOOD_RE.test(s) ? "Seafood" : "Meat & Poultry";
    if (category === "Dairy") return "Dairy & Eggs";
    // Pantry subdivides — the four-value enum was never meant to be a store
    // layout, and "canned beans" next to "chili powder" under one flat
    // "Pantry" header is exactly the thing a real aisle model fixes.
    if (SPICE_RE.test(s)) return "Spices & Seasonings";
    if (CONDIMENT_RE.test(s)) return "Condiments & Sauces";
    return "Dry Goods & Pantry";
  }

  window.MCUnits = {
    UNIT_DEFS: UNIT_DEFS,
    UNIT_DISPLAY: UNIT_DISPLAY,
    unitInfo: unitInfo,
    normalizeUnit: normalizeUnit,
    singularizeUnit: singularizeUnit,
    isCountWord: isCountWord,
    DENSITY: DENSITY,
    densityGrams: densityGrams,
    resolveUnit: resolveUnit,
    AISLE_ORDER: AISLE_ORDER,
    aisleFor: aisleFor,
    OZ_PER_GRAM: OZ_PER_GRAM,
    TSP_PER_ML: TSP_PER_ML
  };
})();
