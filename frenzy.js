// Solo Frenzy is a local wall-clock game. This module has no storage, timers,
// network access, random side effects, purchases, or shared active sessions.
// Only completed summaries are suitable for progress sync.
import {eligibleQuestions} from './game.js';

const QUESTION_MS = 30000;
const HEARTS = 3;
const MAX_QUESTIONS = 50;
const MAX_TIME = 253402297199999;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const own = (value, name) => Object.hasOwn(value, name);
const dictionary = () => Object.create(null);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => integer(value) && value <= MAX_TIME;
const key = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !RESERVED.has(value) && !/[\u0000-\u001f\u007f]/.test(value);
const compareText = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const fail = message => { throw new Error(`Invalid Frenzy progress: ${message}`); };

function assertJSON(value, path = new Set(), depth = 0, budget = {nodes: 1000000, bytes: 16 * 1024 * 1024}) {
  if (--budget.nodes < 0 || depth > 32) fail('data is too large or deeply nested.');
  budget.bytes -= typeof value === 'string' ? value.length * 2 + 2 : 8;
  if (budget.bytes < 0) fail('data is too large.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if ((!object(value) && !Array.isArray(value)) || path.has(value)) fail('expected non-circular JSON data.');
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid object.');
  if (Object.getOwnPropertySymbols(value).length) fail('invalid property.');
  const names = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== names.length + (Array.isArray(value) ? 1 : 0)) fail('non-JSON property.');
  if (Array.isArray(value)) {
    if (names.length !== value.length || value.length > budget.nodes) fail('invalid array.');
    for (let index = 0; index < value.length; index++) if (!own(value, index)) fail('invalid array.');
  }
  path.add(value);
  for (const name of names) {
    budget.bytes -= name.length * 2 + 3;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (budget.bytes < 0 || RESERVED.has(name) || !descriptor || !own(descriptor, 'value')) fail('invalid property.');
    assertJSON(descriptor.value, path, depth + 1, budget);
  }
  path.delete(value);
}
function fields(value, names, label) {
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== names.length
    || Object.keys(value).length !== names.length || names.some(name => !own(value, name))) fail(`invalid ${label}.`);
  for (const name of names) if (!own(Object.getOwnPropertyDescriptor(value, name), 'value')) fail(`invalid ${label} property.`);
}
function readTopics(value, {deduplicate = false} = {}) {
  if (!Array.isArray(value) || value.length > 200 || value.some(topic => !key(topic))) fail('invalid topics.');
  const unique = new Set(value);
  if (!deduplicate && unique.size !== value.length) fail('duplicate topic.');
  return [...unique].sort();
}
function fingerprint(q) {
  return JSON.stringify([q.topic, q.question, q.options, q.answer, q.context || '', q.sharedContext || '']);
}
function snapshot(entry) {
  let parts;
  try { parts = JSON.parse(entry.fingerprint); } catch { fail('invalid question snapshot.'); }
  if (!Array.isArray(parts) || parts.length !== 6) fail('invalid question snapshot.');
  const q = {id: entry.id, topic: parts[0], question: parts[1], options: parts[2], answer: parts[3], context: parts[4], sharedContext: parts[5]};
  if (eligibleQuestions([q]).length !== 1 || fingerprint(q) !== entry.fingerprint) fail('invalid question snapshot.');
  return q;
}
function deadline(now) {
  if (!timestamp(now) || !timestamp(now + QUESTION_MS)) fail('invalid question start time.');
  return now + QUESTION_MS;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${canonical(value[name])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function blankFrenzy() {
  return {version: 1, completed: dictionary(), active: null};
}

function readSummary(value) {
  fields(value, ['id', 'topics', 'questionCount', 'answered', 'correct', 'hearts', 'score', 'startedAt', 'endedAt', 'reason'], 'completed summary');
  const topics = readTopics(value.topics);
  if (!key(value.id) || !integer(value.questionCount) || value.questionCount < 1 || value.questionCount > MAX_QUESTIONS
    || !integer(value.answered) || value.answered < 1 || value.answered > value.questionCount
    || !integer(value.correct) || value.correct > value.answered || !integer(value.hearts) || value.hearts > HEARTS
    || value.hearts !== HEARTS - (value.answered - value.correct) || !integer(value.score) || value.score !== value.correct * 100
    || !timestamp(value.startedAt) || !timestamp(value.endedAt) || value.endedAt < value.startedAt
    || !['hearts', 'finished'].includes(value.reason) || (value.reason === 'hearts') !== (value.hearts === 0)
    || value.reason === 'finished' && value.answered !== value.questionCount) fail('invalid completed summary.');
  return {id: value.id, topics, questionCount: value.questionCount, answered: value.answered, correct: value.correct,
    hearts: value.hearts, score: value.score, startedAt: value.startedAt, endedAt: value.endedAt, reason: value.reason};
}

/** Completed metadata contains no question IDs, content snapshots, or choices. */
export function validateFrenzySummary(value) {
  assertJSON(value);
  return readSummary(value);
}

function readActive(value, bank) {
  fields(value, ['id', 'topics', 'queue', 'index', 'phase', 'startedAt', 'questionStartedAt', 'deadlineAt', 'hearts', 'score', 'responses', 'endedAt', 'reason'], 'active round');
  const topics = readTopics(value.topics);
  if (!key(value.id) || !Array.isArray(value.queue) || value.queue.length < 1 || value.queue.length > MAX_QUESTIONS
    || !integer(value.index) || value.index >= value.queue.length || !['question', 'feedback', 'complete'].includes(value.phase)
    || !timestamp(value.startedAt) || !timestamp(value.questionStartedAt) || value.questionStartedAt < value.startedAt
    || !timestamp(value.deadlineAt) || value.deadlineAt !== deadline(value.questionStartedAt)
    || !integer(value.hearts) || value.hearts > HEARTS || !integer(value.score)
    || !Array.isArray(value.responses) || value.responses.length > value.queue.length) fail('invalid active round.');
  const available = bank === undefined ? null : new Map(eligibleQuestions(bank).map(q => [q.id, q]));
  const seen = new Set(), snapshots = [];
  const queue = value.queue.map(entry => {
    fields(entry, ['id', 'fingerprint'], 'queue entry');
    if (!key(entry.id) || seen.has(entry.id) || typeof entry.fingerprint !== 'string' || entry.fingerprint.length > 6000) fail('invalid queue entry.');
    const q = snapshot(entry);
    if (topics.length && !topics.includes(q.topic) || available && (!available.has(entry.id) || fingerprint(available.get(entry.id)) !== entry.fingerprint)) fail('question is no longer available.');
    seen.add(entry.id); snapshots.push(q);
    return {id: entry.id, fingerprint: entry.fingerprint};
  });
  let lastAt = value.startedAt, misses = 0, correct = 0;
  const responses = value.responses.map((response, index) => {
    fields(response, ['id', 'choice', 'correct', 'timedOut', 'at'], 'response');
    const q = snapshots[index];
    if (response.id !== q.id || typeof response.timedOut !== 'boolean' || typeof response.correct !== 'boolean'
      || !timestamp(response.at) || response.at < lastAt || misses >= HEARTS
      || response.timedOut && (response.choice !== null || response.correct || response.at < lastAt + QUESTION_MS)
      || !response.timedOut && (!Number.isInteger(response.choice) || response.choice < 0 || response.choice >= q.options.length
        || response.correct !== (response.choice === q.answer))
      || index === 0 && !response.timedOut && response.at >= value.startedAt + QUESTION_MS) fail('invalid response.');
    if (response.correct) correct++; else misses++;
    lastAt = response.at;
    return {id: response.id, choice: response.choice, correct: response.correct, timedOut: response.timedOut, at: response.at};
  });
  if (value.hearts !== HEARTS - misses || value.score !== correct * 100) fail('invalid round score.');
  const complete = value.phase === 'complete', answered = value.phase !== 'question';
  if (responses.length !== value.index + (answered ? 1 : 0)
    || value.questionStartedAt < (responses[value.index - 1]?.at ?? value.startedAt)
    || value.index === 0 && value.questionStartedAt !== value.startedAt
    || !complete && (!value.hearts || value.endedAt !== null || value.reason !== null)
    || value.phase === 'feedback' && value.index === queue.length - 1) fail('invalid round phase.');
  if (answered) {
    const response = responses.at(-1);
    if (!response || response.at < value.questionStartedAt
      || (response.at >= value.deadlineAt) !== response.timedOut) fail('invalid response deadline.');
  } else if (value.questionStartedAt < lastAt) fail('invalid question start time.');
  if (complete && (value.endedAt !== responses.at(-1)?.at || (value.reason === 'hearts') !== (value.hearts === 0)
    || !['hearts', 'finished'].includes(value.reason) || value.reason === 'finished' && responses.length !== queue.length)) fail('invalid completed round.');
  return {id: value.id, topics, queue, index: value.index, phase: value.phase, startedAt: value.startedAt,
    questionStartedAt: value.questionStartedAt, deadlineAt: value.deadlineAt, hearts: value.hearts, score: value.score,
    responses, endedAt: value.endedAt, reason: value.reason};
}

/** A stale/corrupt local round is dropped without touching validated history. */
export function validateFrenzy(value, bank) {
  if (value === undefined) return blankFrenzy();
  fields(value, ['version', 'completed', 'active'], 'saved data');
  if (value.version !== 1 || !object(value.completed)) fail('invalid saved data.');
  assertJSON(value.completed);
  const result = blankFrenzy();
  for (const id of Object.keys(value.completed).sort()) {
    if (!key(id)) fail('invalid completed round ID.');
    const summary = readSummary(value.completed[id]);
    if (summary.id !== id) fail('inconsistent completed round ID.');
    result.completed[id] = summary;
  }
  if (value.active !== null && value.active !== undefined) {
    try {
      assertJSON(value.active);
      const active = readActive(value.active, bank);
      if (active.phase === 'complete' && !own(result.completed, active.id)) fail('completed round is not recorded.');
      // Shared history can prefer another completed branch of a copied run;
      // this phone's internally valid round remains local and resumable.
      result.active = active;
    } catch { result.active = null; }
  }
  return result;
}

function hash(text) {
  let result = 2166136261;
  for (let index = 0; index < text.length; index++) result = Math.imul(result ^ text.charCodeAt(index), 16777619);
  return result >>> 0;
}

/** The caller supplies a unique ID and an already book-filtered active bank. */
export function startFrenzy(value, bank, {topics = [], limit = 20, now = Date.now(), seed = 0, runId} = {}) {
  const state = validateFrenzy(value, bank);
  if (state.active && state.active.phase !== 'complete') return state;
  if (!key(runId) || !integer(limit) || limit < 1 || limit > MAX_QUESTIONS
    || !['string', 'number'].includes(typeof seed) || typeof seed === 'number' && !Number.isFinite(seed)) fail('invalid round settings.');
  const selected = readTopics(topics, {deduplicate: true});
  const deadlineAt = deadline(now);
  if (own(state.completed, runId)) return state;
  const candidates = eligibleQuestions(bank).filter(q => !selected.length || selected.includes(q.topic));
  if (!candidates.length) { state.active = null; return state; }
  const salt = JSON.stringify([runId, seed, selected]);
  candidates.sort((a, b) => hash(`${salt}:${a.id}`) - hash(`${salt}:${b.id}`) || compareText(a.id, b.id));
  state.active = {id: runId, topics: selected, queue: candidates.slice(0, limit).map(q => ({id: q.id, fingerprint: fingerprint(q)})),
    index: 0, phase: 'question', startedAt: now, questionStartedAt: now, deadlineAt,
    hearts: HEARTS, score: 0, responses: [], endedAt: null, reason: null};
  return state;
}

function checkActionTime(active, now) {
  if (!timestamp(now) || now < Math.max(active.questionStartedAt, active.responses.at(-1)?.at || 0)) fail('action predates saved progress.');
}
function summaryOf(active) {
  return {id: active.id, topics: [...active.topics], questionCount: active.queue.length, answered: active.responses.length,
    correct: active.responses.filter(response => response.correct).length, hearts: active.hearts, score: active.score,
    startedAt: active.startedAt, endedAt: active.endedAt, reason: active.reason};
}
function compareSummary(a, b) {
  return a.answered - b.answered || a.endedAt - b.endedAt || compareText(canonical(a), canonical(b));
}
function complete(state, now) {
  const active = state.active;
  active.phase = 'complete'; active.endedAt = now; active.reason = active.hearts === 0 ? 'hearts' : 'finished';
  const summary = summaryOf(active), previous = state.completed[active.id];
  if (!previous || compareSummary(summary, previous) > 0) state.completed[active.id] = summary;
}

/** At the exact deadline a response is a timeout, regardless of its choice. */
export function answerFrenzy(value, bank, choice, {now = Date.now()} = {}) {
  const state = validateFrenzy(value, bank), active = state.active;
  if (!active || active.phase !== 'question') return state;
  checkActionTime(active, now);
  const timedOut = now >= active.deadlineAt;
  if (!timedOut && choice === null) return state;
  const q = snapshot(active.queue[active.index]);
  if (!timedOut && (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length)) fail('invalid answer choice.');
  const correct = !timedOut && choice === q.answer;
  active.responses.push({id: q.id, choice: timedOut ? null : choice, correct, timedOut, at: now});
  if (correct) active.score += 100; else active.hearts--;
  if (!active.hearts || active.index === active.queue.length - 1) complete(state, now);
  else active.phase = 'feedback';
  return state;
}

/** Background time expires one question, then waits on its feedback screen. */
export function expireFrenzy(value, bank, {now = Date.now()} = {}) {
  return answerFrenzy(value, bank, null, {now});
}

/** Feedback has no running clock. Only this explicit action starts the next one. */
export function nextFrenzy(value, bank, {now = Date.now()} = {}) {
  const state = validateFrenzy(value, bank), active = state.active;
  if (!active || active.phase !== 'feedback') return state;
  checkActionTime(active, now);
  const deadlineAt = deadline(now);
  active.index++; active.phase = 'question'; active.questionStartedAt = now; active.deadlineAt = deadlineAt;
  return state;
}

export function frenzySummary(value, {now = Date.now()} = {}) {
  if (!timestamp(now)) fail('invalid summary time.');
  const state = validateFrenzy(value), active = state.active;
  const completed = Object.values(state.completed).sort((a, b) => b.endedAt - a.endedAt || compareText(a.id, b.id));
  const totalAnswered = completed.reduce((total, run) => total + run.answered, 0);
  const totalCorrect = completed.reduce((total, run) => total + run.correct, 0);
  if (!integer(totalAnswered) || !integer(totalCorrect)) fail('activity counts are too large.');
  return {completed, completedRuns: completed.length, bestScore: completed.reduce((best, run) => Math.max(best, run.score), 0), totalAnswered, totalCorrect,
    active, questionCount: active?.queue.length || 0, answered: active?.responses.length || 0,
    correct: active?.responses.filter(response => response.correct).length || 0,
    hearts: active?.hearts ?? HEARTS, score: active?.score || 0,
    remainingMs: active?.phase === 'question' ? Math.max(0, active.deadlineAt - now) : 0,
    lastResponse: active?.responses.at(-1) || null};
}
