/* mc-program-pub.js — Share / export a custom program as a JSON blob
   that others can import via import.html */

const McProgramPub = (() => {
  function exportProgram(programObj) {
    const blob = new Blob([JSON.stringify(programObj, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${programObj.id || 'program'}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function copyShareLink(programObj) {
    const encoded = btoa(JSON.stringify(programObj));
    const url     = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}import.html?prog=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      McToast?.show?.('Link copied to clipboard', 'success');
    });
    return url;
  }

  function importFromUrl() {
    const params  = new URLSearchParams(location.search);
    const encoded = params.get('prog');
    if (!encoded) return null;
    try { return JSON.parse(atob(encoded)); }
    catch { return null; }
  }

  return { exportProgram, copyShareLink, importFromUrl };
})();
