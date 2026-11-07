// Public client configuration only; never include a privileged Supabase key.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => { throw new Error(message); };

function publicKey(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 4096) invalid('Use a public Supabase publishable key or legacy anon key.');
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return value;
  try {
    const parts = value.split('.');
    if (parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) {
      const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
      if (object(payload) && payload.role === 'anon') return value;
    }
  } catch { /* Never echo submitted keys in validation errors. */ }
  invalid('Use a public Supabase publishable key or legacy anon key. Secret and service-role keys cannot be used in the app.');
}

function https(value, originOnly) {
  if (typeof value !== 'string' || value !== value.trim()) invalid('The account service needs a valid HTTPS URL.');
  let url;
  try { url = new URL(value); } catch { invalid('The account service needs a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash
    || (originOnly && (url.port || url.pathname !== '/' || url.search || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
      || (value !== url.origin && value !== `${url.origin}/`)))) {
    invalid(originOnly ? 'Use the HTTPS project.supabase.co origin without credentials, a path, a port, a query or a fragment.' : 'Use an HTTPS redirect URL without credentials or a fragment.');
  }
  return originOnly ? url.origin : url.href;
}

export function validateSyncConfig(value = {}) {
  if (!object(value) || (value.enabled !== undefined && typeof value.enabled !== 'boolean')) invalid('The account sync configuration is invalid.');
  const enabled = value.enabled === true;
  const url = value.url === undefined || value.url === '' ? '' : https(value.url, true);
  const publishableKey = value.publishableKey === undefined || value.publishableKey === '' ? '' : publicKey(value.publishableKey);
  const redirectUrl = value.redirectUrl === undefined || value.redirectUrl === '' ? '' : https(value.redirectUrl, false);
  if (enabled && (!url || !publishableKey)) invalid('Account sync needs a public project URL and publishable key.');
  return Object.freeze({enabled, url, publishableKey, redirectUrl});
}
