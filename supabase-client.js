// Fetch-only Supabase adapter. Session persistence belongs to the caller;
// credentials are kept out of progress documents, backups and error messages.
export class SupabaseError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.status = status;
  }
}

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => new SupabaseError('invalid', message);
const malformed = () => new SupabaseError('server', 'The account service returned an unreadable response. Try again.');

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
  const expiresAt = Number.isFinite(value.expires_at) && value.expires_at > 0
    ? value.expires_at * 1000
    : Number.isFinite(value.expires_in) && value.expires_in > 0 ? Date.now() + value.expires_in * 1000 : NaN;
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
  if (status === 409) return new SupabaseError('conflict', 'Cloud progress changed. Fetch the latest progress and try again.', status);
  if (status === 401 || status === 403 || (authRequest && status >= 400 && status < 500 && status !== 429)) {
    const message = detail?.error_code === 'email_not_confirmed' || detail?.code === 'email_not_confirmed'
      ? 'Confirm your email before signing in.'
      : detail?.error_code === 'weak_password' || detail?.code === 'weak_password'
        ? 'Choose a stronger password and try again.'
        : 'Your account details or session could not be verified. Check your details and try again.';
    return new SupabaseError('auth', message, status);
  }
  if (status === 429) return new SupabaseError('server', 'Too many requests. Wait a little before trying again.', status);
  return new SupabaseError('server', 'The account service is unavailable. Try again later.', status);
}

function createRequest({ url, publishableKey, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const base = secureUrl(url, { originOnly: true });
  const key = publicKey(publishableKey);
  if (typeof fetchImpl !== 'function') throw invalid('This app needs browser networking to use account sync.');
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
  const redirect = options.redirectUrl === undefined ? undefined : secureUrl(options.redirectUrl);

  const withRedirect = path => redirect ? `${path}?redirect_to=${encodeURIComponent(redirect)}` : path;
  return Object.freeze({
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
