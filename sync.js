// Auth storage and progress are separate. Only allowlisted sync documents are uploaded.
import {createSupabaseClient} from './supabase-client.js';
import {validateSyncConfig} from './sync-config.js';
import {validateGame} from './game.js';
import {blankSyncDocument, validateSyncDocument, captureProgress, mergeSyncDocuments, projectProgress} from './sync-model.js';

export const AUTH_STORAGE_KEY = 'labwise-sync-auth-v1';
const MAX_BYTES = 8 * 1024 * 1024;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) && !RESERVED.has(value);
class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const failure = (code, message) => new SyncError(code, message);
const stale = () => failure('stale', 'This account operation is no longer active.');
const storageError = () => failure('storage', 'Account sync could not save its device settings. Free some device storage and try again.');
const authRemovalError = 'Saved sign-in could not be cleared. Account sync is paused. Try clearing saved sign-in again before closing the app.';
const malformed = () => failure('document', 'Cloud progress could not be read safely. Your device progress has been kept.');
function safeError(error) {
  switch (error?.code) {
    case 'storage': return storageError().message;
    case 'document': return malformed().message;
    case 'size': return 'Cloud progress must be under 8 MiB. Export a local backup to keep a copy.';
    case 'auth': return 'Your account or session could not be verified. Confirm your email or sign in again.';
    case 'network': case 'timeout': return 'You are offline or the account service could not be reached. Your device progress is safe and will sync when connected.';
    case 'conflict': return 'Another device is updating this account. Your changes are queued and will retry.';
    case 'invalid': return 'Check your email address and password, then try again.';
    default: return 'Account sync is unavailable. Your device progress is safe. Try again later.';
  }
}
function document(value) {
  let result;
  try { result = validateSyncDocument(value); } catch { throw malformed(); }
  // PostgreSQL jsonb::text adds spaces after separators; include those bytes
  // so a compact JSON document cannot cross the database's 8 MiB limit.
  function spaces(value) {
    if (!object(value) && !Array.isArray(value)) return 0;
    const values = Object.values(value);
    return Math.max(0, values.length - 1) + (Array.isArray(value) ? 0 : values.length)
      + values.reduce((total, child) => total + spaces(child), 0);
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength + spaces(result) > MAX_BYTES) throw failure('size', 'Cloud progress must be under 8 MiB.');
  return result;
}
function safeSession(value) {
  if (!object(value) || typeof value.accessToken !== 'string' || !/^[A-Za-z0-9._~+\/=-]+$/.test(value.accessToken)
    || typeof value.refreshToken !== 'string' || !/^[A-Za-z0-9._~+\/=-]+$/.test(value.refreshToken)
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0 || !object(value.user) || !id(value.user.id)) throw failure('auth', 'The saved account session is invalid.');
  return {accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt,
    user: {id: value.user.id, email: typeof value.user.email === 'string' ? value.user.email.slice(0, 320) : ''}};
}
function emptyMetadata() { return {version: 1, owner: null, order: [], profiles: Object.create(null), local: null, transition: null}; }
function metadata(value) {
  if (!object(value) || value.version !== 1 || (value.owner !== null && !id(value.owner)) || !Array.isArray(value.order)
    || value.order.length > 3 || value.order.some(name => !id(name)) || new Set(value.order).size !== value.order.length
    || !object(value.profiles) || Object.keys(value.profiles).length > 3) throw storageError();
  const result = emptyMetadata();
  result.owner = value.owner;
  result.local = value.local == null ? null : document(value.local);
  result.order = [...value.order];
  for (const name of Object.keys(value.profiles)) {
    if (!id(name) || !result.order.includes(name)) throw storageError();
    result.profiles[name] = document(value.profiles[name]);
  }
  if (value.transition != null) {
    const t = value.transition;
    if (!object(t) || (t.from !== null && !id(t.from)) || !id(t.to)) throw storageError();
    result.transition = {from: t.from, to: t.to, document: document(t.document)};
  }
  return result;
}

/** setProgress synchronously replaces and persists progress; false means failure.
 * localChanged captures synchronously before the caller's normal progress save. */
export function createSyncController({config, storage, getProgress, setProgress, getBank = () => undefined,
  onStatus = () => {}, clientFactory = createSupabaseClient, now = Date.now, blankProgress,
  debounceMs = 750, pollMs = 30000, eventTarget = globalThis, nativeBridge = globalThis.LabwiseAndroid} = {}) {
  if (typeof getProgress !== 'function' || typeof setProgress !== 'function') throw new Error('Account sync needs progress read and save callbacks.');
  let settings, configurationError = null;
  try { settings = validateSyncConfig(config); } catch { settings = {enabled: false, url: ''}; configurationError = 'Account sync has not been configured correctly. Your progress stays on this device.'; }
  const configured = settings.enabled;
  if (configured && storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const suffix = settings.url ? new URL(settings.url).hostname : 'disabled';
  const keys = {profiles: 'labwise-sync-profiles-v1', device: 'labwise-sync-device-v1'};
  const accountId = uid => { const value = `${suffix}:${uid}`; if (!id(value)) throw failure('auth', 'The account identifier is invalid.'); return value; };
  let state = {configured, phase: configurationError ? 'error' : configured ? 'signedOut' : 'local', user: null,
    lastSyncedAt: null, pending: false, error: configurationError};
  let client, session = null, owner = emptyMetadata(), doc = null, lastSnapshot = null, deviceId;
  let initialized = false, initialization = null, initializationError = null, stopped = false, generation = 0, authBusy = false;
  let sessionVerified = false, needsAttach = false, identityFlight = null, captureError = null;
  let flight = null, refreshFlight = null, rerun = false, debounceTimer, retryTimer, pollTimer, retryCount = 0;
  const listeners = [];
  const getStatus = () => clone(state);
  function publish(patch = {}) {
    state = {...state, ...patch};
    try { onStatus(getStatus()); } catch { /* UI observers do not own the queue. */ }
  }
  function write(key, value) {
    try {
      if (!storage || typeof storage.setItem !== 'function') throw storageError();
      const encoded = JSON.stringify(value);
      storage.setItem(key, encoded);
      if (typeof storage.getItem === 'function' && storage.getItem(key) !== encoded) throw storageError();
    } catch { throw storageError(); }
  }
  function read(key) {
    try {
      if (!storage || typeof storage.getItem !== 'function') throw storageError();
      const raw = storage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch { throw storageError(); }
  }
  function nativeAuth() {
    if (!nativeBridge) return false;
    if (['readSecureSyncSession', 'writeSecureSyncSession', 'clearSecureSyncSession'].every(name => typeof nativeBridge[name] === 'function')) return true;
    throw storageError();
  }
  function writeAuth(value) {
    const encoded = JSON.stringify({version: 1, project: settings.url, session: safeSession(value)});
    if (new TextEncoder().encode(encoded).byteLength > 65536) throw storageError();
    try {
      if (nativeAuth()) {
        if (nativeBridge.writeSecureSyncSession(AUTH_STORAGE_KEY, encoded) !== true) throw storageError();
      } else write(AUTH_STORAGE_KEY, JSON.parse(encoded));
    } catch { throw storageError(); }
  }
  function readAuth() {
    let value;
    try {
      if (nativeAuth()) {
        const raw = nativeBridge.readSecureSyncSession(AUTH_STORAGE_KEY);
        value = raw == null ? null : JSON.parse(raw);
      } else value = read(AUTH_STORAGE_KEY);
    } catch { throw storageError(); }
    if (value == null) return null;
    if (value.version !== 1 || value.project !== settings.url) { clearAuth(); return null; }
    return safeSession(value.session);
  }
  function clearAuth() {
    try {
      if (nativeAuth()) return nativeBridge.clearSecureSyncSession(AUTH_STORAGE_KEY) === true;
      storage?.removeItem(AUTH_STORAGE_KEY);
      if (storage?.getItem(AUTH_STORAGE_KEY) == null) return true;
    } catch { /* Overwrite if removal is unavailable. */ }
    try { if (nativeAuth()) return false; write(AUTH_STORAGE_KEY, null); return true; } catch { return false; }
  }
  function transport() {
    if (!configured || stopped) throw failure('unavailable', 'Account sync is disabled.');
    if (!client) client = clientFactory({...settings, ...(settings.redirectUrl ? {} : {redirectUrl: undefined})});
    return client;
  }
  function clock() {
    const value = now();
    return Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
  }
  function timer(callback, delay) {
    const value = setTimeout(callback, Math.max(0, delay));
    value?.unref?.();
    return value;
  }
  function clearTimers() {
    clearTimeout(debounceTimer); clearTimeout(retryTimer); clearInterval(pollTimer);
    debounceTimer = retryTimer = pollTimer = undefined;
    for (const [name, listener] of listeners.splice(0)) eventTarget?.removeEventListener?.(name, listener);
  }
  function current(epoch, uid) { return !stopped && generation === epoch && session !== null && session.user.id === uid; }
  function assertCurrent(epoch, uid) { if (!current(epoch, uid)) throw stale(); }
  function safeLocal(progress) {
    const safe = projectProgress(blankSyncDocument(), progress, {bank: getBank()});
    // Projecting an empty sync document intentionally starts shared game totals
    // at zero. A local before-snapshot must retain the actual counters instead.
    safe.game = validateGame(progress?.game, getBank());
    // Projection assigns IDs to legacy log entries. Keep the before-snapshot's
    // actual ID presence so multiple offline saves do not recapture old entries.
    safe.log = (progress?.log ?? []).map(entry => ({id: entry.id, at: entry.at, kind: entry.kind, correct: entry.correct,
      ...(entry.eventId === undefined ? {} : {eventId: entry.eventId})}));
    return safe;
  }
  function makeBlank() { return safeLocal(typeof blankProgress === 'function' ? blankProgress() : {}); }
  function snapshot(progress) { return safeLocal(progress); }
  function progressWithCloud(value, progress) { return {...projectProgress(value, progress, {bank: getBank()}), cloud: value}; }
  function bootstrap(progress) {
    const value = captureProgress(null, undefined, progress, {deviceId: deviceId || 'local', now: clock(), bank: getBank()});
    // A new phone's factory defaults are not a preference edit. Let an
    // established account's settings win until the user changes them locally.
    const defaults = {goal: 10, sessionSize: 10, fontScale: 1};
    for (const [name, register] of Object.entries(value.prefs)) {
      if (register.value === defaults[name]) register.clock = [0, 0, deviceId || 'local'];
    }
    return document(value);
  }
  function ensureDocument(seed = getProgress()) {
    if (doc) return;
    const progress = seed;
    doc = progress?.cloud == null ? bootstrap(progress)
      : document(captureProgress(document(progress.cloud), undefined, progress, {deviceId: deviceId || 'local', now: clock(), bank: getBank()}));
    lastSnapshot = snapshot(progress);
    if (object(progress)) progress.cloud = doc;
  }
  function persistProgress(next, reason, accountChanged = false) {
    const result = setProgress(next, {reason, accountChanged});
    if (result === false || result?.ok === false || typeof result?.then === 'function') throw storageError();
    lastSnapshot = snapshot(next);
  }
  function applyDocument(reason = 'remote', accountChanged = false, base = getProgress()) {
    const next = progressWithCloud(doc, base);
    persistProgress(next, reason, accountChanged);
    return next;
  }
  function fail(error) {
    if (error?.code === 'stale') return;
    const offline = error?.code === 'network' || error?.code === 'timeout';
    publish({phase: session ? offline ? 'offline' : 'error' : configured ? 'signedOut' : 'local', error: safeError(error), user: session ? {...session.user} : null});
  }
  function dropSession(error) {
    generation++;
    session = null;
    refreshFlight = null;
    identityFlight = null;
    sessionVerified = false;
    needsAttach = false;
    clearTimers();
    const removed = clearAuth();
    publish({phase: 'signedOut', user: null, error: removed ? safeError(error) : authRemovalError});
  }
  function schedule(delay = debounceMs) {
    if (!initialized || stopped || !session || authBusy || !configured) return;
    clearTimeout(debounceTimer);
    debounceTimer = timer(() => { debounceTimer = undefined; void syncNow(); }, delay);
  }
  function scheduleRetry() {
    if (!session || stopped) return;
    clearTimeout(retryTimer);
    const delay = Math.min(30000, 1000 * 2 ** Math.min(retryCount++, 5));
    retryTimer = timer(() => { retryTimer = undefined; void syncNow(); }, delay);
  }
  function startAutomaticSync() {
    clearTimers();
    if (!session || stopped) return;
    const interval = Number.isFinite(pollMs) && pollMs > 0 ? Math.max(15000, pollMs) : 30000;
    pollTimer = setInterval(() => { void syncNow(); }, interval);
    pollTimer?.unref?.();
    for (const name of ['online', 'focus']) {
      const listener = () => { if (session && !stopped) { retryCount = 0; schedule(0); } };
      eventTarget?.addEventListener?.(name, listener);
      listeners.push([name, listener]);
    }
  }
  function cacheProfile(target, uid, value) {
    target.profiles[uid] = document(value);
    target.order = [...target.order.filter(name => name !== uid), uid];
    while (target.order.length > 3) delete target.profiles[target.order.shift()];
  }
  function attach(nextSession, {mergeLocal = true, persist = true} = {}) {
    nextSession = safeSession(nextSession);
    ensureDocument();
    const uid = nextSession.user.id, account = accountId(uid), previousOwner = owner.owner;
    if (previousOwner === account) {
      if (persist) writeAuth(nextSession);
      session = nextSession;
      publish({user: {...session.user}, phase: 'syncing', error: null, pending: true});
      startAutomaticSync();
      return;
    }
    // Staging makes a crash between independent auth/progress saves recover to
    // a known profile instead of assigning another account's device progress.
    const previousMetadata = metadata(owner), staged = metadata(owner);
    if (previousOwner) cacheProfile(staged, previousOwner, doc);
    const firstAttachment = previousOwner === null && staged.order.length === 0;
    const adoptCurrent = firstAttachment && mergeLocal;
    if (firstAttachment && !mergeLocal) staged.local = document(doc);
    const nextDoc = staged.profiles[account] ?? (adoptCurrent ? doc : bootstrap(makeBlank()));
    staged.transition = {from: previousOwner, to: account, document: nextDoc};
    write(keys.profiles, staged);
    try { if (persist) writeAuth(nextSession); }
    catch (error) {
      try { write(keys.profiles, previousMetadata); } catch { /* The staged archive remains recoverable. */ }
      throw error;
    }
    const oldDoc = doc, oldProgress = getProgress();
    try {
      doc = document(nextDoc);
      applyDocument('account', !adoptCurrent, adoptCurrent ? oldProgress : makeBlank());
    } catch (error) {
      doc = oldDoc;
      clearAuth();
      try { persistProgress(oldProgress, 'account-rollback', true); write(keys.profiles, previousMetadata); } catch { /* Refuse cloud writes; preserve the archives. */ }
      session = null;
      throw error;
    }
    staged.owner = account;
    staged.transition = null;
    cacheProfile(staged, account, doc);
    try { write(keys.profiles, staged); }
    catch (error) {
      // Do not accept new edits against a staged snapshot that could replace
      // those edits on restart. Roll back and retain the previous archive.
      doc = oldDoc;
      session = null;
      clearAuth();
      try { persistProgress(oldProgress, 'account-rollback', true); write(keys.profiles, previousMetadata); } catch { /* The staged archive remains a safe recovery point. */ }
      throw error;
    }
    owner = staged;
    session = nextSession;
    publish({user: {...session.user}, phase: 'syncing', lastSyncedAt: null, error: null, pending: true});
    startAutomaticSync();
  }
  async function freshSession(epoch = generation, uid = session?.user.id, force = false) {
    assertCurrent(epoch, uid);
    if (!force && session.expiresAt > clock() + 60000) return session.accessToken;
    if (refreshFlight?.epoch === epoch) return refreshFlight.promise;
    const oldRefresh = session.refreshToken;
    const promise = (async () => {
      await Promise.resolve();
      try {
        const next = safeSession(await transport().refresh(oldRefresh));
        assertCurrent(epoch, uid);
        if (next.user.id !== uid) throw failure('auth', 'The refreshed account did not match.');
        writeAuth(next);
        session = next;
        publish({user: {...next.user}});
        return next.accessToken;
      } catch (error) {
        if (current(epoch, uid) && ['auth', 'storage'].includes(error?.code)) dropSession(error);
        throw error;
      } finally {
        if (refreshFlight?.promise === promise) refreshFlight = null;
      }
    })();
    refreshFlight = {epoch, promise};
    return promise;
  }
  async function authenticated(name, args, epoch, uid) {
    let accessToken = await freshSession(epoch, uid);
    assertCurrent(epoch, uid);
    try { return await transport()[name](accessToken, ...args); }
    catch (error) {
      assertCurrent(epoch, uid);
      if (error?.code !== 'auth' || (error.status && ![401, 403].includes(error.status))) throw error;
      accessToken = await freshSession(epoch, uid, true);
      assertCurrent(epoch, uid);
      try { return await transport()[name](accessToken, ...args); }
      catch (second) { if (second?.code === 'auth' && current(epoch, uid)) dropSession(second); throw second; }
    }
  }
  async function prepareSession(epoch, uid) {
    assertCurrent(epoch, uid);
    if (needsAttach && captureError) throw captureError;
    if (!sessionVerified) {
      if (!identityFlight || identityFlight.epoch !== epoch) {
        const promise = (async () => {
          try {
            const user = await authenticated('getUser', [], epoch, uid);
            assertCurrent(epoch, uid);
            if (!object(user) || user.id !== uid) { const error = failure('auth', 'The saved account did not match its session.'); dropSession(error); throw error; }
            sessionVerified = true;
          } finally { if (identityFlight?.epoch === epoch) identityFlight = null; }
        })();
        identityFlight = {epoch, promise};
      }
      await identityFlight.promise;
    }
    assertCurrent(epoch, uid);
    if (needsAttach) { attach(session, {persist: false}); needsAttach = false; }
  }
  function readCloud(value) {
    if (!object(value) || typeof value.accepted !== 'boolean' || !Number.isSafeInteger(value.revision) || value.revision < 0
      || (value.revision === 0 ? value.document !== null : value.document == null)) throw malformed();
    return {revision: value.revision, accepted: value.accepted, document: value.document === null ? blankSyncDocument() : document(value.document)};
  }
  async function runSync(epoch, uid) {
    publish({phase: 'syncing', error: null});
    try {
      if (captureError) throw captureError;
      await prepareSession(epoch, uid);
      assertCurrent(epoch, uid);
      let remote = readCloud(await authenticated('readProgress', [], epoch, uid));
      assertCurrent(epoch, uid);
      for (let attempt = 0; attempt < 5; attempt++) {
        doc = document(mergeSyncDocuments(doc, remote.document));
        applyDocument();
        assertCurrent(epoch, uid);
        if (same(doc, remote.document)) {
          retryCount = 0;
          clearTimeout(retryTimer);
          publish({phase: 'synced', pending: false, error: null, lastSyncedAt: clock()});
          return {ok: true, status: getStatus()};
        }
        publish({pending: true});
        const sent = doc;
        const result = readCloud(await authenticated('writeProgress', [remote.revision, sent], epoch, uid));
        assertCurrent(epoch, uid);
        remote = result;
        if (result.accepted && result.revision === 0) throw malformed();
        // Merge with the live document after every await. An answer may have
        // been captured while this particular revision was being written.
      }
      doc = document(mergeSyncDocuments(doc, remote.document));
      applyDocument();
      if (same(doc, remote.document)) {
        retryCount = 0;
        clearTimeout(retryTimer);
        publish({phase: 'synced', pending: false, error: null, lastSyncedAt: clock()});
        return {ok: true, status: getStatus()};
      }
      publish({pending: true});
      throw failure('conflict', 'The progress revision changed repeatedly.');
    } catch (error) {
      if (current(epoch, uid)) {
        fail(error);
        if (['network', 'timeout', 'server', 'conflict'].includes(error?.code)) scheduleRetry();
      }
      return {ok: false, error: safeError(error), status: getStatus()};
    }
  }
  async function syncNow() {
    if (!initialized) await init();
    if (!configured || stopped || !session || authBusy || !doc) return {ok: false, status: getStatus()};
    clearTimeout(debounceTimer); debounceTimer = undefined;
    if (flight) {
      rerun = true;
      const previous = flight;
      await previous.promise;
      if (flight === previous) flight = null;
      if (!session || stopped || authBusy) return {ok: false, status: getStatus()};
      return syncNow();
    }
    const epoch = generation, uid = session.user.id;
    const active = {epoch, promise: null};
    active.promise = runSync(epoch, uid);
    flight = active;
    try { return await active.promise; }
    finally {
      if (flight === active) {
        flight = null;
        if (rerun) { rerun = false; schedule(); }
      }
    }
  }
  async function init() {
    if (initializationError) {
      // A deliberate retry can recover after device storage becomes available.
      // Re-read ownership before permitting any account operation.
      initialization = null;
      initialized = false;
      initializationError = null;
      doc = lastSnapshot = null;
      owner = emptyMetadata();
    }
    if (initialization) return initialization;
    initialization = (async () => {
      if (initialized || stopped) return getStatus();
      initialized = true;
      if (!configured) { publish(); return getStatus(); }
      try {
        const savedDevice = read(keys.device);
        deviceId = typeof savedDevice === 'string' && id(savedDevice) ? savedDevice
          : `device-${globalThis.crypto?.randomUUID?.() || `${clock()}-${Math.random().toString(36).slice(2)}`}`;
        if (savedDevice !== deviceId) write(keys.device, deviceId);
        const savedOwner = read(keys.profiles);
        owner = savedOwner == null ? emptyMetadata() : metadata(savedOwner);
        const restored = readAuth();
        if (owner.transition) {
          const transition = owner.transition;
          const target = restored && accountId(restored.user.id) === transition.to ? transition.to : transition.from;
          const recover = target === transition.to ? transition.document : target ? owner.profiles[target] : null;
          if (recover) { doc = document(recover); applyDocument('account-recovery', true, makeBlank()); }
          owner.owner = target;
          owner.transition = null;
          if (target && recover) cacheProfile(owner, target, recover);
          write(keys.profiles, owner);
        }
        ensureDocument();
        if (restored) {
          session = restored;
          needsAttach = true;
          sessionVerified = false;
          publish({user: {...session.user}, phase: 'syncing', error: null, pending: true});
          startAutomaticSync();
          schedule(0);
        } else publish({phase: 'signedOut', user: null});
      } catch (error) {
        if (error?.code !== 'auth') initializationError = error;
        if (error?.code === 'auth') clearAuth();
        session = null;
        clearTimers();
        fail(error);
      }
      return getStatus();
    })();
    return initialization;
  }
  function localChanged(before, after = getProgress()) {
    if (!configured) return after;
    try {
      if (!deviceId) {
        const stored = read(keys.device);
        deviceId = typeof stored === 'string' && id(stored) ? stored : `device-${globalThis.crypto?.randomUUID?.() || `${clock()}-${Math.random().toString(36).slice(2)}`}`;
        if (stored !== deviceId) write(keys.device, deviceId);
      }
      ensureDocument(before ?? after);
      const previous = doc;
      doc = document(captureProgress(doc, before ?? lastSnapshot, after, {deviceId, now: clock(), bank: getBank()}));
      if (object(after)) after.cloud = doc;
      lastSnapshot = snapshot(after);
      captureError = null;
      if (!same(previous, doc)) {
        publish({pending: true, error: null, ...(session && state.phase === 'synced' ? {phase: 'syncing'} : {})});
        if (flight) rerun = true;
        schedule();
      }
      return progressWithCloud(doc, after);
    } catch (error) { captureError = error; publish({pending: true}); fail(error); return after; }
  }
  async function authenticate(kind, email, password, options = {}) {
    await init();
    if (!configured || stopped || authBusy || initializationError || captureError) return {ok: false, error: initializationError || captureError ? safeError(initializationError || captureError) : 'Account sync is unavailable.', status: getStatus()};
    const epoch = ++generation;
    authBusy = true;
    clearTimers();
    publish({phase: 'syncing', error: null});
    try {
      const result = await transport()[kind](email, password);
      if (stopped || epoch !== generation) throw stale();
      const next = kind === 'signUp' ? result.session : result;
      if (!next) {
        publish({phase: 'needsConfirmation', error: null, user: session ? {...session.user} : null});
        return {ok: true, requiresEmailConfirmation: true, status: getStatus()};
      }
      await attach(next, options);
      if (stopped || epoch !== generation || !session) throw stale();
      sessionVerified = true;
      needsAttach = false;
      return {ok: true, user: {...session.user}, requiresEmailConfirmation: false, status: getStatus()};
    } catch (error) {
      if (epoch === generation && !stopped) fail(error);
      return {ok: false, error: safeError(error), status: getStatus()};
    } finally {
      if (epoch === generation) {
        authBusy = false;
        if (session) { startAutomaticSync(); schedule(0); }
      }
    }
  }
  async function signOut() {
    generation++;
    const old = session;
    session = null;
    authBusy = false;
    refreshFlight = null;
    identityFlight = null;
    sessionVerified = false;
    needsAttach = false;
    rerun = false;
    clearTimers();
    const removed = clearAuth();
    publish({phase: configured ? 'signedOut' : 'local', user: null, error: removed ? null : authRemovalError});
    if (old && configured && !stopped) {
      try { await transport().signOut(old.accessToken); } catch { /* Opt-out succeeds even while offline. */ }
    }
    return {ok: removed, status: getStatus(), ...(removed ? {} : {error: authRemovalError})};
  }
  async function resetPassword(email) {
    await init();
    if (!configured || stopped) return {ok: false, error: 'Account sync is unavailable.'};
    try { await transport().resetPassword(email); return {ok: true}; }
    catch (error) { return {ok: false, error: safeError(error)}; }
  }
  async function getAccessToken() {
    await init();
    if (!session || stopped || authBusy) throw failure('auth', 'Sign in to use this account feature.');
    const epoch = generation, uid = session.user.id;
    try { await prepareSession(epoch, uid); const value = await freshSession(epoch, uid); assertCurrent(epoch, uid); return value; }
    catch (error) { throw failure(error?.code === 'network' || error?.code === 'timeout' ? error.code : 'auth', safeError(error)); }
  }
  function mergeImportedProgress(progress) {
    ensureDocument();
    const imported = progress?.cloud == null ? null : document(progress.cloud);
    const incoming = document(captureProgress(imported, undefined, progress, {deviceId: deviceId || 'local', now: clock(), bank: getBank()}));
    const previousDoc = doc, previousSnapshot = lastSnapshot, previousProgress = getProgress();
    const merged = document(mergeSyncDocuments(doc, incoming));
    const next = progressWithCloud(merged, progress);
    try { persistProgress(next, 'import'); }
    catch {
      // The import becomes part of the upload queue only after its device save
      // commits. A failed callback may already have replaced its in-memory copy.
      doc = previousDoc;
      if (getProgress() !== previousProgress) {
        try { setProgress(previousProgress, {reason: 'import-rollback', accountChanged: false}); } catch { /* Keep the prior queue even if device storage remains unavailable. */ }
      }
      lastSnapshot = previousSnapshot;
      throw storageError();
    }
    doc = merged;
    captureError = null;
    publish({pending: true, error: null});
    if (flight) rerun = true;
    schedule();
    return next;
  }
  function stop() {
    stopped = true;
    generation++;
    authBusy = false;
    rerun = false;
    clearTimers();
  }
  return Object.freeze({init, localChanged, signUp: (email, password) => authenticate('signUp', email, password),
    signIn: (email, password, options) => authenticate('signIn', email, password, options), resetPassword,
    signOut, syncNow, stop, getStatus, getAccessToken, mergeImportedProgress});
}
