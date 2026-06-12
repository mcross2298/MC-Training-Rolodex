/* ═══════════════════════════════════════════════════════════════════
   mc-account.js  —  User profile & preferences store
   ═══════════════════════════════════════════════════════════════════ */

const McAccount = (() => {
  const KEY = 'mcUserProfile';

  const DEFAULTS = {
    name:        'Athlete',
    units:       'imperial',   // 'imperial' | 'metric'
    bodyweight:  185,
    theme:       'gold',       // 'gold' | 'blue' | 'green' | 'purple'
    startDate:   null,
    goals:       [],
    notifications: true,
    restTimerDefault: 90,
    programId:   null,
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch { return { ...DEFAULTS }; }
  }

  function save(profile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }

  function update(patch) {
    const p = load();
    Object.assign(p, patch);
    save(p);
    return p;
  }

  function get(key) {
    return load()[key];
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  /* unit helpers */
  function lbsToKg(lbs) { return +(lbs * 0.453592).toFixed(1); }
  function kgToLbs(kg)  { return +(kg  * 2.20462).toFixed(1); }
  function displayWeight(lbs) {
    const p = load();
    return p.units === 'metric' ? `${lbsToKg(lbs)} kg` : `${lbs} lbs`;
  }

  return { load, save, update, get, reset, lbsToKg, kgToLbs, displayWeight };
})();
