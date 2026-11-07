// Lab Adventure records learning activity. XP and lab levels are cosmetic.
// This module has no storage, timers, network access, or random side effects.
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const RATINGS = new Set(['again', 'hard', 'good', 'easy']);
const COUNTERS = ['attempted', 'correct', 'recoveryAttempts', 'recoveryCorrect', 'completedRuns', 'memoryChecks'];
const LEVEL_XP = 250;
const MAX_TIME = 253402297199999;
const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'});
const own = (object, key) => Object.hasOwn(object, key);
const dictionary = () => Object.create(null);
const fail = message => { throw new Error(`Invalid Lab Adventure progress: ${message}`); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => integer(value) && value <= MAX_TIME;
const key = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !RESERVED.has(value) && !/[\u0000-\u001f\u007f]/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const counters = () => Object.fromEntries(COUNTERS.map(name => [name, 0]));

function dayKey(now) {
  if (!timestamp(now)) fail('invalid date.');
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}
function assertJSON(value, path = new Set(), depth = 0, budget = {remaining: 1000000}) {
  if (--budget.remaining < 0 || depth > 32) fail('data is too large or deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!object(value) && !Array.isArray(value)) fail('data must contain only JSON values.');
  if (path.has(value)) fail('circular data.');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('invalid object.');
  if (Object.getOwnPropertySymbols(value).length) fail('invalid property.');
  path.add(value);
  if (Array.isArray(value)) {
    if (value.length > budget.remaining || Object.keys(value).length !== value.length) fail('invalid array.');
    for (let index = 0; index < value.length; index++) if (!own(value, index)) fail('invalid array.');
  }
  for (const name of Object.keys(value)) {
    if (RESERVED.has(name)) fail('reserved property name.');
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !own(descriptor, 'value')) fail('invalid property.');
    assertJSON(descriptor.value, path, depth + 1, budget);
  }
  path.delete(value);
}
function readCounters(value) {
  if (!object(value) || COUNTERS.some(name => !integer(value[name]))) fail('invalid activity counts.');
  if (value.correct > value.attempted || value.recoveryCorrect > value.recoveryAttempts) fail('invalid answer counts.');
  return Object.fromEntries(COUNTERS.map(name => [name, value[name]]));
}
function idList(value) {
  if (!Array.isArray(value) || value.some(id => !key(id)) || new Set(value).size !== value.length) fail('invalid question IDs.');
  return [...value];
}
function sum(values) {
  const result = values.reduce((total, value) => total + value, 0);
  if (!integer(result)) fail('activity counts are too large.');
  return result;
}
function fingerprint(q) {
  return JSON.stringify([q.topic, q.question, q.options, q.answer, q.context || '', q.sharedContext || '']);
}
function selfContained(q) {
  return object(q) && key(q.id) && key(q.topic) && !q.needsSource
    && typeof q.question === 'string' && q.question.trim().length > 0 && q.question.length <= 280
    && !/\b(?:above|below|image|figure|diagram|photograph|photomicrograph|micrograph|illustration|plate)\b|\b(?:refer to|as shown|matching questions?)\b/i.test(q.question)
    && (q.context == null || q.context === '')
    && (q.sharedContext == null || q.sharedContext === '')
    && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6
    && q.options.every(option => typeof option === 'string' && option.trim().length > 0 && option.length <= 110)
    && q.question.length + q.options.reduce((length, option) => length + option.length, 0) <= 650
    && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
}

/** Only consider the supplied active bank; no excluded/source-only IDs are restored. */
export function eligibleQuestions(bank, {topic = ''} = {}) {
  if (!Array.isArray(bank)) return [];
  const counts = new Map();
  for (const q of bank) if (q && typeof q.id === 'string') counts.set(q.id, (counts.get(q.id) || 0) + 1);
  return bank.filter(q => selfContained(q) && counts.get(q.id) === 1 && (!topic || topic === 'all' || q.topic === topic));
}

export function blankGame() {
  return {version: 1, xp: 0, sequence: 0, stats: {...counters(), topics: dictionary()}, questions: dictionary(), days: dictionary(), active: null};
}

function readActive(value, bank) {
  if (!object(value) || !key(value.id) || typeof value.topic !== 'string' || value.topic && !key(value.topic)
    || !validDay(value.day) || !timestamp(value.startedAt) || dayKey(value.startedAt) !== value.day
    || !['question', 'feedback', 'complete'].includes(value.phase) || !integer(value.index)
    || !integer(value.elapsedMs) || !integer(value.runXP) || ![0, 10].includes(value.completionXP)
    || !Array.isArray(value.queue) || value.queue.length < 5 || value.queue.length > 7
    || !Array.isArray(value.answers) || !Array.isArray(value.recalls)) fail('invalid active run.');
  const available = bank === undefined ? null : new Map(eligibleQuestions(bank).map(q => [q.id, q]));
  const initial = new Set();
  const queue = value.queue.map((entry, index) => {
    if (!object(entry) || !key(entry.id) || entry.recovery !== (index >= 5) || typeof entry.fingerprint !== 'string'
      || entry.fingerprint.length > 6000) fail('invalid run queue.');
    let snapshot;
    try { snapshot = JSON.parse(entry.fingerprint); } catch { fail('invalid question snapshot.'); }
    if (!Array.isArray(snapshot) || snapshot.length !== 6) fail('invalid question snapshot.');
    const q = {id: entry.id, topic: snapshot[0], question: snapshot[1], options: snapshot[2], answer: snapshot[3], context: snapshot[4], sharedContext: snapshot[5]};
    if (!selfContained(q) || fingerprint(q) !== entry.fingerprint || value.topic && q.topic !== value.topic) fail('invalid question snapshot.');
    if (index < 5) {
      if (initial.has(entry.id)) fail('duplicate initial question.');
      initial.add(entry.id);
    } else if (!initial.has(entry.id)) fail('invalid recovery question.');
    if (available && (!available.has(entry.id) || fingerprint(available.get(entry.id)) !== entry.fingerprint)) fail('question is no longer available.');
    return {id: entry.id, recovery: entry.recovery, fingerprint: entry.fingerprint};
  });
  const complete = value.phase === 'complete';
  if (value.index > queue.length || complete && value.index !== queue.length || !complete && value.index >= queue.length
    || value.answers.length !== value.index + (value.phase === 'feedback' ? 1 : 0)
    || complete && (!timestamp(value.completedAt) || value.completedAt < value.startedAt)
    || !complete && (value.completedAt !== null || value.completionXP !== 0)) fail('invalid run phase.');
  let lastAt = value.startedAt;
  const answers = value.answers.map((answer, index) => {
    const entry = queue[index], snapshot = JSON.parse(entry.fingerprint);
    if (!object(answer) || answer.id !== entry.id || answer.recovery !== entry.recovery
      || !Number.isInteger(answer.optionIndex) || answer.optionIndex < 0 || answer.optionIndex >= snapshot[2].length
      || answer.correct !== (answer.optionIndex === snapshot[3]) || !timestamp(answer.at) || answer.at < lastAt
      || !(answer.correct ? [0, 15, 20] : [0, 5]).includes(answer.xp)) fail('invalid run answer.');
    lastAt = answer.at;
    return {id: answer.id, recovery: answer.recovery, optionIndex: answer.optionIndex, correct: answer.correct, at: answer.at, xp: answer.xp};
  });
  const recoveries = answers.filter(answer => !answer.recovery && !answer.correct).slice(0, 2).map(answer => answer.id);
  if (queue.length !== 5 + recoveries.length || queue.slice(5).some((entry, index) => entry.id !== recoveries[index])
    || value.runXP !== sum(answers.map(answer => answer.xp)) + value.completionXP
    || complete && value.completedAt < lastAt) fail('invalid run score.');
  const recalled = new Set();
  const recalls = value.recalls.map(recall => {
    if (!object(recall) || !key(recall.id) || recalled.has(recall.id) || !RATINGS.has(recall.rating)
      || !timestamp(recall.at) || recall.at < value.startedAt || complete && recall.at > value.completedAt
      || !answers.some(answer => answer.id === recall.id && answer.at <= recall.at)) fail('invalid memory check.');
    recalled.add(recall.id);
    return {id: recall.id, rating: recall.rating, at: recall.at};
  });
  return {id: value.id, topic: value.topic, day: value.day, phase: value.phase, queue, index: value.index, answers,
    elapsedMs: value.elapsedMs, runXP: value.runXP, completionXP: value.completionXP, startedAt: value.startedAt, completedAt: value.completedAt, recalls};
}

export function validActiveRun(active, bank) {
  try { assertJSON(active); readActive(active, bank); return true; } catch { return false; }
}

/** Malformed totals are rejected. A stale/damaged session is dropped without losing earned progress. */
export function validateGame(value, bank) {
  if (value === undefined) return blankGame(); // Backups before Lab Adventure have no game field.
  assertJSON(value);
  if (!object(value) || value.version !== 1 || !integer(value.xp) || !integer(value.sequence)
    || !object(value.stats) || !object(value.stats.topics) || !object(value.questions) || !object(value.days)) fail('invalid saved data.');
  const result = blankGame();
  result.xp = value.xp;
  result.sequence = value.sequence;
  result.stats = {...readCounters(value.stats), topics: dictionary()};
  for (const [topic, stats] of Object.entries(value.stats.topics)) {
    if (!key(topic)) fail('invalid subject.');
    result.stats.topics[topic] = readCounters(stats);
    if (stats.completedRuns > result.stats.completedRuns) fail('invalid subject run count.');
  }
  for (const name of COUNTERS.filter(name => name !== 'completedRuns')) {
    if (sum(Object.values(result.stats.topics).map(stats => stats[name])) !== result.stats[name]) fail('inconsistent subject counts.');
  }
  const subjectRuns = sum(Object.values(result.stats.topics).map(stats => stats.completedRuns));
  if (subjectRuns < result.stats.completedRuns || Math.ceil(subjectRuns / 5) > result.stats.completedRuns) fail('inconsistent subject run counts.');
  for (const [id, record] of Object.entries(value.questions)) {
    if (!key(id) || !object(record) || !integer(record.attempts) || !record.attempts || !integer(record.correct)
      || !integer(record.misses) || record.attempts !== record.correct + record.misses
      || !integer(record.recoveryAttempts) || record.recoveryAttempts > record.misses
      || !integer(record.recoveryCorrect) || record.recoveryCorrect > record.recoveryAttempts
      || !timestamp(record.lastAt) || typeof record.lastCorrect !== 'boolean'
      || !record.correct && record.lastCorrect || !record.misses && !record.lastCorrect) fail('invalid question activity.');
    result.questions[id] = {attempts: record.attempts, correct: record.correct, misses: record.misses,
      recoveryAttempts: record.recoveryAttempts, recoveryCorrect: record.recoveryCorrect, lastAt: record.lastAt, lastCorrect: record.lastCorrect};
  }
  const records = Object.values(result.questions);
  for (const [stat, field] of [['attempted', 'attempts'], ['correct', 'correct'], ['recoveryAttempts', 'recoveryAttempts'], ['recoveryCorrect', 'recoveryCorrect']]) {
    if (sum(records.map(record => record[field])) !== result.stats[stat]) fail('inconsistent answer counts.');
  }
  for (const [day, data] of Object.entries(value.days)) {
    if (!validDay(day) || !object(data) || !integer(data.completedRuns) || !integer(data.xp)) fail('invalid daily activity.');
    const attempted = idList(data.attempted), correct = idList(data.correct), recall = idList(data.recall);
    if ([...attempted, ...correct, ...recall].some(id => !own(result.questions, id)) || correct.some(id => !attempted.includes(id))
      || data.xp !== attempted.length * 5 + correct.length * 15 + Math.min(data.completedRuns, 3) * 10) fail('inconsistent daily activity.');
    result.days[day] = {attempted, correct, recall, completedRuns: data.completedRuns, xp: data.xp};
  }
  const days = Object.values(result.days);
  if (sum(days.map(day => day.xp)) !== result.xp || sum(days.map(day => day.completedRuns)) !== result.stats.completedRuns
    || sum(days.map(day => day.recall.length)) !== result.stats.memoryChecks || result.sequence < result.stats.completedRuns
    || Math.ceil(result.stats.attempted / 5) > result.sequence || Math.ceil(result.stats.recoveryAttempts / 2) > result.sequence
    || result.stats.completedRuns > Math.floor(result.stats.attempted / 5) || result.stats.memoryChecks > result.stats.attempted
    || sum(days.map(day => day.attempted.length)) > result.stats.attempted + result.stats.recoveryAttempts
    || sum(days.map(day => day.correct.length)) > result.stats.correct + result.stats.recoveryCorrect) fail('inconsistent totals.');
  // Session corruption must not erase valid historical statistics.
  if (value.active !== null && value.active !== undefined) {
    try {
      const active = readActive(value.active, bank);
      if (active.id !== `${active.day}:${result.sequence}` || active.runXP > result.xp
        || active.answers.some(answer => !result.days[dayKey(answer.at)]?.attempted.includes(answer.id)
          || answer.correct && !result.days[dayKey(answer.at)]?.correct.includes(answer.id))
        || active.recalls.some(recall => !result.days[dayKey(recall.at)]?.recall.includes(recall.id))
        || active.phase === 'complete' && !result.days[dayKey(active.completedAt)]?.completedRuns) fail('session is not recorded.');
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
function daily(game, now) {
  const day = dayKey(now);
  if (!own(game.days, day)) game.days[day] = {attempted: [], correct: [], recall: [], completedRuns: 0, xp: 0};
  return game.days[day];
}
function subject(game, topic) {
  if (!own(game.stats.topics, topic)) game.stats.topics[topic] = counters();
  return game.stats.topics[topic];
}
function increment(value, name) {
  if (!integer(value[name] + 1)) fail('activity counts are too large.');
  value[name]++;
}
function addElapsed(active, elapsedMs) {
  if (!integer(elapsedMs) || !integer(active.elapsedMs + elapsedMs)) fail('invalid elapsed time.');
  active.elapsedMs += elapsedMs;
}
function checkActionTime(active, now) {
  dayKey(now);
  if (now < Math.max(active.startedAt, active.answers.at(-1)?.at || 0, active.recalls.at(-1)?.at || 0)) fail('action predates saved progress.');
}
function award(game, day, amount) {
  if (!integer(game.xp + amount)) fail('XP is too large.');
  game.xp += amount;
  day.xp += amount;
  game.active.runXP += amount;
}

/** Five distinct initial questions, with a stable mix of unseen, missed, and familiar items. */
export function startRun(value, bank, {topic = '', now = Date.now(), seed = 0} = {}) {
  const game = validateGame(value, bank);
  const day = dayKey(now);
  if (game.active && game.active.phase !== 'complete') return game;
  if (topic === 'all') topic = '';
  if (typeof topic !== 'string' || topic && !key(topic) || !['string', 'number'].includes(typeof seed) || typeof seed === 'number' && !Number.isFinite(seed)) fail('invalid run settings.');
  const candidates = eligibleQuestions(bank, {topic});
  if (candidates.length < 5) { game.active = null; return game; }
  if (!integer(game.sequence + 1)) fail('too many runs.');
  game.sequence++;
  const salt = `${day}:${game.sequence}:${topic}:${seed}`;
  const pools = [[], [], []];
  for (const q of candidates) {
    const record = own(game.questions, q.id) ? game.questions[q.id] : null;
    pools[!record ? 0 : record.lastCorrect === false ? 1 : 2].push(q);
  }
  for (const pool of pools) pool.sort((a, b) => hash(`${salt}:${a.id}`) - hash(`${salt}:${b.id}`) || a.id.localeCompare(b.id));
  const chosen = [0, 1, 0, 1, 2].map(preferred => {
    const pool = pools[preferred].length ? pools[preferred] : pools.find(items => items.length);
    return pool.shift();
  });
  game.active = {id: `${day}:${game.sequence}`, topic, day, phase: 'question',
    queue: chosen.map(q => ({id: q.id, recovery: false, fingerprint: fingerprint(q)})), index: 0, answers: [],
    elapsedMs: 0, runXP: 0, completionXP: 0, startedAt: now, completedAt: null, recalls: []};
  return game;
}

/** Repeated submission during feedback is a no-op. elapsedMs is an added duration. */
export function answerRun(value, bank, optionIndex, {now = Date.now(), elapsedMs = 0} = {}) {
  const game = validateGame(value, bank), active = game.active;
  if (!active || active.phase !== 'question') return game;
  checkActionTime(active, now);
  const entry = active.queue[active.index], q = bank.find(item => item.id === entry.id);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= q.options.length) fail('invalid answer choice.');
  addElapsed(active, elapsedMs);
  const correct = optionIndex === q.answer, day = daily(game, now), stats = subject(game, q.topic);
  const record = own(game.questions, q.id) ? game.questions[q.id] : {attempts: 0, correct: 0, misses: 0, recoveryAttempts: 0, recoveryCorrect: 0, lastAt: now, lastCorrect: false};
  let xp = 0;
  if (!day.attempted.includes(q.id)) { day.attempted.push(q.id); xp += 5; }
  if (correct && !day.correct.includes(q.id)) { day.correct.push(q.id); xp += 15; }
  if (entry.recovery) {
    increment(game.stats, 'recoveryAttempts'); increment(stats, 'recoveryAttempts'); increment(record, 'recoveryAttempts');
    if (correct) { increment(game.stats, 'recoveryCorrect'); increment(stats, 'recoveryCorrect'); increment(record, 'recoveryCorrect'); }
  } else {
    increment(game.stats, 'attempted'); increment(stats, 'attempted'); increment(record, 'attempts');
    record.lastCorrect = correct;
    if (correct) { increment(game.stats, 'correct'); increment(stats, 'correct'); increment(record, 'correct'); } else {
      increment(record, 'misses');
      if (active.queue.length < 7) active.queue.push({...entry, recovery: true});
    }
  }
  record.lastAt = now;
  game.questions[q.id] = record;
  active.answers.push({id: q.id, recovery: entry.recovery, optionIndex, correct, at: now, xp});
  active.phase = 'feedback';
  award(game, day, xp);
  return game;
}

/** Advance feedback, awarding completion only once and for the first three runs that day. */
export function nextRun(value, bank, {now = Date.now(), elapsedMs = 0} = {}) {
  const game = validateGame(value, bank), active = game.active;
  if (!active || active.phase !== 'feedback') return game;
  checkActionTime(active, now);
  addElapsed(active, elapsedMs);
  active.index++;
  if (active.index < active.queue.length) { active.phase = 'question'; return game; }
  active.phase = 'complete';
  active.completedAt = now;
  const day = daily(game, now);
  increment(day, 'completedRuns');
  increment(game.stats, 'completedRuns');
  const topics = new Set(active.queue.slice(0, 5).map(entry => JSON.parse(entry.fingerprint)[0]));
  for (const topic of topics) increment(subject(game, topic), 'completedRuns');
  active.completionXP = day.completedRuns <= 3 ? 10 : 0;
  award(game, day, active.completionXP);
  return game;
}

/** A self-rating is separate from MCQ correctness and awards no XP. */
export function rateRecall(value, bank, rating, {now = Date.now()} = {}) {
  const game = validateGame(value, bank), active = game.active;
  if (!active || active.phase !== 'feedback') return game;
  if (!RATINGS.has(rating)) fail('invalid memory rating.');
  checkActionTime(active, now);
  const id = active.queue[active.index].id, q = bank.find(item => item.id === id), check = q.teaching?.quickCheck;
  if (!check || typeof check.question !== 'string' || !check.question.trim() || typeof check.answer !== 'string' || !check.answer.trim()
    || active.recalls.some(recall => recall.id === id)) return game;
  active.recalls.push({id, rating, at: now});
  const day = daily(game, now);
  if (!day.recall.includes(id)) {
    day.recall.push(id);
    increment(game.stats, 'memoryChecks');
    increment(subject(game, q.topic), 'memoryChecks');
  }
  return game;
}

export function pauseRun(value, bank, {elapsedMs = 0} = {}) {
  const game = validateGame(value, bank);
  if (game.active && game.active.phase !== 'complete') addElapsed(game.active, elapsedMs);
  return game;
}

export function gameSummary(value, {now = Date.now()} = {}) {
  const game = validateGame(value), day = dayKey(now);
  const today = game.days[day] || {attempted: [], correct: [], recall: [], completedRuns: 0, xp: 0};
  const quest = (id, label, current, target) => ({id, label, current, target, complete: current >= target});
  const level = Math.floor(game.xp / LEVEL_XP) + 1;
  return {xp: game.xp, level, nextLevelXP: level * LEVEL_XP, levelProgress: (game.xp % LEVEL_XP) / LEVEL_XP,
    stats: game.stats, uniqueAttempted: Object.keys(game.questions).length,
    today: {day, xp: today.xp, attempted: today.attempted.length, correct: today.correct.length, completedRuns: today.completedRuns, memoryChecks: today.recall.length},
    quests: [quest('run', 'Finish one run', today.completedRuns, 1), quest('questions', 'Attempt five different questions', today.attempted.length, 5), quest('memory', 'Rate two different memory checks', today.recall.length, 2)],
    subjects: Object.entries(game.stats.topics).sort(([a], [b]) => a.localeCompare(b)).map(([topic, stats]) => ({topic, ...stats, level: Math.floor(stats.attempted / 25) + 1})),
    active: game.active};
}
