/* mc-wrapped.js — Year-in-Review / Wrapped generator
   Summarises the past year of workout history into share-ready stats. */

const McWrapped = (() => {
  function generate(year) {
    year = year || new Date().getFullYear();
    let history;
    try { history = JSON.parse(localStorage.getItem('mcWorkoutHistory')) || []; }
    catch { history = []; }

    const inYear = history.filter(w => w.date && w.date.startsWith(String(year)));

    let totalMs = 0, totalSets = 0, totalVol = 0;
    const muscleTally = {}, exTally = {}, dayTally = {};

    for (const w of inYear) {
      totalMs += w.durationMs || 0;
      const dow = new Date(w.date).toLocaleDateString('en-US',{weekday:'long'});
      dayTally[dow] = (dayTally[dow]||0) + 1;
      for (const ex of (w.exercises||[])) {
        exTally[ex.name] = (exTally[ex.name]||0) + 1;
        const m = ex.muscle || ex.primaryMuscle || 'other';
        muscleTally[m] = (muscleTally[m]||0) + 1;
        for (const set of (ex.sets||[])) {
          if (set.done) {
            totalSets++;
            totalVol += (parseFloat(set.weight)||0)*(parseInt(set.reps)||0);
          }
        }
      }
    }

    const topExercise = Object.entries(exTally).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
    const topMuscle   = Object.entries(muscleTally).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
    const topDay      = Object.entries(dayTally).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

    return {
      year, workouts: inYear.length,
      totalHours: +(totalMs/3_600_000).toFixed(1),
      totalSets, totalVol,
      topExercise, topMuscle, topDay
    };
  }

  function renderCard(targetEl, stats) {
    targetEl.innerHTML = `
      <div style="text-align:center;padding:2rem 1rem">
        <h2 style="font-size:2rem;font-weight:900;color:var(--accent)">${stats.year} Wrapped 🎁</h2>
        <p class="text-muted" style="margin:.5rem auto 1.5rem">Your year in iron</p>
        <div class="stat-grid" style="max-width:480px;margin:0 auto 1.5rem">
          <div class="stat-card"><div class="stat-val">${stats.workouts}</div><div class="stat-lbl">Workouts</div></div>
          <div class="stat-card"><div class="stat-val">${stats.totalHours}h</div><div class="stat-lbl">Time Trained</div></div>
          <div class="stat-card"><div class="stat-val">${stats.totalSets.toLocaleString()}</div><div class="stat-lbl">Total Sets</div></div>
          <div class="stat-card"><div class="stat-val">${Math.round(stats.totalVol/1000)}k</div><div class="stat-lbl">Lbs Moved</div></div>
        </div>
        <div class="card" style="max-width:480px;margin:0 auto;text-align:left">
          <p class="text-sm"><span class="text-muted">Top exercise:</span> <strong>${stats.topExercise}</strong></p>
          <p class="text-sm mt-1"><span class="text-muted">Top muscle:</span> <strong>${stats.topMuscle}</strong></p>
          <p class="text-sm mt-1"><span class="text-muted">Favourite day:</span> <strong>${stats.topDay}</strong></p>
        </div>
      </div>`;
  }

  return { generate, renderCard };
})();
