// Only progress metadata belongs in this document. This module deliberately has
// no storage, network, auth, clock, or learning.js dependency.
import {blankGameSync, validateGameSync, captureGameSync, mergeGameSync, projectGameSync} from './game-sync.js';
import {validateFrenzy, validateFrenzySummary} from './frenzy.js';

const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const RATINGS = new Set(['again', 'hard', 'good', 'easy']);
const KINDS = new Set(['answer', 'review', 'game']);
const DIMENSIONS = ['mcq', 'recall', 'game', 'schedule'];
const PREFERENCES = ['goal', 'sessionSize', 'fontScale'];
const MAX_TIME = 253402297199999;
const MAX_ENTITIES = 50000;
const MAX_EVENTS = 200000;
const own = (value, name) => Object.hasOwn(value, name);
const dictionary = () => Object.create(null);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Invalid progress sync: ${message}`); };
const count = value => Number.isSafeInteger(value) && value >= 0;
const time = value => count(value) && value <= MAX_TIME;
const identifier = (value, limit = 200) => typeof value === 'string' && value.length > 0 && value.length <= limit && !RESERVED.has(value) && !/[\u0000-\u001f\u007f]/.test(value);
const device = value => identifier(value, 128) && /^[a-zA-Z0-9_.:-]+$/.test(value);
const compare = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function assertJSON(value, path = new Set(), depth = 0, budget = {nodes: 1000000, bytes: 16 * 1024 * 1024}) {
  if (--budget.nodes < 0 || depth > 24) fail('document is too large or deeply nested.');
  budget.bytes -= typeof value === 'string' ? value.length * 2 + 2 : 8;
  if (budget.bytes < 0) fail('document is too large.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!object(value) && !Array.isArray(value)) fail('only JSON values are allowed.');
  if (path.has(value)) fail('circular document.');
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid object prototype.');
  if (Object.getOwnPropertySymbols(value).length) fail('symbol properties are not allowed.');
  const names = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== names.length + (Array.isArray(value) ? 1 : 0)) fail('non-JSON properties are not allowed.');
  if (Array.isArray(value)) {
    if (names.length !== value.length || value.length > budget.nodes) fail('invalid array.');
    for (let i = 0; i < value.length; i++) if (!own(value, i)) fail('invalid array.');
  }
  path.add(value);
  for (const name of names) {
    budget.bytes -= name.length * 2 + 3;
    if (RESERVED.has(name)) fail('reserved property name.');
    const property = Object.getOwnPropertyDescriptor(value, name);
    if (!property || !own(property, 'value')) fail('accessor properties are not allowed.');
    assertJSON(property.value, path, depth + 1, budget);
  }
  path.delete(value);
}

function fields(value, required, optional = []) {
  if (!object(value) || required.some(name => !own(value, name)) || Object.keys(value).some(name => !required.includes(name) && !optional.includes(name))) fail('unrecognized document fields.');
}
function map(value, limit, readValue, validKey = identifier) {
  if (!object(value)) fail('invalid metadata map.');
  const names = Object.keys(value).sort();
  if (names.length > limit) fail('too many metadata entries.');
  const result = dictionary();
  for (const name of names) {
    if (!validKey(name)) fail('invalid metadata ID.');
    result[name] = readValue(value[name], name);
  }
  return result;
}
function pair(value) {
  if (!Array.isArray(value) || value.length !== 2 || !time(value[0]) || !count(value[1])) fail('invalid hybrid clock.');
  return [...value];
}
function clock(value) {
  if (!Array.isArray(value) || value.length !== 3 || !time(value[0]) || !count(value[1]) || !device(value[2])) fail('invalid register clock.');
  return [...value];
}
const comparePair = (a, b) => compare(a[0], b[0]) || compare(a[1], b[1]);
const compareClock = (a, b) => comparePair(a, b) || compare(a[2], b[2]);
function readCorrect(value) {
  fields(value, ['correct', 'at']);
  if (typeof value.correct !== 'boolean' || !time(value.at)) fail('invalid answer metadata.');
  return {correct: value.correct, at: value.at};
}
function readRecall(value) {
  fields(value, ['rating', 'at']);
  if (!RATINGS.has(value.rating) || !time(value.at)) fail('invalid recall metadata.');
  return {rating: value.rating, at: value.at};
}
function readSchedule(value) {
  fields(value, ['due', 'stage', 'reviewedAt']);
  if (!time(value.due) || !Number.isInteger(value.stage) || value.stage < 0 || value.stage > 4 || !time(value.reviewedAt)) fail('invalid review schedule.');
  return {due: value.due, stage: value.stage, reviewedAt: value.reviewedAt};
}
function readPreference(value, name) {
  const valid = name === 'goal' ? [5, 10, 20, 30].includes(value)
    : name === 'sessionSize' ? Number.isInteger(value) && value >= 1 && value <= 200
      : typeof value === 'number' && Number.isFinite(value) && value >= 0.8 && value <= 2;
  if (!valid) fail('invalid study preference.');
  return value;
}
function register(value, readValue, nullable = true) {
  fields(value, ['clock', 'value']);
  return {clock: clock(value.clock), value: value.value === null && nullable ? null : readValue(value.value)};
}
function reviewTotal(value) {
  const total = Object.values(value.byDevice).reduce((n, increment) => n + increment, value.base);
  if (!count(total)) fail('review count is too large.');
  return total;
}
function readReviews(value) {
  fields(value, ['base', 'byDevice']);
  if (!count(value.base)) fail('invalid review count.');
  const byDevice = map(value.byDevice, 512, n => {
    if (!count(n)) fail('invalid device review count.');
    return n;
  }, device);
  const result = {base: value.base, byDevice};
  reviewTotal(result);
  return result;
}
function readRecord(value) {
  fields(value, ['reviews'], DIMENSIONS);
  const result = {reviews: readReviews(value.reviews)};
  for (const name of DIMENSIONS) if (own(value, name)) result[name] = register(value[name], name === 'schedule' ? readSchedule : name === 'recall' ? readRecall : readCorrect);
  return result;
}
function readEvent(value) {
  fields(value, ['id', 'at', 'kind', 'correct']);
  if (!identifier(value.id) || !time(value.at) || !KINDS.has(value.kind) || typeof value.correct !== 'boolean') fail('invalid study event.');
  return {id: value.id, at: value.at, kind: value.kind, correct: value.correct};
}
function readPage(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) fail('invalid reading page.');
  return value;
}
function readFrenzySummaries(value) {
  return map(value, MAX_ENTITIES, (summary, id) => {
    const result = validateFrenzySummary(summary);
    if (result.id !== id) fail('Frenzy summary ID does not match its key.');
    return result;
  });
}
function mergeFrenzySummary(a, b) {
  const canonical = value => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]])));
  const order = compare(a.answered, b.answered) || compare(a.endedAt, b.endedAt) || compare(canonical(a), canonical(b));
  return order >= 0 ? a : b;
}

export function blankSyncDocument() {
  return {version: 1, clock: [0, 0], records: dictionary(), saved: dictionary(), reading: dictionary(), prefs: dictionary(), events: dictionary(), game: blankGameSync(), frenzy: dictionary()};
}

export function validateSyncDocument(value) {
  assertJSON(value);
  fields(value, ['version', 'clock', 'records', 'saved', 'reading', 'prefs', 'events', 'game', 'frenzy']);
  if (value.version !== 1) fail('unsupported document version.');
  const result = {
    version: 1,
    clock: pair(value.clock),
    records: map(value.records, MAX_ENTITIES, readRecord),
    saved: map(value.saved, MAX_ENTITIES, r => register(r, v => {
      if (typeof v !== 'boolean') fail('invalid saved-question state.');
      return v;
    }, false)),
    reading: map(value.reading, 1000, r => register(r, readPage)),
    prefs: map(value.prefs, 3, (r, name) => register(r, v => readPreference(v, name)), name => PREFERENCES.includes(name)),
    events: map(value.events, MAX_EVENTS, readEvent, value => identifier(value, 1024)),
    game: validateGameSync(value.game),
    frenzy: readFrenzySummaries(value.frenzy)
  };
  const registers = [...Object.values(result.saved), ...Object.values(result.reading), ...Object.values(result.prefs)];
  for (const record of Object.values(result.records)) for (const name of DIMENSIONS) if (record[name]) registers.push(record[name]);
  if (registers.some(r => comparePair(r.clock, result.clock) > 0)) fail('document clock precedes a register.');
  return result;
}

const documentOrBlank = value => value == null ? blankSyncDocument() : validateSyncDocument(value);
function mergeRegister(a, b) {
  if (!a) return b;
  if (!b) return a;
  const order = compareClock(a.clock, b.clock) || compare(JSON.stringify(a.value), JSON.stringify(b.value));
  return order >= 0 ? a : b;
}
function mergeMaps(a, b, mergeValue) {
  const result = dictionary();
  for (const name of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) result[name] = !own(a, name) ? b[name] : !own(b, name) ? a[name] : mergeValue(a[name], b[name], name);
  return result;
}
function mergeReviews(a, b) {
  return {base: Math.max(a.base, b.base), byDevice: mergeMaps(a.byDevice, b.byDevice, (x, y) => Math.max(x, y))};
}
function mergeRecord(a, b) {
  const result = {reviews: mergeReviews(a.reviews, b.reviews)};
  for (const name of DIMENSIONS) {
    const r = mergeRegister(a[name], b[name]);
    if (r) result[name] = r;
  }
  return result;
}
function mergeEvent(a, b) {
  if (!same(a, b)) fail('one study event ID has conflicting data.');
  return a;
}

export function mergeSyncDocuments(a, b) {
  a = documentOrBlank(a);
  b = documentOrBlank(b);
  return validateSyncDocument({
    version: 1,
    clock: [...(comparePair(a.clock, b.clock) >= 0 ? a.clock : b.clock)],
    records: mergeMaps(a.records, b.records, mergeRecord),
    saved: mergeMaps(a.saved, b.saved, mergeRegister),
    reading: mergeMaps(a.reading, b.reading, mergeRegister),
    prefs: mergeMaps(a.prefs, b.prefs, mergeRegister),
    events: mergeMaps(a.events, b.events, mergeEvent),
    game: mergeGameSync(a.game, b.game),
    frenzy: mergeMaps(a.frenzy, b.frenzy, mergeFrenzySummary)
  });
}

// Local progress may carry unrelated UI state or a cloud envelope. Read only the
// allowlisted fields, without walking or copying any unrelated content.
function localField(value, name) {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor) return undefined;
  if (!own(descriptor, 'value')) fail('local progress has an accessor property.');
  return descriptor.value;
}
function localObject(value) {
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid local progress.');
  return value;
}
function localRecord(value) {
  localObject(value);
  const reviews = localField(value, 'reviews');
  if (!count(reviews)) fail('invalid local review count.');
  const result = {reviews, schedule: readSchedule({due: localField(value, 'due'), stage: localField(value, 'stage'), reviewedAt: localField(value, 'reviewedAt') ?? 0})};
  const correct = localField(value, 'correct');
  if (correct !== undefined) result.mcq = readCorrect({correct, at: localField(value, 'at') ?? 0});
  const rating = localField(value, 'lastRecallRating');
  if (rating !== undefined) result.recall = readRecall({rating, at: localField(value, 'lastRecallAt') ?? 0});
  const gameCorrect = localField(value, 'lastGameCorrect');
  if (gameCorrect !== undefined) result.game = readCorrect({correct: gameCorrect, at: localField(value, 'lastGameAt') ?? 0});
  return result;
}
function localMap(value, limit, readValue) {
  if (value === undefined) return dictionary();
  localObject(value);
  const result = dictionary();
  const names = Object.keys(value).sort();
  if (names.length > limit) fail('too many local progress entries.');
  for (const name of names) {
    if (!identifier(name)) fail('invalid local progress ID.');
    result[name] = readValue(localField(value, name));
  }
  return result;
}
function localArray(value, limit) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > limit || Object.keys(value).length !== value.length || Object.getOwnPropertySymbols(value).length) fail('invalid local progress array.');
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const property = Object.getOwnPropertyDescriptor(value, String(i));
    if (!property || !own(property, 'value')) fail('invalid local progress array.');
    result.push(property.value);
  }
  return result;
}
function localProgress(value) {
  value = value == null ? {} : localObject(value);
  const rawSaved = localArray(localField(value, 'saved') ?? [], MAX_ENTITIES);
  const rawLog = localArray(localField(value, 'log') ?? [], MAX_EVENTS);
  if (rawSaved.some(id => !identifier(id))) fail('invalid saved-question list.');
  const log = rawLog.map(entry => {
    localObject(entry);
    const result = readEvent(Object.fromEntries(['id', 'at', 'kind', 'correct'].map(name => [name, localField(entry, name)])));
    const eventId = localField(entry, 'eventId');
    if (eventId !== undefined) {
      if (!identifier(eventId, 1024)) fail('invalid study event ID.');
      result.eventId = eventId;
    }
    return result;
  });
  const prefs = dictionary();
  const rawPrefs = localField(value, 'prefs');
  if (rawPrefs !== undefined) {
    localObject(rawPrefs);
    for (const name of ['sessionSize', 'fontScale']) {
      const field = localField(rawPrefs, name);
      if (field !== undefined) prefs[name] = readPreference(field, name);
    }
  }
  const goal = localField(value, 'goal');
  if (goal !== undefined) prefs.goal = readPreference(goal, 'goal');
  const frenzy = localField(value, 'frenzy');
  let frenzyCompleted = dictionary();
  if (frenzy !== undefined) {
    localObject(frenzy);
    if (localField(frenzy, 'version') !== 1) fail('unsupported local Frenzy version.');
    const completed = localField(frenzy, 'completed');
    if (completed === undefined) fail('missing local Frenzy summaries.');
    // Validate only completed metadata here. The active round belongs to this
    // device and may contain question fingerprints; it never enters the doc.
    assertJSON(completed);
    frenzyCompleted = readFrenzySummaries(completed);
  }
  return {
    records: localMap(localField(value, 'records'), MAX_ENTITIES, localRecord),
    reading: localMap(localField(value, 'reading'), 1000, readPage),
    prefs, saved: new Set(rawSaved), log, game: localField(value, 'game'), frenzy, frenzyCompleted
  };
}
const eventValue = entry => ({id: entry.id, at: entry.at, kind: entry.kind, correct: entry.correct});
const eventContent = entry => JSON.stringify([entry.id, entry.at, entry.kind, entry.correct]);
const legacyEventId = (entry, occurrence) => `legacy:${eventContent(entry)}:${occurrence}`;
function eventsByContent(events) {
  const result = new Map();
  for (const id of Object.keys(events).sort()) {
    const content = eventContent(events[id]);
    if (!result.has(content)) result.set(content, []);
    result.get(content).push(id);
  }
  return result;
}
function addEvent(events, id, value) {
  if (own(events, id)) {
    mergeEvent(events[id], value);
    return false;
  }
  events[id] = value;
  return true;
}

/**
 * Capture only actual changes from before to after, plus previously uncaptured
 * metadata. For a legacy bootstrap, omit before or pass the same progress as
 * before and after. A regular save should pass a real prior snapshot.
 *
 * Reviews use a conservative legacy checkpoint plus device counters. Independent
 * changes after a shared checkpoint add exactly; untracked old backups have no
 * causal identity, so their checkpoint is merged with max rather than summed.
 */
export function captureProgress(value, beforeProgress, afterProgress, {deviceId = 'local', now = 0, bank} = {}) {
  if (!device(deviceId) || !time(now)) fail('invalid capture device or time.');
  const initializing = value == null || beforeProgress == null;
  const result = documentOrBlank(value);
  const before = localProgress(beforeProgress);
  const after = localProgress(afterProgress);
  let seedTime = now;
  for (const record of Object.values(after.records)) for (const name of DIMENSIONS) if (record[name]) seedTime = Math.max(seedTime, name === 'schedule' ? record[name].reviewedAt : record[name].at);
  let operationClock;
  function stamp() {
    if (!operationClock) {
      const wall = Math.max(seedTime, result.clock[0]);
      const counter = wall === result.clock[0] ? result.clock[1] + 1 : 0;
      if (!count(counter)) fail('hybrid clock is exhausted.');
      result.clock = [wall, counter];
      operationClock = [wall, counter, deviceId];
    }
    return [...operationClock];
  }
  function writeRegister(target, name, previous, next, seedAt) {
    const current = target[name];
    if (next !== undefined && (!current || (!same(previous, next) && !same(current.value, next)))) {
      const c = stamp();
      target[name] = {clock: !current && seedAt !== undefined && (initializing || same(previous, next)) ? [seedAt, 0, deviceId] : c, value: next};
    } else if (next === undefined && previous !== undefined && (!current || current.value !== null)) {
      target[name] = {clock: stamp(), value: null};
    }
  }
  for (const id of [...new Set([...Object.keys(before.records), ...Object.keys(after.records)])].sort()) {
    const was = before.records[id];
    const next = after.records[id];
    const existed = own(result.records, id);
    const record = existed ? result.records[id] : {reviews: {base: 0, byDevice: dictionary()}};
    for (const name of DIMENSIONS) {
      const field = next?.[name];
      writeRegister(record, name, was?.[name], field, field === undefined ? undefined : name === 'schedule' ? field.reviewedAt : field.at);
    }
    if (next) {
      if (!existed) {
        record.reviews.base = next.reviews;
        if (next.reviews) stamp();
      } else {
        const increment = Math.max(0, next.reviews - Math.max(was?.reviews ?? 0, reviewTotal(record.reviews)));
        if (increment) {
          const n = (record.reviews.byDevice[deviceId] || 0) + increment;
          if (!count(n)) fail('review count is too large.');
          record.reviews.byDevice[deviceId] = n;
          stamp();
        }
      }
    }
    if (existed || DIMENSIONS.some(name => record[name]) || record.reviews.base) result.records[id] = record;
  }
  for (const id of [...new Set([...before.saved, ...after.saved])].sort()) {
    const previous = before.saved.has(id), next = after.saved.has(id), current = result.saved[id];
    if ((!current && next) || (previous !== next && current?.value !== next)) result.saved[id] = {clock: stamp(), value: next};
  }
  for (const id of [...new Set([...Object.keys(before.reading), ...Object.keys(after.reading)])].sort()) writeRegister(result.reading, id, before.reading[id], after.reading[id]);
  for (const name of PREFERENCES) writeRegister(result.prefs, name, before.prefs[name], after.prefs[name]);

  const beforeCounts = new Map();
  for (const entry of before.log) if (!entry.eventId) {
    const content = eventContent(entry);
    beforeCounts.set(content, (beforeCounts.get(content) || 0) + 1);
  }
  const known = eventsByContent(result.events);
  const claimed = new Set(after.log.filter(entry => entry.eventId).map(entry => entry.eventId));
  const occurrences = new Map(), noIdOccurrences = new Map();
  for (let i = 0; i < after.log.length; i++) {
    const entry = after.log[i], content = eventContent(entry), event = eventValue(entry);
    const occurrence = (occurrences.get(content) || 0) + 1;
    occurrences.set(content, occurrence);
    if (entry.eventId) {
      if (addEvent(result.events, entry.eventId, event)) stamp();
      continue;
    }
    const n = (noIdOccurrences.get(content) || 0) + 1;
    noIdOccurrences.set(content, n);
    let id;
    if (initializing || n <= (beforeCounts.get(content) || 0)) {
      id = known.get(content)?.find(id => !claimed.has(id));
      if (id) { claimed.add(id); continue; }
      id = legacyEventId(entry, occurrence);
    } else {
      const c = stamp();
      id = `event:${JSON.stringify([deviceId, c[0], c[1], i])}`;
    }
    claimed.add(id);
    if (addEvent(result.events, id, event)) stamp();
  }
  const game = captureGameSync(result.game, beforeProgress == null ? after.game : before.game, after.game, {deviceId, now, bank});
  if (!same(game, result.game)) stamp();
  result.game = game;
  const frenzy = mergeMaps(result.frenzy, after.frenzyCompleted, mergeFrenzySummary);
  if (!same(frenzy, result.frenzy)) stamp();
  result.frenzy = frenzy;
  return validateSyncDocument(result);
}

function projectedEvents(events, localLog) {
  const result = Object.assign(dictionary(), events);
  const known = eventsByContent(events);
  const claimed = new Set(localLog.filter(entry => entry.eventId).map(entry => entry.eventId));
  const occurrences = new Map();
  for (const entry of localLog) {
    const content = eventContent(entry), occurrence = (occurrences.get(content) || 0) + 1;
    occurrences.set(content, occurrence);
    let id = entry.eventId;
    if (!id) {
      id = known.get(content)?.find(candidate => !claimed.has(candidate)) || legacyEventId(entry, occurrence);
      claimed.add(id);
    }
    addEvent(result, id, eventValue(entry));
  }
  return Object.keys(result).sort((a, b) => compare(result[a].at, result[b].at) || compare(a, b)).map(eventId => ({...result[eventId], eventId}));
}

export function projectProgress(value, local, {bank} = {}) {
  const doc = documentOrBlank(value), progress = localProgress(local), records = dictionary();
  for (const id of [...new Set([...Object.keys(progress.records), ...Object.keys(doc.records)])].sort()) {
    const localRecord = progress.records[id], remote = doc.records[id];
    const values = Object.fromEntries(DIMENSIONS.map(name => [name, remote && own(remote, name) ? remote[name].value : localRecord?.[name]]));
    const schedule = values.schedule || {due: 0, stage: 0, reviewedAt: 0};
    records[id] = {
      due: schedule.due, stage: schedule.stage,
      reviews: Math.max(localRecord?.reviews || 0, remote ? reviewTotal(remote.reviews) : 0),
      at: values.mcq?.at || 0, reviewedAt: schedule.reviewedAt,
      ...(values.mcq ? {correct: values.mcq.correct} : {}),
      ...(values.recall ? {lastRecallRating: values.recall.rating, lastRecallAt: values.recall.at} : {}),
      ...(values.game ? {lastGameCorrect: values.game.correct, lastGameAt: values.game.at} : {})
    };
  }
  const saved = new Set(progress.saved), reading = Object.assign(dictionary(), progress.reading);
  for (const [id, r] of Object.entries(doc.saved)) if (r.value) saved.add(id); else saved.delete(id);
  for (const [id, r] of Object.entries(doc.reading)) if (r.value === null) delete reading[id]; else reading[id] = r.value;
  const prefs = {sessionSize: progress.prefs.sessionSize ?? 10, fontScale: progress.prefs.fontScale ?? 1};
  let goal = progress.prefs.goal ?? 10;
  for (const [name, r] of Object.entries(doc.prefs)) {
    if (name === 'goal') goal = r.value ?? 10;
    else prefs[name] = r.value ?? (name === 'sessionSize' ? 10 : 1);
  }
  const localFrenzy = validateFrenzy(progress.frenzy, bank);
  const frenzy = validateFrenzy({version: 1, completed: mergeMaps(localFrenzy.completed, doc.frenzy, mergeFrenzySummary), active: localFrenzy.active}, bank);
  return {
    records, saved: [...saved].sort(), log: projectedEvents(doc.events, progress.log),
    reading, prefs, goal, game: projectGameSync(doc.game, progress.game, {bank}), frenzy
  };
}
