# Mike's Cookbook — Flagship CI Initiatives (v3 proposal)

> **Status:** All three phases complete. **All five initiatives are ✅ shipped.**
> Each initiative carries its own status line, with the real deltas from what was proposed —
> this file is kept truthful as work lands, per the repo's process rule.
> **Scope:** a multi-lens audit of the repo at `bb2efe0`, and the 5 initiatives that
> move this app from "very good utility cookbook" to flagship-tier.
> **Constraints honored:** vanilla HTML/CSS/JS, no framework, no bundler, no npm.
> Generated files follow the existing `tools/build-sw.py` precedent (a Python/Node
> generator + a `--check` CI gate), which is the only build-shaped thing this repo allows.
> **Relationship to `ROADMAP.md`:** that file's Pillars A–E are shipped and are not
> re-litigated here. This is the next round, chosen from measurements taken against
> the real data — every number below is reproducible from the repo.

---

## 1. Repository core competency map

### Architecture

Hybrid PWA: a single-page **shell** (`index.html`, six `<section class="screen">`
panels switched by `display` + `location.hash`) plus two **standalone deep pages**
(`recipe.html`, `collection.html`). One persistent 2-tab bar (Cookbook · Tracker);
the six screens are hub-and-spoke behind it, not tabs. Role declared per page via
`data-tabbar="shell" | "page"`.

~37.5k lines across 32 tracked source files. Vanilla IIFE modules, `"use strict"`,
no framework, no build step. Shared modules (`MCFav`, `MCCards`, `MCGrocery`,
`MCRecipeForm`, `MCBridge`, `MCExport`, `MC_INSTALL`, `MC_BACKUP_STATUS`) are
configured by host pages via hook objects rather than imported.

### Data layer

`recipes-data.js` — **318 recipes, 15 collections (13 live + 2 coming soon),
11 dish categories, 119 distinct tags, 856 distinct ingredient identities**,
23,220 lines / **1.04 MB**. Per-recipe: authored `serving_N` ingredient tiers
(156 recipes author one tier, 162 author two), per-single-serving `macro_profiles`
constant across tiers, `instructions` (avg 4.3 steps, max 8), and structured
ingredients separating `item` (shopping name) from `prep` (mise instruction) with a
4-value `category` enum (Meat · Dairy · Produce · Pantry).

### Shipped competencies (genuinely strong)

| Domain | What exists |
| --- | --- |
| Planning | One `wkGenerateWeek(scope, mode, args)` engine, three declared biases (`balanced` · `macro` · `time`), slot-level regeneration, batch-prep day suggestion, plan history + reuse |
| Substitution (recipe level) | **SRE** — macro-isomorphic swaps at 10/20/35% tolerance bands, equipment-match scoring, "express" (≤15 min) candidates |
| Grocery | Cross-meal merge with per-item quantity buckets, vol/wt conversion, purchase-unit rounding, pantry-staple suppression, "Use it up" reverse ingredient index |
| Cooking | Full-screen Cooking Mode, screen wake lock, swipe nav, A−/A+ type scale, TTS step announce, **voice control** (`next` / `back` / `read ingredients` / `exit`), tap-to-start inline timers parsed from step prose |
| Nutrition | In-app macro tracker on `mc_macros_v1` — the same key/shape the workout app uses, so one signed-in trainee has one store, not two |
| Cross-app | `mc-bridge.js` read-only layer: today's meals (denormalized snapshots), today's workout, `likelyTrainingDays()` biasing meal selection toward protein on real historical training days |
| Sync / durability | Optional Supabase login, per-store merge strategies, v2 backup format with legacy import, `diagnostics.html` device self-test |
| CI | 13 blocking gates on PRs *and* `main`, deploy gated behind them |

### What is genuinely absent

Ingredient-level substitution · any photography · multi-token or fault-tolerant
search · timer persistence · leftover/yield tracking · a light/daylight theme ·
any UI smoke test (`ROADMAP.md` names this as the open CI gap).

---

## 2. Multi-agent synthesis summary

### Agent 1 — Culinary Engine & Automation Architect

**The grocery merge is the app's best algorithm and it fragments on a quarter of the
catalog.** Measured across all 856 ingredient identities:

- **210 (24.5%) resolve to more than one quantity bucket** and render as
  `"3 cloves · 1 clove · 1 tbsp · 6 g"` on a single row instead of one buyable number.
- **121 of those mix metric and imperial**, which the current `UNIT_DEFS` can *never*
  reconcile — it defines only `vol` (tsp↔tbsp↔cup) and `wt` (oz↔lb). `g` is the
  5th-most-used unit in the corpus (**453 occurrences**) and sits outside both families.
- Real examples: `Produce|garlic → clove / cloves / tbsp / g / tsp / small cloves`
  (six buckets); `Produce|onion → small / large / medium / ∅ / g / large (150g) / cup`.
- The unit half of the bucket key is `"u:" + unit.toLowerCase()` — **not singularized**,
  even though the *item* half is. `clove` and `cloves` are two buckets by construction.
- `ITEM_ALIASES` is empty. The comment above it is right to reject fuzzy name matching
  (it would under-count). The fix is not fuzzier names — it's a **deterministic density
  and count-equivalence table**, which is data, not guessing.

Secondary: no ingredient-level substitution (`SRE` swaps whole recipes, not "I'm out of
buttermilk"); no yield/leftover model, so nothing knows a 12-serving cheesecake feeds a
household for four days.

### Agent 2 — UI/UX & Tactile Kitchen Designer

**The design system is already flagship-grade; the media layer doesn't exist.**
Tokens are disciplined — desaturated charcoal ground, warm cream card surfaces,
terracotta/sage accents, an Iowan-Old-Style serif paired with system sans, exactly one
easing curve and two durations, 8 `prefers-reduced-motion` blocks, safe-area insets
honored throughout. That is not the problem.

The problem is stated in the codebase's own words at `cookbook-home.js:65`:

> `// Recipe cards have no photography — recipes-data.js has no image field`

- **0 of 318 recipes carry a `photo` field. `images/` does not exist.** Every card in
  every grid is an emoji over one of four deterministic CSS patterns.
- Two photo stores *already exist and already hold real images*:
  `mc-cookbook:photos` (per-recipe cover, cap 24) and `mc-cookbook:cooked[].photo`
  (per dated cook entry, cap 12). **Neither ever renders outside `recipe.html`.** The
  user is already photographing their food and the app is already storing it — and then
  showing it in exactly one place.
- Dark-only. No `prefers-color-scheme` handling anywhere in 2,399 lines of CSS. A
  charcoal app on a sunlit kitchen counter at arm's length is the single worst-case
  legibility scenario this app has, and Cooking Mode — the mode used at that exact
  distance under that exact light — inherits it.

### Agent 3 — Process Improvement & Lean/CI Specialist

Walking the stream Discovery → Grocery → Prep → Cook → Leftovers:

- **A running timer is destroyed silently.** `timerChip()` holds its `setInterval` id in a
  closure bound to a DOM node; `renderCook()` executes `o.innerHTML = ""` on *every* step
  advance **and every done-toggle**. Start a 20-minute braise, swipe to read ahead → the
  timer is gone, with no indication. It also cannot survive leaving the recipe page, and
  its 1-second `setInterval` is throttled when backgrounded and suspended entirely when the
  phone locks. This is a correctness defect wearing a feature's clothes.
- **Hands-free mode is four taps deep.** `recipe.html` parses only `?id`; `init()`
  unconditionally calls `setTab("overview")`; `enterCook()` is reachable only from a button
  inside the *third* sub-tab. Path from a planned meal to hands-free: open meal → swipe/tap
  to Recipe tab → scroll → Start Cooking. There is no `?cook=1`.
- **Search is a substring scan.** `recipesMatch()` is `indexOf` over title, dish_category,
  category, joined tags, and native-tier ingredient names. `"chicken broccoli"` returns
  **zero** results across 318 recipes; so does `"chiken"`. No tokenization, no ranking, no
  tolerance. This is the front door to the entire catalog.
- **1.04 MB parses synchronously before anything paints, on all three page types.** The
  repo already suspected this — `window.__mcBoot` exists specifically to measure it
  (audit C-06), and `recipe.html`'s own comment calls it "62% of the payload." Opening a
  recipe from a cold cache pays a full-catalog parse to render one recipe.
- Waste that is *already* eliminated and should stay eliminated: four planning entry points
  collapsed to one, Home ranks instead of stacks, three week-generators unified to one engine.
  The lean discipline in this repo is real — these five are what's left.

### Agent 4 — Chief Product Officer (synthesis)

Three arguments were had and resolved:

1. **Agent 1 wanted an LLM ingredient parser.** Rejected. The data is already
   structured — `item`/`prep`/`quantity`/`unit`/`category` are separate authored fields.
   An LLM would add a network dependency, a cost, and nondeterminism to a problem solvable
   exactly with a ~120-row density table. **Determinism beats intelligence here.** LLM
   parsing earns its place only at the *import* boundary (pasting a recipe from a website),
   which is out of scope this round.
2. **Agent 2 wanted commissioned photography for 318 recipes.** Rejected as the primary
   move — that's a content project, not a CI initiative, and it would put megabytes into a
   repo that already pays a payload penalty. **Inverted instead:** surface the photos the
   user is already taking, and wire the `photo` field so authored art has somewhere to land.
3. **Agent 3's payload finding was nearly cut as "infrastructure."** Kept, because it is the
   *enabler* for Agent 2's photo layer — you cannot responsibly add images to a first-paint
   path that already blocks on 1.04 MB. Sequenced accordingly.

Ordering rule applied: **fix what is broken, then make what works fast, then make it
beautiful.** Initiative 1 repairs a live defect. Initiatives 2 and 4 fix algorithms that
are wrong on measurable percentages of the catalog. Initiative 5 unblocks Initiative 3.

---

## 3. Flagship CI initiatives

### Initiative 1: The Continuous Cook Session ✅ (shipped)

* **Target Domain:** Hands-Free Cooking Mode / Kitchen Timers / Session State
* **Status:** ✅ **Shipped.** `mc-timers.js` + the rail, `?cook=1`, the timer voice grammar, the SW notification, and `tools/test-mc-timers.js` as blocking gate 5 of 9. Two deviations from the spec below, both deliberate: the ticker is a 250 ms `setInterval` rather than `requestAnimationFrame` (rAF is paused outright in a backgrounded tab — exactly when an expiry still needs noticing), and the SW notification is posted *by the page* rather than scheduled in the worker, because with no Push service a service worker cannot wake itself at a future instant. See `CLAUDE.md`'s `mc-timers.js` row for both.

**The problem / gap.** Timers are the most-used utility in any cooking app and this
one's evaporate. `timerChip()` closes over `intId`; `renderCook()` blanks its container on
every render — including a mere done-toggle — so the interval is orphaned and the chip that
displayed it is gone. Nothing persists across page navigation. A 1s `setInterval` is
throttled in a backgrounded tab and suspended on screen lock, so even an *undisturbed*
timer drifts or stalls. Separately, Cooking Mode — where wake lock, voice control, and the
large type all live — is buried behind the third sub-tab with no deep link, so the planner's
"cook this tonight" intent dead-ends in a reading view.

**The CI solution.** Promote the timer from a DOM-bound closure to a **persisted,
wall-clock-anchored session store**, and promote Cooking Mode from a sub-tab feature to an
addressable destination.

- Timers store an **absolute `endsAt` epoch**, not a decrementing counter. Elapsed time is
  computed from `Date.now()` on every tick and on every visibility change, so throttling and
  suspension become irrelevant — a timer that fires while the phone is locked reports itself
  correctly the instant the screen wakes.
- **Multiple concurrent timers** across steps *and* across recipes (the real kitchen case:
  rice on, chicken resting, sauce reducing), rendered in a persistent rail that is present in
  Cooking Mode, the Recipe tab, and the app shell.
- A **Service Worker notification** fires when the app is backgrounded and a timer expires,
  falling back to the existing Web Audio `ping()` + `navigator.vibrate` `buzz()` in the
  foreground. Both already exist and already work offline.
- `recipe.html?id=…&cook=1` enters Cooking Mode directly; the planner's Today card, the
  cook-log, and Home's suggestion cards all switch to it. Four taps → one.

**Technical & architecture specifications.**
- New shared module `mc-timers.js`, exposed as `window.MCTimers`, loaded before the page
  controllers alongside `mc-fav.js` / `mc-cards.js`.
- New store `mc-cookbook:timers` → `{ timers: [{ id, recipeId, stepNumber, label, endsAt,
  pausedRemaining|null, createdAt }] }`. **Add to `mc-sync.js`'s `STORES`? No** — a running
  timer is device-local by nature and has no sensible merge; document it in `CLAUDE.md`'s
  "deliberately not synced" list next to `:timecheck`, with that reason.
- Single `requestAnimationFrame`-throttled ticker in the module (one loop for N timers,
  not N intervals), plus a `visibilitychange` handler that reconciles from wall clock.
- `timerChip()` in `cookbook.js` becomes a thin view over `MCTimers.start(...)`; `renderCook()`
  keeps its `innerHTML = ""` (correct for the step body) because timer state no longer lives
  in that subtree.
- `cookbook.js` `init()` reads `?cook=1` and calls `enterCook(r)` after `setTab("recipe")`.
- Notifications: extend `sw.js` with a `message` handler that schedules/cancels a
  `showNotification`; guard behind `Notification.permission`, requested lazily on first timer
  start (never at page load). Full graceful degradation when denied — the current in-app
  alert path is unchanged.
- **CI:** `tools/test-mc-timers.js` sandboxes the module with `vm` and a mocked clock, exactly
  as `tools/test-mc-sync-merge.js` does, asserting: a timer survives a simulated 30-minute
  background gap; two concurrent timers expire independently; a paused timer resumes correctly.
  Add as blocking gate 9 in `pages.yml`.

**UI/UX & aesthetic spec.**
- A **timer rail** docked above the safe-area inset: 56px-tall pills, cream `--surface` on
  `--bg`, radius `--r-md`, one pill per timer, horizontally scrollable past three.
- Each pill: monospaced tabular-figure countdown at 1.25rem, label at 0.75rem `--ink-dim`,
  and a **circular-progress ring** that drains around the pill's leading edge — the app's
  one motion primitive (`--ease-out`, `--dur`) reused, not a new vocabulary.
- Under 60 seconds the ring shifts from `--sage` to `--accent`; at zero the pill takes a
  `.ringing` state with the existing `pop()` animation and a slow 1.2s breath — suppressed
  under `prefers-reduced-motion` (which the pill respects by switching to a static
  high-contrast fill).
- Voice grammar extends the existing `webkitSpeechRecognition` table with
  `"set a timer for N minutes"`, `"how long left"` (spoken via the existing `cookAnnounce`
  TTS), and `"stop the timer"`. Zero new dependencies — this is four regexes and two
  handlers in a table that already has four entries.
- Tap a pill → jump to the step that created it, even across recipes.

**Automation impact.** Removes the separate phone-timer app from the loop entirely. The
current design silently *loses* work; the new one is unlosable by construction — a
wall-clock anchor cannot drift, and a persisted store cannot be blanked by a re-render.
Deep-linked Cooking Mode removes three taps and one scroll from every single cook, which on
a 5-meals-a-week cadence is ~260 fewer interactions a year at the exact moment the user's
hands are dirtiest.

---

### Initiative 2: The Ingredient Truth Layer ✅ (shipped)

* **Target Domain:** Smart Grocery Consolidation / Unit Normalization / Pantry Intelligence
* **Status:** ✅ **Shipped**, as a smaller, more honest first slice than the spec below projected:
  * **208 → 179 of 854 identities fragment** (24.4% → 21.0%), not the full resolution the original
    framing implied. The metric bridge and unit-word aliasing are exact, zero-risk fixes and landed
    in full; the density table is the one place this initiative makes a judgment call, and it stayed
    deliberately small — ~30 curated items, each a widely-cited average weight, not the ~120-row
    table originally estimated. Most of the *remaining* 179 are a genuine cooking-measurement-vs-weight
    divide (a cup of chopped onion vs. a whole one) or fresh-herb bunch sizes, both of which this file
    declines to guess at for the same reason `ITEM_ALIASES` started empty: fabricating a density it
    isn't confident in would silently under- or over-count a real shopping list.
  * The fragmentation count is a **CI ratchet** (`tools/test-mc-units.js`, gate 8 of 12), not a
    one-time fix — it can only fall as `DENSITY` grows, never silently rise.
  * The aisle model shipped as specified: `Produce → Meat & Poultry / Seafood → Dairy & Eggs →
    Spices & Seasonings → Condiments & Sauces → Dry Goods & Pantry → Frozen` (perimeter first,
    frozen deliberately last), derived from the untouched `category` enum plus a keyword check.
  * **Not built:** user-reorderable aisle sequence. `AISLE_ORDER` is fixed, not drag-sortable — a
    real feature, deliberately scoped out to keep this slice to the ingredient-math + a sensible
    default store walk, not a new persisted-preference UI. Candidate for a follow-up, not blocking.

**The problem / gap.** The merged grocery list is the app's highest-leverage automation and
it is wrong on **24.5% of the catalog's ingredient identities**. Measured: 210 of 856
identities split into more than one quantity bucket; 121 of those mix metric and imperial
across a boundary `UNIT_DEFS` cannot cross. Garlic renders as six separate sub-amounts.
The unit half of the bucket key is never singularized, so `clove` and `cloves` are
structurally distinct. The result at the store is a row reading `"3 cloves · 1 clove ·
1 tbsp · 6 g"` — which is not a shopping instruction, it's a research assignment. Worse, it
is *silently* wrong: the merge is doing exactly what it was told, so nothing flags it.

**The CI solution.** A deterministic normalization layer beneath `MCGrocery`, with three
tiers, each strictly more conservative than the last — and a CI gate that measures
fragmentation so it can never silently regress.

1. **Unit singularization + alias expansion.** `clove`/`cloves`, `slice`/`slices`,
   `stalk`/`stalks`, `can`/`cans`, `scoop`/`scoops`, `(24 oz) jar`/`(24 oz) jars`. Pure
   string normalization, zero ambiguity, eliminates a whole class of split by itself.
2. **A metric bridge.** Extend `UNIT_DEFS` with `g`/`kg` into the `wt` family (1 oz =
   28.3495 g) and `ml`/`l` into `vol` (1 tsp = 4.92892 ml). These are exact conversions;
   the only reason they were absent is that the family tables were written imperial-first.
   Display ladders stay imperial-preferred so the list still reads "1 lb", not "453 g".
3. **A curated count↔weight density table** — the one place judgment enters, so it is
   explicit, reviewable data rather than an inference: `1 garlic clove ≈ 3 g`,
   `1 medium onion ≈ 110 g`, `1 celery stalk ≈ 40 g`, `1 cup diced onion ≈ 160 g`. Roughly
   120 rows cover the corpus's long tail. Every row carries a source note. **Conversions
   round up, never down** — the existing purchase-unit rule, applied one layer deeper.

Plus a **real aisle model**: the 4-value `category` enum is a data-integrity field, not a
store layout. Add a derived `aisle` (Produce · Butcher · Dairy & Eggs · Dry Goods · Spices ·
Frozen · Refrigerated) computed from item identity, with user-reorderable aisle sequence so
the list matches *their* store's walk.

**Technical & architecture specifications.**
- New `mc-units.js` (`window.MCUnits`) holding `UNIT_DEFS` (extended), `DENSITY` (the count↔g
  table), `AISLE_MAP`, and pure functions `normalizeUnit(u)`, `toBase(qty, unit, item)`,
  `aisleFor(item, category)`. **Pure, no DOM, no storage** — trivially testable.
- `mc-grocery.js` delegates `unitInfo()` and the bucket key to `MCUnits`; `buildGrocery()`'s
  structure is unchanged. The `ikey` stays `category|singularized-name`, so `mc-cookbook:mealplan:grocery`
  check-off keys **remain stable** — no migration, no lost check-offs.
- `Smart Week`'s ingredient-overlap scoring reads the same keys (it already shares
  `groceryMergeName`), so overlap detection gets more accurate for free — recipes that share
  garlic-in-grams and garlic-in-cloves finally register as overlapping.
- New store `mc-cookbook:aisleorder` (array of aisle names). Syncable — it's a stable ordered
  list; use a last-write-wins strategy and document it.
- **CI:** `tools/test-mc-grocery.js` — asserts the exact conversions, asserts round-up
  behavior, and runs the corpus-wide fragmentation probe as a **ratcheting metric**: the
  count of multi-bucket identities must not increase. Baseline is committed at 210; adding a
  recipe with a novel unit that fragments fails the build until the table covers it. Add as
  a blocking gate.
- A `--report` flag prints the current fragmentation table, so improving the density table
  is a measurable exercise rather than a vibe.

**UI/UX & aesthetic spec.**
- One row, one number: `2 lb 3 oz · Chicken breast`. Quantity in tabular figures, left-aligned
  in a fixed 5.5rem column so numbers form a clean vertical rule down the list — the single
  highest-value typographic move on this screen.
- **A quiet provenance affordance:** a hairline `--line` underdot on any quantity that was
  derived via a density conversion; tap → a small sheet reading "6 cloves ≈ 18 g · from
  3 recipes." Never a modal, never an interruption. Trust in an automated number comes from
  being able to open it, not from it being hidden.
- Aisle headers as sticky small-caps `--ink-dim` labels with a hairline rule; drag-handle
  reorder in an "Arrange my store" sheet, with the existing 220ms `--ease-out` settle already
  used by `collapseGroceryRow`.
- Pantry staples keep their current lift-off-the-list behavior, now aisle-aware.

**Automation impact.** Turns a research assignment back into a shopping list on a quarter of
all items. Every derived number rounds up, so the failure mode is "slightly extra," never a
missing ingredient mid-cook — the one failure a cookbook must never cause. Aisle ordering
removes the backtracking walk through a store, which is the largest single time cost in the
grocery leg of the journey.

---

### Initiative 3: The Photographic Layer (auto-curated) ✅ (shipped)

* **Target Domain:** Visual Media Presentation / Micro-UI & Motion / Daylight Legibility
* **Status:** ✅ **Shipped, all three slices**, with a scope adjustment on Slice A's placement:
  * **Slice A — surfacing existing photos.** `mc-cards.js`'s `photoFor(r)` chain (authored →
    cover → cook-log → nothing) is live on every card grid: Browse, Favorites, Mike's
    Favorites, collection pages, and the planner's picker. A resolved photo swaps the
    compact 52px icon band for a taller `aspect-ratio: 4/3` photo band — the accent survives
    as a 3px rule beneath it, and a cook-log-sourced photo gets a "📸 Your cook" chip. **The
    proposal's overlay-title treatment ("title sits on the image, scrim behind it") wasn't
    built** — title stays in the existing cream `.rc-body` below the photo, a smaller,
    lower-risk evolution of the current split-card layout rather than a redesign of how
    every one of 318 cards presents its title. `recipe.html` also got a real hero (not in
    the original card-only scope): a non-sticky `#hero` block before the sticky header, so
    it scrolls away naturally, using the identical `photoFor()` chain.
  * **Slice B — wiring the `photo` field.** Shipped exactly as specced: `tools/validate-
    recipes.js` fails CI on a `photo` path that doesn't resolve on disk; `tools/build-sw.py`
    recursively scans `images/` (previously top-level-only) for the precache. Verified both
    directions with a mutated fixture (bad path fails, good path passes) since no recipe
    currently has a photo to exercise this against for real.
  * **Slice C — light theme + Counter Mode.** Light theme: a 7-token `@media (prefers-color-
    scheme: light)` override, exactly as specced (`--bg` → warm paper, `--surface` →
    white). **A real bug this pass caught along the way:** four floating "frosted chrome"
    elements (the tab bar, both FABs, the header's fade) were hardcoded to
    `rgba(30,32,34,…)` instead of reading a token, so the light override couldn't reach
    them — a light shell with dark-charcoal floating chrome. Fixed with a new `--chrome-rgb`
    token those four spots now read. Counter Mode: a manual, persisted toggle in Cooking
    Mode's top bar (not the ambient `prefers-color-scheme` — a cook's daylight need is a
    decision, not something to infer), redefining `.cook`'s own tokens to near-brutalist
    white/black with a 1.5rem type floor; `--accent` stays untouched, exactly as specced.
  * **Not done:** an exhaustive line-by-line audit of ~2,400 lines of CSS for every
    dark-mode-assuming literal. The four "frosted chrome" spots were found and fixed; there
    may be other, lower-traffic components with a similar hardcoded assumption that a full
    light-mode visual pass would still catch. `diagnostics.html` doesn't yet have a check for
    this — a reasonable follow-up.

**The problem / gap.** `cookbook-home.js:65` states it plainly: *"Recipe cards have no
photography."* Zero of 318 recipes carry a `photo` field; `images/` does not exist. Every
grid is emoji-over-CSS-pattern — a considered fallback, executed well, and still the single
largest gap between this app and NYT Cooking or Kitchen Stories. Food is the most
photogenic content category there is and this app renders none of it.

The compounding waste: **the photos already exist.** `mc-cookbook:photos` holds a cover image
per recipe (cap 24) and `mc-cookbook:cooked[].photo` holds one per dated cook entry (cap 12).
Both are captured through a real downscale pipeline. Both render in exactly one place —
`recipe.html`'s sticky header and its cook-log card. Home, Browse, Favorites, Mike's
Favorites, the planner, and every collection page ignore them completely.

Compounding it further: the app is **dark-only**. No `prefers-color-scheme` block exists in
2,399 lines of CSS. Charcoal at arm's length on a sunlit counter is this app's worst
legibility case, and it is exactly the Cooking Mode case.

**The CI solution.** Three moves, cheapest first.

1. **Surface what already exists.** `MCCards.recipeCard()` gains a photo resolution chain:
   authored `r.photo` → user cover (`mc-cookbook:photos`) → most-recent cook-log photo →
   the existing emoji/pattern fallback, unchanged. The user's own dish photos become the
   cookbook's art everywhere, automatically, with zero new user effort. **This is the
   highest-ROI visual change available and it ships without a single new asset.**
2. **Wire the `photo` field.** `CLAUDE.md` already specifies the hand-off rule
   (`images/recipes/<recipe_id>.<ext>` + a `photo` field). Today that field is inert —
   nothing reads it. Make it render as a hero on `recipe.html` and as card art, so authored
   photography has somewhere to land the moment the first one arrives.
3. **Counter Mode.** A daylight theme, plus an explicit high-luminance Cooking Mode variant.

**Technical & architecture specifications.**
- `mc-cards.js`: `photoFor(r)` implementing the chain above; card markup gains an optional
  `<div class="rc-photo">` above the accent band. `opts.photo: false` opts out (dense list
  contexts). Fallback path is byte-for-byte the current behavior, so any recipe without a
  photo renders exactly as it does today — **no visual regression is possible** for the 318
  recipes that have none.
- All images `loading="lazy"` `decoding="async"` with an explicit `aspect-ratio: 4/3` box, so
  a grid never reflows as photos resolve. Data-URL photos from localStorage are read once per
  render pass and memoized per screen paint (the shell rebuilds Home's DOM on every visit).
- `tools/validate-recipes.js` gains a check: any `photo` path must resolve to a file on disk.
  A recipe pointing at a missing image fails CI rather than rendering a broken box.
- `tools/build-sw.py`: `EXTS` extends to `.jpg`/`.jpeg`/`.webp`/`.png` **only under
  `images/`**, so authored photos precache for offline use without sweeping in stray assets.
- Theming: `:root` tokens are already the single source of truth, so a light theme is a
  `@media (prefers-color-scheme: light)` block overriding ~12 token values — **not** a
  restyle. `--bg` → warm paper `#F7F5F1`, `--surface` → white, `--on-dark` → `--ink`.
  Because 58 rules already cascade from `--accent` and its siblings, the component layer
  needs no changes.
- Counter Mode: a `data-counter="1"` attribute on the Cooking Mode overlay forcing maximum
  luminance and contrast independent of the ambient theme, persisted in
  `mc-cookbook:cookmode` beside the existing `mc-cookbook:cookfont`.

**UI/UX & aesthetic spec.**
- **Editorial, not e-commerce.** Card photo at 4:3, radius `--r-lg` top corners only, with a
  bottom-edge gradient scrim (`--bg` at 0 → 0.75 alpha) so the title sits *on* the image at
  full contrast rather than beside it. The accent band survives as a 3px rule under the photo —
  the per-recipe accent is this app's identity and photography must not erase it.
- Hero on `recipe.html`: full-bleed, 16:9, parallax-free (kitchen scroll is one-thumb and
  jittery), with the existing sticky header condensing over it on scroll.
- A card whose photo came from the user's own cook log gets a small `📸 Your cook · Mar 14`
  chip at 0.7rem in the scrim. This is the emotional payoff of the whole initiative: the
  cookbook visibly becomes *theirs* the more they cook from it.
- Counter Mode: `#FFFFFF` ground, `#000000` ink, step type floored at 1.5rem regardless of
  the A−/A+ setting, accent reserved solely for the progress bar and active timer. It should
  look almost brutalist next to the rest of the app — that is correct for a screen read at
  arm's length under a window.
- Photo load: 200ms `--ease-out` opacity fade only. No scale, no blur-up. Reduced-motion
  users get an instant swap.

**Automation impact.** The photo library builds itself. Every cook-log photo the user was
already taking now compounds into the app's visual quality with zero curation, zero uploads,
and zero decisions — a system that gets more beautiful as a direct function of use. Counter
Mode removes the squint-and-lean that currently precedes every step read in daylight.

---

### Initiative 4: Intent-Ranked Discovery ✅ (shipped, search + substitution slices)

* **Target Domain:** Search & Discovery / Cook-What-You-Have / AI-adjacent Matching
* **Status:** ✅ **Search and substitution shipped; cook-what-you-have was already there.**
  * `mc-search.js` replaced the `indexOf`-over-five-fields scan on the shell's Browse screen,
    the recipe/meal picker overlay, and `collection.html`'s live search — all three were
    separate reimplementations of the same substring scan, now one module. Both documented
    failures are fixed and pinned in `tools/test-mc-search.js`: `"chicken broccoli"` and
    `"chiken"` each now return real, ranked results.
  * **A real bug the test suite itself caught:** the first working fuzz threshold (no fuzz
    under 4 characters) let `"pork"` fuzzy-match `"York"` (New York strip steak) at edit
    distance 1 — a single p→y substitution. The floor is 5 characters now.
  * **A real performance bug, also self-caught:** the first working version ran Levenshtein
    per (recipe × field × word) and measured ~35–50ms per keystroke on the real corpus —
    perceptible lag on a live-typing search box. Restructured to resolve fuzzy matches once
    per query token against a corpus-wide vocabulary instead of once per recipe; the same
    corpus now measures ~4–8ms/query.
  * **"Cook what you have" was substantially already built**, just under a different name —
    the existing 🧂 Low-shopping filter already ranks by `pantryMatchInfo()`'s coverage
    (`need` ascending) and shows a "Need N items" badge. Nothing new was required there; the
    audit's framing implied a gap that measurement showed was mostly already closed.
  * **Missing-ingredient substitution shipped smaller than proposed.** A curated 20-swap table
    surfaces as an informational "Don't have it on hand?" note on `recipe.html`'s Grocery tab —
    not the pantry-aware, tap-to-accept-and-rewrite-the-row version the original spec
    described. `recipe.html` has no pantry read, and wiring one in was judged not worth a new
    cross-file dependency for a first slice; the note shows for any curated ingredient the
    recipe uses, regardless of whether the cook's pantry actually has it.
  * **Not built:** token highlighting in card titles (a visual nicety, explicitly scoped out
    up front) and the matched-field eyebrow on the picker overlay and collection pages (only
    the shell's Browse screen shows it — ranking improved everywhere, the badge didn't).

**The problem / gap.** `recipesMatch()` is `indexOf` over five fields. Consequences,
verified against the real catalog:

- `"chicken broccoli"` → **0 results**. The query is compared as one contiguous substring, so
  any two-word intent fails unless those exact words are adjacent in a single field.
- `"chiken"` → **0 results**. No tolerance of any kind.
- Results are **unranked** — a recipe whose *title* is "Chicken Alfredo" sorts identically to
  one that merely lists chicken 9th in its ingredients.
- Ingredient matching reads only the native tier, so it inspects one of the two authored
  ingredient lists on the 162 recipes that have two.

This is the front door to 318 recipes and it fails on the most natural query a cook types.
Meanwhile the app *already has* the raw material for something far better: a pantry store, an
`ingredientIndex()` reverse index, a 119-tag vocabulary, macro profiles, and cook history.

**The CI solution.** A real scored index, plus an intent mode that only this app can offer.

- **Tokenize and AND.** Every whitespace token must match somewhere; `"chicken broccoli"`
  works.
- **Field-weighted scoring:** title 10 · dish_category 6 · tags 4 · ingredient item 3 ·
  description 1, with an exact-token bonus over prefix, and a prefix bonus over
  bounded-edit-distance. Sort by score, not by array order.
- **Bounded fuzz:** Levenshtein ≤1 for tokens of 4–6 chars, ≤2 for 7+, never on short tokens
  (so `"pork"` never matches `"port"`). Catches `chiken`, `brocoli`, `avacado` without
  producing nonsense.
- **"Cook what you have" as a first-class mode.** The pantry store and the reverse ingredient
  index already exist; the Browse screen already has a `🧂 Low-shopping` chip. Promote it:
  type or tap the ingredients on hand, get recipes ranked by **coverage** with an explicit
  `Need 2 more: sour cream, lime` line per card — turning the question from "what can I
  search for" into "what can I cook right now."
- **Missing-ingredient substitution.** For a recipe that's 1–2 items short, offer a
  deterministic swap from a curated table (buttermilk → milk + acid; sour cream → Greek
  yogurt; shallot → onion + garlic), scoped to the ~40 swaps the corpus actually needs.
  This is the ingredient-level substitution the app has never had, and it earns its place by
  appearing *precisely* when it's needed rather than as another screen.

**Technical & architecture specifications.**
- New `mc-search.js` (`window.MCSearch`): builds a token→postings index over all recipes once,
  lazily on first query, memoized. 318 recipes × ~40 tokens is a trivial index — measured
  against the corpus this is well under 15ms to build, no worker needed.
- Index all authored tiers' ingredients, not just native, deduped by `groceryMergeName` so it
  shares identity keying with `MCGrocery` — one definition of "the same ingredient" across
  search, grocery, and Smart Week overlap.
- `MCSearch.query(q, opts)` → `[{ recipe, score, matchedFields }]`. `recipesMatch()` in
  `cookbook-home.js` and the live search in `collection.js` both delegate; both currently
  reimplement matching, so this is also a de-duplication in the audit's own C-07 spirit.
- Substitutions: `SUBSTITUTIONS` table in `mc-units.js` (it already owns ingredient identity),
  keyed by `groceryMergeName`, each entry `{ swap, ratio, note }`.
- Index build is invalidated on `mc-cookbook:userrecipes` change so user recipes are
  searchable immediately (they already merge into `window.RECIPES` at load).
- **CI:** `tools/test-mc-search.js` — a fixture of ~15 real queries with asserted top-3
  results, including the two failures above as explicit regression cases, plus a guard that
  fuzz never matches across short tokens. Blocking gate.

**UI/UX & aesthetic spec.**
- Matched tokens highlighted in card titles with an `--accent` background at 0.18 alpha —
  never bold, which fights the serif's weight.
- Result cards gain a subtle `matchedFields` eyebrow (`matched: ingredient`) at 0.7rem
  `--ink-dim`, so ranking is legible instead of mysterious.
- Cook-what-you-have: pantry items render as removable chips in a wrap row above results,
  reusing `.pantry-filter-toggle`'s existing on-state. Coverage shown as a thin
  `--sage` → `--accent` fill on the card's accent band — the band already exists, so this is
  meaning added to an existing element, not a new one.
- Substitution surfaces as a single inline line on the recipe's grocery tab:
  `No sour cream? Use ¾ cup Greek yogurt.` One tap to accept, which rewrites the grocery row.
  No overlay, no new screen.
- Zero-results state proposes the three highest-scoring near-misses rather than an apology.

**Automation impact.** Converts the catalog from *searchable-if-you-know-the-title* to
*answerable-from-intent*. "Cook what you have" eliminates the most common real-world failure
of a 318-recipe library — owning it and still not knowing what tonight is — and it does so
from state the app already maintains. Ingredient substitution prevents the trip-to-the-store
abort, which is the single most expensive failure in the whole culinary journey.

---

### Initiative 5: The Instant-Open Data Layer ✅ (shipped)

* **Target Domain:** Time-to-Table / Boot Performance / Offline Architecture
* **Status:** ✅ **Shipped**, with three corrections the build forced — each of which was a wrong assumption in the spec below, caught by measuring:
  * **The index is 155 KB, not ~120 KB** (14.5% of source), so first paint waits on **81% less work**, not 88%. Confirmed in a real browser, not inferred: median parse+execute of `recipes-data.js` vs `recipes-index.js` in the same Chromium was 2.6 ms → 0.5 ms. Note the *absolute* saving on a desktop-class CPU is ~2 ms — the byte and percentage wins are real and the transfer saving (155 KB vs 1.04 MB before anything can paint) dominates on kitchen Wi-Fi, but **the phone-scale number is still unmeasured**. `diagnostics.html` now reports exactly it.
  * **Per-letter shards were a bad idea.** Recipe ids cluster hard: `c` alone (chicken, chipotle, chocolate…) is 211 KB, larger than the whole index, so opening a chicken recipe would have pulled a fifth of the corpus. Shards are hash-assigned instead — 16 of them, 33–70 KB.
  * **"No consumer changes" was not achievable.** Three shell features genuinely need the whole corpus (ingredient search, the "Use it up" reverse index, the low-shopping pantry filter) plus the planner's grocery merge, so they call `ensureAll()` and repaint **in place** when it resolves. A hydration accessor cannot make an async load synchronous; the honest design waits, and `hasDetail()`/`allReady()` exist so callers check rather than silently rendering an empty ingredient list.
* **Also learned:** the generator's index field list started as an allow-list and silently dropped `subsection` from 236 recipes. It is a deny-list now, so the failure mode is a too-big index rather than missing data, and `tools/test-mc-data.js` round-trips every field of every recipe to prove it.

**The problem / gap.** `recipes-data.js` is 1.04 MB across 23,220 lines and is loaded
**synchronously, in full, before any render, on all three page types**. Opening one recipe
parses all 318. The repo already suspected this: `window.__mcBoot` exists to measure it
(audit C-06) and `recipe.html`'s own comment calls it *"62% of the payload."* The
instrument is in place; the fix never followed.

This is the substrate under everything else. It is why Initiative 3 must not naively add
images to the first-paint path, and it is the difference between an app that feels like a
native cookbook and one that feels like a website — a distinction a user makes in the first
400 milliseconds, wet hands, mid-recipe.

**The CI solution.** Split the monolith into a **generated index** plus **lazy per-recipe
detail**, following the repo's existing generator precedent exactly.

- `recipes-index.js` — id, title, icon, accent, category, dish_category, tags, source,
  native_serving, and per-serving macros for all 318. Everything Home, Browse, Favorites,
  the planner, search, and every card grid needs. Estimated ~120 KB — roughly an **88%
  reduction** in what a cold open must parse.
- `recipes-detail-<shard>.js` — ingredients and instructions, sharded by first letter of
  `recipe_id` (~26 shards, ~40 KB each), fetched on demand by `recipe.html` and by the
  grocery merge.
- `window.RECIPES` **remains a live array with the same shape.** A `Proxy`-free accessor
  layer hydrates detail fields on access and returns a promise-free view for the index
  fields, so *no consumer changes* — `recipesIn()`, `recipeById()`, `MCGrocery`, Smart Week,
  and `user-recipes.js`'s merge all keep working against the same interface. This is the
  entire reason the split is safe: the data layer is already decoupled from rendering.
- The service worker precaches **index + all shards** as it does today, so offline capability
  is strictly unchanged — the win is parse time, not network.

**Technical & architecture specifications.**
- `tools/build-data.py` generates index + shards from a single authored `recipes-data.js`,
  which **stays the source of truth** — recipes are still added by appending one object to
  one array, exactly as `CLAUDE.md` documents. Nothing about the authoring workflow changes.
- `--check` mode fails CI when the generated files are stale, mirroring `build-sw.py`'s
  contract precisely. Add as a blocking gate; add the generated files to `.gitattributes` as
  `linguist-generated`.
- `mc-data.js` (`window.MCData`) owns hydration: `ensureDetail(id) → Promise`, plus a
  synchronous `detail(id)` for already-hydrated recipes. `recipe.html` awaits one shard before
  first render; `MCGrocery.buildGrocery()` awaits the shards its plan touches.
- `user-recipes.js` merges into the index at load as it does now, with full detail inline
  (user recipes are few and already in localStorage — no sharding needed).
- `window.__mcBoot` extends to `{ t0, index, detail, firstPaint }` and `diagnostics.html`
  reports all four, so the improvement is **measured on real devices**, not asserted.
- **CI:** extend `tools/validate-recipes.js` to validate index+shards reassemble to a
  byte-equivalent recipe set. A split that loses a field fails the build.

**UI/UX & aesthetic spec.**
- The user-visible spec is *the absence of a spec*: no spinner, no skeleton, no shimmer. The
  index carries title, icon, accent, and macros, so a recipe's header, tags, times, and
  macros paint **immediately** and the ingredient/step panes fill in within the same frame
  budget on a warm cache. A skeleton would advertise a wait that shouldn't be perceptible.
- Should a shard genuinely stall (cold cache, dead network), the pane shows the recipe's own
  accent as a 2px indeterminate top rule — the least ceremony that still communicates.
- Cards in every grid render from the index alone, so scroll performance in Browse becomes
  independent of catalog size — which matters directly as the library grows past 318.

**Automation impact.** Every subsequent initiative gets cheaper: photos can be added to card
grids without compounding a first-paint cost that was already too high, search indexes the
lightweight index rather than the full corpus, and the catalog can grow toward 1,000 recipes
without the boot cost growing with it. This is the enabler, which is why it is sequenced
early despite having no visible feature of its own.

---

## 4. Next steps & implementation roadmap

### Phase 1 — Repair and Measure ✅ *(shipped)*

1. **Initiative 1 — Continuous Cook Session.** It fixes a live defect where a user's running
   timer is silently destroyed. Nothing else on this list outranks correctness.
2. **Initiative 5 — Instant-Open Data Layer.** Sequenced second because it is the substrate
   under Phases 2 and 3, and because doing it *before* photography avoids a re-do.

Both ship behind new blocking CI gates (`test-mc-timers.js`, `build-data.py --check`), taking
the gate count from 8 to **11** (both initiatives added a test plus a freshness check).

**The one Phase 1 step still outstanding is the device measurement.** `diagnostics.html` now
reports `__mcBoot.data` as the index-only parse and flags anything over 120 ms. Open it on a
real phone before starting Phase 2: the desktop measurement above confirms the *relative* win
(81% less work before first paint) but says nothing useful about a mid-range phone, which is
the device this app is for. `tools/smoke-test.js` also ships now — a real-browser pass over
boot, hydration, search, `?cook=1` and timer survival — though it needs Playwright and is
deliberately not wired into CI.

### Phase 2 — Algorithmic Truth ✅ *(shipped)*

3. **Initiative 2 — Ingredient Truth Layer.** ✅ Shipped: `mc-units.js` with the ratcheting
   fragmentation gate (`tools/test-mc-units.js`) and the aisle model both landed. Measured
   208 → 179 of 854 identities fragmenting — a real, CI-enforced improvement, smaller than the
   original ~120-row density-table estimate because the table shipped deliberately conservative
   (~30 curated items). Growing `DENSITY`/`UNIT_WORD_ALIASES` further, and building the
   user-reorderable aisle sequence, are both real follow-ups but weren't blocking for this slice.
4. **Initiative 4 — Intent-Ranked Discovery.** ✅ Shipped: `mc-search.js` replaced the
   `indexOf` scan everywhere it lived (Browse, the picker overlay, `collection.html`), fixing
   both documented failures (`"chicken broccoli"`, `"chiken"`) and catching two real bugs in
   its own test suite along the way — a 4-char fuzz floor that let `"pork"` match `"York"`,
   and a naive per-recipe fuzzy scan that measured ~35–50ms/query before being restructured to
   ~4–8ms. Cook-what-you-have turned out to already exist (the 🧂 Low-shopping filter). The
   substitution slice shipped smaller than proposed — informational only, not pantry-aware or
   interactive — see Initiative 4's own status note above for the full account.

### Phase 3 — Flagship Surface ✅ *(shipped)*

5. **Initiative 3 — Photographic Layer.** ✅ Shipped, all three slices. Slice A surfaces
   the photos that already exist (cards + a new recipe.html hero) with zero new assets;
   the proposed overlay-title card treatment was traded for a smaller, lower-risk change —
   photo fills the band, title stays in the cream body below, unchanged from today's layout.
   Slice B wired the `photo` field exactly as specced. Slice C shipped the light theme and
   Counter Mode, and caught a real cross-cutting bug along the way: four floating chrome
   elements were hardcoded dark and couldn't have responded to any theme override without
   the `--chrome-rgb` fix that shipped alongside it.

### Cross-cutting, every phase

- **The Quick Tour is not optional.** `CLAUDE.md`'s documentation currency rule applies to
  the timer rail, cook-mode deep entry, aisle ordering, cook-what-you-have, substitutions,
  photo cards, and Counter Mode — every one is user-facing. `quick-tour.html` and
  `quick-tour-overview.html` update in the same piece of work, and `tools/check-docs.js`
  should grow assertions for each new claim.
- **Close the open CI gap.** `ROADMAP.md` names the absent UI smoke test as the standing
  weakness. Four new pure, DOM-free modules (`mc-timers`, `mc-units`, `mc-search`, `mc-data`)
  are each `vm`-testable in the established `test-mc-sync-merge.js` style — this round should
  close most of that gap as a side effect of how it's structured.
- **`CLAUDE.md` and `ROADMAP.md` get a truthfulness pass at the end of every phase**, per this
  repo's own process rule. Doc drift is the documented highest-frequency waste here.

### Explicitly out of scope this round

LLM/AI recipe parsing (the data is already structured — an LLM belongs at the *import*
boundary, i.e. pasting a recipe from a URL, which is its own initiative); commissioned
photography for 318 recipes (a content project, not a CI initiative); any framework, bundler,
or npm dependency; and a leftovers/yield model, which is real but ranks below all five above.
