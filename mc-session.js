/* ===============================================
   mc-session.js  —  Session persistence engine
   Handles save / load / clear of workout logs
   stored in localStorage.
   =============================================== */

'use strict';

/* ── Key helpers ─────────────────────────────── */
const SESSION_PREFIX = 'mcSession_';
const HISTORY_PREFIX = 'mcHistory_';
const MAX_HISTORY    = 10;   // sessions kept per page

/**
 * Build a storage key for a given page ID + date.
 * @param {string} pageId   e.g. 'mc-s1-legs'
 * @param {string} [date]   ISO date string; defaults to today
 */
function sessionKey(pageId, date) {
  date = date ?? new Date().toISOString().slice(0, 10);
  return `${SESSION_PREFIX}${pageId}_${date}`;
}

/**
 * Save the current session log for a page.
 * @param {string} pageId
 * @param {object} data    Plain object — will be JSON-serialised
 */
function saveSession(pageId, data) {
  const key  = sessionKey(pageId);
  const json = JSON.stringify({ ts: Date.now(), data });
  try {
    localStorage.setItem(key, json);
    _pruneHistory(pageId);
  } catch (e) {
    console.warn('[mc-session] save failed', e);
  }
}

/**
 * Load today's session log for a page.
 * Returns null if nothing saved today.
 */
function loadSession(pageId) {
  const raw = localStorage.getItem(sessionKey(pageId));
  if (!raw) return null;
  try { return JSON.parse(raw).data; }
  catch { return null; }
}

/**
 * Load the most-recent saved session (any date).
 * Useful for pre-filling weights from last workout.
 */
function loadLastSession(pageId) {
  const keys = _historyKeys(pageId).sort().reverse();
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try { return JSON.parse(raw).data; }
    catch { continue; }
  }
  return null;
}

/**
 * Return an array of past sessions (newest first).
 * Each entry: { date, data }
 */
function listSessions(pageId) {
  return _historyKeys(pageId)
    .sort().reverse()
    .map(k => {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const date   = k.replace(`${SESSION_PREFIX}${pageId}_`, '');
        return { date, data: parsed.data, ts: parsed.ts };
      } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Clear today's session (used by "Reset Workout" button).
 */
function clearSession(pageId) {
  localStorage.removeItem(sessionKey(pageId));
}

/* ── Private helpers ─────────────────────────── */
function _historyKeys(pageId) {
  const prefix = `${SESSION_PREFIX}${pageId}_`;
  return Object.keys(localStorage).filter(k => k.startsWith(prefix));
}

function _pruneHistory(pageId) {
  const keys = _historyKeys(pageId).sort(); // oldest first
  while (keys.length > MAX_HISTORY) {
    localStorage.removeItem(keys.shift());
  }
}

/* ── Expose globally ─────────────────────────── */
window.mcSession = { saveSession, loadSession, loadLastSession, listSessions, clearSession };
