# Mike's Cookbook — Flagship Production Roadmap

**Date:** 2026-09-02
**Method:** Codebase audit (direct file reads — `cookbook.js`, `cookbook-home.js`, `mc-timers.js`,
`mc-search.js`, `mc-units.js`, `mc-grocery.js`, `mc-recipe-form.js`, `mc-data.js`, `recipes-data.js`,
`features.js`, `ROADMAP.md`, `CLAUDE.md`, `.github/workflows/pages.yml`) plus targeted web research
on three named competitors. Every claim below is either (a) grounded in a specific file/line in this
repo, cited inline, or (b) flagged as external/uncertain with its source. Nothing here is invented.

**Alignment (via `AskUserQuestion`, this session):**
- **Identity:** maximum effort across all three candidate identities — zero-friction capture &
  pantry, hands-free kitchen assistant, and a hyper-scientific nutrition engine — each treated as a
  full proposal, not a shallow pass.
- **Import architecture:** a Supabase edge function for server-side URL fetch (approved) — the app
  already runs a Supabase project for sync (`mc-supabase.js`), so this adds one narrow endpoint to
  existing infra rather than a new backend.
- **Four feature vectors selected for full proposals:** Recipe Capture Pipeline, Real Pantry
  Inventory + Dynamic Substitution, Multi-Dish Cook Timeline Synchronizer, Bi-Directional
  Macro/Ingredient Scaling.

---

## 1. Executive Summary & Codebase Audit

### 1.1 What's already flagship-grade

This app is materially further along than a typical "recipe manager" audit target. Confirmed by
reading the actual source, not the docs:

- **Cooking Mode already has real hands-free infrastructure.** `cookbook.js` wires
  `SpeechRecognition`/`webkitSpeechRecognition` (line 1257) with a small grammar covering "set a
  timer for N minutes," "how long left," "stop the timer," and — per the file's own header comment
  — "next step" / "previous step" / "read ingredients" (lines 1249–1382). Screen Wake Lock is real
  (`navigator.wakeLock.request("screen")`, line 1167), not a CSS trick. Counter Mode gives a
  near-brutalist high-contrast override independent of light/dark theme, for greasy-hands/bad-light
  use.
- **Timers are architecturally sound in a way most competitors' in-app timers aren't.** `mc-timers.js`
  stores `endsAt` as an absolute epoch instant rather than a decrementing counter, specifically so a
  timer surviving a backgrounded tab or a locked screen self-corrects instead of drifting — this is a
  real, tested property (`tools/test-mc-timers.js` runs it against a controllable clock), not a
  cosmetic detail.
- **The ingredient layer is unusually rigorous.** `mc-units.js` derives a real aisle model and a
  curated count→weight density table from the actual 856-identity corpus, measured (not estimated) at
  179/854 (21%) of ingredient identities still fragmenting across units — and that number is a
  CI-enforced ratchet that can only improve. `mc-grocery.js` does real quantity parsing/summing
  ("1 1/2", "to taste" → excluded from the sum rather than silently dropped).
- **Search is a real tokenized, field-weighted, fuzzy-bounded engine** (`mc-search.js`), replacing a
  prior `indexOf` scan that measurably returned zero results for multi-word or misspelled queries —
  pinned by regression tests, not just shipped and assumed working.
- **The app already ships a cross-app data bridge** to a companion workout PWA (`mc-bridge.js`,
  `mc-sync.js`'s `CONSUME` map) — training days bias meal generation toward higher protein, and macro
  trend data feeds back into the Macro Smart Generator. Very few recipe apps have any equivalent.
- **18 blocking CI gates** (`.github/workflows/pages.yml`) cover data integrity, doc-drift, search
  ranking, unit-fragmentation ratchets, backup-format round-trips, a UI smoke test in real Chromium,
  and — as of the most recent phase — a touch-target accessibility ratchet. This is far more rigorous
  test coverage than most solo-dev PWAs of this size carry.

### 1.2 Real gaps (verified by direct search, not assumption)

Three gaps stand out because they are **structurally absent**, not merely thin:

- **No recipe capture pipeline at all.** A repo-wide grep for import/scrape/OCR-shaped code
  (`import|scrape|parse.*url|recipe-scan|photo.*ocr|OCR`) across every `*.js` file returns only
  backup import (`mc-export.js`) and Supabase SDK internals — nothing recipe-shaped. The only way to
  add a recipe today is `mc-recipe-form.js`'s hand-typed "Add Recipe" form (title/icon/category,
  structured ingredients, numbered steps — **no macros field at all**). Every one of Paprika's
  reviewed 2026 write-ups highlights one-click web import as a headline feature; this app has no
  equivalent path.
- **Pantry is a name-list, not inventory.** `mc-cookbook:pantry` (`cookbook-home.js` lines 652–739) is
  a flat array of lowercased strings. It suppresses matching grocery rows and feeds a "cook what you
  have" filter (`pantryMatchInfo`, `pantryCandidates`) — genuinely useful — but there is no quantity,
  no expiry, and no notion of "I have 2 eggs, not enough for this recipe's 4." Paprika's own
  pantry feature (per the sourced reviews below) works the same binary way, so this isn't behind the
  market leader here — but it's also not the flagship leap the brief asks for.
- **Substitutions are static and non-interactive by the file's own comment.** `mc-search.js`
  (lines 256–260) documents this directly: `substitutionFor()` "does not rewrite the grocery row or
  know whether the cook's pantry actually lacks the item — `recipe.html` has no pantry read, and
  adding one... was judged not worth a new cross-file dependency for a first slice." That seam is
  exactly where pantry-aware substitution belongs.

Two more gaps are real but narrower:

- **Timers are independent, not orchestrated.** `mc-timers.js` is a well-built flat list of
  timers — nothing back-times multiple dishes to land together, and nothing groups timers by "this
  dish" vs. "that dish" when cooking two recipes at once (a real Sunday-batch-cook scenario this app
  already partially supports via the planner's batch-prep suggestion).
- **Scaling is one-directional.** `cookbook.js`'s `scaleQuantity()` scales ingredients from a serving
  count; there's no reverse path ("give me a version of this hitting 40g protein") even though
  `macro_profiles` are already structured per-serving and the tracker already has real macro-goal
  math (`tracker-calc.js`).

### 1.3 Competitive benchmark — sourced, with explicit confidence notes

I don't have live, first-party access to these apps' current app-store listings (a fetch to
`paprikaapp.com` was blocked by this session's network policy), so the claims below come from web
search results — mostly third-party review/SEO sites, which I'd treat as directionally reliable but
not authoritative. Treat specifics (exact UI mechanics) as "reported," not verified firsthand.

| App | Reported capability | Source reliability |
|---|---|---|
| **Paprika Recipe Manager 3** | One-click web import (title/ingredients/instructions/photo), binary pantry check-off, tap-to-scale servings, aisle-grouped grocery lists, cross-device sync, one-time purchase (no subscription) | Multiple 2026 review sites (marlvel.ai, ultimatemealplans.com, flavor365.com, eathealthy365.com, contentwave.net) — consistent across sources, but all secondary; I could not reach Paprika's own site to confirm directly. |
| **Pestle** | Hands-free voice navigation ("next"/"back"), Siri-read steps, voice ingredient lookup ("how much flour?"), multiple simultaneous timers with reminders | TechCrunch (2022 launch coverage), MacStories review, and 2026 comparison posts — TechCrunch is a reasonably strong primary-adjacent source for the launch claims. |
| **Crouton** | On-device TrueDepth wink-gesture step navigation (no touch, no voice) | MacStories review — but one 2026 source states **Crouton was removed from the App Store in January 2026**. I have not independently confirmed this against Apple's App Store directly; flagging it because if true, Crouton is no longer a live competitive target and gesture-via-camera is a design pattern worth noting but not chasing as "what Crouton does today." |
| **NYT Cooking** | Recipes, video how-tos, community tips/comments | Search results didn't surface specific, verifiable detail on NYT Cooking's scaling or nutrition mechanics — I'm not going to assert specifics I can't back with a real source. Treat NYT Cooking as an editorial/content benchmark in this roadmap (production photography, headnotes), not a mechanics benchmark. |

**Where this app already meets or beats the sourced bar:** hands-free voice step navigation (parity
with Pestle's reported mechanic), absolute-instant timers (more robust than a typical countdown,
though I have no direct comparison data on how Pestle's timers behave under backgrounding), aisle
grocery grouping (parity with Paprika). **Where it's behind:** recipe import (Paprika's headline
feature, and this app has zero equivalent) and pantry depth (both apps report the same binary
model this app has, so "behind" here means behind the *category leapfrog* the brief wants, not
behind either named competitor specifically).

---

## 2. The Four Flagship Feature Proposals

### 2.1 Recipe Capture & Import Pipeline

**Concept vision.** A cook finds a recipe on a website, or has a photographed/handwritten
heirloom card — Mike's Cookbook's own founding premise ("Hand-Me-Downs," per `CLAUDE.md`'s "What
this is" section). Today the only path in is typing it by hand into `mc-recipe-form.js`'s form. This
feature adds two capture paths that both land in the same reviewable-draft step before anything is
saved: **paste a URL**, and **photograph a page**. Neither auto-commits — a cook always sees and can
edit the parsed result first, because heirloom recipes in particular (the app's differentiator) are
exactly the case where automated parsing will get something wrong and silent auto-save would be a
trust-breaking bug, not a convenience.

**UI/UX specification.**
- Home's existing "Add Recipe" entry point (currently opens `mc-recipe-form.js` directly) gains a
  small chooser: **Type it in** (existing form, unchanged) · **Paste a link** · **Photograph a page**.
- **Paste a link:** a single URL field + "Fetch" button. While fetching, a skeleton-state card shows
  (title bar + 3 ingredient-line placeholders + shimmer) — never a blank spinner-only screen, matching
  this app's existing card-skeleton pattern conventions. On success, the cook lands on a **prefilled,
  fully-editable version of the existing Add Recipe form** — same component, same validation, same
  category picker — with every field the parser could extract already filled in and a small "via
  [source]" attribution line under the title (non-editable, informational). Fields the parser couldn't
  confidently extract are left blank, not guessed. A parse that fails outright (paywalled page, no
  recognizable recipe markup) shows a plain "Couldn't read a recipe from that page — try Photograph a
  page, or type it in" — steering to the fallback path rather than a dead end.
- **Photograph a page:** opens the device camera (or file picker on desktop), same flow after capture
  — lands on the same prefilled, editable form. A low-confidence OCR result flags itself inline (e.g.
  a faint yellow underline on a field the OCR engine scored low-confidence) rather than presenting
  garbled text as if it were trustworthy.
- Both paths reuse `mc-recipe-form.js`'s existing "Medium" form wholesale — no new UI surface for
  editing, only new surfaces for getting *to* that form pre-filled. This is a deliberate scope
  discipline: the form's validation, category dropdown (`CATEGORY_ORDER`), and save-to-`MCUser` path
  are already correct and tested; capture only needs to populate it.
- One net-new field the form doesn't have today: **macros**. Neither `mc-recipe-form.js` nor its data
  target currently captures `macro_profiles` at all (confirmed by reading the file — it's
  title/icon/category/ingredients/steps only). A URL-imported recipe with structured nutrition data
  (many recipe sites embed this in JSON-LD `Recipe` schema) should populate it; a photographed
  heirloom card almost never will, and the form should make macros an optional, clearly-labeled
  "Add nutrition info (optional)" section rather than a blocking requirement — consistent with how
  `RECIPES` entries without a source cookbook's macro data are handled elsewhere in this app.

**Technical architecture & data flow.**
- **The CORS problem is real and specific to this app's constraints.** This is a static site with no
  server (`CLAUDE.md`: "vanilla HTML/CSS/JS... no build step... no bundler, no npm"). A browser
  cannot `fetch()` an arbitrary third-party recipe URL client-side — most sites don't send permissive
  CORS headers, and even if they did, a static GitHub Pages site has nowhere to run parsing logic
  server-side today. The approved fix: **one new Supabase Edge Function**, `fetch-recipe-source`,
  whose only job is `fetch(url)` server-side and return the raw HTML (or, when present, the extracted
  JSON-LD `Recipe` block) to the client. This is a genuinely narrow addition — one function, one
  responsibility, no new database tables required for the fetch itself — added to infrastructure that
  already exists (`mc-supabase.js` already runs a Supabase project for sync).
  - **Not yet verified in this session:** whether an edge function already exists in this project (the
    Supabase MCP tools were unavailable this session — server disconnected mid-session). Phase B below
    starts with confirming the project's current edge-function list before writing new code, per
    `mc-supabase` skill guidance ("before making schema changes, use `list_tables`... prefer local
    development and testing before applying changes to a remote project").
  - Rate-limit and abuse consideration: this function is a fetch proxy reachable by any authenticated
    (or, if open, any) caller — needs a per-user rate limit and a max-response-size cap before it
    ships, not after.
- **Parsing stays client-side, in vanilla JS, per this repo's hard architectural constraint.** Most
  recipe sites (WordPress recipe plugins, AllRecipes, Food Network, etc.) embed `schema.org/Recipe`
  JSON-LD — a `<script type="application/ld+json">` block with structured `recipeIngredient`,
  `recipeInstructions`, `name`, `nutrition`, `image` fields. A new small module, `mc-import.js`
  (same IIFE-wrapped, `"use strict"`, no-framework pattern every other module here follows), parses
  that JSON-LD when present and falls back to a heuristic DOM scan (look for `<li>` runs near an
  "Ingredients" heading, etc.) when it isn't — the same honest-degradation posture `mc-data.js` and
  `mc-net.js` already use elsewhere in this app ("a failed shard resolves **false** rather than
  hanging, so callers degrade instead of waiting forever").
- **Photo/OCR path.** A vendored, client-side OCR library (Tesseract.js is the realistic open-source
  choice, WASM-based, no server round-trip) run in a Web Worker so it doesn't block the main thread —
  this repo already uses the "vendor a pinned library, no CDN dependency" pattern (`mc-supabase.js`'s
  own vendoring, per `CLAUDE.md`'s note on C-I3: "vendoring the Supabase SDK so cold offline sign-in
  stops depending on a CDN the service worker can't precache"). OCR output is unstructured text; a
  lightweight heuristic segmenter (blank-line-separated blocks, "1 cup"-shaped line detection for
  ingredients vs. numbered/imperative-verb lines for steps) does the same best-effort structuring the
  URL path's DOM-heuristic fallback does. This is explicitly a "best effort, cook reviews everything"
  feature, not an "always correct" one — the UI spec above reflects that with the low-confidence
  inline flagging.
- **Landing in the data model.** A successfully parsed/reviewed/saved import is just a `MCUser`-stored
  recipe like any hand-typed one today — `user-recipes.js` already merges these into
  `window.RECIPES`/`COLLECTIONS` at load so it behaves identically everywhere (search, planner,
  favorites, categories) with zero changes to any other file. No changes needed to `recipes-data.js`,
  `mc-data.js`'s shard system, or `tools/build-data.js` — imported recipes never touch the
  build-time-generated index/shards, exactly like today's hand-typed "My Recipes."
- **Offline behavior.** Both capture paths require network (fetch or OCR-worker-download-once); the
  chooser should show "Paste a link" and "Photograph a page" as visibly disabled with an inline
  "needs a connection" note when `MCNet.isOffline()` reports offline — reusing the existing shared
  online/offline signal rather than a new one.

**Competitive advantage.** This closes the single largest, most-cited gap versus Paprika (the
sourced reviews above put web import as *the* headline feature) while adding a capability none of the
three named competitors are reported to have: **photo/OCR capture of a physical page**, which is a
direct match to this app's own stated identity — a cookbook bridging "cherished heirloom recipes" and
modern tooling. Paprika's import only works on web pages; a grandmother's handwritten recipe card
has no digital source to import from at all. That's a genuinely differentiated leapfrog, not a
catch-up feature.

---

### 2.2 Real Pantry Inventory + Dynamic Substitution Engine

**Concept vision.** Move `mc-cookbook:pantry` from "a list of staples I always have" (binary,
unquantified) to a real lightweight inventory — quantities, and enough structure that the substitution
engine already built in `mc-search.js` can finally answer the question its own code comment says it
can't: *does the cook actually have enough of this ingredient, or should the app suggest a swap?*

**UI/UX specification.**
- The existing pantry surface (a filter toggle + staple-pin buttons already rendered inline on
  grocery rows, per `cookbook-home.js` lines 3174–3182) gains an optional quantity. Tapping the
  existing 🧂 "mark as staple" pin still works exactly as today (name-only, zero friction) — but a
  long-press or a small "+" affordance opens a minimal quantity sheet (amount + unit, defaulting to
  the unit the triggering grocery row used, via `mc-units.js`'s existing normalization). **Quantity is
  strictly additive, never required** — a cook who never engages with it gets the exact same
  experience as today.
- `recipe.html`'s Grocery tab — which already renders the informational "Don't have it on hand?"
  substitution card (`mc-search.js`'s `substitutionFor()`) — gains real pantry awareness for the first
  time. Per-ingredient, three states instead of the current one static note:
  1. **Have enough** (pantry quantity ≥ recipe's scaled quantity) — a small green check, no
     substitution note at all (reduces noise for the common case).
  2. **Have some, not enough** — the existing informational swap note, now phrased specifically
     ("you have 1 clove, this needs 3 — swap in ½ tsp garlic powder per missing clove" style,
     using the real `DENSITY`/unit data `mc-units.js` already carries) rather than a generic "don't
     have it on hand?" prompt shown regardless of pantry state.
  3. **Don't have it at all** — today's existing behavior, unchanged.
  This is explicitly framed as the fix to `mc-search.js`'s own documented gap (lines 256–260): "does
  not rewrite the grocery row or know whether the cook's pantry actually lacks the item... judged not
  worth a new cross-file dependency for a first slice." This proposal *is* that cross-file dependency,
  now justified by real pantry quantity data existing to make it worth adding.
- The grocery-merge list (`mc-grocery.js`'s `buildGrocery()`) gains a "you're short N" indicator on
  rows where pantry quantity is nonzero but insufficient for the full week's plan — distinct from
  today's binary suppress-if-staple behavior, which currently either fully hides a row or fully shows
  it with no middle state.

**Technical architecture & data flow.**
- `mc-cookbook:pantry`'s shape changes from `string[]` to an array of `{ name, qty, unit, addedAt }`
  — a **backward-compatible migration**, not a breaking change: a bare string entry (today's shape)
  is read as `{ name: entry, qty: null, unit: null }` at load, so an existing pantry list keeps
  working with zero quantity data until a cook opts into adding it. `mc-sync.js`'s existing
  `stringSet` merge strategy for this store stops being correct once entries are objects with
  quantity — this needs a new merge strategy (most likely `mergeArrayByField` keyed on
  `pantryKey(name)`, a pattern `mc-sync.js` already implements for other array-of-object stores like
  cook-log entries) rather than a hand-rolled one.
- Quantity comparison reuses `mc-units.js`'s existing `resolveUnit()`/density-bridge machinery
  wholesale — this is the same unit-normalization problem the grocery merge already solves (comparing
  "3 cloves" against "1 tbsp minced garlic" is exactly the fragmentation problem `mc-units.js`'s
  `DENSITY` table exists to bridge), so this feature is additive load on an already-built system, not
  a new one.
- `mc-search.js`'s `substitutionFor()` signature grows an optional second parameter (pantry-quantity
  context) so the "have enough / have some / have none" tri-state can be computed without a second,
  parallel substitution-lookup path — one function, richer input, same output shape callers not yet
  updated can ignore.
- **CI impact:** `tools/test-mc-units.js`'s corpus-wide fragmentation ratchet (currently 179/854,
  "may only fall, never rise") is a direct dependency here — the density table this feature leans on
  is exactly the mechanism that ratchet protects, so no changes to that gate's logic, but this feature
  is a second real consumer of its correctness beyond grocery-list summing.

**Competitive advantage.** Sourced research above found *both* named competitors' pantry features
described as check-off/binary, matching what this app already has — meaning quantity-aware pantry
plus tri-state, unit-bridged substitution suggestions would be ahead of the reported feature set of
either named competitor, not just this app's own prior state. Combined with §2.1's capture pipeline,
this also compounds: an imported recipe with structured ingredient quantities (from JSON-LD) feeds
directly into "do I actually have enough" checks the moment it's saved.

---

### 2.3 Multi-Dish Cook Timeline Synchronizer

**Concept vision.** `mc-timers.js` is genuinely well-engineered (absolute-instant, store-owns-truth,
survives navigation and backgrounding) but every timer today is independent — start one, it counts
down, that's it. A cook running Sunday batch-prep (a scenario this app's planner already explicitly
supports via its "batch-prep suggestion" feature, per `CLAUDE.md`) or simply cooking a protein +
two sides for one dinner has no way to ask "if I want everything to land at 6:30, when do I need to
start each piece?" This feature adds a real back-timing sequencer on top of the existing timer
engine, without touching its core correctness properties.

**UI/UX specification.**
- A new entry point from the planner's existing "batch-prep day" surface and from a multi-dish
  meal-plan slot (already-existing data — meals grouped by `day`/`slot` in `mc-cookbook:mealplan`):
  **"⏱ Time it together."** Given 2+ recipes/dishes selected (defaulting to whatever's planned for
  that slot), the cook enters one target: "ready by [time]."
- The synchronizer reads each recipe's step-embedded durations — the same `DUR_RE` regex parser
  `cookbook.js`'s `parseDurations()` already extracts per-step timer chips from (lines 85–107) — plus
  each recipe's `prep_time_mins`/`cook_time_mins` fields already in `recipes-data.js`, to build a
  simple critical-path schedule: the longest single dish's total time anchors the target, and every
  other dish gets a computed "start at" offset before it.
- Result renders as a single vertical timeline (not a grid — this is a phone screen, portrait,
  kitchen-use, per this app's own mobile-first convention) with one row per dish: dish name/icon,
  "start at [time]," and a "Start" button that, when tapped at or after that moment, opens that
  recipe directly into Cooking Mode via the existing `?cook=1` deep link (`recipe.html`'s already-
  documented direct-to-Cooking-Mode entry). Rows for dishes not yet due show their countdown-to-start;
  rows in progress show the existing `mc-timers.js` rail state inline.
- Each dish's individual step timers, once started from within its own Cooking Mode session, are
  **unmodified `mc-timers.js` timers** — this feature does not touch timer *execution*, only
  *scheduling when to start*. That's a deliberate scope boundary: `mc-timers.js`'s absolute-instant
  correctness property is exactly what makes this safe to layer on top of without risk of drift
  compounding across a multi-hour multi-dish sequence.
- A synchronizer session is itself just data — `{ targetTime, dishes: [{recipeId, startAt}] }` — so
  closing the app and reopening restores the same timeline (consistent with `mc-timers.js`'s own
  "the store is the truth, not the DOM" principle already established in this codebase).

**Technical architecture & data flow.**
- New module `mc-timeline.js`, same IIFE/no-framework pattern, persisting to a new
  `mc-cookbook:timeline` key holding the active synchronizer session (if any) — one active session at
  a time is a reasonable v1 scope (a cook coordinating more than one simultaneous multi-dish cook is
  an edge case not worth the complexity of concurrent-session management yet).
- **Not synced, same reasoning `mc-timers.js` and `mc-cookbook:timecheck` already establish and
  document:** a cook-timeline is device-local by nature (the phone on the counter is the one cooking),
  and there's no honest merge strategy for "cancel this dish's timing" happening on two devices at
  once. This keeps the feature consistent with this app's own existing, written data-sync philosophy
  rather than introducing a new one.
- The critical-path math is pure and testable in isolation — a `computeTimeline(dishes, targetTime)`
  function with no DOM dependency, following this app's existing pattern of keeping calculation pure
  and separately testable (`mc-grocery.js`'s quantity math, `mc-units.js`'s conversions — both pure,
  both have dedicated `tools/test-*.js` files). A new `tools/test-mc-timeline.js` should exist before
  this ships, mirroring that convention, not as an afterthought.
- **A real constraint to flag honestly:** step-duration extraction (`parseDurations()`) is a regex
  over free-text instruction strings, not a structured field — `DUR_RE` will miss non-numeric or
  oddly-phrased durations ("simmer until reduced by half" has no parseable time). The UI must show a
  dish with no extractable timing as "manual — no auto-schedule available, start whenever" rather than
  silently omitting it or guessing, consistent with this app's stated design ethic of "informational,
  not silent" degradation seen in `mc-net.js` and `mc-data.js`.

**Competitive advantage.** None of the three named competitors were reported (in the sourced research
above) to have multi-dish back-timing — Pestle and Crouton's hands-free features are both about
*single-recipe* step navigation. This is a genuinely novel leapfrog matched to a real, already-
supported use case in this app (batch-prep day, multi-slot meal plans) rather than a feature imported
from a competitor's playbook.

---

### 2.4 Bi-Directional Macro/Ingredient Scaling

**Concept vision.** Today, scaling flows one direction only: pick a serving count (1–12),
`scaleQuantity()` scales every ingredient proportionally, and macros stay flat per-serving (correctly
— `CLAUDE.md`'s data model explicitly documents "Macros never scale with serving count," which is
the right behavior for the *existing* feature). This proposal adds the **reverse** direction as a new,
separate capability: a cook with a macro target ("I want ~40g protein, under 500 kcal from this
meal") gets ingredient quantities back-solved to hit it, as closely as the recipe's structure allows.

**UI/UX specification.**
- A new toggle on `recipe.html`'s existing serving stepper: **Servings** (today's existing behavior,
  default, unchanged) vs. **Hit a macro target** (new). Switching reveals up to three optional target
  fields — protein (g), calories, carbs (g) — a cook fills in as many as they care about; leaving all
  blank falls back to servings mode with no behavior change.
- On entering a target, the recipe's ingredient list re-renders with a scaling factor computed against
  whichever macro was specified (protein-first if multiple are given, since that's this app's own
  stated bias — see `CLAUDE.md`'s macro-trend-bias work already biasing toward protein). The header
  shows the resulting macros plainly ("≈ 41g protein · 480 kcal at this scale") so the cook sees
  exactly what they're getting, not a black box.
- **Honesty constraint, stated directly in the UI, not hidden:** this is a *linear* scale of the whole
  recipe (every ingredient scaled by the same factor derived from the target macro), not an
  ingredient-substitution solver. A macro target that would require, say, doubling the protein without
  doubling the fat is **not achievable by scaling alone** — the UI must say so explicitly ("closest
  achievable by scaling: 38g protein / 720 kcal — hitting 40g protein without raising calories this
  much isn't possible by scaling this recipe alone") rather than silently returning a worse match and
  implying it's exact. This mirrors `mc-units.js`'s own honesty pattern (tagging `viaDensity`
  conversions so an estimate is never presented as a fact) — the same discipline applied to a new
  feature.
- A "portion this many ways" secondary readout — given the solved scale factor, how many
  same-sized servings does that make? — reuses the existing serving-count display, so a cook scaling
  for macros still sees a sane real-world portion count, not just an abstract ratio.

**Technical architecture & data flow.**
- Pure function, `solveScaleForTarget(recipe, servingBase, target)` — given the recipe's per-serving
  `macro_profiles` (already exact, already validated by `tools/validate-recipes.js`) and a target
  `{protein_g?, calories?, carbs_g?}`, returns `{ scale, achieved: {...}, exact: boolean }`. Because
  `macro_profiles` is already guaranteed per-single-serving and constant across authored tiers (a
  `CLAUDE.md`-documented, CI-enforced invariant), this is genuinely simple math — `scale = target /
  perServingValue` for whichever field is prioritized — not a new solver architecture. The complexity
  is entirely in the UI honesty layer above (multi-target conflicts), not the math.
- Ingredient quantities reuse `scaleQuantity()` unchanged — this feature computes a different *scale
  factor input*, it doesn't touch how scaling is applied to a quantity string. That's the same
  "additive, not a rewrite" posture the other three proposals share.
- **Tracker integration (the actual payoff).** `tracker-calc.js` already computes a cook's daily/
  per-meal macro goals via its suggest-then-adjust calculator. The natural on-ramp for this feature is
  the planner's recipe-picker overlay: when adding a meal to a slot, if the tracker has real goals set
  (`mc_macros_v1.goals`), the picker can pre-suggest a macro-target scale for whatever recipe is
  chosen, rather than requiring the cook to separately open `recipe.html` and configure it — this is
  the specific place where "bi-directional scaling" becomes a planning tool, not just a recipe-detail
  curiosity. This on-ramp is a **Phase C/D stretch**, not required for a shippable v1 (v1 is
  `recipe.html`-only, self-contained).
- No changes to `recipes-data.js`'s data model, `mc-data.js`'s split-shard system, or CI — this reads
  fields that already exist, validated by gates that already run.

**Competitive advantage.** I found no sourced evidence any of the three named competitors offer
reverse macro-target scaling — the reported feature set for all three is forward-only (serving count
→ quantities). This is a direct extension of what's already this app's most differentiated existing
system (the tracker + bridge + macro-aware Smart Week generation, per `ROADMAP.md`'s Pillar C/D), so
it compounds the app's actual strength rather than opening a disconnected new surface.

---

## 3. Step-by-Step Production Implementation Plan

Sequenced so each phase produces something independently shippable and testable — consistent with
this repo's own stated practice of landing features via reviewed PRs against CI gates, not big-bang
merges.

### Phase A — Core UI/UX Primitives & Kitchen Design System Polish
- Design and build the shared "reviewable draft" pattern once (§2.1's prefilled-editable-form
  landing state) — it's reused verbatim by both capture paths, so building it as a shared primitive
  rather than duplicating per-path avoids the exact kind of drift `CLAUDE.md`'s audits (C-07, the
  duplicated recipe card) have repeatedly had to clean up in this codebase.
- Build the pantry quantity-sheet UI and the tri-state substitution note UI (§2.2) as pure
  presentation against **mocked** pantry-quantity data, before the real merge-strategy work in Phase
  B — lets design/copy get reviewed on-device early.
- Build the timeline UI shell (§2.3) against a hand-authored fixture schedule, same reasoning.
- Build the macro-target toggle + honesty-messaging UI (§2.4) against fixture targets.
- **Touch-target discipline from the start, not retrofitted:** this repo's own `tools/check-a11y.mjs`
  gate exists specifically because prior UI work shipped under-floor controls that had to be
  cleaned up later (Wave 6/7 in `ROADMAP.md`). Every new interactive control in this phase should hit
  the documented 44px floor (or the established invisible-`::before` pattern) on first commit.

### Phase B — State, Parser & Engine Infrastructure
- **Confirm current Supabase project state before writing anything** (per the `mc-supabase` skill's
  own guidance) — list existing edge functions/tables; this session could not check live (MCP
  disconnected), so this is a genuine first step, not a formality.
- Ship `fetch-recipe-source` edge function with rate limiting and a response-size cap.
- Ship `mc-import.js` (JSON-LD parser + DOM heuristic fallback) and wire the vendored OCR worker.
- Migrate `mc-cookbook:pantry` to the quantity-capable shape with the backward-compatible read path;
  update `mc-sync.js`'s merge strategy and its test fixtures (`tools/test-mc-sync-merge.js`).
- Extend `mc-units.js`/`mc-search.js`'s `substitutionFor()` for pantry-aware tri-state output.
- Build `mc-timeline.js`'s pure `computeTimeline()` and `mc-cookbook:timeline` persistence, with
  `tools/test-mc-timeline.js` written alongside it, not after.
- Build `solveScaleForTarget()` as a pure function with its own unit tests.

### Phase C — Cook Mode & Micro-Interactions Integration
- Wire Phase A's UI to Phase B's real engines for all four features.
- Wire §2.3's "Start" action to `recipe.html`'s existing `?cook=1` deep link.
- Wire §2.4's tracker on-ramp in the planner's recipe-picker overlay (the stretch item noted above).
- Extend Cooking Mode's voice grammar, if scope allows, to acknowledge the timeline ("what's next" /
  "am I on schedule") — a natural extension of the grammar table already in `cookbook.js`, not a new
  subsystem.

### Phase D — Production Readiness, Performance Profiling & Handoff
- **CI gates to add or extend**, following this repo's own established ratchet/round-trip patterns
  rather than inventing new test philosophy:
  - `tools/test-mc-import.js` — JSON-LD parse fixtures (a real recipe page's HTML saved as a fixture,
    not a live network fetch in CI) + the DOM-heuristic fallback path.
  - `tools/test-mc-timeline.js` — critical-path math against hand-computed expected schedules.
  - Extend `tools/test-mc-sync-merge.js` with pantry-quantity merge fixtures.
  - Extend `tools/validate-recipes.js` if imported/user recipes ever need shape validation beyond
    what `MCUser`'s existing save path already enforces.
- **Docs, per this repo's own binding rules — not optional:**
  - `CLAUDE.md`'s Documentation currency rule requires a Quick Tour update for each of these (all four
    are genuinely new, discoverable, user-facing capabilities) — and `features.js`'s `MC_FEATURES`
    array needs a new entry per feature, since `tools/check-tour-coverage.js --check` is a blocking CI
    gate that fails on an undocumented capability.
  - `ROADMAP.md` gets a new pillar for this work, following the file's own stated convention (problem
    → approach → acceptance criteria → effort, phases marked ✅ as shipped).
- **Performance profiling specific to this app's real constraints:** OCR-in-a-worker needs a real
  low-end-device timing check (this app's own `ROADMAP.md` C-06 finding is a good precedent — it
  measured real DOMContentLoaded cost under CPU throttling rather than trusting a back-of-envelope
  estimate; the same discipline applies to "how long does Tesseract.js take on a mid-range Android").
  The edge function needs a cold-start latency check, since Supabase edge functions have real
  cold-start behavior that a synchronous-feeling "paste a link, wait" UI needs to design around
  (the skeleton-state UI in §2.1 already accounts for this, but the actual latency should be measured,
  not assumed).
- **Owner-only verification**, mirroring the pattern `ROADMAP.md`'s own "Owner-only verification"
  section already uses for cross-device Supabase reconciliation: a signed-in, two-device pantry-sync
  test (add a quantity on Device A, confirm the merge lands correctly on Device B) needs a real human
  with two physical devices — CI cannot do this, same as the existing C-02 pantry/favorites sync
  verification already documented as owner-only.

---

## 4. Honest risk register

- **Edge function scope creep risk.** A URL-fetch proxy is easy to describe narrowly and easy to grow
  into something broader (auth-gating, caching, rewriting). Phase B should ship the smallest possible
  version and resist adding responsibilities to it.
- **OCR accuracy on handwritten cards is a real open question, not a solved one.** Tesseract.js (or
  any client-side OCR) is tuned for printed text; a handwritten heirloom recipe card — this app's own
  founding use case — is a harder target. The UI's low-confidence flagging (§2.1) is the honest
  mitigation, not a promise of high accuracy; this should be tested against real handwritten samples
  before the feature is presented as reliable for that case specifically.
- **Pantry quantity is opt-in, and most cooks may never use it.** That's fine — the binary staple list
  stays fully functional either way — but it means the tri-state substitution feature (§2.2) will show
  its richest state only for engaged users, and should degrade gracefully (today's binary behavior)
  for everyone else, which the architecture above is designed to do.
- **This roadmap does not re-litigate anything already shipped.** Per `ROADMAP.md`'s own stated
  practice ("re-read it before proposing new work so you don't re-litigate a finished pillar"), the
  four proposals above were chosen specifically because direct code search confirmed they don't exist
  yet — not because I assumed a gap without checking.
