import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
const copy = value => typeof value === 'string' ? value.slice(0, 2000) : '';
const button = (label, action, {primary = false, disabled = false} = {}) => `<button type="button" class="btn account-button${primary ? ' primary' : ''}" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;

function lastSync(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 8640000000000000) return 'No completed sync yet';
  const iso = new Date(value).toISOString();
  return `<time datetime="${iso}">${iso.slice(0, 10)} at ${iso.slice(11, 16)} UTC</time>`;
}

function feedback(status, message) {
  const error = copy(status.error), information = copy(message);
  return `${error ? `<p class="account-notice account-error" role="alert">${esc(error)}</p>` : ''}${information ? `<p class="account-notice" role="status" aria-live="polite">${esc(information)}</p>` : ''}`;
}

function accountChoices(mode, disabled) {
  return `<nav class="account-modes" aria-label="Account options">${[
    ['signIn', 'Sign in', 'account-signin'],
    ['signUp', 'Create account', 'account-signup'],
    ['reset', 'Reset password', 'account-reset']
  ].map(([value, label, action]) => `<button type="button" data-action="${action}" aria-pressed="${mode === value}"${disabled ? ' disabled' : ''}>${label}</button>`).join('')}</nav>`;
}

function accountForm(mode, working, emailFlowsAvailable) {
  const signup = mode === 'signUp', reset = mode === 'reset';
  const title = reset ? 'Request a password reset' : signup ? 'Create your account' : 'Sign in to your account';
  const description = reset
    ? 'If an account uses that email, check your inbox privately for any reset instructions.'
    : signup
      ? 'Use an email address you can check privately. If confirmation is required, follow any instructions you receive before signing in.'
      : 'Bring your study progress to this phone and keep learning where you left off.';
  const submit = reset ? 'Request reset instructions' : signup ? 'Create account' : 'Sign in';
  return `<section class="account-card" aria-labelledby="account-form-title">
    ${emailFlowsAvailable ? accountChoices(mode, working) : ''}
    <h2 id="account-form-title">${title}</h2><p class="account-description" id="account-form-description">${description}</p>
    ${emailFlowsAvailable ? '' : '<p class="account-small account-pilot-note">For this pilot, sign in with a confirmed account. Public account creation and password reset will be available after email setup.</p>'}
    <form id="account-form" method="post" aria-describedby="account-form-description" aria-busy="${working}">
      <fieldset class="account-fields"${working ? ' disabled' : ''}>
        <legend class="account-sr">${title}</legend>
        <div class="account-field"><label for="account-email">Email address</label><input id="account-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="320" required></div>
        ${reset ? '' : `<div class="account-field"><label for="account-password">Password</label><input id="account-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}"${signup ? ' minlength="12"' : ''} maxlength="128" aria-describedby="account-password-help" required><p id="account-password-help" class="account-field-help">${signup ? 'Use at least 12 characters. A longer passphrase is welcome.' : 'Use your existing password.'}</p></div>`}
        <button type="submit" class="btn primary account-button account-submit">${working ? 'Please wait…' : submit}</button>
      </fieldset>
    </form>
    ${working ? '<p class="account-working" role="status" aria-live="polite">Working on your account…</p>' : ''}
    ${reset ? '<p class="account-small">Email delivery may take time. Follow any reset link privately, then return here to sign in.</p>' : ''}
  </section>`;
}

function syncDescription(status) {
  switch (status.phase) {
    case 'syncing': return ['Syncing your progress…', 'Your device copy stays available while we check for updates.'];
    case 'synced': return status.pending === true
      ? ['Changes are waiting to sync.', 'Keep studying. Your latest device changes will sync when connected.']
      : ['Progress is up to date.', 'New study progress syncs automatically when connected.'];
    case 'offline': return ['Study offline. Sync when connected.', 'Your device copy is available. Automatic sync will retry when the connection returns.'];
    case 'error': return ['Sync needs another try.', 'Keep studying on this device. Try Sync now when connected.'];
    case 'needsConfirmation': return ['Email confirmation is needed.', 'Check your inbox privately and follow any confirmation instructions you receive.'];
    default: return ['Your account is ready.', 'Your study progress stays on this device while account sync checks for updates.'];
  }
}

function signedIn(status, working, returnToDuel) {
  const [heading, description] = syncDescription(status);
  const syncing = status.phase === 'syncing';
  return `<section class="account-card account-signed-in" aria-labelledby="account-sync-title">
    <div class="account-identity"><span class="account-emblem" aria-hidden="true">${icon('check')}</span><div><p class="account-label">SIGNED IN</p>${status.user.email ? `<p class="account-address">${esc(status.user.email.slice(0, 320))}</p>` : '<p class="account-address">Your study account</p>'}</div></div>
    <div class="account-sync-status" role="status" aria-live="polite" aria-atomic="true"><h2 id="account-sync-title">${heading}</h2><p>${description}</p></div>
    <dl class="account-sync-meta"><div><dt>Last successful sync</dt><dd>${lastSync(status.lastSyncedAt)}</dd></div><div><dt>Device changes</dt><dd>${status.pending === true ? 'Waiting to sync' : 'None waiting to sync'}</dd></div></dl>
    <div class="account-actions">${button(syncing ? 'Syncing…' : 'Sync now', 'account-sync', {primary: true, disabled: working || syncing})}${button('Export progress', 'backup')}${button('Sign out', 'account-signout', {disabled: working})}</div>
    <p class="account-small">Signing out keeps a local copy of the current progress and stops automatic sync.</p>
    <div class="account-duel"><div><strong>${returnToDuel ? 'Your Friend Duel is next.' : 'A friendly round, when you’re ready.'}</strong><p>Use Play to create or join a private Friend Duel.</p></div>${button(returnToDuel ? 'Return to Friend Duel' : 'Open Friend Duel', 'duel-hub')}</div>
  </section>`;
}

function ownershipNote() {
  return `<aside class="account-guidance" aria-labelledby="account-guidance-title"><h2 id="account-guidance-title">Your progress belongs to you.</h2><ul>
    <li><strong>Your first sign-in</strong><span>Your own local study progress merges with this account’s progress.</span></li>
    <li><strong>Changing accounts</strong><span>Each person opens their own progress. Another account stays separate.</span></li>
    <li><strong>Keeping a copy</strong><span>Export progress before changing phones, clearing app data or uninstalling.</span></li>
  </ul>${button('Export progress backup', 'backup')}</aside>`;
}

/** Pure view: the host handles forms/actions, requests and transient credentials. */
export function renderAccount({status = {}, mode = 'signIn', busy = false, message = '', returnToDuel = false, emailFlowsAvailable = true} = {}) {
  const state = status && typeof status === 'object' ? status : {};
  const configured = state.configured === true;
  const user = state.user;
  const authenticated = configured && user && typeof user.id === 'string' && user.id.length > 0 && typeof user.email === 'string';
  const emailReady = emailFlowsAvailable === true;
  const selectedMode = emailReady && ['signIn', 'signUp', 'reset'].includes(mode) ? mode : 'signIn';
  const working = busy === true || (!authenticated && state.phase === 'syncing');
  const confirmation = emailReady && state.phase === 'needsConfirmation'
    ? '<p class="account-notice" role="status">Email confirmation is needed. Check your inbox privately and follow any confirmation instructions you receive, then return here to sign in. Delivery may take time.</p>'
    : '';
  const header = `<header class="account-header"><p class="eyebrow">YOUR STUDY SPACE</p><div class="account-title-row"><h1 tabindex="-1">${authenticated ? 'Your study account.' : 'Your progress, with you.'}</h1>${button('Back to Play', 'arcade-hub')}</div><p>An optional account keeps your study progress across phones. You can keep learning on this device without an account.</p></header>`;
  if (!configured) return `<div class="account-page">${header}${feedback(state, message)}<section class="account-card account-local" aria-labelledby="account-local-title"><span class="account-emblem" aria-hidden="true">${icon('saved')}</span><h2 id="account-local-title">Keep learning on this device.</h2><p>Account sync isn’t available in this build. Your questions, explanations and local progress are ready to use.</p><p>Export a progress backup to bring your work to another phone.</p><div class="account-actions">${button('Export progress backup', 'backup', {primary: true})}${button('Explore Play', 'arcade-hub')}</div></section></div>`;
  return `<div class="account-page">${header}${feedback(state, message)}${!authenticated && state.error ? `<div class="account-actions">${button('Clear saved sign-in', 'account-signout', {disabled: working})}</div>` : ''}${confirmation}${!authenticated && returnToDuel ? '<p class="account-notice">Sign in to create or join a Friend Duel. You can return to Play whenever you like.</p>' : ''}<div class="account-layout">${authenticated ? signedIn(state, busy === true, returnToDuel === true) : accountForm(selectedMode, working, emailReady)}${ownershipNote()}</div></div>`;
}
