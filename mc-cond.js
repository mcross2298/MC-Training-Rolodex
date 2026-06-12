/* ═══════════════════════════════════════════════════════════════════
   mc-cond.js  —  Conditioning / cardio session tracker
   Tracks HIIT intervals, LISS sessions, and conditioning circuits.
   ═══════════════════════════════════════════════════════════════════ */

const McCond = (() => {
  const KEY = 'mcCondLog';

  /* ── types ───────────────────────────────────────────────────── */
  const TYPES = {
    HIIT:   'HIIT',
    LISS:   'LISS',
    CIRCUIT:'Circuit',
    TABATA: 'Tabata',
    CUSTOM: 'Custom'
  };

  /* ── storage ─────────────────────────────────────────────────── */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }
  function save(arr) { localStorage.setItem(KEY, JSON.stringify(arr)); }

  /* ── log session ─────────────────────────────────────────────── */
  function logSession(type, durationMin, notes = '', extras = {}) {
    const arr = load();
    arr.push({
      id:   crypto.randomUUID?.() || Date.now().toString(36),
      type, durationMin, notes,
      date: new Date().toISOString().slice(0,10),
      ts:   Date.now(),
      ...extras
    });
    save(arr);
  }

  /* ── queries ─────────────────────────────────────────────────── */
  function getAll()    { return load(); }
  function getByType(t){ return load().filter(s => s.type === t); }
  function getRange(days = 30) {
    const cutoff = Date.now() - days * 86_400_000;
    return load().filter(s => s.ts >= cutoff);
  }
  function totalMinutes(days = 30) {
    return getRange(days).reduce((sum, s) => sum + (s.durationMin || 0), 0);
  }

  /* ── HIIT interval helper ────────────────────────────────────── */
  function buildIntervals(workSec, restSec, rounds) {
    const intervals = [];
    for (let i = 0; i < rounds; i++) {
      intervals.push({ type: 'work', seconds: workSec, label: `Round ${i+1}` });
      if (i < rounds - 1) intervals.push({ type: 'rest', seconds: restSec, label: 'Rest' });
    }
    return intervals;
  }

  return { TYPES, logSession, getAll, getByType, getRange, totalMinutes, buildIntervals };
})();
