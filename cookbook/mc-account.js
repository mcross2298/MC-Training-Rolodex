/* ==========================================================================
   mc-account.js  —  user-facing account UI (sign in / sign out) for sync
   --------------------------------------------------------------------------
   Cookbook port of 4-Weeks-to-Open-'s mc-account.js. Same invite-only accounts
   (the owner provisions them in Supabase; no public sign-up here either) — a
   trainee signs in with the same email/password they use in the workout app,
   and their tracker data (mc_macros_v1) reconciles across both.

   Entry point: a small account button in the Home top bar, to the left of the
   search button. Home re-renders from scratch on every visit (cookbook-home.js
   is a hub-and-spoke SPA, not a persistent header), so cookbook-home.js calls
   window.MCAccount.mount(container) each time it builds the top bar rather
   than this module owning a fixed DOM node the way the workout app's .avatar
   does.
   ========================================================================== */
(function () {
  "use strict";
  if (window.MCAccount) return;
  if (!window.MC_SB || !MC_SB.configured) { window.MCAccount = { mount: function () {} }; return; }

  var overlay = null, currentUserObj = null, buttons = [];

  function initials(email) {
    var p = (email || '').split('@')[0].replace(/[^a-z0-9]/gi, '');
    return (p.slice(0, 2) || '?').toUpperCase();
  }

  function injectStyles() {
    if (document.getElementById('mcAcctStyles')) return;
    var css =
      '.home-account-btn{position:absolute;top:calc(20px + env(safe-area-inset-top));right:68px;z-index:21;' +
        'width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'background:var(--bg-elev);border:1px solid var(--line-dark);color:var(--on-dark);' +
        'font-size:13px;font-weight:800;cursor:pointer;transition:transform var(--dur-fast) var(--ease-out);}' +
      '.home-account-btn:active{transform:scale(0.92);}' +
      '.home-account-btn.acct-on{box-shadow:0 0 0 2px rgba(200,122,83,0.6);}' +
      '.acct-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);' +
        'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
        'display:none;align-items:flex-end;justify-content:center;z-index:1200;}' +
      '.acct-overlay.open{display:flex;}' +
      '.acct-sheet{width:100%;max-width:520px;background:var(--bg-elev);' +
        'border-top:1px solid var(--line-dark);border-radius:24px 24px 0 0;' +
        'padding:18px 18px calc(28px + env(safe-area-inset-bottom));color:var(--on-dark);' +
        'font-family:var(--sans);}' +
      '.acct-handle{width:36px;height:4px;background:var(--line-dark);border-radius:2px;margin:0 auto 16px;}' +
      '.acct-title{font-family:var(--serif);font-size:19px;font-weight:700;margin-bottom:4px;}' +
      '.acct-sub{font-size:13px;color:var(--on-dark-dim);margin-bottom:16px;line-height:1.5;}' +
      '.acct-sub b{color:var(--on-dark);}' +
      '.acct-sheet input{width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);' +
        'border:1px solid var(--line-dark);border-radius:var(--r-md);padding:13px 14px;margin-bottom:10px;' +
        'color:var(--on-dark);font-size:15px;font-weight:600;outline:none;font-family:inherit;}' +
      '.acct-btn{width:100%;border:none;border-radius:var(--r-md);padding:14px;font-size:15px;font-weight:800;' +
        'cursor:pointer;font-family:inherit;margin-top:4px;}' +
      '.acct-primary{background:var(--accent);color:#fff;}' +
      '.acct-primary:disabled{opacity:0.5;cursor:default;}' +
      '.acct-secondary{background:rgba(255,255,255,0.07);color:var(--on-dark);border:1px solid var(--line-dark);}' +
      '.acct-note{font-size:12px;color:var(--on-dark-dim);margin-top:14px;line-height:1.5;text-align:center;}' +
      '.acct-info{font-size:13px;color:var(--sage);background:rgba(125,140,119,0.12);' +
        'border:1px solid rgba(125,140,119,0.3);border-radius:var(--r-sm);padding:11px 12px;margin-bottom:16px;line-height:1.5;}' +
      '.acct-err{font-size:13px;color:#e0685a;margin-top:10px;min-height:18px;text-align:center;}' +
      '.acct-hr{border-top:1px solid var(--line-dark);margin:18px 0 14px;}' +
      '.acct-backup .acct-btn{margin-top:8px;}';
    var st = document.createElement('style');
    st.id = 'mcAcctStyles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function close() { if (overlay) overlay.classList.remove('open'); }

  function render() {
    var body = overlay.querySelector('#acctBody');
    if (currentUserObj) {
      body.innerHTML =
        '<div class="acct-title">Account</div>' +
        '<div class="acct-sub">Signed in as <b>' + (currentUserObj.email || 'your account') + '</b></div>' +
        '<div class="acct-info">✓ Your tracker, meal plan, macro history and My Recipes sync across your devices — and your tracker reconciles with the workout app if you use both.</div>' +
        '<button class="acct-btn acct-secondary" id="acctSignout">Sign out</button>';
      body.querySelector('#acctSignout').addEventListener('click', doSignOut);
    } else {
      body.innerHTML =
        '<div class="acct-title">Sign in</div>' +
        '<div class="acct-sub">Sign in to sync your tracker, meal plan, and My Recipes across devices — the same account works in the workout app.</div>' +
        '<input id="acctEmail" type="email" autocomplete="email" placeholder="Email"/>' +
        '<input id="acctPw" type="password" autocomplete="current-password" placeholder="Password"/>' +
        '<button class="acct-btn acct-primary" id="acctSignin">Sign in</button>' +
        '<div class="acct-err" id="acctErr"></div>' +
        '<div class="acct-note">Accounts are provided by the app owner — ask for an invite to get one.</div>';
      body.querySelector('#acctSignin').addEventListener('click', doSignIn);
      body.querySelector('#acctPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });
    }
    appendInstallSection(body);
    appendBackupSection(body);
  }

  // Add to Home Screen (roadmap B4 — ported from 4-Weeks-to-Open-'s
  // mc-account.js so both apps offer the same install moment; mc-install.js
  // captures the native Android prompt at page load, this just renders
  // whatever state it stashed). Byte-for-byte the same section/copy pattern
  // as the workout app's, app name swapped.
  function appendInstallSection(body) {
    if (!window.MC_INSTALL) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="acct-hr"></div>' +
      '<div class="acct-sub">Install — add Mike’s Cookbook to your home screen for a full-screen, app-like experience.</div>' +
      '<div id="acctInstallBody"></div>';
    body.appendChild(wrap);
    renderInstallBody(wrap.querySelector('#acctInstallBody'));
    MC_INSTALL.onChange(function () {
      var slot = wrap.querySelector('#acctInstallBody');
      if (slot) renderInstallBody(slot);
    });
  }

  function renderInstallBody(slot) {
    if (MC_INSTALL.isInstalled()) {
      slot.innerHTML = '<div class="acct-info">✓ Already installed on this device.</div>';
      return;
    }
    if (MC_INSTALL.platform === 'ios') {
      slot.innerHTML =
        '<div class="acct-sub" style="margin-bottom:0;line-height:1.7;">' +
        '1. Tap the <b>Share</b> icon in Safari’s toolbar<br>' +
        '2. Scroll down and tap <b>Add to Home Screen</b><br>' +
        '3. Tap <b>Add</b> — Mike’s Cookbook now opens full-screen, just like an app</div>';
      return;
    }
    if (MC_INSTALL.canPrompt()) {
      slot.innerHTML = '<button type="button" class="acct-btn acct-secondary" id="acctInstall">Install app</button>';
      slot.querySelector('#acctInstall').addEventListener('click', function () {
        MC_INSTALL.prompt();
      });
      return;
    }
    slot.innerHTML = '<div class="acct-sub" style="margin-bottom:0;">Look for <b>Install app</b> or <b>Add to Home Screen</b> in your browser’s menu.</div>';
  }

  // Manual backup — available whether signed in or not (window.MCExport is
  // a separate module; no-op here if it isn't loaded for some reason).
  function appendBackupSection(body) {
    if (!window.MCExport) return;
    var wrap = document.createElement('div');
    wrap.className = 'acct-backup';
    wrap.innerHTML =
      '<div class="acct-hr"></div>' +
      '<div class="acct-sub">Back up your data as a file, or restore from one — works whether you’re signed in or not.</div>' +
      '<button class="acct-btn acct-secondary" id="acctExport">Export data</button>' +
      '<button class="acct-btn acct-secondary" id="acctImport">Import data</button>' +
      '<input type="file" id="acctImportFile" accept="application/json" style="display:none">' +
      '<div class="acct-err" id="acctBackupMsg"></div>';
    body.appendChild(wrap);
    wrap.querySelector('#acctExport').addEventListener('click', function () { MCExport.exportJSON(); });
    var fileInput = wrap.querySelector('#acctImportFile');
    wrap.querySelector('#acctImport').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var msg = wrap.querySelector('#acctBackupMsg');
      MCExport.importJSON(file).then(function () {
        location.reload();
      }).catch(function (e) {
        msg.textContent = (e && e.message) || 'Import failed.';
        msg.style.color = '#e0685a';
      });
    });
  }

  function openSheet() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'acct-overlay';
      overlay.innerHTML = '<div class="acct-sheet"><div class="acct-handle"></div><div id="acctBody"></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    }
    render();
    overlay.classList.add('open');
  }

  function doSignIn() {
    var email = (document.getElementById('acctEmail').value || '').trim();
    var pw = document.getElementById('acctPw').value || '';
    var err = document.getElementById('acctErr');
    var btn = document.getElementById('acctSignin');
    if (!email || !pw) { err.textContent = 'Enter your email and password.'; return; }
    btn.disabled = true; btn.textContent = 'Signing in…'; err.textContent = '';
    MC_SB.signInPassword(email, pw).then(function () {
      return MC_SB.currentUser();
    }).then(function (u) {
      currentUserObj = u;
      updateButtons();
      close();
      if (window.MC_SYNC && MC_SYNC.kick) MC_SYNC.kick();
    }).catch(function (e) {
      var m = (e && e.message) ? e.message : 'Sign-in failed.';
      if (/invalid login/i.test(m)) m = 'Wrong email or password.';
      else if (/email not confirmed/i.test(m)) m = 'Please confirm your email (check your inbox) before signing in.';
      err.textContent = m;
      btn.disabled = false; btn.textContent = 'Sign in';
    });
  }

  function doSignOut() {
    MC_SB.signOut().then(function () {
      try { sessionStorage.removeItem('mc_sync_reloaded'); } catch (e) {}
      location.reload();
    }).catch(function () { location.reload(); });
  }

  function paintButton(btn) {
    if (currentUserObj) { btn.textContent = initials(currentUserObj.email); btn.classList.add('acct-on'); }
    else { btn.textContent = '👤'; btn.classList.remove('acct-on'); }
  }

  function updateButtons() { buttons.forEach(paintButton); }

  // Called by cookbook-home.js each time the Home top bar is (re)built.
  function mount(container) {
    injectStyles();
    buttons = buttons.filter(function (b) { return document.contains(b); });
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-account-btn';
    btn.setAttribute('aria-label', 'Account');
    btn.addEventListener('click', openSheet);
    paintButton(btn);
    container.appendChild(btn);
    buttons.push(btn);
  }

  MC_SB.ready
    .then(function (c) { return c ? MC_SB.currentUser() : null; })
    .then(function (u) { currentUserObj = u; updateButtons(); })
    .catch(function () {});

  window.MCAccount = { mount: mount };
})();
