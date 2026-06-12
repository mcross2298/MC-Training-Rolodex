/* mc-replace.js — Exercise replacement helper
   Loads exercisedata.json (or cached), filters by muscle group,
   and renders a replacement picker modal. */

const McReplace = (() => {
  let _cache = null;

  async function fetchData() {
    if (_cache) return _cache;
    const r = await fetch('exercisedata.json');
    _cache = await r.json();
    return _cache;
  }

  async function getSimilar(exercise) {
    const all = await fetchData();
    const target = (exercise.muscle || exercise.primaryMuscle || '').toLowerCase();
    return all.filter(e =>
      e.name !== exercise.name &&
      (e.muscle || e.primaryMuscle || '').toLowerCase() === target
    ).slice(0, 12);
  }

  async function openPicker(exercise, onSelect) {
    const similar = await getSimilar(exercise);
    const backdropId = 'replace-backdrop';
    document.getElementById(backdropId)?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = backdropId;
    backdrop.className = 'modal-backdrop open';
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Replace Exercise</span>
          <button class="modal-close" id="replace-close">✕</button>
        </div>
        <p class="text-muted text-sm mb-2">Similar to: <strong>${exercise.name}</strong></p>
        <div id="replace-list" style="display:flex;flex-direction:column;gap:.5rem">
          ${similar.map(e => `
            <button class="btn btn-secondary" style="justify-content:flex-start;text-align:left" data-name="${e.name}">
              <span style="flex:1">${e.name}</span>
              <span class="badge badge-gray">${e.muscle || e.primaryMuscle || ''}</span>
            </button>`).join('')}
          ${similar.length === 0 ? '<p class="text-muted text-sm">No similar exercises found.</p>' : ''}
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    backdrop.querySelector('#replace-close').onclick = () => backdrop.remove();
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelectorAll('[data-name]').forEach(btn => {
      btn.onclick = () => { onSelect(btn.dataset.name); backdrop.remove(); };
    });
  }

  return { openPicker, getSimilar, fetchData };
})();
