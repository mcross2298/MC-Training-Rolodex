/* Quick Tour content — the slides themselves, and the one function that turns
   a slide into markup.

   These were inline in quick-tour.html until quick-tour-full.html existed. Data
   and renderer ship together on purpose: the renderer is the only reader of a
   slide's shape, so a field added to one and not the other is the drift worth
   preventing, and both pages now get it from the same place.

   NOTE: tools/check-tour-coverage.js scans this file as well as quick-tour.html
   for its feature-keyword check — the tour's prose is here now, so the gate
   reads here too. */
(function () {
  'use strict';

  var SLIDES = [
    {
      eyebrow:'Welcome',
      title:"Welcome to Mike's Cookbook",
      tagline:"Heirloom hand-me-downs meet performance plates — whole-food, low-carb cooking on a two-meals-a-day rhythm, in an app built for the kitchen. This short tour gets you cooking with zero guesswork.",
      scene:{glyph:'🍳',caption:'318 recipes · serving scaling · macros · smart grocery lists',glow:'rgba(200,122,83,0.18)'},
      narration:"Welcome in. Everything lives one or two taps from Home — browse recipes, scale a dish to any serving count, see the macros, plan your week, and even track what you eat. Swipe or tap Next and I'll walk you through it.",
      steps:[
        {tx:"Use <span class='tap'>Next →</span> / <b>← Back</b> below, the dots, or swipe left/right."},
        {tx:"Tap any <span class='tap'>Open it</span> card to jump straight into the real screen and try it live."},
        {tx:"Rather read it all at once? <b>The whole tour — every step on one page</b> is linked at the top, and the <b>Executive Summary</b> beside it exports to PDF."},
      {tx:"Hit <b>Skip</b> anytime — relaunch this tour from the <b>Quick Tour</b> card on Home whenever you like."}
      ]
    },
    {
      eyebrow:'Module 1 · Home base',
      title:"The Home hub",
      tagline:"Home is the hub; every feature is a spoke. One bar at the bottom switches Cookbook ↔ Tracker — everything else opens from Home, and a “‹ Home” arrow always brings you back.",
      scene:{glyph:'🏠',caption:'This Week hero · Browse · Macro Tracker · Favorites',glow:'rgba(200,122,83,0.16)'},
      narration:"Start at Home. Up top, the This Week card — your meal planner. Below, the modules: Browse, Mike's Favorites, your saved Favorites, Add Recipe, and this Quick Tour. Tap any module to drill in; the “‹ Home” arrow in the corner brings you straight back. The Macro Tracker isn't one of those modules — it's the second button in the bar along the bottom, so it's one tap away from wherever you are. You can't get lost.",
      steps:[
        {tx:"<b>Top — This Week:</b> your weekly meal planner and combined grocery list."},
        {tx:"<b>Modules:</b> Browse · Mike's Favorites · Favorites · Add Recipe · Quick Tour."},
        {tx:"<b>📊 Tracker</b> lives in the bottom bar next to Cookbook — not in the module list — so it's reachable from any screen."},
        {tx:"Every spoke has a <span class='tap'>‹ Home</span> arrow — one tap back to the hub."},
        {tx:"<b>🏋️ Workout app:</b> the icon next to search opens 4 Weeks to Open — one sign-in works in both."}
      ],
      tip:"On the recipe and collection pages, a floating <b>🏠 Home</b> button does the same job. Every Sunday and Monday, a <b>Past 7 Days</b> card sums up your week — active days, meals cooked, tracker goal days, how many of your planned meals actually got cooked, and, signed in with the workout app linked, how many workouts you finished that week too — right on Home, dismissible per week. Trained today (or mid-streak), the <b>Today</b> card also picks up a real status badge — “🏋️ Trained today” or a streak count — pulled straight from your workout log, even on a day with no meals planned yet. Got two or more dishes planned for today with real prep/cook times? A <b>⏱ Time it together</b> button appears on the Today card — pick when you want everything ready, and it works backward from each dish's own timing to tell you exactly when to start each one so they land together, not staggered."
    },
    {
      eyebrow:'Module 2 · Find a dish',
      title:"Browse & pick a recipe",
      tagline:"One Browse screen, two ways to look at it — by collection or by dish type — plus a real search that understands what you meant, even with a typo.",
      scene:{glyph:'📖',caption:'13 live collections · 11 dish types · search by name, tag or ingredient',glow:'rgba(217,160,91,0.18)'},
      narration:"Tap Browse. A switch at the top picks how you look at the library: By collection shows the flagship sets — Two Meals a Day, Chipotle Copycats, High-Protein Meal Prep, Desserts, Salsas, Sauces, Marinades and more, with Kelli Cross' heirlooms and a Carnivore set on the way. By dish type sorts everything into eleven buckets instead: Breakfast, Salads &amp; Slaws, Soups, Casseroles, Skillets, Grilled, Sandwiches, Desserts, Salsas &amp; Dips, Sauces and Marinades. Tap either kind of card to narrow down. Open a collection and the bigger ones add a sub-tab bar — Chicken, Beef &amp; Steak, Seafood and the like — so you can narrow in before you scroll. The search box now ranks best matches first instead of just filtering — type two words like &ldquo;chicken broccoli&rdquo; and it finds recipes naming both, and a small typo like &ldquo;chiken&rdquo; still finds Chicken recipes. A quiet &ldquo;matched: ingredient&rdquo; label under a card explains why it surfaced when the title alone wouldn&rsquo;t say so. The filter chips work across the whole catalog either way.",
      steps:[
        {tx:"From Home, tap <span class='tap'>📖 Browse</span> — then use the switch at the top: <b>By collection</b> for the flagship sets, <b>By dish type</b> for the eleven buckets. One screen, both axes."},
        {tx:"Open a <b>collection</b> (e.g. Two Meals a Day) to see every recipe in it."},
        {tx:"In a larger collection, tap a <b>sub-tab</b> (e.g. Chicken, Seafood) to narrow the grid further."},
        {tx:"Use the <b>search box</b> to search by name, tag, or ingredient — it ranks the best match first, tolerates a small typo, and a &ldquo;matched: ingredient&rdquo; label on a card says why it showed up."},
        {tx:"Tap a <b>recipe card</b> to open its full detail page."},
        {tx:"Arriving from the workout app's Nutrition tab? A <b>🎯 “Fits your day”</b> banner tops this screen with recipes that fit your remaining calories, best protein first — ✕ dismisses it. Logged a heavy leg day? The banner leans carb-forward automatically, to help you replenish."}
      ],
      cta:{ico:'📖',label:'Try it now',name:'Browse the Two Meals a Day collection',href:'collection.html?c=two-meals-a-day'}
    },
    {
      eyebrow:'Module 3 · ⭐ Core skill',
      title:"Scale any recipe to your servings",
      tagline:"Cooking for one or feeding six? The serving stepper rescales every ingredient quantity on the fly — from 1 up to 12.",
      scene:{glyph:'🔢',caption:'Serving stepper − / + → ingredients rescale · macros stay per-serving',glow:'rgba(200,122,83,0.16)'},
      narration:"Open any recipe and look at the header: a serving stepper. Most recipes are written out at 2 and 4 servings; a batch dish like a whole cheesecake is written at its own yield instead. Tap minus or plus and any other count — anywhere from 1 to 12 — is scaled live from whichever amounts that recipe actually ships with. Every ingredient quantity updates instantly. Macros are listed per single serving, so those stay constant no matter how many you're cooking for.",
      steps:[
        {tx:"Open a recipe, then find the <b>serving stepper</b> in the header."},
        {tx:"Tap <span class='tap'>−</span> / <span class='tap'>+</span> to set your serving count (1–12)."},
        {tx:"Every <b>ingredient quantity rescales instantly</b> — grocery and recipe tabs included."},
        {tx:"Your check-off progress is saved <b>per serving count</b>, so each keeps its own list."},
        {tx:"Recipe has real macro data? A second tab appears next to Servings: <span class='tap'>Hit a macro target</span>. Type a protein, calorie, or carb goal and the ingredient list rescales to match — the header shows exactly what you land on, and says so honestly when your targets can't all be hit by scaling alone."}
      ],
      tip:"Macros are shown <b>per serving</b> and don't change with the count — scale freely without losing your numbers. Switch to <b>Hit a macro target</b> and that logic runs in reverse: tell it the macro, it works out the servings.",
      cta:{ico:'🔢',label:'Try it now',name:'Open a recipe and scale the servings',href:'recipe.html?id=jalapeno-chicken-bake'}
    },
    {
      eyebrow:'Module 4 · Read the recipe',
      title:"Macros, Grocery & Recipe tabs",
      tagline:"Every recipe page has three swipeable tabs — toggle between the macro overview, a clean grocery list, and the step-by-step method.",
      scene:{glyph:'📊',caption:'Overview & Macros · Grocery · Recipe — three swipeable tabs',glow:'rgba(125,140,119,0.18)'},
      narration:"At the top of every recipe, three tabs. Overview & Macros shows the dish summary with its calories and protein, fat and carb breakdown per serving — your macro view. Grocery gives you a clean shopping list grouped by real store aisles — Produce, Meat & Poultry, Dairy & Eggs, and on through to Frozen last, so you shop the way you actually walk a store. Recipe is the full method, step by step, with the prep notes for each ingredient. Swipe or tap to switch.",
      steps:[
        {tx:"If you've photographed a cook, or set a cover photo, it's the first thing you see — a photo header above these tabs. No photo yet? Nothing changes; the recipe opens exactly as it always has."},
        {tx:"Tap <span class='tap'>Overview &amp; Macros</span> for the dish summary + per-serving macro breakdown."},
        {tx:"Tap <span class='tap'>Grocery</span> for a clean shopping list grouped by real store aisles — Produce, Meat &amp; Poultry, Seafood, Dairy &amp; Eggs, Spices, Condiments, Dry Goods, and Frozen last, matching the order you'd actually walk a store. Missing something like sour cream or buttermilk? A <b>&ldquo;Don&rsquo;t have it on hand?&rdquo;</b> note under the list offers a swap for anything this recipe uses that has one — and if you've recorded how much you have in your pantry (from This Week's grocery list), it checks that first: already have enough, and the note skips itself; short, and it tells you both amounts before suggesting the swap."},
        {tx:"Tap <span class='tap'>Recipe</span> for the numbered method with per-ingredient prep notes."},
        {tx:"<b>Swipe</b> left/right to move between the three tabs."},
        {tx:"On the Recipe tab, tap <span class='tap'>▸ Start Cooking</span> for <b>Cooking Mode</b> — a full-screen, one-step-at-a-time view with big text, the screen kept awake, and a <span class='tap'>🎙️</span> button for opt-in voice control: say <b>“next step”</b>, <b>“previous step”</b>, or <b>“read ingredients”</b> to hear the list read aloud, hands free."},
        {tx:"Sunlit counter making the screen hard to read? Tap <span class='tap'>☀︎</span> in Cooking Mode for <b>Daylight mode</b> — max-contrast black on white, independent of your phone's own light/dark setting. It stays on until you turn it off again."},
        {tx:"Any step that mentions a real duration grows a <span class='tap'>⏱ 20 minutes</span> chip — tap it to start a <b>kitchen timer</b>. Timers now live in a rail along the bottom of the screen and <b>keep running</b> while you move between steps, switch tabs, or leave the recipe entirely. Run as many at once as the meal needs."},
        {tx:"With voice control on you can also say <b>“set a timer for 10 minutes”</b>, <b>“how long left”</b>, or <b>“stop the timer”</b> — no duration has to appear in the step text, and you never have to touch the screen."}
      ],
      tip:"A timer counts down to a fixed moment, not a ticking number — so it stays accurate even if you lock the phone or switch apps, and it tells you the truth the second you come back."
    },
    {
      eyebrow:'Module 5 · Plan the week',
      title:"This Week planner & grocery list",
      tagline:"Pick the meals you're making this week and the planner merges every recipe into one smart grocery list.",
      scene:{glyph:'🗓️',caption:'Add meals → one combined, aisle-grouped grocery list',glow:'rgba(200,122,83,0.16)'},
      narration:"From Home, open This Week. Add the recipes you plan to cook, and the planner does the math: it combines all their ingredients into a single grocery list, grouped by aisle and de-duplicated, so you shop once for the whole week. A quantity with a small dot under it was estimated — tap it to see how, like “1 medium onion ≈ 110 g.” Check items off as you go. It's the fastest path from “what's for dinner” to a full cart.",
      steps:[
        {tx:"From Home, tap the <span class='tap'>This Week</span> hero card."},
        {tx:"<b>Add meals</b> from your recipes to build the week's plan. Set real goals in the Macro Tracker and a recipe that fits them shows a <span class='tap'>🎯 fit your goal · N×</span> chip — tap it to add that recipe already scaled toward your macro target, right alongside the normal add."},
        {tx:"Open the <b>combined grocery list</b> — every recipe merged into one, by aisle, with a small dot under any estimated quantity you can tap to see how it was worked out."},
        {tx:"Tap <span class='tap'>🧂</span> on any item to mark it a pantry staple — it drops off the buy list. Tap <span class='tap'>📏</span> to record <b>how much you have</b>; if it's less than a recipe needs, the item comes back on the list showing exactly how much more to buy."},
        {tx:"Check items off as you shop; the plan remembers what's done."}
      ],
      cta:{ico:'🗓️',label:'Try it now',name:'Open the weekly planner',href:'index.html#planner'}
    },
    {
      eyebrow:'Module 6 · Let the app plan',
      title:"Plan my week: one door, three ways",
      tagline:"Don't want to pick a week of meals by hand? Tap once, then choose how it should think — balanced, built around your macros, or built around how much time each day has.",
      scene:{glyph:'✨',caption:'Balanced · Macro · Time — switch the bias, the week rebuilds',glow:'rgba(200,122,83,0.16)'},
      narration:"Inside This Week, tap ✨ Plan my week. You get a full day-by-day grid straight away, plus three chips at the top: Balanced favours variety and shared ingredients so perishables get used up; Macro fits each day to your calorie and protein goals (it only appears once you've set goals in the tracker); Time asks how much room each day has — Quick, Standard or No rush — and builds the week around your actual bandwidth. Tap a different chip and the week rebuilds in place, so you can compare instead of starting over. Regenerate any single slot with ↻, drop one with ×, then tap Set Weekly Meal Plan to commit it.",
      steps:[
        {tx:"Open <b>This Week</b>, then tap <span class='tap'>✨ Plan my week</span>."},
        {tx:"Pick a bias: <b>Balanced</b>, <b>Macro</b> or <b>Time</b> — the grid rebuilds as you switch."},
        {tx:"For <b>Time</b>, set each day to <b>Quick</b>, <b>Standard</b> or <b>No rush</b>, then tap <span class='tap'>Generate my week →</span>. Your day assignments are remembered."},
        {tx:"Fine-tune with <span class='tap'>↻</span> on any slot, then tap <span class='tap'>＋ Set Weekly Meal Plan</span> to commit."}
      ],
      tip:"Balanced deprioritizes anything you cooked in the last week, so the week complements what you've already eaten instead of repeating it. Signed in with the workout app linked, it also learns your real training days from your logged workout history and leans higher-protein on those, lighter on the rest — no schedule to set up, it just picks up the pattern."
    },
    {
      eyebrow:'Module 7 · Track your intake',
      title:"The Macro Tracker",
      tagline:"Beyond the recipes, a full day tracker — log what you eat by the hour and watch your calories and macros against your goals.",
      scene:{glyph:'📊',caption:'Daily kcal · P/F/C · food search + barcode scan',glow:'rgba(125,140,119,0.18)'},
      narration:"Tap 📊 Tracker in the bar along the bottom — it's there on every screen. Set your goals, then log food across the day: search your own cookbook and a big food database together, or tap the barcode icon and scan a label — the scanner detects the code and pulls the food's nutrition in automatically, no typing. Your daily totals for calories, protein, fat and carbs build up against your targets as you go. You can even log a cookbook recipe straight into your day. Sign in from the 👤 button on Home and your tracker follows you across devices — and reconciles with the same account in the 4 Weeks to Open workout app, if you use both.",
      steps:[
        {tx:"Tap <span class='tap'>📊 Tracker</span> in the bottom bar — from Home or anywhere else."},
        {tx:"Set your <b>calorie & macro goals</b>, then start logging by the hour."},
        {tx:"Tap <span class='tap'>Search foods &amp; recipes</span> — it looks through your own cookbook first, then Open Food Facts — or the <span class='tap'>▦ barcode</span> icon to scan a label."},
        {tx:"The scanner <b>auto-detects the barcode</b> and fills in the food's nutrition for you."},
        {tx:"Optional: tap the <span class='tap'>👤 account</span> icon on Home to sign in and sync your tracker, meal plan, favorites and pantry across devices."},
        {tx:"Prefer not to sign in? The same 👤 sheet has <b>Export data</b> / <b>Import data</b> — a manual backup file you can save anywhere and restore from. Home's <b>Backup &amp; Restore</b> card does the same thing with the same file."}
      ],
      tip:"No barcode match, or offline? It drops you into <b>manual entry</b> so you can log it anyway — with a link to add the product to Open Food Facts' database right from that screen, so the next scan (yours or anyone else's) finds it. Never sign in? Everything keeps working exactly as before, fully offline on this device — just export a backup file every so often for safekeeping.",
      cta:{ico:'📊',label:'Try it now',name:'Open the Macro Tracker',href:'index.html#tracker'}
    },
    {
      eyebrow:'Module 8 · Dial it in',
      title:"Nutrition facts & favorite foods",
      tagline:"Every food opens a tappable facts sheet — switch grams and ounces, key in your exact amount, and star the staples for fast logging.",
      scene:{glyph:'🔢',caption:'Facts sheet · grams ⇄ oz toggle · keypad qty · ★ favorites',glow:'rgba(200,122,83,0.16)'},
      narration:"Tap any food and its nutrition-facts sheet opens: the macro breakdown plus micronutrients. Toggle the unit between grams and ounces, or use the keypad to enter exactly how much you had — type 3 for three servings — and the macros recalculate live. Tap the star to save a food to your Favorites, then quick-log your everyday staples in a couple of taps instead of searching each time.",
      steps:[
        {tx:"Tap a food to open its <b>nutrition-facts sheet</b>."},
        {tx:"Toggle <span class='tap'>grams</span> / <span class='tap'>oz</span>, or use the <b>keypad</b> for a custom quantity or multiple."},
        {tx:"Macros <b>recalculate live</b> as you change the unit or amount, then tap <span class='tap'>Log Food</span>."},
        {tx:"Tap the <span class='tap'>☆ star</span> to save a food, then quick-log it from <b>★ Favorites</b>."}
      ]
    },
    {
      eyebrow:'Module 9 · Make it yours',
      title:"Favorites & your own recipes",
      tagline:"Save the recipes you love, see the ones Mike swears by, and add your own — they behave like every built-in recipe.",
      scene:{glyph:'❤',caption:"Tap ❤ to save · Mike's Favorites · Add your own recipe",glow:'rgba(255,90,110,0.16)'},
      narration:"Two kinds of favorites. Tap the heart on any recipe to save it to your personal Favorites — that list lives on Home. Mike's Favorites is the curated shortlist of dishes Mike has actually made and loved. Add Recipe now gives you two ways in: type one up field by field, or paste a link to a recipe website and let the app pull out the title, ingredients and steps for you — you always land on the same editable form to check it over before saving, nothing imports silently. Saved recipes join your library and work everywhere — search, categories, the planner, and favorites — just like the built-ins. Found a recipe somewhere else on your phone? Once the app is installed, use your phone's own Share button and pick Mike's Cookbook — it opens Add Recipe with the title and link already filled in.",
      steps:[
        {tx:"Tap the <span class='tap'>❤</span> on any recipe to save it to your <b>Favorites</b> (find them on Home)."},
        {tx:"Open <span class='tap'>⭐ Mike's Favorites</span> for the dishes Mike has made and loves."},
        {tx:"Tap <span class='tap'>📝 Add Recipe</span> to create your own or save a hand-me-down — there's an optional <b>Nutrition</b> section too, per serving, so your own recipes can carry real macros if you want them to."},
        {tx:"Got a link instead? Choose <b>Paste a link</b> to import it automatically — review and edit before saving; needs sign-in and a connection."},
        {tx:"Seen a recipe in another app? <b>Share</b> it straight to Mike's Cookbook to start Add Recipe prefilled."},
        {tx:"Your recipes join the library — searchable, categorized, and plannable like the rest."}
      ],
      cta:{ico:'❤',label:'Try it now',name:'See your saved Favorites',href:'index.html#favorites'}
    },
    {
      eyebrow:'Module 10 · Take it anywhere',
      title:"Install & cook offline",
      tagline:"Mike's Cookbook is a PWA — add it to your home screen and it works at the counter with zero signal.",
      scene:{glyph:'📲',caption:'Add to Home Screen → full-screen → works offline',glow:'rgba(200,122,83,0.16)'},
      narration:"Last thing. This app installs. From your browser's Share menu, tap Add to Home Screen — it launches full-screen like a native app, and once cached it runs offline. Flaky kitchen Wi-Fi won't stop you: your recipes, scaling, grocery lists and macros keep working. When there's an update, a small banner taps you to refresh.",
      steps:[
        {tx:"Open your browser's <b>Share</b> menu and tap <span class='tap'>Add to Home Screen</span>."},
        {tx:"Launch from the icon — it opens <b>full-screen, no browser bar</b>."},
        {tx:"Cook <b>offline</b>; tap the <b>update</b> banner whenever it appears."}
      ],
      tip:"Your favorites, plan, check-offs and tracker logs are saved <b>on your device</b> — private and instant."
    },
    {
      eyebrow:'You’re ready',
      title:"That’s the whole kitchen 🍽️",
      tagline:"You can now find a recipe, scale it to any serving count, read the macros, plan your week's groceries, track what you eat, and save your own dishes. Time to cook.",
      scene:{glyph:'🔥',caption:'Browse · Scale · Plan · Track · Save — you’ve got it all',glow:'rgba(200,122,83,0.18)'},
      narration:"That's it — you're tour-complete. Pick a recipe, scale it to your table, build the week's grocery list, and keep your macros honest in the tracker. Replay this tour anytime from Home. Now go make something good.",
      finish:[
        "Browse recipes by collection, sub-tab, or dish category",
        "Scale any recipe from 1 to 12 servings",
        "Read per-serving macros and a clean grocery list",
        "Plan the week into one combined shopping list",
        "Let Plan my week build it for you — Balanced, Macro or Time",
        "Track intake with food search & barcode scan",
        "Save favorites and add your own recipes"
      ],
      cta:{ico:'🍳',label:'Start cooking',name:'Go to my Cookbook',href:'index.html'},
      last:true
    }
  ];

  function sceneHTML(s){
    return '<div class="qt-scene" style="--scene-glow:'+(s.scene.glow||'rgba(200,122,83,0.16)')+'">'
      +'<div class="qt-scene-glow"></div>'
      +'<div class="qt-scene-glyph">'+s.scene.glyph+'</div>'
      +'<div class="qt-scene-cap">'+s.scene.caption+'</div>'
      +'<div class="qt-scene-clip"><span class="dot"></span>Tour clip</div>'
      +'<div class="qt-scene-play">▶</div>'
      +'</div>';
  }

  /* The markup for one slide's contents. The element that wraps it belongs to
     the page: the step tour wraps it in a positioned .qt-slide, the one-page
     version in a plain <section>. Everything inside is identical by
     construction, which is the point of it living here. */
  function slideBodyHTML(s){
    var h='';
    h+='<div class="qt-eyebrow">'+s.eyebrow+'</div>';
    h+='<h1 class="qt-title">'+s.title+'</h1>';
    h+='<p class="qt-tagline">'+s.tagline+'</p>';
    h+=sceneHTML(s);
    h+='<div class="qt-narr"><p>'+s.narration+'</p></div>';
    if(s.steps&&s.steps.length){
      h+='<div class="qt-steps-lbl">Step by step</div><ol class="qt-steps">';
      s.steps.forEach(function(st,n){
        h+='<li class="qt-step"><div class="qt-step-n">'+(n+1)+'</div><div class="qt-step-tx">'+st.tx+'</div></li>';
      });
      h+='</ol>';
    }
    if(s.finish&&s.finish.length){
      h+='<div class="qt-steps-lbl">You can now</div><ul class="qt-finish-list">';
      s.finish.forEach(function(f){ h+='<li><span class="chk">✓</span><span>'+f+'</span></li>'; });
      h+='</ul>';
    }
    if(s.tip){
      h+='<div class="qt-tip"><div class="qt-tip-ico">💡</div><div class="qt-tip-tx"><b>Pro tip:</b> '+s.tip+'</div></div>';
    }
    if(s.cta){
      if(s.last){
        h+='<a class="qt-finish-cta" href="'+s.cta.href+'" onclick="markDone()">'+s.cta.ico+' '+s.cta.name+' →</a>';
      } else {
        h+='<a class="qt-try" href="'+s.cta.href+'">'
          +'<div class="qt-try-ico">'+s.cta.ico+'</div>'
          +'<div class="qt-try-body"><div class="qt-try-lbl">'+s.cta.label+'</div><div class="qt-try-nm">'+s.cta.name+'</div></div>'
          +'<div class="qt-try-arrow">→</div></a>';
      }
    }
    return h;
  }

  window.MC_TOUR = { SLIDES: SLIDES, slideBodyHTML: slideBodyHTML };
})();
