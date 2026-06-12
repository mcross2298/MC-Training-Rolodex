/* ═══════════════════════════════════════════════════════════════════
   mc-stats.js  —  Historical stats engine
   Provides aggregation helpers over McFinish history.
   ═══════════════════════════════════════════════════════════════════ */

const McStats = (() => {
  function all() {
    try { return JSON.parse(localStorage.getItem('mcWorkoutHistory')) || []; }
    catch { return []; }
  }

  /* ── streak ──────────────────────────────────────────────────── */
  function currentStreak() {
    const dates = [...new Set(all().map(w => w.date))].sort().reverse();
    if (!dates.length) return 0;
    let streak = 0;
    let prev   = new Date();
    prev.setHours(0,0,0,0);
    for (const d of dates) {
      const cur  = new Date(d);
      const diff = Math.round((prev - cur) / 86_400_000);
      if (diff > 1) break;
      streak++;
      prev = cur;
    }
    return streak;
  }

  /* ── volume over time ────────────────────────────────────────── */
  function volumeByDay(days = 30) {
    const cutoff = Date.now() - days * 86_400_000;
    const result = {};
    for (const w of all()) {
      if (new Date(w.date).getTime() < cutoff) continue;
      let vol = 0;
      for (const ex of (w.exercises || [])) {
        for (const set of (ex.sets || [])) {
          if (set.done) vol += (parseFloat(set.weight)||0) * (parseInt(set.reps)||0);
        }
      }
      result[w.date] = (result[w.date] || 0) + vol;
    }
    return result;
  }

  /* ── PRs ─────────────────────────────────────────────────────── */
  function personalRecords() {
    const prs = {};
    for (const w of all()) {
      for (const ex of (w.exercises || [])) {
        for (const set of (ex.sets || [])) {
          if (!set.done) continue;
          const w2 = parseFloat(set.weight) || 0;
          const r  = parseInt(set.reps)    || 0;
          const key = ex.name;
          if (!prs[key] || w2 > prs[key].weight) {
            prs[key] = { weight: w2, reps: r, date: w.date };
          }
        }
      }
    }
    return prs;
  }

  /* ── muscle frequency ────────────────────────────────────────── */
  function muscleFrequency() {
    const freq = {};
    for (const w of all()) {
      for (const ex of (w.exercises || [])) {
        const m = ex.muscle || ex.primaryMuscle || 'other';
        freq[m] = (freq[m] || 0) + 1;
      }
    }
    return freq;
  }

  /* ── totals ──────────────────────────────────────────────────── */
  function totals() {
    const history = all();
    const workouts = history.length;
    let totalMs = 0, totalSets = 0, totalVol = 0;
    for (const w of history) {
      totalMs  += w.durationMs || 0;
      for (const ex of (w.exercises||[])) {
        for (const set of (ex.sets||[])) {
          if (set.done) {
            totalSets++;
            totalVol += (parseFloat(set.weight)||0)*(parseInt(set.reps)||0);
          }
        }
      }
    }
    return { workouts, totalMs, totalSets, totalVol };
  }

  return { all, currentStreak, volumeByDay, personalRecords, muscleFrequency, totals };
})();
