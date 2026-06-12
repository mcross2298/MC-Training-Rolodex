/* mc-backup-status.js — tiny helper that renders a backup-freshness
   indicator into any element with id="backup-status".  Call
   McBackupStatus.render() after page load. */

const McBackupStatus = (() => {
  const KEY = 'mcLastBackup';

  function stamp() {
    localStorage.setItem(KEY, Date.now().toString());
    render();
  }

  function render() {
    const el = document.getElementById('backup-status');
    if (!el) return;
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      el.innerHTML = '<span class="badge badge-red">No backup found</span>';
      return;
    }
    const ms  = Date.now() - parseInt(raw, 10);
    const hrs = ms / 3_600_000;
    let cls = 'badge-green', label = 'Backed up just now';
    if (hrs > 72)  { cls = 'badge-red';    label = `Last backup ${Math.round(hrs/24)}d ago`; }
    else if (hrs > 24) { cls = 'badge-gold';   label = `Last backup ${Math.round(hrs)}h ago`; }
    else if (hrs > 1)  { cls = 'badge-blue';   label = `Last backup ${Math.round(hrs)}h ago`; }
    else if (ms  > 60_000) { label = `Last backup ${Math.round(ms/60_000)}m ago`; }
    el.innerHTML = `<span class="badge ${cls}">${label}</span>`;
  }

  return { stamp, render };
})();
