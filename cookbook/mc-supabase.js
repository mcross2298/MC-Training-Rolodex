/* ==========================================================================
   mc-supabase.js  —  Supabase client + auth (cookbook)
   --------------------------------------------------------------------------
   Trimmed port of 4-Weeks-to-Open-'s mc-supabase.js: same Supabase project,
   same anon key, so a trainee signed in here is the same identity as in the
   workout app. Only what the cookbook needs — auth — is ported; the workout
   app's program/naming/publish-log tables have no cookbook equivalent.

     MC_SB.ready            Promise that resolves once the client is created
     MC_SB.client           the configured supabase-js client (or null)
     MC_SB.configured       true when real keys are present
     MC_SB.currentUser()    -> Promise<user|null>
     MC_SB.signInPassword(email, password)
     MC_SB.signOut()

   The anon key is public by design — every protection is enforced server-side
   by Row-Level Security (mc-sync.js's user_sync rows are isolated per user).
   ========================================================================== */
(function () {
  "use strict";
  if (window.MC_SB) return;

  var SUPABASE_URL = 'https://dhlxmoyjfxohbeiexwnr.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobHhtb3lqZnhvaGJlaWV4d25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjgwNDAsImV4cCI6MjA5NjcwNDA0MH0.G9XpWjEqaGhY7mdLjz8yAaQBFl5EXvYFfAkJMivG38E';
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  var configured = /^https:\/\/[a-z0-9]+\.supabase\.co/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.indexOf('eyJ') === 0;
  var client = null;

  function loadSDK() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('supabase-js failed to load')); };
      document.head.appendChild(s);
    });
  }

  var ready = (!configured)
    ? Promise.resolve(null)
    : loadSDK().then(function () {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return client;
      }).catch(function (e) { console.warn('[MC_SB]', e && e.message); return null; });

  function currentUser() {
    return ready.then(function (c) {
      if (!c) return null;
      return c.auth.getUser().then(function (r) { return (r && r.data && r.data.user) || null; });
    });
  }

  function signInPassword(email, password) {
    return ready.then(function (c) {
      if (!c) throw new Error('Supabase not configured');
      return c.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) throw r.error;
        return r.data;
      });
    });
  }

  function signOut() { return ready.then(function (c) { return c ? c.auth.signOut() : null; }); }

  window.MC_SB = {
    ready: ready,
    get client() { return client; },
    configured: configured,
    currentUser: currentUser,
    signInPassword: signInPassword,
    signOut: signOut
  };
})();
