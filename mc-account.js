/* ===============================================
   mc-account.js  —  User account / profile store
   All data lives in localStorage.
   =============================================== */

'use strict';

const ACCOUNT_KEY = 'mcAccount';

const DEFAULTS = {
  name:       '',
  unit:       'lbs',        // 'lbs' | 'kg'
  program:    'MC',         // 'MC' | 'PMC'
  theme:      'dark',       // 'dark' (only option for now)
  weekStart:  'monday',     // 'monday' | 'sunday'
  bodyWeight: '',
  goal:       '',
  joinDate:   new Date().toISOString().slice(0, 10)
};

function _load() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function _save(data) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(data));
}

/* ── Public API ──────────────────────────────── */

/** Get the full account object */
function getAccount() { return _load(); }

/** Update one or more fields */
function updateAccount(patch) {
  const current = _load();
  _save({ ...current, ...patch });
}

/** Get a single field */
function getField(key) { return _load()[key] ?? DEFAULTS[key]; }

/** Get the preferred unit (lbs/kg) */
function getUnit() { return getField('unit'); }

/** Get the active program */
function getProgram() { return getField('program'); }

/** Convert a weight value between units if needed.
 *  storedUnit: the unit the value was stored in.
 *  Returns value in current preferred unit, rounded to 1 dp.
 */
function convertWeight(value, storedUnit) {
  const pref = getUnit();
  if (!value || storedUnit === pref) return value;
  if (storedUnit === 'lbs' && pref === 'kg')  return +(value / 2.20462).toFixed(1);
  if (storedUnit === 'kg'  && pref === 'lbs') return +(value * 2.20462).toFixed(1);
  return value;
}

/** Reset account to defaults */
function resetAccount() { _save({ ...DEFAULTS, joinDate: getField('joinDate') }); }

/* ── Expose globally ─────────────────────────── */
window.mcAccount = {
  getAccount, updateAccount, getField, getUnit, getProgram,
  convertWeight, resetAccount
};
