/* ═══════════════════════════════════════════════════════════════════
   mc-session.js  —  Active workout session manager
   Tracks: active program, current day, set completions, rest timer,
   elapsed time, and auto-save to localStorage.
   ═══════════════════════════════════════════════════════════════════ */

const McSession = (() => {
  const KEY = 'mcActiveSession';

  /* ── helpers ─────────────────────────────────────────────────── */
  const now = () => Date.now();
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function clear()  { localStorage.removeItem(KEY); }

  /* ── session lifecycle ───────────────────────────────────────── */
  function start(programId, dayLabel, exercises) {
    const session = {
      programId, dayLabel,
      startedAt: now(),
      exercises: exercises.map(ex => ({
        id: ex.id || ex.name,
        name: ex.name,
        sets: Array.from({ length: ex.sets || 3 }, () => ({
          reps: null, weight: null, done: false
        }))
      })),
      notes: '',
      finished: false
    };
    save(session);
    return session;
  }

  function get() { return load(); }

  function markSet(exerciseIndex, setIndex, data) {
    const s = load();
    if (!s) return;
    Object.assign(s.exercises[exerciseIndex].sets[setIndex], data, { done: true });
    save(s);
  }

  function updateSet(exerciseIndex, setIndex, field, value) {
    const s = load();
    if (!s) return;
    s.exercises[exerciseIndex].sets[setIndex][field] = value;
    save(s);
  }

  function setNotes(text) {
    const s = load();
    if (!s) return;
    s.notes = text;
    save(s);
  }

  function finish() {
    const s = load();
    if (!s) return null;
    s.finished = true;
    s.finishedAt = now();
    s.durationMs = s.finishedAt - s.startedAt;
    save(s);
    return s;
  }

  function elapsedMs() {
    const s = load();
    return s ? now() - s.startedAt : 0;
  }

  function formatElapsed() {
    const ms = elapsedMs();
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`;
  }

  return { start, get, markSet, updateSet, setNotes, finish, elapsedMs, formatElapsed, clear };
})();
