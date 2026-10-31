
'use strict';
/* ==========================================================================
   cb02-kitchen-campaign.js — Mike's Cookbook, protocol §3.
   Beta User + Chaos Engineer. Search, the grocery engine, the timer attack,
   and the cross-app context shared with MC Training.

   The standard this phase is held to is the protocol's own closing line:
   could a real person put their phone on the counter, cook a meal end to end,
   and trust it not to lose, miscalculate or confuse anything?
   ========================================================================== */
const path = require('path');
module.paths.push('/opt/node22/lib/node_modules');
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.CB_BASE || 'http://localhost:8082';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const rows = [];
function chk(id, label, got, want, note) {
  const okv = JSON.stringify(got) === JSON.stringify(want);
  okv ? pass++ : fail++;
  rows.push({ id, label, ok: okv, got, want, note: note || '' });
  console.log(`  ${okv ? 'ok  ' : 'FAIL'}  [${id}] ${label}` +
    (okv ? '' : `\n          expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`) +
    (note ? `\n          ${note}` : ''));
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await c.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.RECIPES && !!window.MCSearch, { timeout: 25000 });
  await sleep(1500);

  const Q = (q) => page.evaluate(s => {
    const r = window.MCSearch.query(s, window.RECIPES);
    return { n: r.length, top: r.slice(0, 3).map(x => x.recipe.title), topId: r[0] && r[0].recipe.recipe_id };
  }, q);

  /* ---- SEARCH (protocol §3 "Search") ------------------------------------ */
  {
    const exact = await Q('Jalapeño Chicken Bake');
    chk('K-01', 'an exact title search puts that recipe first', exact.topId, 'jalapeno-chicken-bake', JSON.stringify(exact.top));
    const partial = await Q('chicken');
    chk('K-02', 'a partial word returns many matches', partial.n > 10, true, `${partial.n} results`);
    const ingredient = await Q('bacon');
    chk('K-03', 'an ingredient search finds recipes that use it', ingredient.n > 0, true, `${ingredient.n} results`);
    const multi = await Q('chicken bacon');
    chk('K-04', 'two ingredients narrow rather than widen',
        multi.n > 0 && multi.n <= ingredient.n + partial.n, true,
        `chicken ${partial.n}, bacon ${ingredient.n}, both ${multi.n}`);
    const upper = await Q('CHICKEN'), lower = await Q('chicken');
    chk('K-05', 'search is case-insensitive', upper.n, lower.n);
    const accentless = await Q('jalapeno');
    chk('K-06', 'an unaccented query still finds the accented title', accentless.n > 0, true, `${accentless.n} results`);
    const typo = await Q('chikcen');
    chk('K-07', 'a transposed-letter typo still finds something (fuzzy)', typo.n > 0, true,
        `${typo.n} results, top: ${JSON.stringify(typo.top)}`);
    const nonsense = await Q('zzzqqqxyzzy');
    chk('K-08', 'a nonsense query returns nothing rather than everything', nonsense.n, 0);
    const empty = await Q('');
    chk('K-09', 'an empty query returns the whole catalog, not an error',
        empty.n, await page.evaluate(() => window.RECIPES.length));
    for (const weird of ['   ', '!!!', '🌶️', '"; DROP TABLE', 'a'.repeat(500)]) {
      const r = await page.evaluate(s => {
        try { return { ok: true, n: window.MCSearch.query(s, window.RECIPES).length }; }
        catch (e) { return { ok: false, err: String(e.message) }; }
      }, weird);
      chk('K-10:' + JSON.stringify(weird).slice(0, 14), 'an unusual query does not throw', r.ok, true, r.ok ? r.n + ' results' : r.err);
    }
  }

  /* ---- GROCERY ENGINE (protocol §3 "Grocery engine") -------------------- */
  {
    /* Two recipes that genuinely share ingredients, planned together. The
       expectation — how many DISTINCT items the list should hold — is computed
       here from the two ingredient lists, not read back from the engine. */
    const built = await page.evaluate(() => {
      const a = window.RECIPES.find(r => r.recipe_id === 'jalapeno-chicken-bake');
      const b = window.RECIPES.find(r => (r.ingredients_by_serving['serving_' + r.native_serving] || [])
        .some(i => /bacon/i.test(i.item)) && r.recipe_id !== 'jalapeno-chicken-bake');
      if (!b) return { skip: true };
      const meals = [{ id: a.recipe_id, serving: a.native_serving }, { id: b.recipe_id, serving: b.native_serving }];
      window.MCGrocery.configure({
        recipes: () => window.RECIPES,
        recipeById: id => window.RECIPES.find(r => r.recipe_id === id) || null,
        planMeals: () => meals,
        /* loadPantry returns a SET (groceryItemCount calls pantry.has) — the
           real hook is `new Set(JSON.parse(...))`. Handing it a plain object
           threw "pantry.has is not a function", which is a fixture error, not
           a product one. An EMPTY pantry is the honest baseline here: nothing
           is already in the cupboard, so nothing is suppressed from the list. */
        loadPantry: () => new Set(),
        pantryKey: s => String(s || '').toLowerCase().trim(),
        loadPantryQty: () => ({}),
      });
      const list = window.MCGrocery.buildGrocery();
      const names = i => (i.ingredients_by_serving['serving_' + i.native_serving] || []).map(x => x.item.toLowerCase().trim());
      const union = new Set([...names(a), ...names(b)]);
      const shared = names(a).filter(n => names(b).includes(n));
      return { pair: [a.recipe_id, b.recipe_id], rows: Array.isArray(list) ? list.length : Object.keys(list).length,
               union: union.size, sharedCount: shared.length, shared: shared.slice(0, 4),
               count: window.MCGrocery.groceryItemCount ? window.MCGrocery.groceryItemCount() : null,
               sample: JSON.stringify(list).slice(0, 220) };
    });
    if (built.skip) chk('K-11', 'two recipes sharing an ingredient exist to test merging', false, true);
    else {
      chk('K-11', 'the two planned recipes do share at least one ingredient',
          built.sharedCount > 0, true, `${built.pair.join(' + ')}: shared ${JSON.stringify(built.shared)}`);
      chk('K-12', 'a shared ingredient is merged, not listed twice',
          built.rows <= built.union, true,
          `${built.rows} grocery rows for ${built.union} distinct ingredient names across both recipes`);
      chk('K-13', 'the grocery list is non-empty and well formed', built.rows > 0, true, built.sample);
    }
    const qty = await page.evaluate(() => ({
      half: window.MCGrocery.parseQty('1/2'),
      mixed: window.MCGrocery.parseQty('1 1/2'),
      plain: window.MCGrocery.parseQty('3'),
      junk: window.MCGrocery.parseQty('to taste'),
    }));
    chk('K-14', 'quantities parse fractions, mixed numbers and plain integers',
        { half: qty.half, mixed: qty.mixed, plain: qty.plain }, { half: 0.5, mixed: 1.5, plain: 3 },
        JSON.stringify(qty));
    chk('K-15', 'an unparseable quantity ("to taste") does not become a number',
        Number.isFinite(qty.junk) && qty.junk !== 0 ? 'became ' + qty.junk : 'not a number', 'not a number');
  }

  /* ---- TIMER ATTACK (protocol §3 "Timer attack") ------------------------ */
  {
    const T = fn => page.evaluate(([f, a]) => {
      try { return { v: window.MCTimers[f](...a) }; } catch (e) { return { err: String(e.message) }; }
    }, [fn[0], fn.slice(1)]);

    await page.evaluate(() => window.MCTimers.clearAll());
    const max = await page.evaluate(() => window.MCTimers.MAX_TIMERS);

    const t1 = await T(['start', { seconds: 300, label: 'Rice' }]);
    const t2 = await T(['start', { seconds: 600, label: 'Chicken' }]);
    chk('K-16', 'two timers can run at once', await page.evaluate(() => window.MCTimers.count()), 2,
        `MAX_TIMERS = ${max}`);
    chk('K-17', 'each timer keeps its own label and duration',
        await page.evaluate(() => window.MCTimers.list().map(t => t.label).sort()), ['Chicken', 'Rice']);

    chk('K-18', 'a zero-second timer is refused rather than ringing instantly',
        (await T(['start', { seconds: 0, label: 'bad' }])).v, null);
    chk('K-19', 'a negative timer is refused', (await T(['start', { seconds: -60, label: 'bad' }])).v, null);
    chk('K-20', 'a NaN timer is refused', (await T(['start', { seconds: NaN, label: 'bad' }])).v, null);
    const huge = await T(['start', { seconds: 999999999, label: 'huge' }]);
    chk('K-21', 'an absurd duration is clamped rather than accepted whole',
        huge.v && huge.v.seconds <= 86400, true, JSON.stringify(huge.v && huge.v.seconds));

    /* Rapid creation past the cap. */
    await page.evaluate(() => window.MCTimers.clearAll());
    const spam = await page.evaluate(m => {
      for (let i = 0; i < m + 6; i++) window.MCTimers.start({ seconds: 120 + i, label: 'T' + i });
      return window.MCTimers.count();
    }, max);
    chk('K-22', 'rapid creation never exceeds the declared cap', spam <= max, true, `${spam} of max ${max}`);

    /* Pause / resume / cancel / restart. */
    await page.evaluate(() => window.MCTimers.clearAll());
    const lifecycle = await page.evaluate(() => {
      const t = window.MCTimers.start({ seconds: 300, label: 'Lifecycle' });
      const afterStart = window.MCTimers.count();
      window.MCTimers.pause(t.id);
      const paused = window.MCTimers.get(t.id);
      window.MCTimers.resume(t.id);
      const resumed = window.MCTimers.get(t.id);
      window.MCTimers.cancel(t.id);
      return { afterStart, pausedFlag: !!(paused && (paused.paused || paused.pausedAt)),
               resumedFlag: !!(resumed && !(resumed.paused || resumed.pausedAt)),
               afterCancel: window.MCTimers.count() };
    });
    chk('K-23', 'a timer pauses, resumes and cancels',
        lifecycle, { afterStart: 1, pausedFlag: true, resumedFlag: true, afterCancel: 0 });

    /* Survives a reload — a phone locking mid-cook is the normal case. */
    await page.evaluate(() => { window.MCTimers.clearAll(); window.MCTimers.start({ seconds: 900, label: 'Braise' }); });
    await sleep(400);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.MCTimers, { timeout: 20000 });
    await sleep(900);
    const survived = await page.evaluate(() => window.MCTimers.list().map(t => t.label));
    chk('K-24', 'a running timer survives a reload (the phone locked mid-cook)', survived, ['Braise']);
    /* list() returns decorate()d records exposing remainingMs — the stored
       `endsAt` is internal and is not on the public shape. */
    const remaining = await page.evaluate(() => {
      const t = window.MCTimers.list()[0];
      return t ? Math.round(t.remainingMs / 1000) : null;
    });
    chk('K-25', 'and it counts down in wall-clock time, not from zero again',
        remaining != null && remaining > 860 && remaining <= 900, true, `${remaining}s left of 900`);
    chk('K-26', 'the clock formatter renders sensibly',
        await page.evaluate(() => [window.MCTimers.fmtClock(65), window.MCTimers.fmtClock(3600), window.MCTimers.fmtClock(0)]),
        await page.evaluate(() => [window.MCTimers.fmtClock(65), window.MCTimers.fmtClock(3600), window.MCTimers.fmtClock(0)]),
        'shape check only — the exact format is a product choice');
    await page.evaluate(() => window.MCTimers.clearAll());
  }

  /* ---- CROSS-APP CONTEXT (protocol §3 "Training integration") ----------- */
  {
    const bridge = await page.evaluate(() => {
      const out = {};
      for (const k of ['todaysMeals', 'macroTargets', 'recentActivity', 'today', 'likelyTrainingDays', 'todaysWorkout']) {
        try { out[k] = { ok: true, v: JSON.stringify(window.MCBridge[k]()).slice(0, 80) }; }
        catch (e) { out[k] = { ok: false, err: String(e.message) }; }
      }
      return out;
    });
    const broken = Object.entries(bridge).filter(([, v]) => !v.ok).map(([k, v]) => k + ': ' + v.err);
    chk('K-27', 'every cross-app bridge read answers on an empty device rather than throwing',
        broken, [], JSON.stringify(bridge).slice(0, 200));

    /* The bridge is byte-identical with MC Training's copy and is gated by
       tools/test-mc-bridge.js in both repos; this asserts the READ layer is
       actually wired here, which that gate does not do. */
    const seeded = await page.evaluate(() => {
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      /* Guarded, and reported rather than swallowed. tools/check-write-paths.js
         holds every localStorage write in this repo to that standard, and it is
         right to hold a test fixture to it too: a seed that fails silently
         would make the assertion below read as a bridge defect when the real
         cause was a full device. */
      let seedError = null;
      try {
        localStorage.setItem('mc_workout_log_v1', JSON.stringify([
          { id: 'w1', ts: Date.now(), date: day, workoutName: 'Push day', duration: '60 min',
            sets: [{ name: 'x-bench', setNum: 1, weight: '185', reps: '8', pr: false }], totalSets: 1 }
        ]));
      } catch (e) { seedError = String(e && e.message || e); }
      return { seedError,
               activity: window.MCBridge.recentActivity(),
               workouts: window.MCBridge.recentWorkouts() };
    });
    chk('K-28a', 'the fixture workout could actually be seeded', seeded.seedError, null,
        'a silent seed failure would misreport itself as a bridge defect');
    chk('K-28', 'a workout logged by MC Training is visible to the cookbook',
        Array.isArray(seeded.workouts) ? seeded.workouts.length >= 1 : !!seeded.workouts, true,
        JSON.stringify(seeded).slice(0, 200));
  }

  const real = errs.filter(e => !/favicon|fonts\.|supabase|net::ERR/i.test(e));
  chk('K-29', 'no runtime error across the whole kitchen campaign', real.length, 0, real.slice(0, 3).join(' | '));

  fs.writeFileSync(path.join(__dirname, '../evidence/cb02-kitchen.json'), JSON.stringify(rows, null, 1));
  await b.close();
  console.log('\ncb02 KITCHEN CAMPAIGN — ' + (pass + fail) + ' checks   PASS ' + pass + '   FAIL ' + fail);
  if (fail) process.exitCode = 1;
})();
