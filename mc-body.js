/* mc-body.js — Body-composition & weight logging helpers */

const McBody = (() => {
  const STORE = 'mcBodyLog';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || []; }
    catch { return []; }
  }
  function save(entries) {
    localStorage.setItem(STORE, JSON.stringify(entries));
  }
  function addEntry(entry) {
    const entries = load();
    entries.push({ ...entry, ts: Date.now() });
    save(entries);
  }
  function getLatest() {
    const entries = load();
    return entries.length ? entries[entries.length - 1] : null;
  }
  function getRange(days = 30) {
    const cutoff = Date.now() - days * 86_400_000;
    return load().filter(e => e.ts >= cutoff);
  }
  function clear() { localStorage.removeItem(STORE); }

  return { load, addEntry, getLatest, getRange, clear };
})();
