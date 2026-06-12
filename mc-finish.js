/* ═══════════════════════════════════════════════════════════════════
   mc-finish.js  —  Workout completion & history logger
   Call McFinish.save(session) to persist a finished workout.
   ═══════════════════════════════════════════════════════════════════ */

const McFinish = (() => {
  const KEY  = 'mcWorkoutHistory';
  const PKEY = 'mcProgramProgress';

  /* ── helpers ─────────────────────────────────────────────────── */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PKEY)) || {}; }
    catch { return {}; }
  }
  function saveHistory(h)  { localStorage.setItem(KEY,  JSON.stringify(h)); }
  function saveProgress(p) { localStorage.setItem(PKEY, JSON.stringify(p)); }

  /* ── main save ───────────────────────────────────────────────── */
  function save(session) {
    if (!session) return;
    // 1. append to history
    const history = loadHistory();
    history.push({
      id:         crypto.randomUUID?.() || Date.now().toString(36),
      programId:  session.programId,
      dayLabel:   session.dayLabel,
      date:       new Date().toISOString().slice(0, 10),
      startedAt:  session.startedAt,
      finishedAt: session.finishedAt || Date.now(),
      durationMs: session.durationMs || 0,
      exercises:  session.exercises,
      notes:      session.notes || ''
    });
    saveHistory(history);

    // 2. update program progress
    if (session.programId) {
      const prog = loadProgress();
      const pid  = session.programId;
      if (!prog[pid]) prog[pid] = { completedDays: [], lastDate: null };
      const dayKey = session.dayLabel || '';
      if (!prog[pid].completedDays.includes(dayKey)) {
        prog[pid].completedDays.push(dayKey);
      }
      prog[pid].lastDate = new Date().toISOString().slice(0, 10);
      saveProgress(prog);
    }

    return history[history.length - 1];
  }

  /* ── history queries ─────────────────────────────────────────── */
  function getAll()    { return loadHistory(); }
  function getLast(n = 10) {
    const h = loadHistory();
    return h.slice(-n).reverse();
  }
  function getByProgram(pid) {
    return loadHistory().filter(w => w.programId === pid);
  }
  function getProgress(pid) {
    return loadProgress()[pid] || { completedDays: [], lastDate: null };
  }
  function clearHistory() { localStorage.removeItem(KEY); }

  return { save, getAll, getLast, getByProgram, getProgress, clearHistory };
})();
