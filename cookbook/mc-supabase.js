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
     MC_SB.sdkLoadFailed    true once `ready` settles if the local vendored
                             SDK file itself failed to load (very rare now
                             that it's same-origin -- almost always offline
                             before the app shell was ever installed)
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
  // Vendored locally (C-I3 / F-I2, VOC/VOA Kaizen audit) rather than fetched
  // from cdn.jsdelivr.net -- the CDN is cross-origin, so sw.js could never
  // precache it, and offline sign-in failed on every cold launch regardless
  // of prior visits. Same-origin, so the normal install-time precache covers
  // it. See supabase-vendor.js's own header for the pinned version.
  var SDK_URL = './supabase-vendor.js';

  var configured = /^https:\/\/[a-z0-9]+\.supabase\.co/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.indexOf('eyJ') === 0;
  var client = null;
  // Distinct from `configured` (a permanent, build-time state) -- this is
  // set only when the SDK itself failed to load, almost always because the
  // device is offline. mc-account.js reads it to show "sign-in needs a
  // connection" instead of a misleading generic error.
  var sdkLoadFailed = false;

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
      }).catch(function (e) { sdkLoadFailed = true; console.warn('[MC_SB]', e && e.message); return null; });

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

  // callFunction(name, body) — invoke a Supabase Edge Function and resolve
  // with its parsed JSON body in every case where one exists, success or
  // failure alike (e.g. fetch-recipe-source's own {ok:false, error:"..."}
  // shape), rather than only resolving on 2xx. supabase-js's own
  // functions.invoke() only populates `data` on success; a non-2xx response
  // surfaces as a FunctionsHttpError whose real Response body lives on
  // `error.context`, so read that instead of just throwing a generic
  // "Edge Function returned a non-2xx status code" past the caller. Only
  // rejects for something that truly isn't a structured response at all —
  // no network, no client, or a body that isn't valid JSON either way.
  function callFunction(name, body) {
    return ready.then(function (c) {
      if (!c) throw new Error('not_configured');
      return c.functions.invoke(name, { body: body }).then(function (r) {
        if (!r.error) return r.data;
        var ctx = r.error && r.error.context;
        if (ctx && typeof ctx.json === 'function') return ctx.json();
        throw r.error;
      });
    });
  }

  window.MC_SB = {
    ready: ready,
    get client() { return client; },
    configured: configured,
    get sdkLoadFailed() { return sdkLoadFailed; },
    currentUser: currentUser,
    signInPassword: signInPassword,
    signOut: signOut,
    callFunction: callFunction
  };
})();
