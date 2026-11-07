// Content-free Lab Adventure replication. Historical v5 totals have no event
// IDs, so one deterministic, highest-effort legacy checkpoint is retained.
// Differing pre-sync histories cannot be added safely. New runs have install-
// scoped IDs; replaying a document or a copied profile cannot award XP twice.
import {blankGame, validateGame} from './game.js';

const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const RATINGS = new Set(['again', 'hard', 'good', 'easy']);
const COUNTERS = ['attempted', 'correct', 'recoveryAttempts', 'recoveryCorrect', 'completedRuns', 'memoryChecks'];
const RUN_ID = /^g-[a-f0-9]{32}$/;
const CHECKPOINT_ID = /^c-[a-f0-9]{32}$/;
const MAX_TIME = 253402297199999;
const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'});
const own = (value, name) => Object.hasOwn(value, name);
const dictionary = () => Object.create(null);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => integer(value) && value <= MAX_TIME;
const key = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !RESERVED.has(value) && !/[\u0000-\u001f\u007f]/.test(value);
const fail = message => { throw new Error(`Invalid Lab Adventure sync: ${message}`); };
const counters = () => Object.fromEntries(COUNTERS.map(name => [name, 0]));
const compareText = (a, b) => a === b ? 0 : a < b ? -1 : 1;

function assertJSON(value, path = new Set(), depth = 0, budget = {left: 1000000, bytes: 16 * 1024 * 1024}) {
  if (--budget.left < 0 || depth > 32) fail('data is too large or deeply nested.');
  budget.bytes -= typeof value === 'string' ? value.length * 2 + 2 : 8;
  if (budget.bytes < 0) fail('data is too large.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if ((!object(value) && !Array.isArray(value)) || path.has(value)) fail('expected non-circular JSON data.');
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid object.');
  if (Object.getOwnPropertySymbols(value).length) fail('invalid property.');
  if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length + (Array.isArray(value) ? 1 : 0)) fail('non-JSON property.');
  if (Array.isArray(value) && (Object.keys(value).length !== value.length || value.length > budget.left)) fail('invalid array.');
  if (Array.isArray(value)) for (let index = 0; index < value.length; index++) if (!own(value, index)) fail('invalid array.');
  path.add(value);
  for (const name of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    budget.bytes -= name.length * 2 + 3;
    if (budget.bytes < 0 || RESERVED.has(name) || !descriptor || !own(descriptor, 'value')) fail('invalid property.');
    assertJSON(descriptor.value, path, depth + 1, budget);
  }
  path.delete(value);
}
function fields(value, names, label) {
  if (!object(value) || Object.keys(value).length !== names.length || names.some(name => !own(value, name))) fail(`invalid ${label}.`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${canonical(value[name])}`).join(',')}}`;
  return JSON.stringify(value);
}
// A stable 128-bit identifier over metadata, never a question-content snapshot.
function digest(value) {
  const text = canonical(value);
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = 0xdeadbeef;
  for (let index = 0; index < text.length; index++) {
    const ch = text.charCodeAt(index);
    a = Math.imul(a ^ ch, 0x85ebca6b); b = Math.imul(b ^ ch, 0xc2b2ae35);
    c = Math.imul(c ^ ch, 0x27d4eb2f); d = Math.imul(d ^ ch, 0x165667b1);
    a ^= b >>> 13; b ^= c >>> 15; c ^= d >>> 16; d ^= a >>> 11;
  }
  return [a, b, c, d].map(number => (number >>> 0).toString(16).padStart(8, '0')).join('');
}
function dayKey(at) {
  if (!timestamp(at)) fail('invalid time.');
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date(at)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const at = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day;
}
function add(value, name, amount = 1) {
  if (!integer(value[name] + amount)) fail('activity counts are too large.');
  value[name] += amount;
}
function subject(game, topic) {
  if (!own(game.stats.topics, topic)) game.stats.topics[topic] = counters();
  return game.stats.topics[topic];
}
function daily(game, at) {
  const day = dayKey(at);
  if (!own(game.days, day)) game.days[day] = {attempted: [], correct: [], recall: [], completedRuns: 0, xp: 0};
  return game.days[day];
}
function strippedGame(game) {
  const result = validateGame(game);
  result.active = null;
  for (const day of Object.values(result.days)) {
    day.attempted.sort(); day.correct.sort(); day.recall.sort();
  }
  return result;
}

export function blankGameSync() {
  return {version: 1, checkpoint: null, runs: dictionary()};
}

function readRun(value, id) {
  fields(value, ['id', 'deviceId', 'legacy', 'localId', 'topic', 'day', 'startedAt', 'phase', 'index', 'queue', 'answers', 'recalls', 'elapsedMs', 'completedAt', 'updatedAt'], 'run');
  if (!RUN_ID.test(id) || value.id !== id || !key(value.deviceId) || typeof value.legacy !== 'boolean' || !key(value.localId)
    || typeof value.topic !== 'string' || value.topic && !key(value.topic) || !validDay(value.day)
    || !timestamp(value.startedAt) || dayKey(value.startedAt) !== value.day
    || !['question', 'feedback', 'complete'].includes(value.phase) || !integer(value.index)
    || !integer(value.elapsedMs) || !timestamp(value.updatedAt) || value.updatedAt < value.startedAt
    || !Array.isArray(value.queue) || value.queue.length < 5 || value.queue.length > 7
    || !Array.isArray(value.answers) || !Array.isArray(value.recalls)) fail('invalid run.');
  const sequence = Number(value.localId.slice(value.day.length + 1));
  if (value.localId !== `${value.day}:${sequence}` || !integer(sequence) || sequence < 1) fail('invalid local run identity.');
  const initial = new Map();
  const queue = value.queue.map((entry, index) => {
    fields(entry, ['id', 'topic', 'recovery'], 'run queue');
    if (!key(entry.id) || !key(entry.topic) || entry.recovery !== (index >= 5) || value.topic && entry.topic !== value.topic) fail('invalid run queue.');
    if (index < 5) {
      if (initial.has(entry.id)) fail('duplicate initial question.');
      initial.set(entry.id, entry.topic);
    } else if (initial.get(entry.id) !== entry.topic) fail('invalid recovery question.');
    return {id: entry.id, topic: entry.topic, recovery: entry.recovery};
  });
  const complete = value.phase === 'complete';
  if (value.index > queue.length || complete && value.index !== queue.length || !complete && value.index >= queue.length
    || value.answers.length !== value.index + (value.phase === 'feedback' ? 1 : 0)
    || complete && !timestamp(value.completedAt) || !complete && value.completedAt !== null) fail('invalid run phase.');
  let lastAt = value.startedAt;
  const answers = value.answers.map((answer, index) => {
    fields(answer, ['id', 'recovery', 'correct', 'at'], 'run answer');
    if (answer.id !== queue[index]?.id || answer.recovery !== queue[index]?.recovery || typeof answer.correct !== 'boolean'
      || !timestamp(answer.at) || answer.at < lastAt) fail('invalid run answer.');
    lastAt = answer.at;
    return {id: answer.id, recovery: answer.recovery, correct: answer.correct, at: answer.at};
  });
  const recovery = answers.filter(answer => !answer.recovery && !answer.correct).slice(0, 2);
  if (queue.length !== 5 + recovery.length || queue.slice(5).some((entry, index) => entry.id !== recovery[index].id)
    || complete && value.completedAt < lastAt) fail('invalid run recovery.');
  const recalled = new Set();
  let recallAt = value.startedAt;
  const recalls = value.recalls.map(recall => {
    fields(recall, ['id', 'rating', 'at'], 'memory check');
    if (!key(recall.id) || recalled.has(recall.id) || !RATINGS.has(recall.rating) || !timestamp(recall.at) || recall.at < recallAt
      || complete && recall.at > value.completedAt || !answers.some(answer => answer.id === recall.id && answer.at <= recall.at)) fail('invalid memory check.');
    recalled.add(recall.id); recallAt = recall.at;
    return {id: recall.id, rating: recall.rating, at: recall.at};
  });
  if (value.updatedAt < Math.max(lastAt, recallAt, value.completedAt || 0)) fail('invalid update time.');
  return {id, deviceId: value.deviceId, legacy: value.legacy, localId: value.localId, topic: value.topic, day: value.day,
    startedAt: value.startedAt, phase: value.phase, index: value.index, queue, answers, recalls,
    elapsedMs: value.elapsedMs, completedAt: value.completedAt, updatedAt: value.updatedAt};
}
function checkpointId(game, covered) { return `c-${digest([game, covered])}`; }
function readMetadata(value) {
  if (value === undefined) return blankGameSync();
  assertJSON(value);
  fields(value, ['version', 'checkpoint', 'runs'], 'saved data');
  if (value.version !== 1 || !object(value.runs)) fail('invalid saved data.');
  const result = blankGameSync();
  for (const id of Object.keys(value.runs).sort()) result.runs[id] = readRun(value.runs[id], id);
  if (value.checkpoint !== null) {
    const checkpoint = value.checkpoint;
    fields(checkpoint, ['id', 'game', 'covered'], 'legacy checkpoint');
    if (typeof checkpoint.id !== 'string' || !CHECKPOINT_ID.test(checkpoint.id) || !object(checkpoint.covered)) fail('invalid legacy checkpoint.');
    let game;
    try { game = strippedGame(checkpoint.game); } catch { fail('invalid legacy totals.'); }
    if (canonical(checkpoint.game) !== canonical(game)) fail('legacy checkpoint must contain only normalized totals.');
    const covered = dictionary();
    for (const id of Object.keys(checkpoint.covered).sort()) {
      const offset = checkpoint.covered[id], run = result.runs[id];
      fields(offset, ['answers', 'answerHash', 'recalls', 'complete'], 'checkpoint run offset');
      if (!run || !integer(offset.answers) || offset.answers > run.answers.length || !Array.isArray(offset.recalls)
        || typeof offset.answerHash !== 'string' || !/^[a-f0-9]{32}$/.test(offset.answerHash)
        || offset.recalls.some(questionId => !key(questionId)) || new Set(offset.recalls).size !== offset.recalls.length
        || typeof offset.complete !== 'boolean') fail('invalid checkpoint run offset.');
      if (run.answers.slice(0, offset.answers).some(answer => !game.days[dayKey(answer.at)]?.attempted.includes(answer.id))
        || offset.recalls.some(questionId => !own(game.questions, questionId))
        || offset.complete && (run.completedAt === null || !game.days[dayKey(run.completedAt)]?.completedRuns)) fail('unrecorded checkpoint run.');
      covered[id] = {answers: offset.answers, answerHash: offset.answerHash, recalls: [...offset.recalls].sort(), complete: offset.complete};
    }
    if (checkpoint.id !== checkpointId(game, covered)) fail('invalid checkpoint identity.');
    result.checkpoint = {id: checkpoint.id, game, covered};
  } else if (Object.keys(result.runs).length) fail('runs require a legacy checkpoint.');
  return result;
}

function aggregate(metadata) {
  const game = metadata.checkpoint ? strippedGame(metadata.checkpoint.game) : blankGame();
  const answers = [], recalls = [], completions = [];
  for (const run of Object.values(metadata.runs)) {
    const offset = metadata.checkpoint?.covered[run.id];
    // A pre-sync round from a discarded checkpoint is part of that ambiguous
    // old history. Only the selected checkpoint's unfinished round continues.
    // Already-complete checkpoints and their immutable prefixes cannot replay.
    if (run.legacy && (!offset || offset.complete || offset.answerHash !== digest(run.answers.slice(0, offset.answers)))) continue;
    if (!offset) add(game, 'sequence');
    for (let index = offset?.answers || 0; index < run.answers.length; index++) {
      answers.push({runId: run.id, index, topic: run.queue[index].topic, ...run.answers[index]});
    }
    for (const recall of run.recalls) if (!offset?.recalls.includes(recall.id)) {
      recalls.push({runId: run.id, topic: run.queue.find(entry => entry.id === recall.id).topic, ...recall});
    }
    if (run.completedAt !== null && !offset?.complete) completions.push(run);
  }
  answers.sort((a, b) => a.at - b.at || compareText(a.runId, b.runId) || a.index - b.index);
  for (const answer of answers) {
    const stats = subject(game, answer.topic), day = daily(game, answer.at);
    const record = own(game.questions, answer.id) ? game.questions[answer.id]
      : {attempts: 0, correct: 0, misses: 0, recoveryAttempts: 0, recoveryCorrect: 0, lastAt: 0, lastCorrect: false};
    const attempted = answer.recovery ? 'recoveryAttempts' : 'attempted';
    const correct = answer.recovery ? 'recoveryCorrect' : 'correct';
    add(game.stats, attempted); add(stats, attempted); add(record, answer.recovery ? 'recoveryAttempts' : 'attempts');
    if (answer.correct) { add(game.stats, correct); add(stats, correct); add(record, correct); }
    else if (!answer.recovery) add(record, 'misses');
    if (answer.at >= record.lastAt) {
      record.lastAt = answer.at;
      if (!answer.recovery) record.lastCorrect = answer.correct;
    }
    game.questions[answer.id] = record;
    if (!day.attempted.includes(answer.id)) day.attempted.push(answer.id);
    if (answer.correct && !day.correct.includes(answer.id)) day.correct.push(answer.id);
  }
  recalls.sort((a, b) => a.at - b.at || compareText(a.runId, b.runId) || compareText(a.id, b.id));
  for (const recall of recalls) {
    const day = daily(game, recall.at);
    if (!day.recall.includes(recall.id)) {
      day.recall.push(recall.id); add(game.stats, 'memoryChecks'); add(subject(game, recall.topic), 'memoryChecks');
    }
  }
  completions.sort((a, b) => a.completedAt - b.completedAt || compareText(a.id, b.id));
  for (const run of completions) {
    add(daily(game, run.completedAt), 'completedRuns'); add(game.stats, 'completedRuns');
    for (const topic of new Set(run.queue.slice(0, 5).map(entry => entry.topic))) add(subject(game, topic), 'completedRuns');
  }
  game.xp = 0;
  for (const day of Object.values(game.days)) {
    day.attempted.sort(); day.correct.sort(); day.recall.sort();
    day.xp = day.attempted.length * 5 + day.correct.length * 15 + Math.min(day.completedRuns, 3) * 10;
    add(game, 'xp', day.xp);
  }
  try { return validateGame(game); } catch { fail('inconsistent replicated totals.'); }
}

/** Reject malformed metadata rather than silently discarding earned activity. */
export function validateGameSync(value) {
  const result = readMetadata(value);
  aggregate(result);
  return result;
}

function compareCheckpoint(a, b) {
  if (!a || !b) return a ? 1 : b ? -1 : 0;
  const effort = game => BigInt(game.stats.attempted) + BigInt(game.stats.recoveryAttempts);
  const aRank = [effort(a.game), BigInt(a.game.stats.completedRuns), BigInt(a.game.stats.memoryChecks), BigInt(a.game.xp), BigInt(a.game.sequence)];
  const bRank = [effort(b.game), BigInt(b.game.stats.completedRuns), BigInt(b.game.stats.memoryChecks), BigInt(b.game.xp), BigInt(b.game.sequence)];
  for (let index = 0; index < aRank.length; index++) if (aRank[index] !== bRank[index]) return aRank[index] > bRank[index] ? 1 : -1;
  return compareText(canonical(a), canonical(b));
}
function compareRun(a, b) {
  const progress = run => run.index + run.answers.length + (run.phase === 'complete' ? 1 : 0);
  for (const [left, right] of [[progress(a), progress(b)], [a.recalls.length, b.recalls.length], [a.updatedAt, b.updatedAt], [a.elapsedMs, b.elapsedMs]]) {
    if (left !== right) return left > right ? 1 : -1;
  }
  return compareText(canonical(a), canonical(b));
}

/** Union run identities; a deterministic furthest branch wins for a copied run. */
export function mergeGameSync(a, b) {
  const left = validateGameSync(a), right = validateGameSync(b), result = blankGameSync();
  result.checkpoint = compareCheckpoint(left.checkpoint, right.checkpoint) >= 0 ? left.checkpoint : right.checkpoint;
  for (const id of [...new Set([...Object.keys(left.runs), ...Object.keys(right.runs)])].sort()) {
    const first = left.runs[id], second = right.runs[id];
    if (first && second && (canonical(runReference(first)) !== canonical(runReference(second))
      || first.topic !== second.topic || first.deviceId !== second.deviceId || first.legacy !== second.legacy)) fail('conflicting run identity.');
    result.runs[id] = !first ? second : !second ? first : compareRun(first, second) >= 0 ? first : second;
  }
  return validateGameSync(result);
}

function activeReference(active) {
  return [active.id, active.startedAt, active.queue.slice(0, 5).map(entry => [entry.id, JSON.parse(entry.fingerprint)[0]])];
}
function runReference(run) {
  return [run.localId, run.startedAt, run.queue.slice(0, 5).map(entry => [entry.id, entry.topic])];
}
function sameRun(run, active) { return canonical(runReference(run)) === canonical(activeReference(active)); }
function sameActive(a, b) { return a && b && canonical(activeReference(a)) === canonical(activeReference(b)); }
function runFromActive(active, {id, deviceId, legacy, now}) {
  const latest = Math.max(active.startedAt, active.answers.at(-1)?.at || 0, active.recalls.at(-1)?.at || 0, active.completedAt || 0);
  return {id, deviceId, legacy, localId: active.id, topic: active.topic, day: active.day, startedAt: active.startedAt,
    phase: active.phase, index: active.index,
    queue: active.queue.map(entry => ({id: entry.id, topic: JSON.parse(entry.fingerprint)[0], recovery: entry.recovery})),
    answers: active.answers.map(({id, recovery, correct, at}) => ({id, recovery, correct, at})),
    recalls: active.recalls.map(({id, rating, at}) => ({id, rating, at})),
    elapsedMs: active.elapsedMs, completedAt: active.completedAt, updatedAt: Math.max(now, latest)};
}
function findRun(metadata, active, {deviceId, continuing = true} = {}) {
  const matches = Object.values(metadata.runs).filter(run => sameRun(run, active));
  const owned = matches.filter(run => run.deviceId === deviceId && !run.legacy);
  if (owned.length) return owned.sort(compareRun).at(-1);
  if (active.syncId && metadata.runs[active.syncId] && sameRun(metadata.runs[active.syncId], active)) return metadata.runs[active.syncId];
  if (!continuing) return null;
  return matches.sort(compareRun).at(-1) || null;
}
function captureActive(metadata, active, {deviceId, now, continuing, legacy = false}) {
  const existing = findRun(metadata, active, {deviceId, continuing});
  const id = existing?.id || active.syncId || `g-${digest([legacy ? 'legacy' : deviceId, activeReference(active)])}`;
  const run = runFromActive(active, {id, deviceId: existing?.deviceId || (legacy ? 'legacy' : deviceId), legacy: existing?.legacy ?? legacy, now});
  if (existing) {
    const unchanged = {...run, updatedAt: existing.updatedAt};
    if (canonical(unchanged) === canonical(existing)) return existing;
  }
  metadata.runs[id] = !existing || compareRun(run, existing) > 0 ? run : existing;
  return metadata.runs[id];
}

/** Capture a local transition before upload. Call even for an unfinished run. */
export function captureGameSync(previousMetadata, beforeGame, afterGame, {deviceId = globalThis.crypto?.randomUUID?.(), now = Date.now(), bank} = {}) {
  if (!key(deviceId) || !timestamp(now)) fail('invalid capture settings.');
  const metadata = validateGameSync(previousMetadata);
  const before = validateGame(beforeGame, bank), after = validateGame(afterGame, bank);
  if (metadata.checkpoint === null) {
    const game = strippedGame(before), covered = dictionary();
    // Existing partial answers already belong to the checkpoint. Keep their
    // run identity so finishing that round adds only subsequent events.
    if (before.active) {
      const run = captureActive(metadata, before.active, {deviceId, now, continuing: true, legacy: true});
      covered[run.id] = {answers: before.active.answers.length, answerHash: digest(run.answers),
        recalls: before.active.recalls.map(recall => recall.id).sort(), complete: before.active.phase === 'complete'};
    }
    metadata.checkpoint = {id: checkpointId(game, covered), game, covered};
  }
  const same = !!sameActive(before.active, after.active);
  // A completed round in a v5 checkpoint is historical, not a newly started
  // sync run. Reopening or repeatedly projecting it must not replay it.
  if (before.active && (before.active.phase !== 'complete' || findRun(metadata, before.active, {deviceId}))) {
    captureActive(metadata, before.active, {deviceId, now, continuing: true});
  }
  if (after.active && (!same || after.active.phase !== 'complete' || findRun(metadata, after.active, {deviceId}))) {
    captureActive(metadata, after.active, {deviceId, now, continuing: same});
  }
  return validateGameSync(metadata);
}

/** Shared counters are projected onto this phone's own round, never a remote queue. */
export function projectGameSync(value, localGame, {bank} = {}) {
  const metadata = validateGameSync(value), local = validateGame(localGame, bank), game = aggregate(metadata);
  game.sequence = Math.max(game.sequence, local.sequence);
  if (local.active) {
    const matching = findRun(metadata, local.active);
    const syncId = matching?.id || local.active.syncId || `g-${digest(['local', activeReference(local.active)])}`;
    game.active = {...local.active, syncId};
  }
  return validateGame(game, bank);
}
