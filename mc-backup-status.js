/* ===============================================
   mc-backup-status.js
   Shows a subtle backup-age indicator in the
   header of any page that includes this script.
   =============================================== */

'use strict';

(function () {
  const KEY = 'mcLastExport';

  function _render() {
    const ts = localStorage.getItem(KEY);
    if (!ts) return;                       // never exported — silent

    const age  = Date.now() - Number(ts);
    const days = Math.floor(age / 86_400_000);
    if (days < 7) return;                  // fresh — no warning

    const el = document.createElement('div');
    el.id = 'backupBadge';
    el.style.cssText = [
      'position:fixed', 'bottom:72px', 'right:12px',
      'background:#1e293b', 'border:1px solid rgba(249,115,22,.4)',
      'color:#fb923c', 'font-size:.72rem', 'font-weight:600',
      'padding:6px 10px', 'border-radius:10px', 'z-index:500',
      'cursor:pointer', 'box-shadow:0 4px 12px rgba(0,0,0,.5)'
    ].join(';');
    el.textContent = `⚠️ Backup ${days}d ago`;
    el.title = 'Tap to go to Import/Export';
    el.onclick = () => location.href = 'import.html';
    document.body.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _render);
  } else {
    _render();
  }
})();
