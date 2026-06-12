/* ═══════════════════════════════════════════════════════════════════
   mc-summary.js  —  Workout summary & stats renderer
   Renders a rich post-workout summary card into a target element.
   ═══════════════════════════════════════════════════════════════════ */

const McSummary = (() => {

  /* ── format helpers ──────────────────────────────────────────── */
  function fmtDur(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${s % 60}s`;
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  }

  /* ── volume calc ─────────────────────────────────────────────── */
  function calcVolume(exercises) {
    let total = 0;
    for (const ex of exercises) {
      for (const set of (ex.sets || [])) {
        if (set.done) total += (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0);
      }
    }
    return total;
  }

  function countSets(exercises) {
    return exercises.reduce((n, ex) => n + (ex.sets || []).filter(s => s.done).length, 0);
  }

  /* ── render ──────────────────────────────────────────────────── */
  function render(targetEl, session) {
    if (!targetEl || !session) return;
    const vol   = calcVolume(session.exercises || []);
    const sets  = countSets(session.exercises || []);
    const exCnt = (session.exercises || []).length;
    const dur   = fmtDur(session.durationMs || 0);

    targetEl.innerHTML = `
      <div class="summary-header">
        <h2>🏆 Workout Complete!</h2>
        <p class="text-muted">${fmtDate(new Date().toISOString())} &mdash; ${session.dayLabel || 'Session'}</p>
      </div>
      <div class="stat-grid" style="margin:1rem 0">
        <div class="stat-card">
          <div class="stat-val">${dur}</div>
          <div class="stat-lbl">Duration</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${exCnt}</div>
          <div class="stat-lbl">Exercises</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${sets}</div>
          <div class="stat-lbl">Sets Done</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${vol.toLocaleString()}</div>
          <div class="stat-lbl">Total Volume</div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Exercises</div>
        ${(session.exercises || []).map(ex => {
          const doneSets = (ex.sets || []).filter(s => s.done);
          return `<div class="card" style="margin-bottom:.5rem">
            <div class="flex items-center justify-between">
              <span class="font-bold">${ex.name}</span>
              <span class="badge badge-gray">${doneSets.length} sets</span>
            </div>
            ${doneSets.length ? `<p class="text-sm text-muted mt-1">${doneSets.map(s=>`${s.weight||'—'} × ${s.reps||'—'}`).join(' · ')}</p>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${session.notes ? `<div class="section"><div class="section-title">Notes</div><p class="text-sm">${session.notes}</p></div>` : ''}
    `;
  }

  function renderMini(session) {
    const vol  = calcVolume(session.exercises || []);
    const sets = countSets(session.exercises || []);
    const dur  = fmtDur(session.durationMs || 0);
    return `${dur} · ${sets} sets · ${vol.toLocaleString()} lbs volume`;
  }

  return { render, renderMini, calcVolume, countSets };
})();
