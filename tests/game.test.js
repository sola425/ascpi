import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankGame, eligibleQuestions, validateGame, validActiveRun, gameSummary, startRun, answerRun, nextRun, rateRecall, pauseRun} from '../game.js';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const DAY = 86400000;
function question(id, topic = 'Calculations', changes = {}) {
  return {id, topic, question: `Which choice matches the label ${id}?`, options: ['First choice', 'Second choice', 'Third choice'], answer: 1,
    teaching: {quickCheck: {question: `Recall the matching choice for ${id}.`, answer: 'Second choice.'}}, ...changes};
}
const makeBank = (size = 5) => Array.from({length: size}, (_, index) => question(`item-${index + 1}`));
const roundtrip = value => JSON.parse(JSON.stringify(value));
function finish(value, bank, {now = NOW, correct = true, recall = false, elapsedMs = 0} = {}) {
  let game = value;
  while (game.active && game.active.phase !== 'complete') {
    if (game.active.phase === 'question') {
      const q = bank.find(q => q.id === game.active.queue[game.active.index].id);
      const isCorrect = typeof correct === 'function' ? correct(game.active, q) : correct;
      game = answerRun(game, bank, isCorrect ? q.answer : (q.answer + 1) % q.options.length, {now, elapsedMs});
    } else {
      if (recall) game = rateRecall(game, bank, 'good', {now});
      game = nextRun(game, bank, {now, elapsedMs});
    }
    assert.ok(validActiveRun(game.active, bank));
    assert.deepEqual(validateGame(roundtrip(game), bank), game);
  }
  return game;
}

test('short mode filters only the active bank and rejects source-dependent, oversized and ambiguous items', () => {
  const good = question('short');
  const bank = [good, question('source', 'Calculations', {needsSource: true}),
    question('case', 'Calculations', {context: 'Read this separate case first.'}),
    question('shared', 'Calculations', {sharedContext: 'Questions 1 and 2 use a separate case.'}),
    question('long-stem', 'Calculations', {question: 'X'.repeat(281)}),
    question('long-choice', 'Calculations', {options: ['X'.repeat(111), 'Other']}),
    question('visual', 'Calculations', {question: 'Which choice matches the figure?'}),
    question('bad-key', 'Calculations', {answer: 99}), question('duplicate'), question('duplicate'),
    question('__proto__'), question('constructor'), question('prototype'), question('unsafe-topic', 'constructor')];
  assert.deepEqual(eligibleQuestions(bank).map(q => q.id), ['short']);
  assert.deepEqual(eligibleQuestions(bank, {topic: 'Unavailable'}), []);
  assert.equal(eligibleQuestions(bank, {topic: 'all'})[0], good);
  assert.deepEqual(eligibleQuestions(null), []);
  assert.deepEqual(bank[0], good);
});

test('the real active bank has short runs for every included subject and never restores excluded IDs', () => {
  const bank = JSON.parse(readFileSync(new URL('../data/study-bank.json', import.meta.url)));
  const excluded = new Set(JSON.parse(readFileSync(new URL('../data/collection-exclusions.json', import.meta.url))).questionIds);
  const eligible = eligibleQuestions(bank);
  assert.ok(eligible.length > 100);
  assert.ok(eligible.every(q => !excluded.has(q.id) && !q.needsSource));
  for (const topic of new Set(bank.map(q => q.topic))) {
    const game = startRun(blankGame(), bank, {topic, now: NOW});
    assert.equal(game.active?.queue.length, 5, topic);
    assert.ok(game.active.queue.every(entry => bank.find(q => q.id === entry.id).topic === topic));
  }
});

test('queues are deterministic, stable on resume, varied across runs and do not mutate inputs', () => {
  const bank = makeBank(30), original = roundtrip(bank), blank = blankGame();
  const a = startRun(blank, bank, {now: NOW, seed: 'same'}), b = startRun(blank, bank, {now: NOW, seed: 'same'});
  assert.deepEqual(a, b);
  assert.equal(new Set(a.active.queue.map(entry => entry.id)).size, 5);
  assert.deepEqual(startRun(a, bank, {now: NOW + DAY, seed: 'different', topic: 'Unavailable'}), a);
  const complete = finish(a, bank);
  const next = startRun(complete, bank, {now: NOW, seed: 'same'});
  assert.notDeepEqual(next.active.queue.map(entry => entry.id), a.active.queue.map(entry => entry.id));
  assert.equal(blank.active, null);
  assert.equal(blank.xp, 0);
  assert.deepEqual(bank, original);
});

test('new runs mix unseen and missed questions while retaining a familiar question', () => {
  const bank = makeBank(20);
  const game = finish(startRun(blankGame(), bank, {now: NOW}), bank, {correct: active => active.index >= 2});
  const next = startRun(game, bank, {now: NOW});
  const selected = next.active.queue.map(entry => entry.id);
  assert.equal(selected.filter(id => !Object.hasOwn(game.questions, id)).length, 2);
  assert.equal(selected.filter(id => game.questions[id]?.lastCorrect === false).length, 2);
  assert.equal(selected.filter(id => game.questions[id]?.lastCorrect === true).length, 1);
});

test('repeated submits and completed runs cannot farm daily question XP or completion bonuses', () => {
  const bank = makeBank();
  let game = startRun(blankGame(), bank, {now: NOW});
  game = answerRun(game, bank, 1, {now: NOW});
  assert.equal(game.xp, 20);
  assert.deepEqual(answerRun(game, bank, 1, {now: NOW, elapsedMs: 1000}), game);
  game = finish(game, bank);
  assert.equal(game.xp, 110);
  assert.deepEqual(nextRun(game, bank, {now: NOW}), game);
  for (const expected of [120, 130, 130, 130]) {
    game = finish(startRun(game, bank, {now: NOW}), bank);
    assert.equal(game.xp, expected);
  }
  assert.equal(game.stats.attempted, 25);
  assert.equal(game.stats.correct, 25);
  assert.equal(game.stats.completedRuns, 5);
  assert.equal(game.days['2026-11-07'].attempted.length, 5);
  assert.equal(game.days['2026-11-07'].correct.length, 5);
  assert.equal(gameSummary(game, {now: NOW}).uniqueAttempted, 5);
});

test('at most two recovery questions follow the initial five and never alter first-attempt accuracy', () => {
  const bank = makeBank();
  const game = finish(startRun(blankGame(), bank, {now: NOW}), bank, {correct: active => active.queue[active.index].recovery});
  assert.equal(game.active.queue.length, 7);
  assert.ok(game.active.queue.slice(0, 5).every(entry => entry.recovery === false));
  assert.ok(game.active.queue.slice(5).every(entry => entry.recovery === true));
  assert.deepEqual(game.active.queue.slice(5).map(entry => entry.id), game.active.queue.slice(0, 2).map(entry => entry.id));
  assert.equal(game.active.answers.filter(answer => !answer.recovery && answer.correct).length, 0);
  assert.equal(game.stats.attempted, 5);
  assert.equal(game.stats.correct, 0);
  assert.equal(game.stats.recoveryAttempts, 2);
  assert.equal(game.stats.recoveryCorrect, 2);
  assert.equal(game.xp, 65);
  const repeated = finish(startRun(game, bank, {now: NOW}), bank);
  assert.equal(repeated.xp, 120); // Only the three not-yet-correct IDs and one completion bonus.
  assert.equal(repeated.stats.correct, 5);
});

test('wrong recoveries do not recurse and no speed or elapsed-time XP is awarded', () => {
  const bank = makeBank();
  const fast = finish(startRun(blankGame(), bank, {now: NOW}), bank, {correct: false});
  const slow = finish(startRun(blankGame(), bank, {now: NOW}), bank, {correct: false, elapsedMs: 60000});
  assert.equal(fast.active.queue.length, 7);
  assert.equal(fast.xp, 35);
  assert.equal(slow.xp, fast.xp);
  assert.equal(fast.active.elapsedMs, 0);
  assert.equal(slow.active.elapsedMs, 14 * 60000);
});

test('Lagos midnight resets daily caps and quests even within a paused run', () => {
  const bank = makeBank(), before = Date.parse('2026-11-07T22:59:59Z'), after = Date.parse('2026-11-07T23:00:00Z');
  let game = startRun(blankGame(), bank, {now: before});
  game = answerRun(game, bank, 1, {now: before});
  assert.equal(gameSummary(game, {now: before}).today.day, '2026-11-07');
  assert.equal(gameSummary(game, {now: after}).today.day, '2026-11-08');
  assert.equal(gameSummary(game, {now: after}).today.attempted, 0);
  game = finish(game, bank, {now: after});
  assert.equal(game.days['2026-11-07'].xp, 20);
  assert.equal(game.days['2026-11-08'].xp, 90);
  assert.equal(gameSummary(game, {now: after}).today.attempted, 4);
  game = finish(startRun(game, bank, {now: after}), bank, {now: after});
  assert.equal(game.xp, 140); // The first ID becomes new for the second day; completion adds ten.
  assert.equal(game.days['2026-11-08'].xp, 120);
  assert.equal(gameSummary(game, {now: after}).quests.find(quest => quest.id === 'questions').complete, true);
});

test('serialization preserves unanswered, feedback, recovery and complete phases atomically', () => {
  const bank = makeBank();
  let game = startRun(blankGame(), bank, {now: NOW});
  game = pauseRun(game, bank, {elapsedMs: 345});
  let restored = validateGame(roundtrip(game), bank);
  assert.deepEqual(restored, game);
  assert.equal(restored.active.elapsedMs, 345);
  restored = answerRun(restored, bank, 0, {now: NOW + 100, elapsedMs: 655});
  assert.equal(restored.active.phase, 'feedback');
  assert.equal(restored.active.queue.length, 6);
  assert.equal(restored.active.elapsedMs, 1000);
  assert.deepEqual(validateGame(roundtrip(restored), bank), restored);
  assert.deepEqual(startRun(restored, bank, {now: NOW + 500}), restored);
  const complete = finish(restored, bank, {now: NOW + 1000});
  assert.equal(complete.active.phase, 'complete');
  assert.deepEqual(validateGame(roundtrip(complete), bank), complete);
  assert.equal(complete.stats.correct, 4);
  assert.equal(complete.stats.recoveryCorrect, 1);
});

test('memory self-ratings require the current existing quick check and stay separate from accuracy and XP', () => {
  const bank = makeBank();
  let game = startRun(blankGame(), bank, {now: NOW});
  assert.deepEqual(rateRecall(game, bank, 'again', {now: NOW}), game);
  game = answerRun(game, bank, 0, {now: NOW});
  const xp = game.xp, correct = game.stats.correct, attempted = game.stats.attempted;
  game = rateRecall(game, bank, 'again', {now: NOW});
  assert.equal(game.xp, xp);
  assert.equal(game.stats.correct, correct);
  assert.equal(game.stats.attempted, attempted);
  assert.equal(game.stats.memoryChecks, 1);
  assert.equal(game.active.recalls[0].rating, 'again');
  assert.deepEqual(rateRecall(game, bank, 'easy', {now: NOW}), game);
  assert.throws(() => rateRecall(game, bank, 'invented', {now: NOW}), /memory rating/);
  game = finish(game, bank, {recall: true});
  assert.equal(game.stats.memoryChecks, 5);
  const summary = gameSummary(game, {now: NOW});
  assert.equal(summary.quests.every(quest => quest.complete), true);
  assert.equal(summary.today.memoryChecks, 5);
  assert.equal(summary.subjects[0].attempted, 5);
  const repeated = finish(startRun(game, bank, {now: NOW}), bank, {recall: true});
  assert.equal(repeated.stats.memoryChecks, 5);
  const noTeaching = makeBank().map(q => ({...q, teaching: undefined}));
  let without = answerRun(startRun(blankGame(), noTeaching, {now: NOW}), noTeaching, 1, {now: NOW});
  assert.deepEqual(rateRecall(without, noTeaching, 'good', {now: NOW}), without);
});

test('unavailable topics and undersized banks do not create or complete phantom runs', () => {
  const game = blankGame();
  for (const [bank, topic] of [[makeBank(), 'Unavailable'], [makeBank(4), ''], [[], '']]) {
    assert.deepEqual(startRun(game, bank, {now: NOW, topic}), game);
  }
  assert.deepEqual(answerRun(game, [], 0, {now: NOW}), game);
  assert.deepEqual(nextRun(game, [], {now: NOW}), game);
  assert.deepEqual(rateRecall(game, [], 'good', {now: NOW}), game);
});

test('bank removal, source dependency and changed stems or keys invalidate the session before scoring', () => {
  const bank = makeBank(), original = answerRun(startRun(blankGame(), bank, {now: NOW}), bank, 1, {now: NOW});
  const currentID = original.active.queue[0].id;
  for (const changed of [bank.filter(q => q.id !== currentID),
    bank.map(q => q.id === currentID ? {...q, answer: 0} : q),
    bank.map(q => q.id === currentID ? {...q, question: q.question + ' Changed.'} : q),
    bank.map(q => q.id === currentID ? {...q, needsSource: true} : q)]) {
    assert.equal(validActiveRun(original.active, changed), false);
    const restored = validateGame(roundtrip(original), changed);
    assert.equal(restored.active, null);
    assert.equal(restored.xp, original.xp);
    assert.deepEqual(restored.stats, original.stats);
    assert.deepEqual(answerRun(original, changed, 1, {now: NOW}), restored);
    assert.deepEqual(nextRun(original, changed, {now: NOW}), restored);
  }
});

test('corrupt sessions are discarded while valid accumulated progress and old backups remain intact', () => {
  const bank = makeBank(), game = answerRun(startRun(blankGame(), bank, {now: NOW}), bank, 1, {now: NOW});
  const corruptions = [active => {active.index = 5;}, active => {active.answers[0].correct = false;},
    active => {active.queue[0].id = 'nonexistent';}, active => {active.queue[0].fingerprint = '{}';},
    active => {active.phase = 'complete';}, active => {active.runXP = 999;},
    active => {active.elapsedMs = -1;}, active => {active.queue.push(active.queue[0]);}];
  for (const change of corruptions) {
    const bad = roundtrip(game);
    change(bad.active);
    assert.equal(validActiveRun(bad.active, bank), false);
    const restored = validateGame(bad, bank);
    assert.equal(restored.active, null);
    assert.equal(restored.xp, game.xp);
    assert.deepEqual(restored.questions, game.questions);
    assert.deepEqual(restored.stats, game.stats);
  }
  assert.deepEqual(validateGame(undefined, bank), blankGame());
  assert.deepEqual(validateGame(roundtrip(blankGame()), bank), blankGame());
  const {active, ...withoutSession} = roundtrip(game);
  assert.equal(validateGame(withoutSession, bank).active, null);
});

test('backup validation rejects invalid or contradictory totals instead of silently clamping earned progress', () => {
  const bank = makeBank(), game = finish(startRun(blankGame(), bank, {now: NOW}), bank, {recall: true});
  const alterations = [value => {value.xp = -1;}, value => {value.xp++;}, value => {value.sequence = 0;},
    value => {value.stats.correct = 100;}, value => {value.stats.attempted = 1.5;},
    value => {value.days['2026-11-07'].xp++;}, value => {value.days['2026-11-07'].correct.push('missing');},
    value => {value.days['2026-11-07'].attempted.push(value.days['2026-11-07'].attempted[0]);},
    value => {value.days['2026-02-30'] = value.days['2026-11-07'];},
    value => {value.questions[value.active.queue[0].id].attempts = Infinity;},
    value => {value.stats.topics.Calculations.correct = 0;}, value => {value.version = 999;}];
  for (const alter of alterations) {
    const bad = roundtrip(game);
    alter(bad);
    assert.throws(() => validateGame(bad, bank), /Invalid Lab Adventure progress/);
  }
  for (const value of [null, [], {}, NaN, () => {}, 'not-json']) assert.throws(() => validateGame(value, bank));
  assert.deepEqual(validateGame(roundtrip(game), [] ).stats, game.stats);
});

test('hostile IDs and reserved property names cannot inject progress or prototypes', () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const value = roundtrip(blankGame());
    value.questions = JSON.parse(`{"${name}":{"attempts":1,"correct":1,"misses":0,"recoveryAttempts":0,"recoveryCorrect":0,"lastAt":0,"lastCorrect":true}}`);
    assert.throws(() => validateGame(value), /reserved/);
    const nested = JSON.parse(`{"version":1,"xp":0,"sequence":0,"stats":{"${name}":{}},"questions":{},"days":{},"active":null}`);
    assert.throws(() => validateGame(nested), /reserved/);
    assert.equal(startRun(blankGame(), [question(name), ...makeBank(4)], {now: NOW}).active, null);
  }
  const inherited = Object.create({version: 1});
  assert.throws(() => validateGame(inherited), /invalid object/);
  assert.equal({}.polluted, undefined);
  const safeNames = ['toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'toLocaleString'].map(id => question(id));
  const game = finish(startRun(blankGame(), safeNames, {now: NOW}), safeNames);
  assert.equal(game.stats.correct, 5);
  assert.equal(game.xp, 110);
});

test('invalid choices, time reversal and invalid elapsed deltas are rejected without mutating progress', () => {
  const bank = makeBank(), game = startRun(blankGame(), bank, {now: NOW}), before = roundtrip(game);
  for (const choice of [-1, 3, 0.5, '1', null]) assert.throws(() => answerRun(game, bank, choice, {now: NOW}), /answer choice/);
  assert.throws(() => answerRun(game, bank, 1, {now: NOW - 1}), /predates/);
  for (const elapsedMs of [-1, 0.5, NaN, Infinity]) assert.throws(() => pauseRun(game, bank, {elapsedMs}), /elapsed/);
  assert.deepEqual(roundtrip(game), before);
});
