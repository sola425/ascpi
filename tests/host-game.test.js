import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankHostGame, validateHostGame, eligibleHostQuestions, startHostGame, answerHostGame, nextHostGame,
  useHostLifeline, rateHostRecall, hostSummary} from '../host-game.js';

const NOW = Date.parse('2026-11-09T12:00:00Z'), DAY = 86400000;
const copy = value => JSON.parse(JSON.stringify(value));
const teaching = count => ({questionInPlainEnglish: 'Compare the label with each choice.',
  explanation: 'Read the label and find the matching choice.', memory: 'Read, compare, match.',
  optionExplanations: Array.from({length: count}, (_, index) => `Compare choice ${index + 1} with the label.`),
  quickCheck: {question: 'What should you compare?', answer: 'The label and the choices.'}});
const question = (id, topic = 'Numbers', changes = {}) => ({id, topic, question: `Which choice matches label ${id}?`,
  options: ['First label', 'Second label', 'Third label', 'Fourth label'], answer: 1,
  bookId: 'source-a', documentId: 'source-a', page: 1, teaching: teaching(4), ...changes});
const bankOf = (size = 20, subjects = ['Numbers']) => Array.from({length: size}, (_, index) => question(`item-${index}`, subjects[index % subjects.length]));
const start = (bank, settings = {}, state = blankHostGame()) => startHostGame(state, bank, {now: NOW, seed: 'fixture', runId: 'host-run-a', ...settings});
const current = (state, bank) => bank.find(q => q.id === state.active.queue[state.active.index].id);
function valid(state, bank) { assert.deepEqual(validateHostGame(copy(state), bank), state); return state; }
function finish(state, bank, choose = () => true) {
  while (state.active?.phase !== 'complete') {
    if (state.active.phase === 'question') {
      const q = current(state, bank), correct = choose(state.active.index);
      state = answerHostGame(state, bank, correct ? q.answer : (q.answer + 1) % q.options.length,
        {now: NOW + state.active.index * 1000 + 1});
    } else state = nextHostGame(state, bank, {now: NOW + state.active.index * 1000 + 999});
    valid(state, bank);
  }
  return state;
}

test('fresh state has independent dictionaries and an empty readable summary', () => {
  assert.deepEqual(validateHostGame(undefined), blankHostGame());
  assert.notEqual(blankHostGame().completed, blankHostGame().completed);
  const summary = hostSummary(blankHostGame());
  assert.equal(summary.active, null); assert.equal(summary.currentId, null); assert.equal(summary.lastResponse, null);
  assert.equal(summary.hearts, 3); assert.equal(summary.score, 0); assert.equal(summary.terminal, false);
  assert.equal(summary.answered, 0); assert.equal(summary.visited, 0); assert.equal(summary.completedRuns, 0);
  assert.equal(summary.bestScore, 0); assert.deepEqual(summary.ladder, []);
});

test('deterministic queues respect requested subjects, bank scope and the fifteen-level limit', () => {
  const bank = bankOf(40, ['Numbers', 'Patterns']), before = copy(bank), blank = blankHostGame();
  const a = start(bank), b = start(bank);
  assert.deepEqual(a, b); assert.equal(a.active.queue.length, 15);
  assert.equal(new Set(a.active.queue.map(q => q.id)).size, 15);
  assert.notDeepEqual(start(bank, {seed: 'different'}).active.queue, a.active.queue);
  const filtered = start(bank, {topics: ['Patterns', 'Patterns'], limit: 10});
  assert.deepEqual(filtered.active.topics, ['Patterns']);
  assert.equal(filtered.active.queue.length, 10);
  assert.ok(filtered.active.queue.every(item => bank.find(q => q.id === item.id).topic === 'Patterns'));
  const sourceB = bank.map(q => ({...q, id: `b-${q.id}`, bookId: 'source-b', documentId: 'source-b'}));
  const selectedBook = [...bank, ...sourceB].filter(q => q.bookId === 'source-a');
  assert.ok(start(selectedBook).active.queue.every(item => bank.some(q => q.id === item.id)));
  assert.equal(start(bankOf(2)).active.queue.length, 2);
  assert.deepEqual(start(bank, {}, blank), a); assert.deepEqual(blank, blankHostGame());
  assert.deepEqual(bank, before); valid(a, bank);
});

test('only supplied unique eligible questions enter audio rounds', () => {
  const bank = [question('a'), question('b'), question('source', 'Numbers', {needsSource: true}),
    question('figure', 'Numbers', {question: 'Which choice matches the figure?'}),
    question('context', 'Numbers', {context: 'A separate diagram is required.'}),
    question('long', 'Numbers', {question: 'X'.repeat(281)}),
    question('duplicate'), question('duplicate'), question('invalid', 'Numbers', {answer: 9}),
    question('__proto__'), question('bad-topic', 'constructor')];
  assert.deepEqual(new Set(start(bank).active.queue.map(q => q.id)), new Set(['a', 'b']));
  assert.equal(start([], {limit: 5}).active, null);
  assert.equal(start(bank, {topics: ['Unavailable']}).active, null);
});

test('visual rounds explicitly opt in and require complete teaching for additional figures', () => {
  const bank = [question('audio'), question('figure', 'Patterns', {question: 'Which label belongs in the figure?', needsSource: true}),
    question('case', 'Patterns', {sharedContext: 'Compare the labels in this drawing.'}),
    question('without-teaching', 'Patterns', {needsSource: true, teaching: undefined}),
    question('too-long', 'Patterns', {needsSource: true, question: 'X'.repeat(601)})];
  const state = start(bank, {includeVisual: true});
  assert.deepEqual(new Set(state.active.queue.map(q => q.id)), new Set(['audio', 'figure', 'case']));
  assert.equal(state.active.includeVisual, true); valid(state, bank);
  const figures = start(bank, {includeVisual: true, topics: ['Patterns']});
  assert.deepEqual(new Set(figures.active.queue.map(q => q.id)), new Set(['figure', 'case']));
  const stale = bank.map(q => q.id === 'figure' ? {...q, teaching: undefined} : q);
  assert.equal(validateHostGame(state, stale).active, null);
  assert.deepEqual(eligibleHostQuestions(bank).map(q => q.id), ['audio']);
  assert.deepEqual(new Set(eligibleHostQuestions(bank, {includeVisual: true}).map(q => q.id)), new Set(state.active.queue.map(q => q.id)));
  assert.equal(eligibleHostQuestions(null).length, 0);
  assert.throws(() => eligibleHostQuestions(bank, {includeVisual: 'true'}), /Invalid Quiz Show progress/);
});

test('settings reject invalid IDs, sizes, dates, seeds and malformed subject arrays', () => {
  const bank = bankOf();
  for (const limit of [0, -1, 0.5, 16, '15', NaN, Infinity]) assert.throws(() => start(bank, {limit}), /Invalid Quiz Show progress/);
  for (const runId of ['', null, 'constructor', '__proto__', 'prototype', 'X'.repeat(201)]) assert.throws(() => start(bank, {runId}), /Invalid Quiz Show progress/);
  for (const topics of [null, 'Numbers', [42], ['constructor'], new Array(1)]) assert.throws(() => start(bank, {topics}), /Invalid Quiz Show progress/);
  for (const seed of [null, {}, [], NaN, Infinity, 'X'.repeat(2049)]) assert.throws(() => start(bank, {seed}), /Invalid Quiz Show progress/);
  for (const now of [-1, 0.5, NaN, Infinity, 253402297200000]) assert.throws(() => start(bank, {now}), /Invalid Quiz Show progress/);
  for (const includeVisual of [null, 1, 'true']) assert.throws(() => start(bank, {includeVisual}), /Invalid Quiz Show progress/);
});

test('a saved unfinished round resumes without reshuffling or replacement', () => {
  const bank = bankOf(), active = start(bank);
  assert.deepEqual(startHostGame(active, bank, {runId: 'host-run-b', topics: ['Other'], limit: 1, now: NOW + DAY}), active);
  const answered = answerHostGame(active, bank, current(active, bank).answer, {now: NOW + 1000});
  assert.deepEqual(startHostGame(answered, bank, {runId: 'host-run-b', now: NOW + DAY}), answered);
  assert.equal(answered.active.phase, 'feedback'); valid(answered, bank);
});

test('questions and explanations have no deadline or hidden time penalties', () => {
  const bank = bankOf(2), initial = start(bank), q = current(initial, bank);
  const answered = answerHostGame(initial, bank, q.answer, {now: NOW + 100 * DAY});
  assert.equal(answered.active.score, 100); assert.equal(answered.active.hearts, 3);
  assert.equal(answered.active.phase, 'feedback'); assert.equal(answered.active.index, 0);
  assert.deepEqual(answerHostGame(answered, bank, 0, {now: NOW + 200 * DAY}), answered);
  const next = nextHostGame(answered, bank, {now: NOW + 200 * DAY});
  assert.equal(next.active.phase, 'question'); assert.equal(next.active.index, 1); valid(next, bank);
});

test('only confirmed choices grade, and duplicate submissions cannot alter a result', () => {
  const bank = bankOf(2), initial = start(bank), q = current(initial, bank), before = copy(initial);
  assert.deepEqual(answerHostGame(initial, bank, null, {now: NOW + 100}), initial);
  for (const choice of [-1, 0.5, 4, '1', undefined, NaN]) assert.throws(() => answerHostGame(initial, bank, choice, {now: NOW + 100}), /visible answer/);
  const answered = answerHostGame(initial, bank, q.answer, {now: NOW + 100});
  assert.equal(answered.active.score, 100); assert.equal(answered.active.hearts, 3); assert.equal(answered.active.responses.length, 1);
  assert.equal(answered.active.responses[0].skipped, false);
  assert.deepEqual(answerHostGame(answered, bank, 0, {now: NOW + 200}), answered);
  assert.deepEqual(copy(initial), before); valid(answered, bank);
});

test('three wrong confirmed answers end play while retaining the final explanation', () => {
  const bank = bankOf(15); let state = start(bank);
  for (let index = 0; index < 3; index++) {
    state = answerHostGame(state, bank, 0, {now: NOW + index * 1000 + 1});
    assert.equal(state.active.hearts, 2 - index); assert.equal(state.active.phase, 'feedback');
    if (index < 2) state = nextHostGame(state, bank, {now: NOW + index * 1000 + 2});
  }
  const summary = hostSummary(state);
  assert.equal(summary.terminal, true); assert.equal(summary.score, 0); assert.equal(summary.answered, 3);
  assert.equal(summary.completedRuns, 1); assert.equal(summary.currentId, state.active.responses[2].id);
  assert.equal(state.active.reason, 'hearts'); assert.equal(state.active.index, 2);
  assert.deepEqual(answerHostGame(state, bank, 1, {now: NOW + DAY}), state);
  const complete = nextHostGame(state, bank, {now: NOW + DAY});
  assert.equal(complete.active.phase, 'complete'); assert.equal(complete.active.endedAt, NOW + 2001);
  assert.deepEqual(nextHostGame(complete, bank, {now: NOW + 2 * DAY}), complete); valid(complete, bank);
});

test('a correct final answer records one completion but waits for explicit Next', () => {
  const bank = bankOf(1), initial = start(bank), q = current(initial, bank);
  const feedback = answerHostGame(initial, bank, q.answer, {now: NOW + 1});
  assert.equal(feedback.active.phase, 'feedback'); assert.equal(hostSummary(feedback).terminal, true);
  assert.equal(feedback.active.reason, 'finished'); assert.equal(feedback.active.hearts, 3);
  const summary = feedback.completed['host-run-a'];
  assert.deepEqual(summary, {id: 'host-run-a', topics: [], questionCount: 1, answered: 1, correct: 1, skipped: 0,
    hearts: 3, score: 100, startedAt: NOW, endedAt: NOW + 1, reason: 'finished'});
  const complete = nextHostGame(feedback, bank, {now: NOW + DAY});
  assert.equal(complete.active.phase, 'complete'); assert.deepEqual(complete.completed, feedback.completed); valid(complete, bank);
});

test('50/50 always retains the keyed answer and exactly one wrong answer', () => {
  for (const count of [3, 4, 5, 6]) {
    const bank = [question(`options-${count}`, 'Numbers', {options: Array.from({length: count}, (_, index) => `Label ${index + 1}`), teaching: teaching(count)})];
    const initial = start(bank), reduced = useHostLifeline(initial, bank, 'fifty', {now: NOW + 1});
    assert.equal(reduced.active.lifelines.fifty, true); assert.equal(reduced.active.hiddenChoices.length, count - 2);
    assert.equal(reduced.active.hiddenChoices.includes(1), false);
    assert.equal(new Set(reduced.active.hiddenChoices).size, count - 2);
    assert.deepEqual(useHostLifeline(initial, bank, 'fifty', {now: NOW + 1}), reduced);
    assert.deepEqual(useHostLifeline(reduced, bank, 'fifty', {now: NOW + 2}), reduced);
    assert.throws(() => answerHostGame(reduced, bank, reduced.active.hiddenChoices[0], {now: NOW + 2}), /visible answer/);
    assert.equal(answerHostGame(reduced, bank, 1, {now: NOW + 2}).active.score, 100); valid(reduced, bank);
  }
});

test('50/50 does not consume a lifeline when a question already has two options', () => {
  const bank = [question('two-options', 'Numbers', {options: ['First label', 'Second label'], teaching: teaching(2)})];
  const initial = start(bank);
  assert.deepEqual(useHostLifeline(initial, bank, 'fifty', {now: NOW + 1}), initial);
});

test('hint and 50/50 remain spent across questions, while their current-question display resets', () => {
  const bank = bankOf(2); let state = start(bank);
  state = useHostLifeline(state, bank, 'fifty', {now: NOW + 1});
  state = useHostLifeline(state, bank, 'hint', {now: NOW + 2});
  assert.equal(state.active.hintShown, true); assert.equal(state.active.lifelines.hint, true);
  assert.deepEqual(useHostLifeline(state, bank, 'hint', {now: NOW + 3}), state);
  state = answerHostGame(state, bank, 1, {now: NOW + 3});
  assert.equal(state.active.hiddenChoices.length, 2); assert.equal(state.active.hintShown, true);
  assert.deepEqual(useHostLifeline(state, bank, 'skip', {now: NOW + 4}), state);
  state = nextHostGame(state, bank, {now: NOW + 4});
  assert.deepEqual(state.active.hiddenChoices, []); assert.equal(state.active.hintShown, false);
  assert.equal(state.active.lifelines.fifty, true); assert.equal(state.active.lifelines.hint, true);
  assert.deepEqual(useHostLifeline(state, bank, 'fifty', {now: NOW + 5}), state);
  assert.deepEqual(useHostLifeline(state, bank, 'hint', {now: NOW + 5}), state); valid(state, bank);
});

test('a skip shows teaching without losing a heart or counting an incorrect attempt', () => {
  const bank = bankOf(2), initial = start(bank), state = useHostLifeline(initial, bank, 'skip', {now: NOW + 1});
  assert.equal(state.active.phase, 'feedback'); assert.equal(state.active.hearts, 3); assert.equal(state.active.score, 0);
  assert.deepEqual(state.active.responses[0], {id: initial.active.queue[0].id, choice: null, correct: false, skipped: true, at: NOW + 1});
  const summary = hostSummary(state);
  assert.equal(summary.visited, 1); assert.equal(summary.answered, 0); assert.equal(summary.skipped, 1);
  assert.equal(summary.ladder[0].status, 'skipped');
  const next = nextHostGame(state, bank, {now: NOW + 2});
  assert.equal(next.active.lifelines.skip, true);
  assert.deepEqual(useHostLifeline(next, bank, 'skip', {now: NOW + 3}), next); valid(next, bank);
});

test('skipping the last question finishes with zero attempts and the final teaching visible', () => {
  const bank = bankOf(1), state = useHostLifeline(start(bank), bank, 'skip', {now: NOW + 1});
  assert.equal(state.active.phase, 'feedback'); assert.equal(hostSummary(state).terminal, true);
  assert.equal(state.active.hearts, 3); assert.equal(state.completed['host-run-a'].answered, 0);
  assert.equal(state.completed['host-run-a'].skipped, 1); assert.equal(state.completed['host-run-a'].reason, 'finished');
  valid(nextHostGame(state, bank, {now: NOW + 2}), bank);
});

test('recall is a once-per-question explicit self-rating with no automatic semantic grade', () => {
  const bank = bankOf(2), initial = start(bank);
  assert.deepEqual(rateHostRecall(initial, bank, 'good', {now: NOW + 1}), initial);
  let state = answerHostGame(initial, bank, 1, {now: NOW + 1});
  const firstId = state.active.responses[0].id;
  state = rateHostRecall(state, bank, 'again', {now: NOW + 2});
  assert.deepEqual(state.active.recalls[firstId], {rating: 'again', at: NOW + 2});
  assert.equal(state.active.score, 100); assert.equal(state.active.hearts, 3);
  assert.deepEqual(rateHostRecall(state, bank, 'good', {now: NOW + 3}), state);
  state = nextHostGame(state, bank, {now: NOW + 3});
  state = useHostLifeline(state, bank, 'skip', {now: NOW + 4});
  state = rateHostRecall(state, bank, 'good', {now: NOW + 5});
  assert.equal(Object.keys(state.active.recalls).length, 2); assert.equal(state.active.hearts, 3);
  const complete = nextHostGame(state, bank, {now: NOW + 6});
  assert.deepEqual(rateHostRecall(complete, bank, 'again', {now: NOW + 7}), complete); valid(complete, bank);
});

test('invalid action names and backwards timestamps fail without mutating saved data', () => {
  const bank = bankOf(2), initial = start(bank), original = copy(initial);
  assert.throws(() => answerHostGame(initial, bank, 1, {now: NOW - 1}), /predates/);
  assert.throws(() => useHostLifeline(initial, bank, 'fifty', {now: NOW - 1}), /predates/);
  assert.throws(() => useHostLifeline(initial, bank, 'unknown', {now: NOW + 1}), /unknown lifeline/);
  assert.throws(() => rateHostRecall(initial, bank, 'easy', {now: NOW + 1}), /unknown recall/);
  let state = answerHostGame(initial, bank, 1, {now: NOW + 100});
  assert.throws(() => rateHostRecall(state, bank, 'again', {now: NOW + 99}), /predates/);
  assert.throws(() => nextHostGame(state, bank, {now: NOW + 99}), /predates/);
  state = rateHostRecall(state, bank, 'good', {now: NOW + 200});
  assert.throws(() => nextHostGame(state, bank, {now: NOW + 199}), /predates/);
  assert.deepEqual(copy(initial), original); valid(state, bank);
});

test('completed metadata survives a stale question or corrupt local snapshot', () => {
  const bank = bankOf(3), first = finish(start(bank, {limit: 1}), bank);
  const state = start(bank, {runId: 'host-run-b'}, first), stale = bank.map(q => ({...q, question: `${q.question} Changed.`}));
  assert.equal(validateHostGame(state, stale).active, null);
  assert.deepEqual(validateHostGame(state, stale).completed, first.completed);
  for (const mutate of [active => {active.queue[0].fingerprint = '{}';}, active => {active.queue[0].fingerprint = 'not JSON';},
    active => {active.queue[0].id = '__proto__';}, active => {active.queue.push(active.queue[0]);},
    active => {active.score = 100;}, active => {active.hearts = 0;}, active => {active.index = 99;},
    active => {active.hiddenChoices = [1];}, active => {active.lifelines.skip = true;},
    active => {active.hintShown = true;}, active => {active.accessToken = 'must-not-be-kept';}]) {
    const corrupt = copy(state); mutate(corrupt.active);
    const recovered = validateHostGame(corrupt, bank);
    assert.equal(recovered.active, null); assert.deepEqual(recovered.completed, first.completed);
  }
});

test('validation rejects forged answers, score, recall and inconsistent completion metadata', () => {
  const bank = bankOf(2), state = answerHostGame(start(bank), bank, 1, {now: NOW + 1});
  for (const mutate of [a => {a.responses[0].correct = false;}, a => {a.responses[0].choice = 0;},
    a => {a.responses[0].at = NOW - 1;}, a => {a.responses[0].skipped = true;}, a => {a.responses[0].audio = 'private';},
    a => {a.recalls['not-visited'] = {rating: 'good', at: NOW + 1};},
    a => {a.recalls[a.responses[0].id] = {rating: 'easy', at: NOW + 1};},
    a => {a.recalls[a.responses[0].id] = {rating: 'good', at: NOW};}, a => {a.endedAt = NOW + 1;}]) {
    const corrupt = copy(state); mutate(corrupt.active); assert.equal(validateHostGame(corrupt, bank).active, null);
  }
  const completed = finish(start(bank, {limit: 1}), bank);
  const corrupt = copy(completed); corrupt.completed['host-run-a'].score = 999;
  assert.throws(() => validateHostGame(corrupt, bank), /completed summary/);
  const mismatch = copy(completed); mismatch.active.responses[0].at++; mismatch.active.endedAt++;
  assert.equal(validateHostGame(mismatch, bank).active, null);
});

test('saved metadata admits only JSON fields and never preserves audio, transcripts or authentication', () => {
  const bank = bankOf(1), state = finish(start(bank), bank), encoded = JSON.stringify(state.completed);
  for (const text of ['question', 'fingerprint', 'First label', 'transcript', 'audio', 'accessToken', 'password']) {
    if (text === 'question') continue; // The summary key questionCount is expected.
    assert.equal(encoded.includes(text), false, text);
  }
  assert.throws(() => validateHostGame({...blankHostGame(), password: 'private'}), /saved data/);
  const withPrivateSummary = copy(state); withPrivateSummary.completed['host-run-a'].transcript = 'private';
  assert.throws(() => validateHostGame(withPrivateSummary), /completed summary/);
  let invoked = false;
  const getter = {version: 1, completed: {}, active: null};
  Object.defineProperty(getter, 'completed', {enumerable: true, get() {invoked = true; return {};}});
  assert.throws(() => validateHostGame(getter), /property/); assert.equal(invoked, false);
  const cyclic = copy(state); cyclic.completed.loop = cyclic.completed;
  assert.throws(() => validateHostGame(cyclic), /non-circular/);
  const badActive = copy(state); badActive.active.queue = new Array(1);
  assert.equal(validateHostGame(badActive).active, null);
});

test('the ladder and cumulative summaries distinguish correct, missed, skipped and pending levels', () => {
  const bank = bankOf(4); let state = start(bank);
  assert.deepEqual(hostSummary(state).ladder.map(level => level.status), ['current', 'pending', 'pending', 'pending']);
  state = answerHostGame(state, bank, 1, {now: NOW + 1}); state = nextHostGame(state, bank, {now: NOW + 2});
  state = answerHostGame(state, bank, 0, {now: NOW + 3}); state = nextHostGame(state, bank, {now: NOW + 4});
  state = useHostLifeline(state, bank, 'skip', {now: NOW + 5}); state = nextHostGame(state, bank, {now: NOW + 6});
  let summary = hostSummary(state);
  assert.deepEqual(summary.ladder.map(level => level.status), ['correct', 'missed', 'skipped', 'current']);
  state = answerHostGame(state, bank, 1, {now: NOW + 7}); state = nextHostGame(state, bank, {now: NOW + 8});
  summary = hostSummary(state);
  assert.equal(summary.correct, 2); assert.equal(summary.answered, 3); assert.equal(summary.skipped, 1);
  assert.equal(summary.totalAnswered, 3); assert.equal(summary.totalCorrect, 2); assert.equal(summary.totalSkipped, 1);
  assert.equal(summary.bestScore, 200); assert.equal(summary.completedRuns, 1);
  state = finish(start(bank, {runId: 'host-run-b', limit: 2}, state), bank);
  summary = hostSummary(state);
  assert.equal(summary.completedRuns, 2); assert.equal(summary.totalAnswered, 5); assert.equal(summary.totalCorrect, 4);
  assert.equal(summary.totalSkipped, 1); assert.equal(summary.bestScore, 200);
  assert.equal(Object.keys(state.completed).length, 2); valid(state, bank);
});

test('completed run IDs cannot be replayed to add another completion', () => {
  const bank = bankOf(2), complete = finish(start(bank), bank);
  assert.deepEqual(start(bank, {runId: 'host-run-a', now: NOW + DAY}, complete), complete);
  const next = start(bank, {runId: 'host-run-b', now: NOW + DAY}, complete);
  assert.equal(next.active.id, 'host-run-b'); assert.equal(hostSummary(next).completedRuns, 1);
  assert.equal(next.active.score, 0); assert.equal(next.active.hearts, 3); valid(next, bank);
});
