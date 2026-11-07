// Deliberately a blocking, local script: discard the URL credentials before
// imports, configuration reads or DOM work. Nothing from the link is persisted.
(() => {
  'use strict';
  const APPROVED_PROJECT = 'https://ncfovahpjofwrygxnbst.supabase.co';
  let rawFragment = window.location.hash;
  let rawQuery = window.location.search;
  let urlCleared = false;
  try {
    window.history.replaceState(null, '', window.location.pathname);
    urlCleared = !window.location.hash && !window.location.search;
  } catch { /* Do not handle credentials if the browser cannot remove them. */ }

  let fragment = new URLSearchParams(rawFragment.slice(1));
  let query = new URLSearchParams(rawQuery.slice(1));
  let accessToken = fragment.get('access_token') || '';
  const recovery = fragment.get('type') === 'recovery';
  const linkError = ['error','error_code','error_description'].some(key => fragment.has(key) || query.has(key));
  const malformed = rawFragment.length > 32768 || !/^[A-Za-z0-9._~+\/=-]{1,16384}$/.test(accessToken);
  // In particular, refresh_token and error_description are never retained.
  rawFragment = rawQuery = '';
  fragment = query = null;

  let client = null, verifiedUser = null, busy = false, alive = true;
  let form, fields, submit, notice;
  const domReady = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}))
    : Promise.resolve();

  function clearSecrets() {
    accessToken = '';
    form?.reset();
  }
  function state(title, message) {
    document.getElementById('account-title').textContent = title;
    document.getElementById('account-status').textContent = message;
    notice.textContent = '';
    notice.hidden = true;
  }
  function stop(title, message) {
    clearSecrets();
    form.hidden = true;
    fields.disabled = true;
    state(title, message);
  }
  function expired() {
    stop('This link is no longer valid.', 'It may have expired or already been used. Open Labwise to request a new confirmation or password-reset email, then use the newest link.');
  }
  function verificationFailure(error) {
    if (error?.status === 401 || error?.status === 403) expired();
    else stop('Could not verify this link.', 'Check your connection and request a new email link from Labwise. No account change was confirmed here.');
  }
  async function publicConfiguration(validateSyncConfig) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([(async () => {
        const response = await fetch('./sync-config.json', {signal:controller.signal, cache:'no-store', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer'});
        if (!response.ok) throw new Error('Configuration unavailable.');
        const config = validateSyncConfig(await response.json());
        if (!config.enabled || config.url !== APPROVED_PROJECT) throw new Error('Configuration unavailable.');
        return config;
      })(),new Promise((_,reject) => {timer=setTimeout(() => {controller.abort();reject(new Error('Configuration unavailable.'));},10000);})]);
    } finally { clearTimeout(timer); }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (busy || !alive) return;
    if (!accessToken || !verifiedUser || !recovery) { expired(); return; }
    notice.hidden = true;
    let newPassword = document.getElementById('new-password').value;
    if ([...newPassword].length < 12 || newPassword.length > 256) {
      notice.textContent = 'Use at least 12 characters for your new password.';
      notice.hidden = false;
      document.getElementById('new-password').focus();
      newPassword = '';
      return;
    }
    if (newPassword !== document.getElementById('confirm-password').value) {
      notice.textContent = 'The two passwords do not match. Please check them.';
      notice.hidden = false;
      document.getElementById('confirm-password').focus();
      newPassword = '';
      return;
    }
    busy = true;
    fields.disabled = true;
    submit.textContent = 'Saving password…';
    form.reset();
    try {
      const pending = client.updatePassword(accessToken,newPassword);
      newPassword = '';
      const updated = await pending;
      if (!alive) return;
      if (updated.id !== verifiedUser.id) throw new Error('Account update could not be confirmed.');
      let signedOut = true;
      try { await client.signOut(accessToken); }
      catch (error) { signedOut = error?.status === 401 || error?.status === 403; }
      if (!alive) return;
      stop('Password updated.', 'Return to Labwise on your original device and sign in with your new password.');
      if (!signedOut) {
        notice.textContent = 'The password update succeeded, but ending the temporary recovery session could not be confirmed. Close this tab after returning to Labwise.';
        notice.hidden = false;
      }
    } catch (error) {
      if (!alive) return;
      if (error?.status === 401 || error?.status === 403) expired();
      else if (error?.status === 400) {
        fields.disabled = false;
        notice.textContent = 'That password was not accepted. Choose a different password with at least 12 characters, or request a new reset link.';
        notice.hidden = false;
      } else {
        stop('Password update not confirmed.', 'The connection did not confirm the update. Return to Labwise and try your new password, or request another reset link.');
      }
    } finally {
      newPassword = '';
      form.reset();
      busy = false;
      submit.textContent = 'Save new password';
    }
  }

  async function initialize() {
    await domReady;
    form = document.getElementById('password-form');
    fields = document.getElementById('password-fields');
    submit = document.getElementById('update-password');
    notice = document.getElementById('account-notice');
    form.addEventListener('submit',changePassword);
    if (!urlCleared || window.top !== window.self) {
      stop('Open this link in a browser tab.', 'Use the newest email link in its own browser tab so Labwise can verify it safely.');
      return;
    }
    if (linkError) {
      stop('This link is no longer available.', 'The email link could not be verified. It may have expired or already been used. Request a new link from Labwise.');
      return;
    }
    if (malformed) {
      stop('Open your email link.', 'Open the newest confirmation or password-reset link from your Labwise email. You can request another one from Account in the app.');
      return;
    }
    let config, createSupabaseClient;
    try {
      const modules = await Promise.all([import('./sync-config.js'),import('./supabase-client.js')]);
      config = await publicConfiguration(modules[0].validateSyncConfig);
      createSupabaseClient = modules[1].createSupabaseClient;
    } catch {
      if (alive) stop('Email links are not ready here.', 'This site could not load its account configuration. Return to Labwise or ask its owner to finish email-link setup.');
      return;
    }
    if (!alive) return;
    try {
      // Empty redirectUrl is valid for a manually confirmed pilot. This page
      // needs only the validated public origin/key to check an existing token.
      client = createSupabaseClient({url:config.url,publishableKey:config.publishableKey});
      verifiedUser = await client.getUser(accessToken);
      if (!alive) return;
      if (recovery) {
        state('Choose a new password.', verifiedUser.email ? `Set a new password for ${verifiedUser.email}.` : 'Set a new password for your verified Labwise account.');
        form.hidden = false;
        fields.disabled = false;
      } else {
        stop('Your account link is verified.', 'Return to Labwise on your original device and sign in. This page has not signed the app in.');
      }
    } catch (error) { if (alive) verificationFailure(error); }
  }

  window.addEventListener('pagehide',() => {alive=false;clearSecrets();});
  window.addEventListener('hashchange',() => {
    // A same-tab fragment navigation does not reload scripts. Remove that new
    // credential too, without mixing it with a previous recovery operation.
    try { window.history.replaceState(null,'',window.location.pathname); } catch { /* Never use the new fragment. */ }
    alive=false;
    clearSecrets();
    if(form)stop('Open a new email link.', 'Request another link from Labwise and open it in a new browser tab.');
  });
  window.addEventListener('pageshow',event => {
    if (event.persisted && form) stop('Open your email link.', 'For your privacy, reopen the newest email link or request another one from Labwise.');
  });
  initialize().catch(() => {
    clearSecrets();
    if (form && alive) stop('Could not verify this link.', 'Return to Labwise and request a new email link.');
  });
})();
