import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseClient, SupabaseError } from '../supabase-client.js';

const URL = 'https://project.supabase.co';
const KEY = 'sb_publishable_browser_example';
const CALLBACK = 'https://labwise.example/auth-callback.html';
const authResult = (overrides = {}) => ({
  access_token: 'access-one', refresh_token: 'refresh-one', expires_at: 2000000000,
  user: { id: 'user-one', email: 'learner@example.com', app_metadata: { role: 'ignored' } },
  ...overrides,
});
const doc = { version: 1 };
const remote = (overrides = {}) => ({ accepted: true, revision: 1, document: doc, updatedAt: '2026-11-07T10:00:00+00:00', ...overrides });
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

function mock(responses, options = {}) {
  const calls = [];
  const client = createSupabaseClient({
    url: URL, publishableKey: KEY, redirectUrl: CALLBACK, ...options,
    fetch: async (url, request) => {
      calls.push({ url, ...request, parsed: request.body === undefined ? undefined : JSON.parse(request.body) });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(url, request);
      assert.ok(next, 'unexpected provider request');
      return next;
    },
  });
  return { client, calls };
}

test('sign-in normalizes only the session fields needed by the app and uses the public key header', async () => {
  const { client, calls } = mock([reply(authResult())]);
  assert.deepEqual(await client.signIn(' learner@example.com ', 'keep this password '), {
    accessToken: 'access-one', refreshToken: 'refresh-one', expiresAt: 2000000000000,
    user: { id: 'user-one', email: 'learner@example.com' },
  });
  assert.equal(calls[0].url, `${URL}/auth/v1/token?grant_type=password`);
  assert.deepEqual(calls[0].parsed, { email: 'learner@example.com', password: 'keep this password ' });
  assert.deepEqual(calls[0].headers, { apikey: KEY, Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.equal(calls[0].credentials, 'omit');
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].referrerPolicy, 'no-referrer');
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(JSON.stringify(client).includes(KEY), false);
});

test('signup supports email confirmation and immediate sessions without disclosing existing-account details', async () => {
  const { client, calls } = mock([
    reply({ id: 'obfuscated', email: 'learner@example.com', identities: [] }),
    reply(authResult()),
  ]);
  assert.deepEqual(await client.signUp('learner@example.com', 'password1'), { session: null, requiresEmailConfirmation: true });
  const signedUp = await client.signUp('learner@example.com', 'password1');
  assert.equal(signedUp.requiresEmailConfirmation, false);
  assert.equal(signedUp.session.user.id, 'user-one');
  assert.equal(calls[0].url, `${URL}/auth/v1/signup?redirect_to=${encodeURIComponent(CALLBACK)}`);
});

test('refresh uses each rotating refresh token once and supports expires_in', async () => {
  const { client, calls } = mock([reply(authResult({ refresh_token: 'refresh-two', expires_at: undefined, expires_in: 3600 }))]);
  const before = Date.now();
  const result = await client.refresh('refresh-one');
  assert.equal(result.refreshToken, 'refresh-two');
  assert.ok(result.expiresAt >= before + 3600000 && result.expiresAt <= Date.now() + 3600000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${URL}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(calls[0].parsed, { refresh_token: 'refresh-one' });
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('recovery sends an explicit callback and updates the password only with a user session', async () => {
  const { client, calls } = mock([reply({}), reply(authResult().user)]);
  assert.deepEqual(await client.resetPassword('learner@example.com'), { ok: true });
  assert.deepEqual(await client.updatePassword('recovery-token', 'new password'), { id: 'user-one', email: 'learner@example.com' });
  assert.equal(calls[0].url, `${URL}/auth/v1/recover?redirect_to=${encodeURIComponent(CALLBACK)}`);
  assert.deepEqual(calls[0].parsed, { email: 'learner@example.com' });
  assert.equal(calls[1].method, 'PUT');
  assert.equal(calls[1].url, `${URL}/auth/v1/user`);
  assert.equal(calls[1].headers.Authorization, 'Bearer recovery-token');
  assert.deepEqual(calls[1].parsed, { password: 'new password' });
});

test('getUser verifies the session and signout revokes only the current device session', async () => {
  const { client, calls } = mock([reply(authResult().user), reply(null, 204)]);
  assert.deepEqual(await client.getUser('access-one'), { id: 'user-one', email: 'learner@example.com' });
  assert.deepEqual(await client.signOut('access-one'), { ok: true });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[1].url, `${URL}/auth/v1/logout?scope=local`);
  for (const call of calls) assert.equal(call.headers.Authorization, 'Bearer access-one');
});

test('progress RPCs never include an owner ID or account credentials in their bodies', async () => {
  const { client, calls } = mock([
    reply(remote({ revision: 0, document: null, updatedAt: null })),
    reply(remote()),
  ]);
  assert.deepEqual(await client.readProgress('access-one'), { accepted: true, revision: 0, document: null, updatedAt: null });
  assert.equal((await client.writeProgress('access-one', 0, doc)).revision, 1);
  assert.equal(calls[0].url, `${URL}/rest/v1/rpc/labwise_read_progress`);
  assert.deepEqual(calls[0].parsed, {});
  assert.equal(calls[1].url, `${URL}/rest/v1/rpc/labwise_write_progress`);
  assert.deepEqual(calls[1].parsed, { expected_revision: 0, document: doc });
  for (const call of calls) {
    assert.equal(call.headers.apikey, KEY);
    assert.equal(call.headers.Authorization, 'Bearer access-one');
    assert.equal(call.body.includes('access-one'), false);
    assert.equal(call.body.includes('refresh-one'), false);
    assert.equal(call.body.includes('user_id'), false);
  }
});

test('revision conflicts return the current server document and never retry a stale write', async () => {
  const current = { version: 1, state: { saved: ['another-device-question'] } };
  const { client, calls } = mock([reply(remote({ accepted: false, revision: 2, document: current }))]);
  const result = await client.writeProgress('access-one', 1, doc);
  assert.equal(result.accepted, false);
  assert.equal(result.revision, 2);
  assert.deepEqual(result.document, current);
  assert.equal(calls.length, 1);
});

test('HTTP auth errors and malformed outage responses cannot expose secrets or server internals', async () => {
  const secretDetail = 'password1 access-one refresh-one INTERNAL SQL /private';
  const { client } = mock([
    reply({ message: secretDetail }, 401),
    { ok: false, status: 503, json: async () => { throw Error(secretDetail); } },
    reply({ error_code: 'email_not_confirmed', message: secretDetail }, 400),
  ]);
  await assert.rejects(client.signIn('learner@example.com', 'password1'), error => {
    assert.equal(error.code, 'auth');
    assert.equal(error.status, 401);
    assert.equal(JSON.stringify(error).includes('password1'), false);
    assert.equal(error.message.includes(secretDetail), false);
    return true;
  });
  await assert.rejects(client.readProgress('access-one'), { code: 'server', status: 503 });
  await assert.rejects(client.signIn('learner@example.com', 'password1'), /Confirm your email/);
});

test('network failure remains retryable and does not retry rotating credentials automatically', async () => {
  const { client, calls } = mock([new Error('Sensitive request body refresh-one')]);
  await assert.rejects(client.refresh('refresh-one'), error => {
    assert.equal(error.code, 'network');
    assert.equal(error.message.includes('refresh-one'), false);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('timeout aborts a hanging provider and does not leave the caller waiting indefinitely', async () => {
  let signal;
  const { client, calls } = mock([(_url, options) => { signal = options.signal; return new Promise(() => {}); }], { timeoutMs: 15 });
  await assert.rejects(client.writeProgress('access-one', 0, doc), { code: 'timeout' });
  assert.equal(signal.aborted, true);
  assert.equal(calls.length, 1);
});

test('timeout covers a hanging response body as well as the initial fetch', async () => {
  const { client } = mock([{ ok: true, status: 200, json: () => new Promise(() => {}) }], { timeoutMs: 15 });
  await assert.rejects(client.getUser('access-one'), { code: 'timeout' });
});

test('malformed auth sessions and incompatible progress responses fail without data loss', async () => {
  for (const bad of [authResult({ user: null }), authResult({ refresh_token: '' }), authResult({ expires_at: 0 })]) {
    const { client } = mock([reply(bad)]);
    await assert.rejects(client.refresh('refresh-one'), { code: 'server' });
  }
  for (const bad of [remote({ revision: -1 }), remote({ document: { version: 2 } }), remote({ updatedAt: 'bad date' }), remote({ document: null }), remote({ accepted: undefined })]) {
    const { client } = mock([reply(bad)]);
    await assert.rejects(client.readProgress('access-one'), { code: 'server' });
  }
});

test('only public keys are accepted and HTTPS prevents accidental token transmission over plaintext', () => {
  const legacy = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.doesNotThrow(() => createSupabaseClient({ url: URL, publishableKey: legacy('anon'), fetch() {} }));
  for (const publishableKey of ['sb_secret_privileged', legacy('service_role'), 'unknown-key', '']) {
    assert.throws(() => createSupabaseClient({ url: URL, publishableKey, fetch() {} }), { code: 'invalid' });
  }
  for (const url of ['http://project.supabase.co', 'https://user:password@project.supabase.co', `${URL}/path`, `${URL}?key=value`, `${URL}#token`, 'not a URL']) {
    assert.throws(() => createSupabaseClient({ url, publishableKey: KEY, fetch() {} }), { code: 'invalid' });
  }
  assert.doesNotThrow(() => createSupabaseClient({ url: 'http://127.0.0.1:54321', publishableKey: KEY, fetch() {} }));
});

test('bad revisions and oversized or incompatible documents never make a network request', async () => {
  const { client, calls } = mock([]);
  for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(client.writeProgress('access-one', revision, doc), { code: 'invalid' });
  for (const document of [[], { version: 2 }, { version: 1, oversized: 'é'.repeat(4 * 1024 * 1024) }]) await assert.rejects(client.writeProgress('access-one', 0, document), { code: 'invalid' });
  await assert.rejects(client.readProgress('bad\nheader'), { code: 'invalid' });
  await assert.rejects(client.readProgress(undefined), { code: 'invalid' });
  await assert.rejects(client.getUser(''), { code: 'invalid' });
  assert.equal(calls.length, 0);
});

test('HTTP conflict and rate limiting have fixed errors with no echoed response details', async () => {
  const { client } = mock([reply({ message: 'private' }, 409), reply({ message: 'private' }, 429)]);
  await assert.rejects(client.writeProgress('access-one', 1, doc), { code: 'conflict', status: 409 });
  await assert.rejects(client.resetPassword('learner@example.com'), error => error instanceof SupabaseError && error.code === 'server' && !error.message.includes('private'));
});
