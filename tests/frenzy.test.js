import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankFrenzy, validateFrenzy, validateFrenzySummary, startFrenzy, answerFrenzy, nextFrenzy, expireFrenzy, frenzySummary} from '../frenzy.js';

const NOW = Date.parse('2026-11-07T12:00:00Z'), MS = 30000, HOUR = 3600000;
const copy = value => JSON.parse(JSON.stringify(value));
const question = (id, topic = 'Numbers', changes = {}) => ({id, topic, question: `Which choice matches label ${id}?`,
  options: ['Choice A', 'Choice B', 'Choice C'], answer: 1, ...changes});
const bankOf = (size = 20, topics = ['Numbers']) => Array.from({length: size}, (_, index) => question(`item-${index}`, topics[index % topics.length]));
const start = (bank, settings = {}, state = blankFrenzy()) => startFrenzy(state, bank, {now: NOW, runId: 'run-a', ...settings});
function finish(state, bank, {correct = true, answerDelay = 0, feedbackDelay = 0} = {}) {
  while (state.active && state.active.phase !== 'complete') {
    if (state.active.phase === 'question') {
      const yes = typeof correct === 'function' ? correct(state.active.index) : correct;
      state = answerFrenzy(state, bank, yes ? 1 : 0, {now: state.active.questionStartedAt + answerDelay});
    } else state = nextFrenzy(state, bank, {now: state.active.responses.at(-1).at + feedbackDelay});
    assert.deepEqual(validateFrenzy(copy(state), bank), state);
  }
  return state;
}

test('old backups default to a fresh state and summaries expose the local wall-clock timer', () => {
  assert.deepEqual(validateFrenzy(undefined), blankFrenzy());
  assert.notEqual(blankFrenzy().completed, blankFrenzy().completed);
  const ready = frenzySummary(blankFrenzy(), {now: NOW});
  assert.equal(ready.completedRuns, 0); assert.equal(ready.hearts, 3); assert.equal(ready.remainingMs, 0);
  assert.equal(ready.active, null); assert.equal(ready.lastResponse, null);
  const state = start(bankOf()), summary = frenzySummary(state, {now: NOW + 4000});
  assert.equal(summary.questionCount, 20); assert.equal(summary.remainingMs, 26000);
  assert.equal(summary.hearts, 3); assert.deepEqual(summary.active, state.active);
  assert.equal(state.active.deadlineAt, NOW + MS);
});

test('eligibility uses only the supplied bank and chosen topics, excluding sources, long items and duplicate IDs', () => {
  const bank = [question('a'), question('b', 'Patterns'), question('c'), question('d', 'Shapes'),
    question('source', 'Numbers', {needsSource: true}), question('context', 'Numbers', {context: 'Separate case.'}),
    question('long', 'Numbers', {question: 'X'.repeat(281)}), question('long-choice', 'Numbers', {options: ['X'.repeat(111), 'Other']}),
    question('visual', 'Patterns', {question: 'Which choice matches the figure?'}), question('duplicate'), question('duplicate'),
    question('bad-answer', 'Numbers', {answer: 8}), question('__proto__'), question('constructor'), question('unsafe-topic', 'prototype')];
  const original = copy(bank), state = start(bank, {topics: ['Patterns', 'Numbers', 'Unavailable', 'Numbers'], limit: 50});
  assert.deepEqual(new Set(state.active.queue.map(entry => entry.id)), new Set(['a', 'b', 'c']));
  assert.deepEqual(state.active.topics, ['Numbers', 'Patterns', 'Unavailable']);
  const filteredBook = bank.filter(q => ['a', 'b'].includes(q.id));
  assert.deepEqual(new Set(start(filteredBook).active.queue.map(entry => entry.id)), new Set(['a', 'b']));
  assert.equal(start(bank, {topics: ['Unavailable']}).active, null);
  assert.equal(start([]).active, null); assert.deepEqual(bank, original);
});

test('queues are deterministic, stable on resume, default to twenty and never exceed fifty', () => {
  const bank = bankOf(80, ['Numbers', 'Patterns']), blank = blankFrenzy(), original = copy(blank);
  const a = start(bank, {seed: 'same'}, blank), b = start(bank, {seed: 'same'}, blank);
  assert.deepEqual(a, b); assert.equal(a.active.queue.length, 20);
  assert.equal(start(bank, {limit: 50}).active.queue.length, 50);
  assert.equal(start(bankOf(1)).active.queue.length, 1);
  assert.equal(new Set(start(bank, {limit: 50}).active.queue.map(entry => entry.id)).size, 50);
  assert.notDeepEqual(start(bank, {seed: 'different'}).active.queue, a.active.queue);
  assert.deepEqual(startFrenzy(a, bank, {now: NOW + HOUR, runId: 'another', limit: 1}), a);
  assert.deepEqual(validateFrenzy(copy(a), bank), a); assert.deepEqual(copy(blank), original);
  for (const limit of [0, -1, 0.5, 51, '20', NaN, Infinity]) assert.throws(() => start(bank, {limit}), /Invalid Frenzy progress/);
  for (const topics of [null, 'Numbers', ['constructor'], [42]]) assert.throws(() => start(bank, {topics}), /Invalid Frenzy progress/);
  for (const runId of ['', '__proto__', 'constructor', 'prototype', null]) assert.throws(() => start(bank, {runId}), /Invalid Frenzy progress/);
  for (const seed of [null, {}, NaN, Infinity]) assert.throws(() => start(bank, {seed}), /Invalid Frenzy progress/);
});

test('the exact deadline times out and cannot award a late correct answer', () => {
  const bank = bankOf(2), initial = start(bank);
  assert.deepEqual(expireFrenzy(initial, bank, {now: NOW + MS - 1}), initial);
  assert.deepEqual(answerFrenzy(initial, bank, null, {now: NOW + 1000}), initial);
  const timely = answerFrenzy(initial, bank, 1, {now: NOW + MS - 1});
  assert.equal(timely.active.score, 100); assert.equal(timely.active.hearts, 3);
  for (const at of [NOW + MS, NOW + MS + 1]) {
    const late = answerFrenzy(initial, bank, 1, {now: at});
    assert.equal(late.active.score, 0); assert.equal(late.active.hearts, 2);
    assert.deepEqual(late.active.responses[0], {id: initial.active.queue[0].id, choice: null, correct: false, timedOut: true, at});
    assert.equal(late.active.phase, 'feedback'); assert.deepEqual(validateFrenzy(copy(late), bank), late);
  }
});

test('a long background absence expires exactly one question and waits on feedback', () => {
  const bank = bankOf(), resumed = expireFrenzy(start(bank), bank, {now: NOW + 10 * HOUR});
  assert.equal(resumed.active.responses.length, 1); assert.equal(resumed.active.index, 0);
  assert.equal(resumed.active.hearts, 2); assert.equal(resumed.active.phase, 'feedback');
  assert.equal(Object.keys(resumed.completed).length, 0);
  assert.deepEqual(expireFrenzy(resumed, bank, {now: NOW + 20 * HOUR}), resumed);
  const next = nextFrenzy(resumed, bank, {now: NOW + 20 * HOUR});
  assert.equal(next.active.index, 1); assert.equal(next.active.deadlineAt, NOW + 20 * HOUR + MS);
  assert.deepEqual(expireFrenzy(next, bank, {now: next.active.deadlineAt - 1}), next);
  const expired = expireFrenzy(next, bank, {now: next.active.deadlineAt});
  assert.equal(expired.active.responses.length, 2); assert.equal(expired.active.hearts, 1);
});

test('feedback pauses the clock until explicit Next, including hours away', () => {
  const bank = bankOf(3), feedback = answerFrenzy(start(bank), bank, 0, {now: NOW + 1000});
  assert.equal(feedback.active.phase, 'feedback'); assert.equal(frenzySummary(feedback, {now: NOW + HOUR}).remainingMs, 0);
  assert.deepEqual(expireFrenzy(feedback, bank, {now: NOW + HOUR}), feedback);
  assert.deepEqual(answerFrenzy(feedback, bank, 1, {now: NOW + HOUR}), feedback);
  const next = nextFrenzy(feedback, bank, {now: NOW + HOUR});
  assert.equal(next.active.questionStartedAt, NOW + HOUR); assert.equal(next.active.deadlineAt, NOW + HOUR + MS);
  assert.equal(frenzySummary(next, {now: NOW + HOUR}).remainingMs, MS);
  assert.deepEqual(validateFrenzy(copy(next), bank), next);
});

test('the third miss ends immediately and preserves its final response for the rationale', () => {
  const bank = bankOf(20);
  let state = answerFrenzy(start(bank), bank, 0, {now: NOW});
  state = nextFrenzy(state, bank, {now: NOW + 100});
  state = expireFrenzy(state, bank, {now: state.active.deadlineAt});
  state = nextFrenzy(state, bank, {now: state.active.responses.at(-1).at + 100});
  state = answerFrenzy(state, bank, 0, {now: state.active.questionStartedAt});
  assert.equal(state.active.phase, 'complete'); assert.equal(state.active.hearts, 0);
  assert.equal(state.active.reason, 'hearts'); assert.equal(state.active.responses.length, 3);
  assert.equal(state.active.index, 2); assert.equal(state.active.score, 0);
  assert.equal(state.active.queue[state.active.index].id, state.active.responses.at(-1).id);
  assert.equal(state.completed['run-a'].questionCount, 20); assert.equal(state.completed['run-a'].answered, 3);
  assert.equal(frenzySummary(state, {now: NOW + HOUR}).lastResponse.id, state.active.responses.at(-1).id);
  assert.deepEqual(validateFrenzySummary(copy(state.completed['run-a'])), state.completed['run-a']);
  for (const next of [nextFrenzy(state, bank), expireFrenzy(state, bank), answerFrenzy(state, bank, 1)]) assert.deepEqual(next, state);
});

test('queue completion retains hearts and gives exactly one hundred per correct answer with no speed bonus', () => {
  const bank = bankOf(4), state = finish(start(bank), bank, {correct: index => index !== 1, feedbackDelay: HOUR});
  assert.equal(state.active.phase, 'complete'); assert.equal(state.active.reason, 'finished');
  assert.equal(state.active.hearts, 2); assert.equal(state.active.score, 300);
  assert.equal(state.active.responses.at(-1).correct, true);
  assert.deepEqual(state.completed['run-a'], {id: 'run-a', topics: [], questionCount: 4, answered: 4, correct: 3, hearts: 2,
    score: 300, startedAt: NOW, endedAt: NOW + 3 * HOUR, reason: 'finished'});
  const fast = finish(start(bank, {runId: 'fast'}), bank);
  const slow = finish(start(bank, {runId: 'slow'}), bank, {answerDelay: MS - 1, feedbackDelay: HOUR});
  assert.equal(fast.active.score, 400); assert.equal(slow.active.score, fast.active.score);
  assert.equal(slow.active.hearts, fast.active.hearts);
  const next = startFrenzy(fast, bank, {now: NOW + HOUR, runId: 'another'});
  assert.equal(next.active.hearts, 3); assert.equal(Object.keys(next.completed).length, 1);
  assert.equal(finish(start(bankOf(3)), bankOf(3), {correct: false}).completed['run-a'].reason, 'hearts');
});

test('duplicate submissions and expiration are idempotent and completed IDs cannot be replayed', () => {
  const bank = bankOf(1), complete = answerFrenzy(start(bank), bank, 1, {now: NOW + 100});
  assert.deepEqual(answerFrenzy(complete, bank, 1, {now: NOW + 101}), complete);
  assert.deepEqual(expireFrenzy(complete, bank, {now: NOW + HOUR}), complete);
  assert.deepEqual(startFrenzy(complete, bank, {runId: 'run-a', now: NOW + HOUR}), complete);
  assert.equal(frenzySummary(complete, {now: NOW}).completedRuns, 1);
  const wrong = answerFrenzy(start(bankOf(5)), bankOf(5), 0, {now: NOW});
  assert.deepEqual(answerFrenzy(wrong, bankOf(5), 0, {now: NOW + 10}), wrong);
  assert.deepEqual(expireFrenzy(wrong, bankOf(5), {now: NOW + HOUR}), wrong);
});

test('invalid choices and time reversal fail without mutating progress', () => {
  const bank = bankOf(), state = start(bank), original = copy(state);
  for (const choice of [-1, 3, 1.5, '1', undefined, NaN]) assert.throws(() => answerFrenzy(state, bank, choice, {now: NOW}), /answer choice/);
  for (const now of [NOW - 1, NaN, Infinity, -1, 1.5]) assert.throws(() => answerFrenzy(state, bank, 1, {now}), /Invalid Frenzy progress/);
  assert.throws(() => expireFrenzy(state, bank, {now: NOW - 1}), /predates/);
  assert.throws(() => start(bank, {now: 253402297199999}), /start time/);
  const feedback = answerFrenzy(state, bank, 1, {now: NOW + 2000});
  assert.throws(() => nextFrenzy(feedback, bank, {now: NOW + 1999}), /predates/);
  assert.deepEqual(state, validateFrenzy(original, bank));
  assert.equal(answerFrenzy(state, bank, 99, {now: NOW + MS}).active.responses[0].timedOut, true);
});

test('serialization preserves every phase and its wall-clock deadline', () => {
  const bank = bankOf(2), questionState = start(bank), feedback = answerFrenzy(questionState, bank, 1, {now: NOW + 2000});
  const next = nextFrenzy(feedback, bank, {now: NOW + HOUR}), complete = answerFrenzy(next, bank, 0, {now: NOW + HOUR + 1000});
  for (const state of [questionState, feedback, next, complete]) assert.deepEqual(validateFrenzy(copy(state), bank), state);
  const restored = validateFrenzy(copy(questionState), bank);
  assert.equal(restored.active.deadlineAt, NOW + MS);
  assert.equal(expireFrenzy(restored, bank, {now: NOW + HOUR}).active.responses.length, 1);
  assert.equal(complete.active.responses.at(-1).id, complete.active.queue.at(-1).id);
  assert.equal(complete.active.responses.at(-1).choice, 0);
});

test('corrupt or stale active rounds clear while completed history remains intact', () => {
  const bank = bankOf(), old = finish(start(bank, {limit: 2, runId: 'old'}), bank);
  const live = answerFrenzy(startFrenzy(old, bank, {now: NOW + HOUR, runId: 'live'}), bank, 1, {now: NOW + HOUR + 1000});
  const changes = [a => { a.index = 19; }, a => { a.hearts = 4; }, a => { a.hearts = 2; }, a => { a.score = 999; },
    a => { a.responses[0].correct = false; }, a => { a.responses[0].choice = 99; }, a => { a.responses[0].timedOut = true; },
    a => { a.queue[0].fingerprint = '{}'; }, a => { a.queue[1].id = a.queue[0].id; }, a => { a.deadlineAt++; },
    a => { a.startedAt++; }, a => { a.endedAt = NOW; }, a => { a.reason = 'hearts'; }, a => { a.phase = 'complete'; },
    a => { a.queue[0].id = '__proto__'; }];
  for (const change of changes) {
    const bad = copy(live); change(bad.active);
    const restored = validateFrenzy(bad, bank);
    assert.equal(restored.active, null); assert.deepEqual(restored.completed, live.completed);
  }
  const id = live.active.queue[0].id;
  for (const changed of [bank.filter(q => q.id !== id), [], bank.map(q => q.id === id ? {...q, answer: 0} : q),
    bank.map(q => q.id === id ? {...q, question: q.question + ' Changed.'} : q), bank.map(q => q.id === id ? {...q, needsSource: true} : q)]) {
    const restored = validateFrenzy(copy(live), changed);
    assert.equal(restored.active, null); assert.deepEqual(restored.completed, live.completed);
  }
  const cyclic = copy(live); cyclic.active.queue = cyclic.active;
  assert.equal(validateFrenzy(cyclic, bank).active, null);
  const getter = copy(live);
  Object.defineProperty(getter.active, 'score', {enumerable: true, get() { throw Error('getter must not execute'); }});
  assert.equal(validateFrenzy(getter, bank).active, null);
  assert.deepEqual(validateFrenzy(copy(live)).active, live.active);
});

test('completed summary validation rejects contradictory totals and all raw content', () => {
  const bank = bankOf(3), state = finish(start(bank), bank), summary = state.completed['run-a'];
  assert.deepEqual(validateFrenzySummary(copy(summary)), summary);
  assert.deepEqual(Object.keys(summary).sort(), ['answered', 'correct', 'endedAt', 'hearts', 'id', 'questionCount', 'reason', 'score', 'startedAt', 'topics']);
  for (const value of [null, [], {}, NaN, 'invalid']) assert.throws(() => validateFrenzySummary(value), /Invalid Frenzy progress/);
  const changes = [s => { s.score++; }, s => { s.correct = 4; }, s => { s.answered = 0; }, s => { s.questionCount = 51; },
    s => { s.hearts--; }, s => { s.endedAt = NOW - 1; }, s => { s.reason = 'hearts'; }, s => { s.topics = ['Numbers', 'Numbers']; },
    s => { s.id = 'constructor'; }, s => { s.question = 'private stem'; }, s => { s.queue = state.active.queue; }, s => { s.audio = 'private'; }];
  for (const change of changes) { const bad = copy(summary); change(bad); assert.throws(() => validateFrenzySummary(bad), /Invalid Frenzy progress/); }
  const serialized = JSON.stringify(state.completed);
  for (const forbidden of ['fingerprint', 'Which choice', 'Choice A', 'item-', 'choice', 'audio', 'rationale']) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test('unknown historical IDs and subjects survive bank changes and preserve a different local completed branch', () => {
  const bank = bankOf(5), local = finish(start(bank, {topics: ['Numbers']}), bank, {correct: false});
  const winner = {id: 'run-a', topics: ['Imported subject'], questionCount: 50, answered: 50, correct: 50, hearts: 3,
    score: 5000, startedAt: NOW, endedAt: NOW + HOUR, reason: 'finished'};
  const shared = copy(local); shared.completed['run-a'] = winner; shared.completed['imported-run-id'] = {...winner, id: 'imported-run-id'};
  const projected = validateFrenzy(shared, bank);
  assert.deepEqual(projected.active, local.active); assert.equal(projected.completed['run-a'].score, 5000);
  assert.equal(projected.completed['imported-run-id'].score, 5000);
  const changedBank = validateFrenzy(shared, []);
  assert.equal(changedBank.active, null); assert.deepEqual(changedBank.completed, projected.completed);
  const summary = frenzySummary(projected, {now: NOW + HOUR});
  assert.equal(summary.completedRuns, 2); assert.equal(summary.bestScore, 5000);
  assert.equal(summary.totalAnswered, 100); assert.equal(summary.totalCorrect, 100); assert.equal(summary.lastResponse.correct, false);
});

test('a finishing clone cannot overwrite a more progressed completed summary received from another phone', () => {
  const bank = bankOf(10), live = start(bank);
  live.completed['run-a'] = {id: 'run-a', topics: [], questionCount: 10, answered: 10, correct: 10, hearts: 3,
    score: 1000, startedAt: NOW, endedAt: NOW + HOUR, reason: 'finished'};
  const local = finish(live, bank, {correct: false});
  assert.equal(local.active.reason, 'hearts'); assert.equal(local.active.score, 0);
  assert.equal(local.completed['run-a'].score, 1000); assert.equal(local.completed['run-a'].answered, 10);
  assert.deepEqual(validateFrenzy(copy(local), bank), local);
});

test('malformed history, prototype payloads, non-JSON properties and invalid roots are rejected', () => {
  const bank = bankOf(1), good = finish(start(bank), bank);
  for (const value of [null, [], {}, NaN, Object.create(good), 'invalid']) assert.throws(() => validateFrenzy(value), /Invalid Frenzy progress/);
  const bad = copy(good); bad.completed['run-a'].score++;
  assert.throws(() => validateFrenzy(bad), /Invalid Frenzy progress/);
  const mismatch = copy(good); mismatch.completed['run-a'].id = 'other';
  assert.throws(() => validateFrenzy(mismatch), /Invalid Frenzy progress/);
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const reserved = copy(good); reserved.completed = JSON.parse(`{"${name}":{}}`);
    assert.throws(() => validateFrenzy(reserved), /Invalid Frenzy progress/);
  }
  const hidden = copy(good); Object.defineProperty(hidden.completed['run-a'], 'hidden', {value: 'extra'});
  assert.throws(() => validateFrenzy(hidden), /Invalid Frenzy progress/);
  const hostile = copy(good);
  Object.defineProperty(hostile.completed['run-a'], 'score', {enumerable: true, get() { throw Error('getter must not execute'); }});
  assert.throws(() => validateFrenzy(hostile), /Invalid Frenzy progress/); assert.equal({}.polluted, undefined);
});
