/* ==========================================================================
   features.js — the cookbook's feature registry (C-I4, VOC/VOA Kaizen audit)
   --------------------------------------------------------------------------
   One array naming every real screen/capability the app has, so the
   Documentation currency rule in CLAUDE.md (keep the Quick Tour current) has
   a mechanism behind it, not just prose. Mirrors the pattern already used by
   the finance apps (js/features.js), scoped for this repo's shape.

   This is NOT the content source for quick-tour.html or
   quick-tour-overview.html — both stay hand-authored, and deliberately so.
   Rewriting either into a generic array-driven renderer risks exactly what
   roadmap F6 already reversed once in the sibling workout app: an inlining
   pipeline that made the target page longer and harder to keep accurate than
   just editing it directly. What THIS file buys instead is a coverage
   contract: tools/check-tour-coverage.js asserts every entry below is
   actually mentioned somewhere in quick-tour.html's real text, so a new
   screen shipping with zero tour coverage fails CI instead of silently
   drifting the way pm-rename-design.md-style gaps did elsewhere in this
   account's other repos.

   Each entry:
     id        stable slug, matches the real route/screen where it applies
     name      what a cook would call this feature
     keywords  lowercase substrings; the coverage check passes if AT LEAST
               ONE appears in quick-tour.html's lowercased text -- pick
               distinctive words so a coincidental hit elsewhere in the page
               doesn't create a false pass

   Adding a real screen or capability? Add it here in the same change, and
   make sure quick-tour.html actually mentions it -- that's the two-sided
   contract the gate checks. ========================================================================== */
window.MC_FEATURES = [
  {
    id: 'home',
    name: 'Home — the hub & spokes',
    keywords: ['home hub', 'home base']
  },
  {
    id: 'browse',
    name: 'Browse: collections & dish types',
    keywords: ['browse & pick a recipe', 'browse a recipe']
  },
  {
    id: 'recipe-detail',
    name: 'Recipe detail — scaling, macros, grocery, method',
    keywords: ['macros, grocery', 'scale any recipe']
  },
  {
    id: 'cooking-mode',
    name: 'Cooking Mode (hands-free, voice, timers)',
    keywords: ['cooking mode', 'install & cook offline']
  },
  {
    id: 'planner',
    name: 'This Week planner & grocery list',
    keywords: ['this week planner', 'grocery list']
  },
  {
    id: 'plan-my-week',
    name: 'Plan my week (Balanced / Macro / Time)',
    keywords: ['plan my week']
  },
  {
    id: 'tracker',
    name: 'The macro tracker',
    keywords: ['macro tracker']
  },
  {
    id: 'favorites',
    name: 'Favorites & My Recipes',
    keywords: ['favorites & your own recipes', 'make it yours']
  },
  {
    id: 'account-sync',
    name: 'Optional sign-in & cross-device sync',
    keywords: ['sign in', 'sync']
  },
  {
    id: 'share-target',
    name: 'Share a recipe link in from another app',
    keywords: ['share it straight to', 'phone\'s own share button']
  },
  {
    id: 'recipe-import',
    name: 'Import a recipe by pasting a link',
    keywords: ['paste a link', 'import it automatically']
  },
  {
    id: 'offline-install',
    name: 'Install & offline',
    keywords: ['install & cook offline', 'offline']
  },
  {
    id: 'pantry-quantities',
    name: 'Pantry quantities — record how much you have',
    keywords: ['how much you have', 'more to buy']
  },
  {
    id: 'macro-target-scaling',
    name: 'Hit a macro target (bi-directional scaling)',
    keywords: ['hit a macro target', 'macro target']
  },
  {
    id: 'cook-timeline',
    name: 'Time It Together — multi-dish cook timeline',
    keywords: ['time it together']
  }
];
