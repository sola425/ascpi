// Local, untimed Quiz Show rules. Spoken words never enter this model.
// The host UI owns listening, confirmation, explanations and session storage.
import {eligibleQuestions} from './game.js';
import {hasCompleteTeaching} from './teaching.js';

const HEARTS = 3, MAX_QUESTIONS = 15, MAX_TIME = 253402297199999;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, name) => Object.prototype.hasOwnProperty.call(value, name);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const dictionary = () => Object.create(null);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => integer(value) && value <= MAX_TIME;
const key = value => typeof value === 'string' && value.length > 0 && value.length <= 200
  && !RESERVED.has(value) && !/[\u0000-\u001f\u007f]/.test(value);
const compare = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const last = values => values[values.length - 1];
const fail = message => { throw new Error(`Invalid Quiz Show progress: ${message}`); };

function assertJSON(value, path = new Set(), depth = 0, budget = {nodes: 1000000, bytes: 16 * 1024 * 1024}) {
  if (--budget.nodes < 0 || depth > 32) fail('data is too large or deeply nested.');
  budget.bytes -= typeof value === 'string' ? value.length * 2 + 2 : 8;
  if (budget.bytes < 0) fail('data is too large.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if ((!object(value) && !Array.isArray(value)) || path.has(value)) fail('expected non-circular JSON data.');
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype
    : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid object.');
  if (Object.getOwnPropertySymbols(value).length) fail('invalid property.');
  const names = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== names.length + (Array.isArray(value) ? 1 : 0)) fail('non-JSON property.');
  if (Array.isArray(value)) {
    if (names.length !== value.length || value.length > budget.nodes) fail('invalid array.');
    for (let index = 0; index < value.length; index++) if (!own(value, index)) fail('invalid array.');
  }
  path.add(value);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    budget.bytes -= name.length * 2 + 3;
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
function topics(value, deduplicate = false) {
  if (!Array.isArray(value) || value.length > 200 || value.some(topic => !key(topic))) fail('invalid subjects.');
  for (let index = 0; index < value.length; index++) if (!own(value, index)) fail('invalid subjects.');
  const unique = new Set(value);
  if (!deduplicate && unique.size !== value.length) fail('duplicate subject.');
  return [...unique].sort();
}
function coreQuestion(q) {
  return object(q) && key(q.id) && key(q.topic) && typeof q.question === 'string'
    && q.question.trim().length > 0 && q.question.length <= 600
    && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6
    && q.options.every(option => typeof option === 'string' && option.trim().length > 0 && option.length <= 160)
    && q.question.length + q.options.reduce((total, option) => total + option.length, 0) <= 1400
    && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length
    && [q.context, q.sharedContext].every(value => value == null || typeof value === 'string' && value.length <= 3000)
    && ['bookId', 'documentId', 'contextDocumentId'].every(name => q[name] == null || q[name] === '' || key(q[name]))
    && ['page', 'contextPage'].every(name => q[name] == null || integer(q[name]) && q[name] <= 20000);
}
function visualQuestion(q) {
  return coreQuestion(q) && (q.needsSource === true || !!q.context || !!q.sharedContext
    || /\b(?:above|below|image|figure|diagram|photograph|photomicrograph|micrograph|illustration|plate)\b|\b(?:refer to|as shown)\b/i.test(q.question));
}
function eligible(bank, includeVisual = false) {
  const audio = eligibleQuestions(bank).filter(q => coreQuestion(q) && fingerprint(q).length <= 16000);
  if (!includeVisual || !Array.isArray(bank)) return audio;
  const counts = new Map();
  for (const q of bank) if (q && typeof q.id === 'string') counts.set(q.id, (counts.get(q.id) || 0) + 1);
  const ids = new Set(audio.map(q => q.id));
  return [...audio, ...bank.filter(q => visualQuestion(q) && hasCompleteTeaching(q) && fingerprint(q).length <= 16000
    && counts.get(q.id) === 1 && !ids.has(q.id))];
}
/** Use the same eligibility rules for topic counts and actual round selection. */
export function eligibleHostQuestions(bank, {includeVisual = false} = {}) {
  if (typeof includeVisual !== 'boolean') fail('invalid visual setting.');
  return eligible(bank, includeVisual);
}
function fingerprint(q) {
  return JSON.stringify([q.topic, q.question, q.options, q.answer, q.context || '', q.sharedContext || '',
    q.needsSource === true, q.bookId || '', q.documentId || '', q.page || 0, q.contextDocumentId || '', q.contextPage || 0]);
}
function snapshot(entry, includeVisual) {
  let parts;
  try { parts = JSON.parse(entry.fingerprint); } catch { fail('invalid question snapshot.'); }
  if (!Array.isArray(parts) || parts.length !== 12 || typeof parts[6] !== 'boolean') fail('invalid question snapshot.');
  const q = {id: entry.id, topic: parts[0], question: parts[1], options: parts[2], answer: parts[3],
    context: parts[4], sharedContext: parts[5], needsSource: parts[6], bookId: parts[7], documentId: parts[8],
    page: parts[9], contextDocumentId: parts[10], contextPage: parts[11]};
  if (!coreQuestion(q) || (eligibleQuestions([q]).length !== 1 && !(includeVisual && visualQuestion(q)))
    || fingerprint(q) !== entry.fingerprint) fail('invalid question snapshot.');
  return q;
}
function terminal(active) { return active.hearts === 0 || active.responses.length === active.queue.length; }
function summaryOf(active) {
  const skipped = active.responses.filter(response => response.skipped).length;
  return {id: active.id, topics: [...active.topics], questionCount: active.queue.length,
    answered: active.responses.length - skipped, correct: active.responses.filter(response => response.correct).length,
    skipped, hearts: active.hearts, score: active.score, startedAt: active.startedAt,
    endedAt: active.endedAt, reason: active.reason};
}
function readSummary(value) {
  fields(value, ['id', 'topics', 'questionCount', 'answered', 'correct', 'skipped', 'hearts', 'score', 'startedAt', 'endedAt', 'reason'], 'completed summary');
  const selected = topics(value.topics);
  if (!key(value.id) || !integer(value.questionCount) || value.questionCount < 1 || value.questionCount > MAX_QUESTIONS
    || !integer(value.answered) || !integer(value.correct) || value.correct > value.answered
    || !integer(value.skipped) || value.skipped > 1 || value.answered + value.skipped < 1
    || value.answered + value.skipped > value.questionCount || !integer(value.hearts) || value.hearts > HEARTS
    || value.hearts !== HEARTS - (value.answered - value.correct) || value.score !== value.correct * 100
    || !timestamp(value.startedAt) || !timestamp(value.endedAt) || value.endedAt < value.startedAt
    || !['hearts', 'finished'].includes(value.reason) || (value.reason === 'hearts') !== (value.hearts === 0)
    || value.reason === 'finished' && value.answered + value.skipped !== value.questionCount) fail('invalid completed summary.');
  return {id: value.id, topics: selected, questionCount: value.questionCount, answered: value.answered,
    correct: value.correct, skipped: value.skipped, hearts: value.hearts, score: value.score,
    startedAt: value.startedAt, endedAt: value.endedAt, reason: value.reason};
}
function readActive(value, bank) {
  fields(value, ['id', 'topics', 'includeVisual', 'queue', 'index', 'phase', 'startedAt', 'hearts', 'score',
    'responses', 'lifelines', 'hiddenChoices', 'hintShown', 'recalls', 'endedAt', 'reason'], 'active round');
  const selected = topics(value.topics);
  if (!key(value.id) || typeof value.includeVisual !== 'boolean' || !Array.isArray(value.queue)
    || value.queue.length < 1 || value.queue.length > MAX_QUESTIONS || !integer(value.index) || value.index >= value.queue.length
    || !['question', 'feedback', 'complete'].includes(value.phase) || !timestamp(value.startedAt)
    || !integer(value.hearts) || value.hearts > HEARTS || !integer(value.score)
    || !Array.isArray(value.responses) || value.responses.length > value.queue.length) fail('invalid active round.');
  const available = bank === undefined ? null : new Map(eligible(bank, value.includeVisual).map(q => [q.id, q]));
  const seen = new Set(), snapshots = [];
  const queue = value.queue.map(entry => {
    fields(entry, ['id', 'fingerprint'], 'queue entry');
    if (!key(entry.id) || seen.has(entry.id) || typeof entry.fingerprint !== 'string' || entry.fingerprint.length > 16000) fail('invalid queue entry.');
    const q = snapshot(entry, value.includeVisual);
    if (selected.length && !selected.includes(q.topic) || available && (!available.has(entry.id)
      || fingerprint(available.get(entry.id)) !== entry.fingerprint)) fail('question is no longer available.');
    seen.add(entry.id); snapshots.push(q);
    return {id: entry.id, fingerprint: entry.fingerprint};
  });
  let lastAt = value.startedAt, misses = 0, correct = 0, skipped = 0;
  const responses = value.responses.map((response, index) => {
    fields(response, ['id', 'choice', 'correct', 'skipped', 'at'], 'response');
    const q = snapshots[index];
    if (!q || misses >= HEARTS || response.id !== q.id || typeof response.correct !== 'boolean'
      || typeof response.skipped !== 'boolean' || !timestamp(response.at) || response.at < lastAt
      || response.skipped && (response.choice !== null || response.correct)
      || !response.skipped && (!Number.isInteger(response.choice) || response.choice < 0 || response.choice >= q.options.length
        || response.correct !== (response.choice === q.answer))) fail('invalid response.');
    if (response.skipped) skipped++;
    else if (response.correct) correct++;
    else misses++;
    lastAt = response.at;
    return {id: response.id, choice: response.choice, correct: response.correct, skipped: response.skipped, at: response.at};
  });
  if (skipped > 1 || value.hearts !== HEARTS - misses || value.score !== correct * 100
    || responses.length !== value.index + (value.phase === 'question' ? 0 : 1)) fail('invalid round score or position.');
  const ended = value.hearts === 0 || responses.length === queue.length;
  if (value.phase === 'question' && ended || value.phase === 'complete' && !ended
    || !ended && (value.endedAt !== null || value.reason !== null)
    || ended && (value.endedAt !== lastAt || value.reason !== (value.hearts === 0 ? 'hearts' : 'finished'))) fail('invalid round phase.');
  fields(value.lifelines, ['fifty', 'hint', 'skip'], 'lifelines');
  if (Object.values(value.lifelines).some(used => typeof used !== 'boolean')
    || value.lifelines.skip !== (skipped === 1) || typeof value.hintShown !== 'boolean'
    || value.hintShown && !value.lifelines.hint || !Array.isArray(value.hiddenChoices)) fail('invalid lifelines.');
  const current = snapshots[value.index], hidden = [...value.hiddenChoices];
  if (hidden.some(choice => !integer(choice) || choice >= current.options.length || choice === current.answer)
    || new Set(hidden).size !== hidden.length || hidden.some((choice, index) => index && hidden[index - 1] >= choice)
    || hidden.length && (!value.lifelines.fifty || hidden.length !== current.options.length - 2)
    || value.phase !== 'question' && hidden.includes(last(responses).choice)) fail('invalid removed choices.');
  if (!object(value.recalls) || Object.keys(value.recalls).length > responses.length) fail('invalid recall ratings.');
  const recalls = dictionary();
  for (const id of Object.keys(value.recalls).sort()) {
    const response = responses.find(item => item.id === id), rating = value.recalls[id];
    fields(rating, ['rating', 'at'], 'recall rating');
    if (!key(id) || !response || !['again', 'good'].includes(rating.rating) || !timestamp(rating.at) || rating.at < response.at) fail('invalid recall rating.');
    recalls[id] = {rating: rating.rating, at: rating.at};
  }
  return {id: value.id, topics: selected, includeVisual: value.includeVisual, queue, index: value.index, phase: value.phase,
    startedAt: value.startedAt, hearts: value.hearts, score: value.score, responses,
    lifelines: {...value.lifelines}, hiddenChoices: hidden, hintShown: value.hintShown, recalls,
    endedAt: value.endedAt, reason: value.reason};
}

export function blankHostGame() { return {version: 1, completed: dictionary(), active: null}; }

/** Invalid local questions are discarded; validated completed metadata survives. */
export function validateHostGame(value, bank) {
  if (value === undefined) return blankHostGame();
  fields(value, ['version', 'completed', 'active'], 'saved data');
  if (value.version !== 1 || !object(value.completed) || Object.keys(value.completed).length > 20000) fail('invalid saved data.');
  assertJSON(value.completed);
  const result = blankHostGame();
  for (const id of Object.keys(value.completed).sort()) {
    const summary = readSummary(value.completed[id]);
    if (!key(id) || summary.id !== id) fail('inconsistent completed round ID.');
    result.completed[id] = summary;
  }
  if (value.active !== null) {
    try {
      assertJSON(value.active);
      const active = readActive(value.active, bank), ended = terminal(active);
      if (ended ? !own(result.completed, active.id)
        || JSON.stringify(result.completed[active.id]) !== JSON.stringify(summaryOf(active)) : own(result.completed, active.id)) fail('inconsistent completed round.');
      result.active = active;
    } catch { result.active = null; }
  }
  return result;
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

/** Supply an already book-filtered bank and a globally unique local run ID. */
export function startHostGame(value, bank, {topics: requested = [], limit = 15, now = Date.now(), seed = 0, runId, includeVisual = false} = {}) {
  const state = validateHostGame(value, bank);
  if (state.active && state.active.phase !== 'complete') return state;
  if (!key(runId) || !integer(limit) || limit < 1 || limit > MAX_QUESTIONS || !timestamp(now)
    || typeof includeVisual !== 'boolean' || !['number', 'string'].includes(typeof seed)
    || typeof seed === 'number' && !Number.isFinite(seed) || typeof seed === 'string' && seed.length > 2048) fail('invalid round settings.');
  const selected = topics(requested, true);
  if (own(state.completed, runId)) return state;
  const salt = JSON.stringify([runId, seed, selected]);
  const candidates = eligible(bank, includeVisual).filter(q => !selected.length || selected.includes(q.topic));
  candidates.sort((a, b) => hash(`${salt}:${a.id}`) - hash(`${salt}:${b.id}`) || compare(a.id, b.id));
  if (!candidates.length) { state.active = null; return state; }
  state.active = {id: runId, topics: selected, includeVisual, queue: candidates.slice(0, limit).map(q => ({id: q.id, fingerprint: fingerprint(q)})),
    index: 0, phase: 'question', startedAt: now, hearts: HEARTS, score: 0, responses: [],
    lifelines: {fifty: false, hint: false, skip: false}, hiddenChoices: [], hintShown: false,
    recalls: dictionary(), endedAt: null, reason: null};
  return state;
}
function checkActionTime(active, now) {
  const recallAt = Object.values(active.recalls).reduce((latest, rating) => Math.max(latest, rating.at), 0);
  if (!timestamp(now) || now < Math.max(active.startedAt, last(active.responses)?.at || 0, recallAt)) fail('action predates saved progress.');
}
function recordResponse(state, choice, skipped, now) {
  const active = state.active, q = snapshot(active.queue[active.index], active.includeVisual);
  const correct = !skipped && choice === q.answer;
  active.responses.push({id: q.id, choice, correct, skipped, at: now});
  if (correct) active.score += 100;
  else if (!skipped) active.hearts--;
  active.phase = 'feedback';
  if (terminal(active)) {
    active.endedAt = now; active.reason = active.hearts === 0 ? 'hearts' : 'finished';
    state.completed[active.id] = summaryOf(active);
  }
  return state;
}

/** Only a confirmed option is an answer. Null has no grading side effect. */
export function answerHostGame(value, bank, choice, {now = Date.now()} = {}) {
  const state = validateHostGame(value, bank), active = state.active;
  if (!active || active.phase !== 'question' || choice === null) return state;
  checkActionTime(active, now);
  const q = snapshot(active.queue[active.index], active.includeVisual);
  if (!integer(choice) || choice >= q.options.length || active.hiddenChoices.includes(choice)) fail('choose a visible answer.');
  return recordResponse(state, choice, false, now);
}

/** The terminal explanation stays in feedback until this explicit action. */
export function nextHostGame(value, bank, {now = Date.now()} = {}) {
  const state = validateHostGame(value, bank), active = state.active;
  if (!active || active.phase !== 'feedback') return state;
  checkActionTime(active, now);
  if (terminal(active)) { active.phase = 'complete'; return state; }
  active.index++; active.phase = 'question'; active.hiddenChoices = []; active.hintShown = false;
  return state;
}

/** Lifelines are learning aids. A skip is separate from an incorrect answer. */
export function useHostLifeline(value, bank, type, {now = Date.now()} = {}) {
  if (!['fifty', 'hint', 'skip'].includes(type)) fail('unknown lifeline.');
  const state = validateHostGame(value, bank), active = state.active;
  if (!active || active.phase !== 'question' || active.lifelines[type]) return state;
  checkActionTime(active, now);
  const q = snapshot(active.queue[active.index], active.includeVisual);
  if (type === 'fifty' && q.options.length === 2) return state;
  active.lifelines[type] = true;
  if (type === 'fifty') {
    active.hiddenChoices = q.options.map((_, index) => index).filter(index => index !== q.answer)
      .sort((a, b) => hash(`${active.id}:${active.index}:${a}`) - hash(`${active.id}:${active.index}:${b}`) || a - b)
      .slice(0, q.options.length - 2).sort((a, b) => a - b);
  } else if (type === 'hint') active.hintShown = true;
  else return recordResponse(state, null, true, now);
  return state;
}

/** Recall is explicitly self-rated after comparing with the model answer. */
export function rateHostRecall(value, bank, rating, {now = Date.now()} = {}) {
  if (!['again', 'good'].includes(rating)) fail('unknown recall rating.');
  const state = validateHostGame(value, bank), active = state.active;
  if (!active || active.phase !== 'feedback') return state;
  const response = last(active.responses);
  if (own(active.recalls, response.id)) return state;
  checkActionTime(active, now);
  active.recalls[response.id] = {rating, at: now};
  return state;
}

export function hostSummary(value) {
  const state = validateHostGame(value), active = state.active;
  const completed = Object.values(state.completed).sort((a, b) => b.endedAt - a.endedAt || compare(a.id, b.id));
  const responses = active?.responses || [], skipped = responses.filter(response => response.skipped).length;
  const totals = completed.reduce((total, run) => ({answered: total.answered + run.answered, correct: total.correct + run.correct,
    skipped: total.skipped + run.skipped}), {answered: 0, correct: 0, skipped: 0});
  if (!Object.values(totals).every(integer)) fail('activity counts are too large.');
  return {active, currentId: active?.queue[active.index]?.id || null, lastResponse: last(responses) || null,
    questionCount: active?.queue.length || 0, visited: responses.length, answered: responses.length - skipped,
    correct: responses.filter(response => response.correct).length, skipped, hearts: active?.hearts ?? HEARTS,
    score: active?.score || 0, terminal: !!active && terminal(active),
    ladder: active ? active.queue.map((entry, index) => ({level: index + 1, id: entry.id,
      status: responses[index] ? responses[index].skipped ? 'skipped' : responses[index].correct ? 'correct' : 'missed'
        : index === active.index ? 'current' : 'pending'})) : [],
    completed, completedRuns: completed.length, bestScore: completed.reduce((best, run) => Math.max(best, run.score), 0),
    totalAnswered: totals.answered, totalCorrect: totals.correct, totalSkipped: totals.skipped};
}
