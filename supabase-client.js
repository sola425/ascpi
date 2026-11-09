// Fetch-only Supabase adapter. Session persistence belongs to the caller;
// credentials are kept out of progress documents, backups and error messages.
export class SupabaseError extends Error {
  constructor(code, message, status = 0, reason = '') {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.status = status;
    if (reason) this.reason = reason;
  }
}

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => new SupabaseError('invalid', message);
const malformed = () => new SupabaseError('server', 'The account service returned an unreadable response. Try again.');

// Fixed diagnostics only: never copy provider messages, SQL or credentials.
const ACCOUNT_ERRORS = Object.freeze({
  invalid_credentials: 'The email or password did not match. Check both and try again.',
  email_not_confirmed: 'Confirm your email before signing in. For this pilot, the app owner can confirm your account in Supabase.',
  weak_password: 'Choose a stronger password and try again.',
  invalid_api_key: 'This app’s account connection needs an update. Install the latest app or ask the app owner to check its public project key.',
  email_disabled: 'Email sign-in is not enabled for this app. Ask the app owner to enable it.',
  backend_setup: 'Sign-in worked, but progress sync is not set up on the account service. Ask the app owner to finish the sync setup.',
  backend_permissions: 'The account service refused progress access. Ask the app owner to check the sync permissions.',
  project_unavailable: 'The account project is unavailable or paused. Ask the app owner to check its Supabase dashboard.',
  rate_limited: 'Too many account requests. Wait a little before trying again.',
  webview_outdated: 'This device’s web component is too old for account sign-in. Update Android System WebView or Chrome, then reopen Labwise.'
});
export function accountErrorDetails(error) {
  const reason = typeof error?.reason === 'string' && Object.prototype.hasOwnProperty.call(ACCOUNT_ERRORS, error.reason) ? error.reason : null;
  return reason ? {code: reason, message: ACCOUNT_ERRORS[reason]} : null;
}

function secureUrl(value, { originOnly = false } = {}) {
  let parsed;
  try { parsed = new URL(value); } catch { throw invalid('Enter a valid HTTPS account service URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) || parsed.username || parsed.password || parsed.hash || (originOnly && (parsed.pathname !== '/' || parsed.search))) {
    throw invalid('Use an HTTPS account service URL without credentials, a query or a fragment.');
  }
  return originOnly ? parsed.origin : parsed.href;
}

function publicKey(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) throw invalid('A public Supabase publishable key is required.');
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return value;
  // Legacy anon JWT keys are public too. Decode only to reject accidental
  // privileged keys; Supabase, not this check, verifies the key's signature.
  try {
    const parts = value.split('.');
    if (parts.length === 3) {
      const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
      if (payload.role === 'anon') return value;
    }
  } catch { /* Report only a fixed message; never include a submitted key. */ }
  throw invalid('Use the public publishable key or legacy anon key. Secret and service-role keys must never be used in the app.');
}

function token(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._~+\/=-]+$/.test(value)) throw invalid('A valid account session is required.');
  return value;
}

function email(value) {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw invalid('Enter a valid email address.');
  return value.trim();
}

function password(value) {
  if (typeof value !== 'string' || !value.length) throw invalid('Enter your password.');
  return value;
}

function user(value) {
  if (!object(value) || typeof value.id !== 'string' || !value.id) throw malformed();
  return { id: value.id, email: typeof value.email === 'string' ? value.email : '' };
}

function session(value) {
  if (!object(value) || typeof value.access_token !== 'string' || !value.access_token || typeof value.refresh_token !== 'string' || !value.refresh_token) throw malformed();
  // GoTrue supplies a duration as well as server wall-clock expiry. Use the
  // duration on this device so a tablet with a skewed clock does not refresh
  // its newly issued session repeatedly before its first progress request.
  const expiresAt = Number.isFinite(value.expires_in) && value.expires_in > 0
    ? Date.now() + value.expires_in * 1000
    : Number.isFinite(value.expires_at) && value.expires_at > 0 ? value.expires_at * 1000 : NaN;
  if (!Number.isSafeInteger(expiresAt)) throw malformed();
  return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt, user: user(value.user) };
}

function documentJson(value) {
  if (!object(value) || value.version !== 1) throw invalid('The progress document must use version 1.');
  let serialized;
  try { serialized = JSON.stringify(value); } catch { throw invalid('The progress document could not be encoded.'); }
  if (new TextEncoder().encode(serialized).byteLength > MAX_DOCUMENT_BYTES) throw invalid('Cloud progress must be under 8 MiB. Export a local backup to keep a copy.');
  return serialized;
}

function progress(value) {
  if (!object(value) || typeof value.accepted !== 'boolean' || !Number.isSafeInteger(value.revision) || value.revision < 0 || (value.document === null ? value.revision !== 0 : !object(value.document))) throw malformed();
  if (value.document !== null) {
    try { documentJson(value.document); } catch { throw malformed(); }
  }
  if (value.updatedAt !== null && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) throw malformed();
  if ((value.revision === 0) !== (value.updatedAt === null)) throw malformed();
  return { accepted: value.accepted, revision: value.revision, document: value.document, updatedAt: value.updatedAt };
}

function responseError(status, detail, authRequest) {
  const reason = typeof detail?.error_code === 'string' ? detail.error_code : typeof detail?.code === 'string' ? detail.code : '';
  const message = typeof detail?.message === 'string' ? detail.message : '';
  if (/^invalid api key\b/i.test(message) || ['invalid_api_key', 'invalid_apikey', 'no_api_key'].includes(reason)) return new SupabaseError('configuration', ACCOUNT_ERRORS.invalid_api_key, status, 'invalid_api_key');
  if (['email_provider_disabled', 'email_disabled'].includes(reason)) return new SupabaseError('configuration', ACCOUNT_ERRORS.email_disabled, status, 'email_disabled');
  if (!authRequest && ['PGRST202', '42883'].includes(reason)) return new SupabaseError('backend_setup', ACCOUNT_ERRORS.backend_setup, status, 'backend_setup');
  if (!authRequest && reason === '42501') return new SupabaseError('backend_setup', ACCOUNT_ERRORS.backend_permissions, status, 'backend_permissions');
  if (status >= 500 && /^.*project (?:is )?paused\b/i.test(message)) return new SupabaseError('server', ACCOUNT_ERRORS.project_unavailable, status, 'project_unavailable');
  if (status === 409) return new SupabaseError('conflict', 'Cloud progress changed. Fetch the latest progress and try again.', status);
  if (status === 401 || status === 403 || (authRequest && status >= 400 && status < 500 && status !== 429)) {
    const known = ['email_not_confirmed', 'weak_password', 'invalid_credentials'].includes(reason) ? reason : '';
    return new SupabaseError('auth', known ? ACCOUNT_ERRORS[known] : 'Your account details or session could not be verified. Check your details and try again.', status, known);
  }
  if (status === 429) return new SupabaseError('server', ACCOUNT_ERRORS.rate_limited, status, 'rate_limited');
  return new SupabaseError('server', 'The account service is unavailable. Try again later.', status);
}

function createRequest({ url, publishableKey, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const base = secureUrl(url, { originOnly: true });
  const key = publicKey(publishableKey);
  if (typeof fetchImpl !== 'function') throw invalid('This app needs browser networking to use account sync.');
  if (typeof globalThis.AbortController !== 'function' || typeof globalThis.TextEncoder !== 'function') throw new SupabaseError('compatibility', ACCOUNT_ERRORS.webview_outdated, 0, 'webview_outdated');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) throw invalid('The account request timeout is invalid.');

  async function request(path, { method = 'POST', body, accessToken, authRequest = false } = {}) {
    const controller = new AbortController();
    const headers = { apikey: key, Accept: 'application/json' };
    if (accessToken !== undefined) headers.Authorization = `Bearer ${token(accessToken)}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let timer;
    let timedOut = false;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new SupabaseError('timeout', 'The account service took too long. Try again.'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([(async () => {
        const response = await fetchImpl(`${base}${path}`, {
          method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal, credentials: 'omit', cache: 'no-store',
          redirect: 'error', referrerPolicy: 'no-referrer',
        });
        if (!response || typeof response.ok !== 'boolean') throw malformed();
        if (!response.ok) {
          let detail = null;
          try { detail = await response.json(); } catch { /* Fixed error messages also handle HTML outage pages. */ }
          throw responseError(response.status, detail, authRequest);
        }
        if (response.status === 204) return null;
        try { return await response.json(); } catch { throw malformed(); }
      })(), deadline]);
    } catch (error) {
      if (timedOut) throw new SupabaseError('timeout', 'The account service took too long. Try again.');
      if (error instanceof SupabaseError) throw error;
      throw new SupabaseError('network', 'The account service could not be reached. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
  }
  return request;
}

// Share the same authenticated transport with features that have their own
// fixed RPC whitelist. No raw server errors or credential persistence escape it.
export function createSupabaseRpcCaller(options, allowedNames) {
  const request = createRequest(options);
  const allowed = new Set(allowedNames);
  return async (name, accessToken, body = {}) => {
    if (!allowed.has(name) || !/^labwise_[a-z_]+$/.test(name)) throw invalid('This account operation is unavailable.');
    return request(`/rest/v1/rpc/${name}`, { accessToken: token(accessToken), body });
  };
}

/**
 * expiresAt is a Unix timestamp in milliseconds. No retries are automatic:
 * refresh tokens rotate, and a timed-out write may already have committed.
 */
export function createSupabaseClient(options = {}) {
  const request = createRequest(options);
  const redirect = options.redirectUrl === undefined || options.redirectUrl === '' ? undefined : secureUrl(options.redirectUrl);

  const withRedirect = path => redirect ? `${path}?redirect_to=${encodeURIComponent(redirect)}` : path;
  return Object.freeze({
    async checkConnection() {
      const result = await request('/auth/v1/settings', {method: 'GET'});
      if (!object(result) || !object(result.external) || typeof result.external.email !== 'boolean') throw malformed();
      return {emailEnabled: result.external.email};
    },
    async signIn(address, secret) {
      return session(await request('/auth/v1/token?grant_type=password', { body: { email: email(address), password: password(secret) }, authRequest: true }));
    },
    async signUp(address, secret) {
      const result = await request(withRedirect('/auth/v1/signup'), { body: { email: email(address), password: password(secret) }, authRequest: true });
      if (object(result) && result.access_token) return { session: session(result), requiresEmailConfirmation: false };
      // GoTrue returns a user object when confirmation is enabled, including
      // an obfuscated user for an existing address. Do not expose that detail.
      if (!object(result) || !object(result.user ?? result) || typeof (result.user ?? result).id !== 'string') throw malformed();
      return { session: null, requiresEmailConfirmation: true };
    },
    async resetPassword(address) {
      await request(withRedirect('/auth/v1/recover'), { body: { email: email(address) }, authRequest: true });
      return { ok: true };
    },
    async updatePassword(accessToken, secret) {
      const result = await request('/auth/v1/user', { method: 'PUT', accessToken: token(accessToken), body: { password: password(secret) }, authRequest: true });
      return user(result);
    },
    async refresh(refreshToken) {
      return session(await request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: token(refreshToken) }, authRequest: true }));
    },
    async getUser(accessToken) {
      return user(await request('/auth/v1/user', { method: 'GET', accessToken: token(accessToken), authRequest: true }));
    },
    async signOut(accessToken) {
      await request('/auth/v1/logout?scope=local', { accessToken: token(accessToken), authRequest: true });
      return { ok: true };
    },
    async readProgress(accessToken) {
      return progress(await request('/rest/v1/rpc/labwise_read_progress', { accessToken: token(accessToken), body: {} }));
    },
    async writeProgress(accessToken, expectedRevision, document) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw invalid('The cloud progress revision is invalid.');
      documentJson(document);
      return progress(await request('/rest/v1/rpc/labwise_write_progress', { accessToken: token(accessToken), body: { expected_revision: expectedRevision, document } }));
    },
  });
}
