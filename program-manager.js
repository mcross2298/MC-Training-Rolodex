/* ═══════════════════════════════════════════════════════════════════
   program-manager.js  —  MC Training Program Registry
   Central store for built-in and custom programs.
   ═══════════════════════════════════════════════════════════════════ */

const ProgramManager = (() => {
  const CUSTOM_KEY = 'mcCustomPrograms';
  const ACTIVE_KEY = 'mcActiveProgram';

  /* ── built-in programs ───────────────────────────────────────── */
  const BUILTINS = [
    {
      id: 'pmc',
      name: 'PMC — Power & Mass Circuit',
      description: 'A 6-day push/pull/legs hypertrophy program with progressive overload.',
      days: ['S1-Legs','S2-CST','S3-Pull','S4-Legs/Back','S5-Push','S6-Legs'],
      tags: ['hypertrophy','6-day','push-pull-legs'],
      level: 'intermediate'
    },
    {
      id: 'mc-split2',
      name: 'MC 2-Day Split',
      description: 'Upper / Lower 2-day split for minimalist scheduling.',
      days: ['Upper','Lower'],
      tags: ['2-day','beginner'],
      level: 'beginner'
    },
    {
      id: 'mc-split3',
      name: 'MC 3-Day Full Body',
      description: '3-day full-body program for general fitness.',
      days: ['Day A','Day B','Day C'],
      tags: ['3-day','full-body'],
      level: 'beginner'
    },
    {
      id: 'mc-s1',
      name: 'MC S1 — Legs Day',
      description: 'Quad-dominant leg day from the MC S1 program.',
      days: ['Legs'],
      tags: ['legs','single-day'],
      level: 'intermediate'
    },
    {
      id: 'mc-s5',
      name: 'MC S5 — Pull Day',
      description: 'Back & biceps pull session from MC S5.',
      days: ['Pull'],
      tags: ['pull','back','single-day'],
      level: 'intermediate'
    }
  ];

  /* ── custom programs ─────────────────────────────────────────── */
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; }
    catch { return []; }
  }
  function saveCustom(arr) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr));
  }
  function addCustom(program) {
    const arr = loadCustom();
    program.id = program.id || 'custom-' + Date.now().toString(36);
    program.custom = true;
    arr.push(program);
    saveCustom(arr);
    return program;
  }
  function removeCustom(id) {
    saveCustom(loadCustom().filter(p => p.id !== id));
  }

  /* ── active program ──────────────────────────────────────────── */
  function setActive(id) { localStorage.setItem(ACTIVE_KEY, id); }
  function getActiveId() { return localStorage.getItem(ACTIVE_KEY); }
  function getActive() {
    const id = getActiveId();
    return id ? getById(id) : null;
  }

  /* ── lookups ─────────────────────────────────────────────────── */
  function getAll() { return [...BUILTINS, ...loadCustom()]; }
  function getById(id) { return getAll().find(p => p.id === id) || null; }
  function getByTag(tag) { return getAll().filter(p => (p.tags||[]).includes(tag)); }

  return {
    getAll, getById, getByTag,
    addCustom, removeCustom, loadCustom,
    setActive, getActiveId, getActive
  };
})();
