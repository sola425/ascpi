import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTH_STORAGE_KEY, createSyncController} from '../sync.js';
import {validateSyncConfig} from '../sync-config.js';
import {blankSyncDocument, captureProgress} from '../sync-model.js';
import {blankGame, startRun, answerRun, nextRun} from '../game.js';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const config = {enabled: true, url: 'https://abcdefghijklmnopqrst.supabase.co', publishableKey: 'sb_publishable_public-test'};
const copy = value => JSON.parse(JSON.stringify(value));
const blank = () => ({records: {}, saved: [], log: [], reading: {}, prefs: {sessionSize: 10, fontScale: 1}, goal: 10});
const record = extra => ({due: NOW, stage: 1, reviews: 1, correct: true, at: NOW, reviewedAt: NOW, ...extra});
const coded = code => Object.assign(new Error('Untrusted server error containing private-token private-password'), {code});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function memoryStorage() {
  const values = new Map();
  return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
}
function backend() {
  const rows = new Map(), tokens = new Map(), refreshes = new Map(), calls = [];
  let sequence = 0;
  const server = {rows, calls, clock: NOW, offline: false, conflicts: 0, onRead: null, onWrite: null, onRefresh: null, failSignOut: false};
  function issue(uid) {
    const n = ++sequence, accessToken = `access-${uid}-${n}`, refreshToken = `refresh-${uid}-${n}`;
    tokens.set(accessToken, uid); refreshes.set(refreshToken, uid);
    return {accessToken, refreshToken, expiresAt: server.clock + 3600000, user: {id: uid, email: `${uid}@example.test`}};
  }
  function uidOf(token) { if (!tokens.has(token)) throw coded('auth'); return tokens.get(token); }
  function response(uid, accepted = true) {
    const row = rows.get(uid);
    return {accepted, revision: row?.revision ?? 0, document: row ? copy(row.document) : null, updatedAt: row ? new Date(server.clock).toISOString() : null};
  }
  server.client = {
    async signIn(email) { calls.push({method: 'signIn'}); return issue(email.split('@')[0]); },
    async signUp(email) { calls.push({method: 'signUp'}); return server.confirmEmail ? {session: null, requiresEmailConfirmation: true} : {session: issue(email.split('@')[0]), requiresEmailConfirmation: false}; },
    async resetPassword() { calls.push({method: 'resetPassword'}); return {ok: true}; },
    async getUser(token) { const uid = uidOf(token); calls.push({method: 'getUser', uid}); if (server.offline) throw coded('network'); return {id: uid, email: `${uid}@example.test`}; },
    async refresh(token) {
      calls.push({method: 'refresh'});
      if (server.offline) throw coded('network');
      if (!refreshes.has(token)) throw coded('auth');
      const uid = refreshes.get(token); refreshes.delete(token);
      const next = issue(uid);
      if (server.onRefresh) await server.onRefresh(next);
      return next;
    },
    async signOut(token) { calls.push({method: 'signOut', uid: uidOf(token)}); if (server.failSignOut) throw coded('network'); return {ok: true}; },
    async readProgress(token) {
      const uid = uidOf(token); calls.push({method: 'read', uid});
      if (server.offline) throw coded('network');
      const result = response(uid);
      if (server.onRead) await server.onRead(uid);
      return result;
    },
    async writeProgress(token, revision, document) {
      const uid = uidOf(token); calls.push({method: 'write', uid, revision, document: copy(document)});
      if (server.offline) throw coded('network');
      if (server.onWrite) await server.onWrite(uid, document);
      if ((rows.get(uid)?.revision ?? 0) !== revision) { server.conflicts++; return response(uid, false); }
      rows.set(uid, {revision: revision + 1, document: copy(document)});
      return response(uid);
    },
  };
  return server;
}
function phone(server, options = {}) {
  let progress = copy(options.progress ?? blank());
  const storage = options.storage ?? memoryStorage(), statuses = [], replacements = [];
  const controller = createSyncController({config, storage, getProgress: () => progress,
    setProgress: (next, details) => { progress = next; replacements.push(details); return options.onSave?.(next, details) ?? true; },
    now: () => server.clock, clientFactory: () => server.client, onStatus: status => statuses.push(status),
    debounceMs: 60000, pollMs: 60000, ...options});
  return {controller, storage, statuses, replacements, get progress() { return progress; },
    mutate(action, explicitBefore = true) { const before = copy(progress); action(progress); return controller.localChanged(explicitBefore ? before : undefined, progress); },
    async login(uid = 'a', settings) { assert.equal((await controller.signIn(`${uid}@example.test`, 'test-password', settings)).ok, true); return controller.syncNow(); }};
}

test('public configuration accepts publishable/anon keys and rejects privileged keys or unsafe origins', () => {
  assert.equal(validateSyncConfig(config).url, config.url);
  assert.equal(validateSyncConfig({enabled: false, url: '', publishableKey: ''}).enabled, false);
  const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
  assert.equal(validateSyncConfig({...config, publishableKey: jwt('anon')}).publishableKey, jwt('anon'));
  for (const publishableKey of ['sb_secret_private', jwt('service_role'), 'password', ' sb_publishable_public']) {
    assert.throws(() => validateSyncConfig({...config, publishableKey}), /public|Secret/);
  }
  for (const url of ['http://abcdefghijklmnopqrst.supabase.co', `${config.url}/path`, `${config.url}?x=1`, `${config.url}#fragment`, 'https://user:pass@abcdefghijklmnopqrst.supabase.co', 'https://other.example.test', `${config.url}:444`, `${config.url}/../`]) {
    assert.throws(() => validateSyncConfig({...config, url}), /HTTPS|origin/);
  }
  assert.throws(() => validateSyncConfig({...config, redirectUrl: 'http://example.test/callback'}), /HTTPS/);
  assert.equal(validateSyncConfig({...config, redirectUrl: 'https://example.test/callback?app=1'}).redirectUrl, 'https://example.test/callback?app=1');
});

test('missing, disabled, invalid and signed-out configurations make no account requests', async t => {
  for (const value of [undefined, {}, {enabled: false}, {enabled: true}, {...config, publishableKey: 'sb_secret_private'}, config]) {
    const server = backend(), p = phone(server, {config: value}); t.after(() => p.controller.stop());
    await p.controller.init();
    p.mutate(progress => progress.saved.push('q1'));
    await p.controller.syncNow();
    assert.deepEqual(server.calls, []);
    assert.equal(p.controller.getStatus().user, null);
  }
});

test('two offline phones merge concurrent edits, tombstones and independent history without duplication', async t => {
  const server = backend();
  const seed = {...blank(), records: {q1: record()}, saved: ['q1']};
  const a = phone(server, {progress: seed}), b = phone(server); t.after(() => { a.controller.stop(); b.controller.stop(); });
  await a.login(); await b.login();
  server.offline = true;
  a.mutate(progress => { progress.saved = []; progress.records.q1.reviews++; progress.records.q1.correct = false; progress.records.q1.at++; progress.log.push({id: 'q1', at: NOW + 1, correct: false, kind: 'answer'}); });
  b.mutate(progress => { progress.saved.push('q2'); progress.records.q1.reviews++; progress.records.q1.lastRecallRating = 'good'; progress.records.q1.lastRecallAt = NOW + 2; progress.log.push({id: 'q1', at: NOW + 2, correct: true, kind: 'review'}); });
  await Promise.all([a.controller.syncNow(), b.controller.syncNow()]);
  assert.equal(a.controller.getStatus().phase, 'offline');
  assert.equal(a.controller.getStatus().pending, true);
  server.offline = false;
  await Promise.all([a.controller.syncNow(), b.controller.syncNow()]);
  await a.controller.syncNow(); await b.controller.syncNow();
  assert.deepEqual(a.progress.cloud, b.progress.cloud);
  assert.deepEqual(a.progress.saved, ['q2']);
  assert.equal(a.progress.records.q1.reviews, 3);
  assert.equal(a.progress.records.q1.correct, false);
  assert.equal(a.progress.records.q1.lastRecallRating, 'good');
  assert.equal(a.progress.log.length, 2);
  assert.equal(new Set(a.progress.log.map(event => event.eventId)).size, 2);
  assert.ok(server.conflicts >= 1);
  await Promise.all([a.controller.syncNow(), b.controller.syncNow()]);
  assert.equal(a.progress.log.length, 2);
  assert.equal(a.controller.getStatus().pending, false);
});

test('edits captured while a revision write is in flight are merged and flushed', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login();
  const entered = deferred(), release = deferred();
  let delayed = false;
  server.onWrite = async () => { if (!delayed) { delayed = true; entered.resolve(); await release.promise; } };
  p.mutate(progress => { progress.saved.push('first'); });
  const syncing = p.controller.syncNow();
  await entered.promise;
  p.mutate(progress => { progress.saved.push('during-write'); progress.log.push({id: 'second', at: NOW + 10, kind: 'answer', correct: true}); }, false);
  release.resolve();
  assert.equal((await syncing).ok, true);
  assert.deepEqual(p.progress.saved, ['during-write', 'first']);
  assert.equal(Object.keys(server.rows.get('a').document.events).length, 1);
  assert.equal(p.controller.getStatus().pending, false);
});

test('revision conflicts retry at most five writes and preserve queued edits', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login();
  const realWrite = server.client.writeProgress;
  let attempts = 0;
  server.client.writeProgress = async (token, revision, document) => {
    attempts++;
    const row = server.rows.get('a'); row.revision++;
    return {accepted: false, revision: row.revision, document: copy(row.document)};
  };
  p.mutate(progress => progress.saved.push('queued'));
  assert.equal((await p.controller.syncNow()).ok, false);
  assert.equal(attempts, 5);
  assert.equal(p.controller.getStatus().pending, true);
  assert.deepEqual(p.progress.saved, ['queued']);
  server.client.writeProgress = realWrite;
  assert.equal((await p.controller.syncNow()).ok, true);
  assert.equal(server.rows.get('a').document.saved.queued.value, true);
});

test('access-token requests share one durable rotating refresh and restart from the new session', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login();
  const old = JSON.parse(p.storage.getItem(AUTH_STORAGE_KEY)).session;
  server.clock += 3590000;
  const [tokenA, tokenB, result] = await Promise.all([p.controller.getAccessToken(), p.controller.getAccessToken(), p.controller.syncNow()]);
  assert.equal(result.ok, true);
  assert.equal(tokenA, tokenB);
  assert.notEqual(tokenA, old.accessToken);
  assert.equal(server.calls.filter(call => call.method === 'refresh').length, 1);
  const saved = JSON.parse(p.storage.getItem(AUTH_STORAGE_KEY));
  assert.equal(saved.project, config.url);
  assert.equal(saved.session.accessToken, tokenA);
  assert.notEqual(saved.session.refreshToken, old.refreshToken);
  p.controller.stop();
  const restarted = phone(server, {storage: p.storage, progress: p.progress}); t.after(() => restarted.controller.stop());
  await restarted.controller.init();
  assert.equal(await restarted.controller.getAccessToken(), tokenA);
  assert.equal(server.calls.filter(call => call.method === 'refresh').length, 1);
});

test('failed auth persistence never enables progress sync or exports credentials', async t => {
  const server = backend(), storage = memoryStorage(), originalSet = storage.setItem;
  storage.setItem = (key, value) => { if (key === AUTH_STORAGE_KEY) throw new Error('private-token'); return originalSet(key, value); };
  const p = phone(server, {storage, progress: {...blank(), saved: ['device-progress']}}); t.after(() => p.controller.stop());
  const result = await p.controller.signIn('a@example.test', 'private-password');
  assert.equal(result.ok, false);
  assert.equal(p.controller.getStatus().user, null);
  assert.deepEqual(p.progress.saved, ['device-progress']);
  await p.controller.syncNow();
  assert.equal(server.calls.some(call => ['read', 'write'].includes(call.method)), false);
  assert.equal(JSON.stringify([p.progress, p.statuses, result, [...storage.values]]).includes('private-'), false);
});

test('a failed rotated-session save clears auth before any progress operation uses the new token', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login();
  const beforeReads = server.calls.filter(call => call.method === 'read').length;
  const originalSet = p.storage.setItem;
  p.storage.setItem = (key, value) => { if (key === AUTH_STORAGE_KEY && value !== 'null') throw new Error('quota'); return originalSet(key, value); };
  p.mutate(progress => progress.saved.push('pending'));
  server.clock += 3590000;
  assert.equal((await p.controller.syncNow()).ok, false);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(p.controller.getStatus().phase, 'signedOut');
  assert.equal(p.controller.getStatus().pending, true);
  assert.equal(server.calls.filter(call => call.method === 'read').length, beforeReads);
  assert.deepEqual(p.progress.saved, ['pending']);
});

test('native secure auth storage is used exclusively and false commit results fail closed', async t => {
  const server = backend(), secure = {value: null, writes: 0, clears: 0, fail: false};
  const nativeBridge = {
    readSecureSyncSession(key) { assert.equal(key, AUTH_STORAGE_KEY); return secure.value; },
    writeSecureSyncSession(key, value) { assert.equal(key, AUTH_STORAGE_KEY); secure.writes++; if (secure.fail) return false; secure.value = value; return true; },
    clearSecureSyncSession(key) { assert.equal(key, AUTH_STORAGE_KEY); secure.clears++; secure.value = null; return true; },
  };
  const p = phone(server, {nativeBridge}); t.after(() => p.controller.stop());
  await p.login();
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(JSON.parse(secure.value).session.user.id, 'a');
  server.failSignOut = true;
  assert.equal((await p.controller.signOut()).ok, true);
  assert.equal(secure.value, null);
  assert.equal(secure.clears, 1);
  secure.fail = true;
  assert.equal((await p.controller.signIn('b@example.test', 'test-password')).ok, false);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(p.controller.getStatus().user, null);
});

test('sign-out invalidates an in-flight read and keeps device progress even if remote logout fails', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['device-only']}}); t.after(() => p.controller.stop());
  await p.login();
  const entered = deferred(), release = deferred();
  server.onRead = async () => { entered.resolve(); await release.promise; };
  const syncing = p.controller.syncNow();
  await entered.promise;
  const replacements = p.replacements.length;
  server.failSignOut = true;
  assert.equal((await p.controller.signOut()).ok, true);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  release.resolve(); await syncing;
  assert.equal(p.replacements.length, replacements);
  assert.deepEqual(p.progress.saved, ['device-only']);
  assert.equal(p.controller.getStatus().phase, 'signedOut');
  const calls = server.calls.length;
  await p.controller.syncNow();
  assert.equal(server.calls.length, calls);
});

test('switching accounts during an old read loads an isolated profile and restores the prior account cache', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['a-local']}}); t.after(() => p.controller.stop());
  await p.login('a');
  p.mutate(progress => progress.saved.push('a-pending'));
  const bProgress = {...blank(), saved: ['b-cloud']};
  server.rows.set('b', {revision: 1, document: captureProgress(null, undefined, bProgress, {deviceId: 'seed-b', now: NOW})});
  const entered = deferred(), release = deferred();
  server.onRead = async uid => { if (uid === 'a') { entered.resolve(); await release.promise; } };
  const oldFlight = p.controller.syncNow(); await entered.promise;
  assert.equal((await p.controller.signIn('b@example.test', 'test-password')).ok, true);
  assert.deepEqual(p.progress.saved, []);
  assert.equal(p.controller.getStatus().user.id, 'b');
  release.resolve(); await oldFlight;
  await p.controller.syncNow();
  assert.deepEqual(p.progress.saved, ['b-cloud']);
  assert.equal('a-local' in server.rows.get('b').document.saved, false);
  assert.equal('a-pending' in server.rows.get('b').document.saved, false);
  server.onRead = null;
  assert.equal((await p.controller.signIn('a@example.test', 'test-password')).ok, true);
  assert.deepEqual(p.progress.saved, ['a-local', 'a-pending']);
  await p.controller.syncNow();
  assert.equal('b-cloud' in server.rows.get('a').document.saved, false);
});

test('a sign-in result arriving after sign-out never recreates a session', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  const entered = deferred(), release = deferred(), signIn = server.client.signIn;
  server.client.signIn = async (...args) => { const result = await signIn(...args); entered.resolve(); await release.promise; return result; };
  const signingIn = p.controller.signIn('a@example.test', 'test-password');
  await entered.promise; await p.controller.signOut(); release.resolve();
  assert.equal((await signingIn).ok, false);
  assert.equal(p.controller.getStatus().user, null);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(server.calls.some(call => ['read', 'write'].includes(call.method)), false);
});

test('a refresh arriving after sign-out cannot persist its rotated credentials', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login(); server.clock += 3590000;
  const entered = deferred(), release = deferred();
  server.onRefresh = async () => { entered.resolve(); await release.promise; };
  const refreshing = p.controller.getAccessToken();
  await entered.promise; await p.controller.signOut(); release.resolve();
  await assert.rejects(refreshing, /sync|session|account/i);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(p.controller.getStatus().user, null);
});

test('email confirmation and password reset do not start background progress requests', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  server.confirmEmail = true;
  const result = await p.controller.signUp('new@example.test', 'test-password');
  assert.equal(result.requiresEmailConfirmation, true);
  assert.equal(p.controller.getStatus().phase, 'needsConfirmation');
  assert.equal((await p.controller.resetPassword('new@example.test')).ok, true);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.deepEqual(server.calls.map(call => call.method), ['signUp', 'resetPassword']);
});

test('repeated offline saves retain one event per answer before projection assigns event IDs', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login(); server.offline = true;
  p.mutate(progress => progress.log.push({id: 'q1', at: NOW, kind: 'answer', correct: true}), false);
  p.mutate(progress => { progress.goal = 20; }, false);
  p.mutate(progress => { progress.reading.book = 7; }, false);
  assert.equal(Object.keys(p.progress.cloud.events).length, 1);
  p.mutate(progress => progress.log.push({id: 'q1', at: NOW, kind: 'answer', correct: true}), false);
  p.mutate(progress => { progress.prefs.fontScale = 1.2; }, false);
  assert.equal(Object.keys(p.progress.cloud.events).length, 2);
  server.offline = false; await p.controller.syncNow();
  assert.equal(p.progress.log.length, 2);
});

function syntheticBank() {
  return Array.from({length: 5}, (_, n) => ({id: `n${n}`, topic: 'Numbers', question: `Which choice matches label ${n}?`, options: ['Choice A', 'Choice B'], answer: 1}));
}
function finishRound(p, bank) {
  while (p.progress.game.active?.phase !== 'complete') {
    p.mutate(progress => { progress.game = progress.game.active.phase === 'question'
      ? answerRun(progress.game, bank, 1, {now: NOW}) : nextRun(progress.game, bank, {now: NOW}); }, false);
  }
}

test('two phones sync distinct game runs once and never upload question snapshots or another active round', async t => {
  const server = backend(), bank = syntheticBank();
  const a = phone(server, {getBank: () => bank}), b = phone(server, {getBank: () => bank});
  t.after(() => { a.controller.stop(); b.controller.stop(); });
  await a.login(); await b.login(); server.offline = true;
  a.mutate(progress => { progress.game = startRun(progress.game || blankGame(), bank, {now: NOW, seed: 1}); });
  b.mutate(progress => { progress.game = startRun(progress.game || blankGame(), bank, {now: NOW, seed: 2}); });
  finishRound(a, bank); finishRound(b, bank);
  const ownA = a.progress.game.active.id, ownB = b.progress.game.active.id;
  server.offline = false;
  await Promise.all([a.controller.syncNow(), b.controller.syncNow()]);
  await a.controller.syncNow(); await b.controller.syncNow();
  assert.equal(a.progress.game.stats.completedRuns, 2);
  assert.equal(a.progress.game.stats.attempted, 10);
  assert.equal(a.progress.game.xp, 120);
  assert.equal(b.progress.game.xp, 120);
  assert.equal(a.progress.game.active.id, ownA);
  assert.equal(b.progress.game.active.id, ownB);
  const uploaded = JSON.stringify(server.calls.filter(call => call.method === 'write'));
  assert.equal(uploaded.includes('Which choice'), false);
  assert.equal(uploaded.includes('Choice A'), false);
  await a.controller.syncNow(); await b.controller.syncNow();
  assert.equal(a.progress.game.xp, 120);
  assert.equal(a.progress.game.stats.completedRuns, 2);
});

test('first attachment preserves a partial legacy game and finishing it does not replay its old answers', async t => {
  const server = backend(), bank = syntheticBank();
  const partial = answerRun(startRun(blankGame(), bank, {now: NOW}), bank, 1, {now: NOW});
  const p = phone(server, {progress: {...blank(), game: partial}, getBank: () => bank}); t.after(() => p.controller.stop());
  await p.login();
  assert.equal(p.progress.game.active.answers.length, 1);
  assert.equal(p.progress.game.xp, partial.xp);
  assert.equal(p.replacements.find(details => details.reason === 'account').accountChanged, false);
  finishRound(p, bank);
  await p.controller.syncNow();
  assert.equal(p.progress.game.xp, 110);
  assert.equal(p.progress.game.stats.attempted, 5);
  assert.equal(p.progress.game.stats.completedRuns, 1);
});

test('corrupt ownership metadata fails closed instead of merging a prior profile into a new account', async t => {
  const server = backend(), storage = memoryStorage();
  storage.setItem('labwise-sync-profiles-v1', '{damaged');
  const p = phone(server, {storage, progress: {...blank(), saved: ['a-private']}}); t.after(() => p.controller.stop());
  await p.controller.init();
  assert.equal((await p.controller.signIn('b@example.test', 'test-password')).ok, false);
  assert.deepEqual(p.progress.saved, ['a-private']);
  assert.deepEqual(server.calls, []);
});

test('restoring a session verifies its account before any progress fetch or write', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['a-private']}}); t.after(() => p.controller.stop());
  await p.login('a'); p.controller.stop();
  const auth = JSON.parse(p.storage.getItem(AUTH_STORAGE_KEY));
  auth.session.user.id = 'b';
  p.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  const restarted = phone(server, {storage: p.storage, progress: p.progress}); t.after(() => restarted.controller.stop());
  const oldProgressCalls = server.calls.filter(call => ['read', 'write'].includes(call.method)).length;
  await restarted.controller.init();
  assert.equal((await restarted.controller.syncNow()).ok, false);
  assert.equal(restarted.controller.getStatus().user, null);
  assert.equal(restarted.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(server.calls.filter(call => ['read', 'write'].includes(call.method)).length, oldProgressCalls);
  assert.deepEqual(restarted.progress.saved, ['a-private']);
});

test('an offline restart retains the authenticated queue and verifies identity on reconnection', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login(); server.offline = true;
  p.mutate(progress => progress.saved.push('pending-after-restart'));
  p.controller.stop();
  const restarted = phone(server, {storage: p.storage, progress: p.progress}); t.after(() => restarted.controller.stop());
  await restarted.controller.init(); await restarted.controller.syncNow();
  assert.equal(restarted.controller.getStatus().phase, 'offline');
  assert.equal(restarted.controller.getStatus().pending, true);
  assert.deepEqual(restarted.progress.saved, ['pending-after-restart']);
  server.offline = false; await restarted.controller.syncNow();
  assert.equal(server.rows.get('a').document.saved['pending-after-restart'].value, true);
  assert.equal(restarted.controller.getStatus().pending, false);
});

test('a project configuration change cannot upload the previous project account into a new project', async t => {
  const oldServer = backend(), p = phone(oldServer, {progress: {...blank(), saved: ['old-project-private']}}); t.after(() => p.controller.stop());
  await p.login('a'); p.controller.stop();
  const newServer = backend(), nextConfig = {...config, url: 'https://zyxwvutsrqponmlkjihg.supabase.co'};
  const next = phone(newServer, {storage: p.storage, progress: p.progress, config: nextConfig}); t.after(() => next.controller.stop());
  await next.controller.init();
  assert.equal(next.controller.getStatus().user, null);
  assert.deepEqual(newServer.calls, []);
  await next.login('b');
  assert.equal('old-project-private' in newServer.rows.get('b').document.saved, false);
  assert.deepEqual(next.progress.saved, []);
});

test('progress, archives, status and errors exclude auth and arbitrary content fields', async t => {
  const server = backend(), progress = {...blank(), password: 'private-password', accessToken: 'private-token', refresh_token: 'private-refresh', transcript: 'private-transcript', questions: ['private-question'], pdf: 'private-pdf'};
  const p = phone(server, {progress}); t.after(() => p.controller.stop());
  await p.login();
  server.offline = true; await p.controller.syncNow();
  const publicData = JSON.stringify([p.progress, p.statuses, server.calls, [...p.storage.values].filter(([key]) => key !== AUTH_STORAGE_KEY)]);
  for (const value of ['private-password', 'private-token', 'private-refresh', 'private-transcript', 'private-question', 'private-pdf', 'access-a-', 'refresh-a-']) assert.equal(publicData.includes(value), false);
  assert.ok(p.storage.getItem(AUTH_STORAGE_KEY).includes('access-a-'));
});

test('choosing cloud-only on first attachment archives local progress without uploading it', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['local-private']}}); t.after(() => p.controller.stop());
  await p.login('a', {mergeLocal: false});
  assert.deepEqual(p.progress.saved, []);
  assert.equal('local-private' in server.rows.get('a').document.saved, false);
  assert.equal(JSON.parse(p.storage.getItem('labwise-sync-profiles-v1')).local.saved['local-private'].value, true);
});

test('staged account recovery cannot attribute an old main progress save to the newly authenticated account', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['a-private']}}); t.after(() => p.controller.stop());
  await p.login('a'); p.controller.stop();
  const uidA = `${new URL(config.url).hostname}:a`, uidB = `${new URL(config.url).hostname}:b`;
  const bProgress = {...blank(), saved: ['b-safe']}, bDoc = captureProgress(null, undefined, bProgress, {deviceId: 'b-device', now: NOW});
  const staged = {version: 1, owner: uidA, order: [uidA], profiles: {[uidA]: p.progress.cloud}, transition: {from: uidA, to: uidB, document: bDoc}};
  p.storage.setItem('labwise-sync-profiles-v1', JSON.stringify(staged));
  const bSession = await server.client.signIn('b@example.test');
  p.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({version: 1, project: config.url, session: bSession}));
  const restarted = phone(server, {storage: p.storage, progress: p.progress}); t.after(() => restarted.controller.stop());
  await restarted.controller.init(); await restarted.controller.syncNow();
  assert.deepEqual(restarted.progress.saved, ['b-safe']);
  assert.equal('a-private' in server.rows.get('b').document.saved, false);
  assert.equal(JSON.parse(p.storage.getItem('labwise-sync-profiles-v1')).profiles[uidA].saved['a-private'].value, true);
});

test('an account switch whose final storage commit fails keeps the previous device profile', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['a-private']}}); t.after(() => p.controller.stop());
  await p.login('a');
  const original = p.storage.setItem;
  p.storage.setItem = (key, value) => {
    if (key === 'labwise-sync-profiles-v1') {
      const parsed = JSON.parse(value);
      if (parsed.owner?.endsWith(':b') && parsed.transition === null) throw new Error('disk');
    }
    return original(key, value);
  };
  assert.equal((await p.controller.signIn('b@example.test', 'test-password')).ok, false);
  assert.deepEqual(p.progress.saved, ['a-private']);
  assert.equal(p.controller.getStatus().user, null);
  assert.equal(p.storage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(server.rows.has('b'), false);
});

function oversizedDocument() {
  const value = blankSyncDocument();
  for (let n = 0; n < 6000; n++) value.events[`event-${n}-${'€'.repeat(500)}`] = {id: 'q1', at: NOW, kind: 'answer', correct: true};
  return value;
}

test('oversized cloud data is refused before projection and cannot overwrite device progress', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['keep']}}); t.after(() => p.controller.stop());
  await p.login();
  server.rows.set('a', {revision: 2, document: oversizedDocument()});
  const replacements = p.replacements.length;
  const result = await p.controller.syncNow();
  assert.equal(result.ok, false);
  assert.match(result.error, /8 MiB/);
  assert.equal(p.replacements.length, replacements);
  assert.deepEqual(p.progress.saved, ['keep']);
});

test('failed local capture blocks projection and upload instead of rolling back uncaptured device changes', async t => {
  const server = backend(), p = phone(server); t.after(() => p.controller.stop());
  await p.login();
  const large = oversizedDocument();
  p.mutate(progress => { progress.saved.push('new-local'); progress.log = Object.entries(large.events).map(([eventId, entry]) => ({...entry, eventId})); });
  const networkCalls = server.calls.length;
  assert.equal((await p.controller.syncNow()).ok, false);
  assert.equal(server.calls.length, networkCalls);
  assert.equal(p.progress.log.length, 6000);
  assert.deepEqual(p.progress.saved, ['new-local']);
  assert.equal(p.controller.getStatus().pending, true);
});

test('imported snapshots merge their safe document without reviving a newer local tombstone', async t => {
  const server = backend(), p = phone(server, {progress: {...blank(), saved: ['q1']}}); t.after(() => p.controller.stop());
  await p.login();
  const old = copy(p.progress);
  p.mutate(progress => { progress.saved = []; });
  old.saved.push('q2');
  old.password = 'private-password';
  const merged = p.controller.mergeImportedProgress(old);
  assert.deepEqual(merged.saved, ['q2']);
  assert.equal('password' in merged, false);
  assert.equal(p.controller.getStatus().pending, true);
  await p.controller.syncNow();
  assert.deepEqual(p.progress.saved, ['q2']);
});

test('sign-in can retry after initially unavailable device storage becomes writable', async t => {
  const server = backend(), storage = memoryStorage(), original = storage.setItem;
  let unavailable = true;
  storage.setItem = (key, value) => { if (unavailable) throw new Error('storage'); return original(key, value); };
  const p = phone(server, {storage, progress: {...blank(), saved: ['keep']}}); t.after(() => p.controller.stop());
  await p.controller.init();
  assert.equal((await p.controller.signIn('a@example.test', 'test-password')).ok, false);
  assert.deepEqual(server.calls, []);
  unavailable = false;
  await p.login();
  assert.deepEqual(p.progress.saved, ['keep']);
});

test('a newly attached phone adopts cloud preferences while later explicit default choices still sync', async t => {
  const server = backend(), a = phone(server, {progress: {...blank(), goal: 30, prefs: {sessionSize: 25, fontScale: 1.4}}}), b = phone(server);
  t.after(() => { a.controller.stop(); b.controller.stop(); });
  await a.login(); server.clock += 10000; await b.login(); await a.controller.syncNow();
  assert.equal(a.progress.goal, 30);
  assert.equal(b.progress.goal, 30);
  assert.deepEqual(b.progress.prefs, {sessionSize: 25, fontScale: 1.4});
  b.mutate(progress => { progress.goal = 10; progress.prefs.fontScale = 1; });
  await b.controller.syncNow(); await a.controller.syncNow();
  assert.equal(a.progress.goal, 10);
  assert.equal(a.progress.prefs.fontScale, 1);
});

test('a failed imported-progress save rolls back its document and leaves the existing upload queue intact', async t => {
  for (const failureMode of ['false', 'throw']) {
    const server = backend();
    const p = phone(server, {progress: {...blank(), saved: ['keep']}, onSave: (_next, details) => {
      if (details.reason === 'import') {
        if (failureMode === 'throw') throw new Error('Device save failed');
        return false;
      }
      return true;
    }});
    t.after(() => p.controller.stop());
    await p.login();
    p.mutate(progress => { progress.saved.push('already-queued'); });
    const previous = copy(p.progress), status = p.controller.getStatus();
    const imported = {...blank(), saved: ['failed-import'], goal: 30,
      log: [{id: 'failed-answer', at: NOW + 1, kind: 'answer', correct: true}]};
    assert.throws(() => p.controller.mergeImportedProgress(imported), /device settings/);
    assert.deepEqual(copy(p.progress), previous);
    assert.deepEqual(p.controller.getStatus(), status);
    // Exercise the restored before-snapshot too, before flushing the old queue.
    p.mutate(progress => { progress.reading.book = 8; }, false);
    assert.equal((await p.controller.syncNow()).ok, true);
    const uploaded = server.rows.get('a').document;
    assert.deepEqual(p.progress.saved, ['already-queued', 'keep']);
    assert.equal('failed-import' in uploaded.saved, false);
    assert.equal(Object.values(uploaded.events).some(event => event.id === 'failed-answer'), false);
    assert.equal(uploaded.prefs.goal.value, 10);
    assert.equal(uploaded.reading.book.value, 8);
  }
});

test('failed saved-sign-in deletion keeps sync paused and can be retried after the in-memory session is gone', async t => {
  for (const secureNative of [false, true]) {
    const server = backend(), storage = memoryStorage();
    let blocked = false, encrypted = null;
    const originalSet = storage.setItem, originalRemove = storage.removeItem;
    storage.setItem = (key, value) => { if (blocked && key === AUTH_STORAGE_KEY) throw new Error('storage'); return originalSet(key, value); };
    storage.removeItem = key => { if (blocked && key === AUTH_STORAGE_KEY) throw new Error('storage'); return originalRemove(key); };
    const nativeBridge = secureNative ? {
      readSecureSyncSession: () => encrypted,
      writeSecureSyncSession: (_key, value) => { encrypted = value; return true; },
      clearSecureSyncSession: () => { if (blocked) return false; encrypted = null; return true; },
    } : undefined;
    const p = phone(server, {storage, nativeBridge, progress: {...blank(), saved: ['keep']}});
    t.after(() => p.controller.stop());
    await p.login(); blocked = true;
    const result = await p.controller.signOut();
    assert.equal(result.ok, false);
    assert.match(result.error, /Saved sign-in could not be cleared/);
    assert.equal(p.controller.getStatus().user, null);
    assert.ok(secureNative ? encrypted : storage.getItem(AUTH_STORAGE_KEY));
    const calls = server.calls.length;
    assert.equal((await p.controller.syncNow()).ok, false);
    assert.equal((await p.controller.signOut()).ok, false);
    assert.equal(server.calls.length, calls);
    blocked = false;
    assert.equal((await p.controller.signOut()).ok, true);
    assert.equal(secureNative ? encrypted : storage.getItem(AUTH_STORAGE_KEY), null);
    assert.equal(p.controller.getStatus().error, null);
    assert.deepEqual(p.progress.saved, ['keep']);
    assert.equal(server.calls.length, calls);
  }
});
