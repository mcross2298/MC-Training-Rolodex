/* mc-replace.js — renders saved exercise replacements
   Reads from localStorage key 'mcReplacements'
   and applies them when a workout page loads.

   Storage format:
   {
     "<pageId>": {
       "<originalName>": "<replacementName>"
     }
   }
*/

'use strict';

(function () {

  const STORE_KEY = 'mcReplacements';

  function _load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  }

  function _save(map) {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  }

  /**
   * Retrieve replacement name for an exercise on a given page.
   * Returns null if no replacement is active.
   */
  function getReplacement(pageId, originalName) {
    const map = _load();
    return map[pageId]?.[originalName] ?? null;
  }

  /**
   * Set a replacement.  Pass null to remove.
   */
  function setReplacement(pageId, originalName, replacementName) {
    const map = _load();
    if (!map[pageId]) map[pageId] = {};
    if (replacementName === null) {
      delete map[pageId][originalName];
    } else {
      map[pageId][originalName] = replacementName;
    }
    _save(map);
  }

  /**
   * Apply all replacements for a page to the DOM.
   * Looks for elements with data-ex-name attribute.
   */
  function applyReplacements(pageId) {
    const map = _load()[pageId];
    if (!map) return;
    document.querySelectorAll('[data-ex-name]').forEach(el => {
      const orig = el.getAttribute('data-ex-name');
      if (map[orig]) {
        el.textContent = map[orig];
        el.classList.add('replaced');
      }
    });
  }

  window.mcReplace = { getReplacement, setReplacement, applyReplacements };

})();
