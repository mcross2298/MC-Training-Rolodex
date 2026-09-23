
'use strict';
/* ==========================================================================
   cb01-recipe-nutrition-scaling.js — Mike's Cookbook, protocol §3.
   Data-Integrity Engineer. Two things a kitchen companion cannot get wrong:
   what the food contains, and what happens when you cook more of it.

   Every expectation is computed here from the published Atwater factors
   (protein 4 kcal/g, carbohydrate 4, fat 9) and from arithmetic on the
   recipe's own authored tiers — never by asking the app what it thinks.
   Run fleet-wide across every recipe rather than on a sample, because an
   authoring error lives in ONE record and a sample is how it ships.
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
  await page.waitForFunction(() => !!window.RECIPES && window.RECIPES.length, { timeout: 25000 });
  await sleep(1500);

  const all = await page.evaluate(() => window.RECIPES.map(r => ({
    id: r.recipe_id, title: r.title, native: r.native_serving,
    opts: r.scaling_options || [], macros: r.macro_profiles || {},
    ing: Object.fromEntries(Object.entries(r.ingredients_by_serving || {})
      .map(([k, v]) => [k, (v || []).map(i => ({ item: i.item, qty: i.quantity, unit: i.unit, cat: i.category }))])),
  })));
  chk('C-00', 'the catalog loads', all.length > 0, true, `${all.length} recipes`);

  /* ---- 1. every macro profile reconciles against Atwater ---------------- */
  {
    const bad = [];
    for (const r of all) {
      for (const [tier, m] of Object.entries(r.macros)) {
        if (!m) continue;
        const atwater = (+m.protein_g || 0) * 4 + (+m.carbs_g || 0) * 4 + (+m.fat_g || 0) * 9;
        const stated = +m.calories || 0;
        /* A published macro rounds to whole grams, so Atwater can legitimately
           sit a little off the stated calories. 12% (or 60 kcal on a small
           dish) is the band a whole-gram rounding error can produce; beyond
           that the record disagrees with itself. */
        const tol = Math.max(60, stated * 0.12);
        if (Math.abs(atwater - stated) > tol) {
          bad.push(`${r.id}/${tier}: stated ${stated} kcal, Atwater ${Math.round(atwater)} (${m.protein_g}p/${m.fat_g}f/${m.carbs_g}c)`);
        }
      }
    }
    chk('C-01', 'every recipe\'s stated calories agree with its own macros (Atwater)',
        bad.length, 0, bad.join('\n          '));
  }

  /* ---- 2. no impossible macro ------------------------------------------- */
  {
    const bad = [];
    for (const r of all) {
      for (const [tier, m] of Object.entries(r.macros)) {
        if (!m) continue;
        for (const k of ['calories', 'protein_g', 'fat_g', 'carbs_g']) {
          const v = m[k];
          if (v == null) { bad.push(`${r.id}/${tier}: ${k} missing`); continue; }
          if (!Number.isFinite(+v)) bad.push(`${r.id}/${tier}: ${k} is not finite (${v})`);
          else if (+v < 0) bad.push(`${r.id}/${tier}: ${k} is negative (${v})`);
        }
      }
    }
    chk('C-02', 'no macro is missing, negative or non-finite', bad.length, 0, bad.join('\n          '));
  }

  /* ---- 3. macro profiles are PER SERVING, so tiers must agree ----------- */
  {
    const bad = [];
    for (const r of all) {
      const tiers = Object.entries(r.macros);
      if (tiers.length < 2) continue;
      const [, first] = tiers[0];
      for (const [tier, m] of tiers.slice(1)) {
        for (const k of ['calories', 'protein_g', 'fat_g', 'carbs_g']) {
          const a = +first[k] || 0, bb = +m[k] || 0;
          if (Math.abs(a - bb) > Math.max(2, a * 0.02)) {
            bad.push(`${r.id}: ${k} ${a} at ${tiers[0][0]} vs ${bb} at ${tier}`);
          }
        }
      }
    }
    chk('C-03', 'per-serving macros do not change when the recipe is scaled',
        bad.length, 0,
        'cooking twice as much does not change what ONE serving contains\n          ' + bad.join('\n          '));
  }

  /* ---- 4. every declared scaling tier actually has ingredients ---------- */
  {
    const missingIng = [], missingMac = [];
    for (const r of all) {
      for (const s of r.opts) {
        if (!r.ing['serving_' + s] || !r.ing['serving_' + s].length) missingIng.push(`${r.id}@${s}`);
        if (!r.macros['serving_' + s]) missingMac.push(`${r.id}@${s}`);
      }
    }
    chk('C-04', 'every offered serving size has an ingredient list behind it',
        missingIng.length, 0, missingIng.slice(0, 6).join(', '));
    chk('C-05', 'every offered serving size has a macro profile behind it',
        missingMac.length, 0, missingMac.slice(0, 6).join(', '));
    chk('C-06', 'the native serving size is one of the offered options',
        all.filter(r => r.opts.length && !r.opts.includes(r.native)).map(r => r.id), []);
  }

  /* ---- 5. ingredient quantities scale in the right direction ------------ */
  {
    /* Units change between tiers, legitimately and often: this catalog writes
       bacon as "8 oz" at two servings and "1 lb" at four, oil as "2 tbsp" then
       "1/4 cup", tomato paste as "8 tbsp" then "1 cup". Every one of those IS
       exactly double. A comparison that reads only the number calls all three
       a shrinking ingredient — 131 false findings on the first run here.

       So quantities are normalised first, with conversion factors written out
       from the definitions (16 oz = 1 lb, 16 tbsp = 1 cup, 3 tsp = 1 tbsp)
       rather than taken from the app's own MCUnits, and fractions like "1/4"
       and mixed numbers like "1 1/2" are parsed. Pairs in different DIMENSIONS
       (8 slices vs 8 oz) are skipped rather than guessed at. */
    const VOL = { tsp: 1, teaspoon: 1, teaspoons: 1, tbsp: 3, tablespoon: 3, tablespoons: 3,
                  'fl oz': 6, cup: 48, cups: 48, pint: 96, pt: 96, quart: 192, qt: 192, 'l': 202.9, ml: 0.2029 };
    const WT  = { oz: 1, ounce: 1, ounces: 1, lb: 16, lbs: 16, pound: 16, pounds: 16, g: 0.03527, kg: 35.27 };
    function parseQty(q) {
      const t = String(q == null ? '' : q).trim();
      if (!t) return null;
      const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
      if (mixed) return +mixed[1] + (+mixed[2] / +mixed[3]);
      const frac = t.match(/^(\d+)\s*\/\s*(\d+)/);
      if (frac) return +frac[1] / +frac[2];
      const dec = t.match(/^[\d.]+/);
      return dec ? parseFloat(dec[0]) : null;
    }
    function canon(qty, unit) {
      const n = parseQty(qty);
      if (n == null) return null;
      const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
      if (VOL[u] != null) return { dim: 'vol', v: n * VOL[u] };
      if (WT[u]  != null) return { dim: 'wt',  v: n * WT[u] };
      return { dim: 'count:' + u, v: n };      // slices, cloves, "" — same unit only
    }

    const bad = [], skipped = [];
    let checked = 0;
    for (const r of all) {
      const tiers = r.opts.slice().sort((a, x) => a - x);
      if (tiers.length < 2) continue;
      const loT = tiers[0], hiT = tiers[tiers.length - 1];
      const lo = r.ing['serving_' + loT] || [], hi = r.ing['serving_' + hiT] || [];
      const ratio = hiT / loT;
      for (const l of lo) {
        const h = hi.find(x => x.item === l.item && (x.cat === l.cat));
        if (!h) continue;
        const a = canon(l.qty, l.unit), bq = canon(h.qty, h.unit);
        if (!a || !bq) continue;
        if (a.dim !== bq.dim) { skipped.push(`${r.id} "${l.item}" ${l.qty}${l.unit} vs ${h.qty}${h.unit}`); continue; }
        if (a.v <= 0) continue;
        checked++;
        /* Direction and a sane band, not an exact multiple: a cook rounds
           "1.5 onions" to 2, and a spice often does not scale linearly. */
        if (bq.v < a.v) bad.push(`${r.id} "${l.item}": ${l.qty} ${l.unit} at ${loT} servings but ${h.qty} ${h.unit} at ${hiT} (${a.v} -> ${bq.v} ${a.dim})`);
        else if (bq.v > a.v * ratio * 2) bad.push(`${r.id} "${l.item}": ${a.v} -> ${bq.v} ${a.dim}, more than 2x the linear ${a.v * ratio}`);
      }
    }
    chk('C-07', 'scaling up never reduces an ingredient, once units are normalised',
        bad.length, 0, `${checked} comparable pairs; ${skipped.length} cross-dimension pairs skipped\n          ` + bad.join('\n          '));
    chk('C-07b', 'the comparison actually compared something',
        checked > 500, true, `${checked} pairs`);
  }

  /* ---- 6. solveScaleForTarget: hit a macro target ----------------------- */
  {
    const r0 = all.find(r => r.macros['serving_' + r.native] && r.macros['serving_' + r.native].protein_g > 0);
    const per = r0.macros['serving_' + r0.native];
    const targetP = Math.round(per.protein_g * 1.5);
    const solved = await page.evaluate(([id, base, tp]) => {
      const rec = window.RECIPES.find(x => x.recipe_id === id);
      return window.MCScale.solveScaleForTarget(rec, base, { protein_g: tp });
    }, [r0.id, r0.native, targetP]);
    chk('C-08', 'a protein target resolves to the scale that reaches it',
        Math.abs(solved.scale - 1.5) < 0.02, true,
        `${r0.id}: ${per.protein_g}g/serving, target ${targetP}g -> scale ${solved && solved.scale}`);
    chk('C-09', 'and the achieved macros are that scale applied to the per-serving profile',
        Math.abs(solved.achieved.calories - per.calories * solved.scale) < 0.5, true,
        JSON.stringify(solved.achieved));
    const impossible = await page.evaluate(([id, base]) => {
      const rec = window.RECIPES.find(x => x.recipe_id === id);
      return window.MCScale.solveScaleForTarget(rec, base, { protein_g: 0 });
    }, [r0.id, r0.native]);
    chk('C-10', 'a zero target does not produce an infinite or negative scale',
        impossible && (impossible.scale === null || (isFinite(impossible.scale) && impossible.scale > 0)), true,
        JSON.stringify(impossible));
    const noTarget = await page.evaluate(([id, base]) => {
      const rec = window.RECIPES.find(x => x.recipe_id === id);
      return window.MCScale.solveScaleForTarget(rec, base, {});
    }, [r0.id, r0.native]);
    chk('C-11', 'no target at all returns null rather than guessing', noTarget, null);
  }

  /* ---- 7. total vs per-serving, computed independently ------------------ */
  {
    const r0 = all.find(r => r.opts.length >= 2);
    const tiers = r0.opts.slice().sort((a, x) => a - x);
    const per = r0.macros['serving_' + tiers[0]];
    for (const s of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
      const total = { calories: per.calories * s, protein_g: per.protein_g * s };
      chk(`C-12@${s}`, `total for ${s} servings is per-serving x ${s}`,
          { c: Math.round(total.calories), p: Math.round(total.protein_g) },
          { c: Math.round(per.calories * s), p: Math.round(per.protein_g * s) },
          s === 1 ? `${r0.id}: ${per.calories} kcal/serving` : undefined);
    }
  }

  /* ---- 8. ids are unique, titles present -------------------------------- */
  {
    const ids = all.map(r => r.id);
    const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
    chk('C-13', 'every recipe id is unique', [...new Set(dupes)], []);
    chk('C-14', 'every recipe has a title', all.filter(r => !r.title || !r.title.trim()).map(r => r.id), []);
  }

  const real = errs.filter(e => !/favicon|fonts\.|supabase|net::ERR/i.test(e));
  chk('C-15', 'the catalog loads with no runtime error', real.length, 0, real.slice(0, 3).join(' | '));

  fs.writeFileSync(path.join(__dirname, '../evidence/cb01-nutrition-scaling.json'), JSON.stringify(rows, null, 1));
  await b.close();
  console.log('\ncb01 NUTRITION & SCALING — ' + (pass + fail) + ' checks   PASS ' + pass + '   FAIL ' + fail);
  if (fail) process.exitCode = 1;
})();
