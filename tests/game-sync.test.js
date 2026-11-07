import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankGame, validateGame, startRun, answerRun, nextRun, rateRecall, pauseRun} from '../game.js';
import {blankGameSync, validateGameSync, captureGameSync, mergeGameSync, projectGameSync} from '../game-sync.js';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const DAY = 86400000;
const copy = value => JSON.parse(JSON.stringify(value));
function bankOf(size = 5, prefix = 'item', topics = ['Numbers']) {
  return Array.from({length: size}, (_, index) => ({id: `${prefix}-${index}`, topic: topics[index % topics.length],
    question: `Which choice matches label ${index}?`, options: ['Choice A', 'Choice B'], answer: 1,
    teaching: {quickCheck: {question: `Recall label ${index}.`, answer: 'Choice B.'}}}));
}
function finish(game, bank, {now = NOW, correct = true, recall = false} = {}) {
  while (game.active && game.active.phase !== 'complete') {
    if (game.active.phase === 'question') {
      const answer = typeof correct === 'function' ? correct(game.active) : correct;
      game = answerRun(game, bank, answer ? 1 : 0, {now});
    } else {
      if (recall) game = rateRecall(game, bank, 'good', {now});
      game = nextRun(game, bank, {now});
    }
  }
  return game;
}
function phone(bank, {deviceId = 'phone-a', game = blankGame(), metadata = blankGameSync(), now = NOW} = {}) {
  const state = {game, metadata, now};
  state.apply = action => {
    const before = state.game, after = action(before);
    state.metadata = captureGameSync(state.metadata, before, after, {deviceId, now: state.now, bank});
    state.game = projectGameSync(state.metadata, after, {bank});
    assert.deepEqual(validateGame(copy(state.game), bank), state.game);
    return state;
  };
  state.start = () => state.apply(game => startRun(game, bank, {now: state.now}));
  state.finish = ({correct = true, recall = false} = {}) => {
    while (state.game.active?.phase !== 'complete') {
      if (state.game.active.phase === 'question') {
        const answer = typeof correct === 'function' ? correct(state.game.active) : correct;
        state.apply(game => answerRun(game, bank, answer ? 1 : 0, {now: state.now}));
      } else {
        if (recall) state.apply(game => rateRecall(game, bank, 'good', {now: state.now}));
        state.apply(game => nextRun(game, bank, {now: state.now}));
      }
    }
    return state;
  };
  return state;
}

test('identical v5 profile clones use one checkpoint and never replay its completed round', () => {
  const bank = bankOf(), old = finish(startRun(blankGame(), bank, {now: NOW}), bank, {recall: true});
  const a = captureGameSync(undefined, old, old, {deviceId: 'a', now: NOW, bank});
  const b = captureGameSync(undefined, copy(old), copy(old), {deviceId: 'b', now: NOW, bank});
  assert.deepEqual(a, b);
  assert.equal(Object.keys(a.runs).length, 1);
  const merged = mergeGameSync(a, b), projected = projectGameSync(merged, old, {bank});
  assert.equal(projected.xp, 110);
  assert.equal(projected.stats.attempted, 5);
  assert.equal(projected.stats.completedRuns, 1);
  assert.equal(projected.stats.memoryChecks, 5);
  assert.deepEqual(captureGameSync(merged, projected, projected, {deviceId: 'b', now: NOW + DAY, bank}), merged);
  assert.deepEqual(mergeGameSync(merged, merged), merged);
});

test('two offline phones add distinct runs and effort while sharing daily XP and recall caps', () => {
  const bank = bankOf(5, 'shared', ['Numbers', 'Patterns']);
  const base = captureGameSync(undefined, blankGame(), blankGame(), {now: NOW, bank});
  const a = phone(bank, {deviceId: 'a', metadata: copy(base)}).start().finish({recall: true});
  const b = phone(bank, {deviceId: 'b', metadata: copy(base)}).start().finish({recall: true});
  assert.equal(Object.keys(a.metadata.runs).length, 1);
  assert.notEqual(Object.keys(a.metadata.runs)[0], Object.keys(b.metadata.runs)[0]);
  const merged = mergeGameSync(a.metadata, b.metadata), game = projectGameSync(merged, blankGame(), {bank});
  assert.equal(game.stats.attempted, 10);
  assert.equal(game.stats.correct, 10);
  assert.equal(game.stats.completedRuns, 2);
  assert.equal(game.stats.memoryChecks, 5);
  assert.equal(game.xp, 120);
  assert.equal(game.days['2026-11-07'].attempted.length, 5);
  assert.equal(game.stats.topics.Numbers.attempted + game.stats.topics.Patterns.attempted, 10);
  assert.equal(game.stats.topics.Numbers.completedRuns, 2);
  assert.equal(game.stats.topics.Patterns.completedRuns, 2);
  assert.deepEqual(mergeGameSync(a.metadata, b.metadata), mergeGameSync(b.metadata, a.metadata));
  assert.deepEqual(mergeGameSync(merged, a.metadata), merged);
  assert.equal(projectGameSync(merged, a.game, {bank}).active.syncId, a.game.active.syncId);
});

test('all new runs merge across three phones, including recovery, distinct days, and the third-run bonus cap', () => {
  const bank = bankOf(), base = captureGameSync(undefined, blankGame(), blankGame(), {now: NOW, bank});
  const a = phone(bank, {deviceId: 'a', metadata: copy(base)}).start().finish({correct: active => active.queue[active.index].recovery});
  const b = phone(bank, {deviceId: 'b', metadata: copy(base)}).start().finish().start().finish();
  const c = phone(bank, {deviceId: 'c', metadata: copy(base)}).start().finish().start().finish();
  const left = mergeGameSync(mergeGameSync(a.metadata, b.metadata), c.metadata);
  const right = mergeGameSync(a.metadata, mergeGameSync(c.metadata, b.metadata));
  assert.deepEqual(left, right);
  const game = projectGameSync(left, blankGame(), {bank});
  assert.equal(game.stats.attempted, 25);
  assert.equal(game.stats.correct, 20);
  assert.equal(game.stats.recoveryAttempts, 2);
  assert.equal(game.stats.recoveryCorrect, 2);
  assert.equal(game.stats.completedRuns, 5);
  assert.equal(game.xp, 130);
  const nextDay = phone(bank, {deviceId: 'b', metadata: left, game, now: NOW + DAY}).start().finish();
  assert.equal(nextDay.game.xp, 240);
  assert.equal(nextDay.game.stats.completedRuns, 6);
});

test('a copied sync run resolves by furthest progress and deterministic ties without double-counting', () => {
  const bank = bankOf(), original = phone(bank).start();
  const a = phone(bank, {deviceId: 'a', game: copy(original.game), metadata: copy(original.metadata)});
  const b = phone(bank, {deviceId: 'b', game: copy(original.game), metadata: copy(original.metadata)});
  a.finish({correct: false});
  b.finish({correct: true});
  const merged = mergeGameSync(a.metadata, b.metadata);
  assert.equal(Object.keys(merged.runs).length, 1);
  assert.deepEqual(mergeGameSync(b.metadata, a.metadata), merged);
  const game = projectGameSync(merged, blankGame(), {bank});
  assert.equal(game.stats.attempted, 5);
  assert.equal(game.stats.completedRuns, 1);
  assert.equal(game.stats.recoveryAttempts, 2);
  assert.equal(game.xp, 35);
  // The local correct branch can still display and finish its own result even
  // when shared history selects the longer recovery branch from its clone.
  const local = projectGameSync(merged, b.game, {bank});
  assert.deepEqual(local.active, b.game.active);
  assert.equal(local.active.runXP, 110);
  assert.equal(local.xp, 35);
  assert.deepEqual(validateGame(copy(local), bank), local);

  const c = phone(bank, {deviceId: 'c', game: copy(original.game), metadata: copy(original.metadata)});
  const d = phone(bank, {deviceId: 'd', game: copy(original.game), metadata: copy(original.metadata)});
  c.apply(game => answerRun(game, bank, 0, {now: NOW}));
  d.apply(game => answerRun(game, bank, 1, {now: NOW}));
  const tie = mergeGameSync(c.metadata, d.metadata);
  assert.deepEqual(mergeGameSync(d.metadata, c.metadata), tie);
  assert.deepEqual(mergeGameSync(tie, c.metadata), tie);
  assert.equal(projectGameSync(tie, blankGame()).stats.attempted, 1);
});

test('enabling sync midway through a legacy round offsets existing answers and self-ratings', () => {
  const bank = bankOf();
  let partial = answerRun(startRun(blankGame(), bank, {now: NOW}), bank, 0, {now: NOW});
  partial = rateRecall(partial, bank, 'hard', {now: NOW});
  const metadata = captureGameSync(undefined, partial, partial, {deviceId: 'a', now: NOW, bank});
  const runId = Object.keys(metadata.runs)[0];
  assert.equal(metadata.checkpoint.covered[runId].answers, 1);
  assert.equal(metadata.checkpoint.covered[runId].recalls.length, 1);
  const a = phone(bank, {deviceId: 'a', metadata, game: projectGameSync(metadata, partial, {bank})}).finish({recall: true});
  assert.equal(a.game.stats.attempted, 5);
  assert.equal(a.game.stats.correct, 4);
  assert.equal(a.game.stats.recoveryAttempts, 1);
  assert.equal(a.game.stats.recoveryCorrect, 1);
  assert.equal(a.game.stats.memoryChecks, 5);
  assert.equal(a.game.xp, 110);
  assert.deepEqual(mergeGameSync(a.metadata, metadata), a.metadata);
  assert.deepEqual(captureGameSync(a.metadata, a.game, a.game, {deviceId: 'a', now: NOW + DAY, bank}), a.metadata);
});

test('different checkpoints from the same partial legacy round do not replay their shared prefix', () => {
  const bank = bankOf(), first = answerRun(startRun(blankGame(), bank, {now: NOW}), bank, 1, {now: NOW});
  const second = answerRun(nextRun(first, bank, {now: NOW}), bank, 1, {now: NOW});
  const a = captureGameSync(undefined, first, first, {deviceId: 'a', now: NOW, bank});
  const b = captureGameSync(undefined, second, second, {deviceId: 'b', now: NOW, bank});
  assert.equal(Object.keys(a.runs)[0], Object.keys(b.runs)[0]);
  const finished = phone(bank, {deviceId: 'a', game: first, metadata: a}).finish();
  const merged = mergeGameSync(finished.metadata, b), game = projectGameSync(merged, finished.game, {bank});
  assert.equal(game.stats.attempted, 5);
  assert.equal(game.stats.correct, 5);
  assert.equal(game.stats.completedRuns, 1);
  assert.equal(game.xp, 110);
});

test('a newer completed legacy checkpoint does not replay a round known to an older partial checkpoint', () => {
  const bank = bankOf(), partial = answerRun(startRun(blankGame(), bank, {now: NOW}), bank, 1, {now: NOW});
  const complete = finish(partial, bank);
  const aMeta = captureGameSync(undefined, partial, partial, {deviceId: 'a', now: NOW, bank});
  const bMeta = captureGameSync(undefined, complete, complete, {deviceId: 'b', now: NOW, bank});
  const a = phone(bank, {deviceId: 'a', game: partial, metadata: aMeta}).finish();
  const merged = mergeGameSync(a.metadata, bMeta), game = projectGameSync(merged, complete, {bank});
  assert.equal(game.stats.attempted, 5);
  assert.equal(game.stats.completedRuns, 1);
  assert.equal(game.xp, 110);
});

test('legacy histories choose one conservative checkpoint, while later run IDs all survive', () => {
  const bank = bankOf(), one = finish(startRun(blankGame(), bank, {now: NOW}), bank);
  const two = finish(startRun(one, bank, {now: NOW}), bank);
  const aMeta = captureGameSync(undefined, one, one, {deviceId: 'a', now: NOW, bank});
  const bMeta = captureGameSync(undefined, two, two, {deviceId: 'b', now: NOW, bank});
  const base = mergeGameSync(aMeta, bMeta);
  assert.equal(projectGameSync(base, blankGame()).stats.completedRuns, 2);
  const a = phone(bank, {deviceId: 'a', game: one, metadata: aMeta}).start().finish();
  const b = phone(bank, {deviceId: 'b', game: two, metadata: bMeta}).start().finish();
  const merged = mergeGameSync(a.metadata, b.metadata), game = projectGameSync(merged, blankGame());
  assert.equal(Object.values(merged.runs).filter(run => !run.legacy).length, 2);
  assert.equal(game.stats.attempted, 20);
  assert.equal(game.stats.completedRuns, 4);
  assert.equal(game.xp, 130);
  assert.deepEqual(mergeGameSync(merged, b.metadata), merged);
});

test('projection retains only this phone’s queue and can resume it after larger remote totals', () => {
  const bank = bankOf(12), base = captureGameSync(undefined, blankGame(), blankGame(), {now: NOW, bank});
  const local = phone(bank, {deviceId: 'local', metadata: copy(base)}).start();
  local.apply(game => answerRun(game, bank, 1, {now: NOW}));
  local.apply(game => nextRun(game, bank, {now: NOW}));
  local.apply(game => pauseRun(game, bank, {elapsedMs: 3000}));
  const remote = phone(bank, {deviceId: 'remote', metadata: copy(base), now: NOW + 500}).start().finish().start().finish();
  const merged = mergeGameSync(local.metadata, remote.metadata), projected = projectGameSync(merged, local.game, {bank});
  assert.deepEqual(projected.active, local.game.active);
  assert.ok(projected.sequence > Number(projected.active.id.split(':').at(-1)));
  assert.equal(projected.active.elapsedMs, 3000);
  assert.equal(projectGameSync(merged, blankGame(), {bank}).active, null);
  const resumed = phone(bank, {deviceId: 'local', metadata: merged, game: projected, now: NOW + 1000}).finish();
  assert.equal(resumed.game.stats.completedRuns, 3);
  assert.equal(resumed.game.stats.attempted, 15);
  assert.equal(resumed.game.active.phase, 'complete');
});

test('payload contains IDs and activity metadata, with no question snapshots, choices, teaching, or audio', () => {
  const bank = bankOf(), a = phone(bank).start().finish({recall: true});
  const text = JSON.stringify(a.metadata);
  for (const forbidden of ['fingerprint', 'optionIndex', 'Which choice', 'Choice A', 'Choice B', 'Recall label', 'teaching', 'rationale', 'audio']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.ok(Object.values(a.metadata.runs)[0].queue.every(entry => Object.keys(entry).sort().join(',') === 'id,recovery,topic'));
  const input = copy(a.metadata);
  mergeGameSync(input, blankGameSync());
  projectGameSync(input, a.game, {bank});
  assert.deepEqual(input, copy(a.metadata));
});

test('unknown imported question IDs and topic counters survive bank changes without restoring remote content', () => {
  const imported = bankOf(5, 'custom', ['Custom subject']), a = phone(imported).start().finish();
  const current = bankOf(), game = projectGameSync(a.metadata, blankGame(), {bank: current});
  assert.equal(Object.keys(game.questions).length, 5);
  assert.ok(Object.keys(game.questions).every(id => id.startsWith('custom-')));
  assert.equal(game.stats.topics['Custom subject'].attempted, 5);
  assert.equal(game.active, null);
  assert.deepEqual(validateGameSync(copy(a.metadata)), a.metadata);
});

test('invalid or hostile metadata is rejected instead of silently dropping or inventing progress', () => {
  const bank = bankOf(), a = phone(bank).start().finish({recall: true}), runId = Object.keys(a.metadata.runs)[0];
  const alterations = [
    value => { value.version = 99; },
    value => { value.audio = 'extra'; },
    value => { value.checkpoint.game.xp++; },
    value => { value.checkpoint.game.question = 'private question'; },
    value => { value.runs[runId].queue[0].fingerprint = 'private snapshot'; },
    value => { value.runs[runId].answers[0].at = -1; },
    value => { value.runs[runId].answers[0].correct = 'true'; },
    value => { value.runs[runId].queue[1].id = value.runs[runId].queue[0].id; },
    value => { value.runs[runId].day = '2026-02-30'; },
    value => { value.runs[runId].updatedAt = 0; },
    value => { value.runs[runId].recalls[0].id = 'unknown'; },
    value => { value.runs[runId].elapsedMs = Infinity; },
    value => { value.checkpoint = null; }
  ];
  for (const alter of alterations) {
    const malformed = copy(a.metadata); alter(malformed);
    assert.throws(() => validateGameSync(malformed), /Invalid Lab Adventure sync/);
    assert.throws(() => mergeGameSync(a.metadata, malformed), /Invalid Lab Adventure sync/);
  }
  for (const value of [null, [], {}, 'invalid', NaN, Object.create(a.metadata)]) assert.throws(() => validateGameSync(value));
  assert.throws(() => validateGameSync(JSON.parse('{"version":1,"checkpoint":null,"runs":{"__proto__":{}}}')), /Invalid Lab Adventure sync/);
  const accessor = copy(a.metadata);
  Object.defineProperty(accessor, 'runs', {enumerable: true, get() { throw Error('getter must not execute'); }});
  assert.throws(() => validateGameSync(accessor), /Invalid Lab Adventure sync/);
  const cyclic = blankGameSync(); cyclic.runs.loop = cyclic;
  assert.throws(() => validateGameSync(cyclic), /Invalid Lab Adventure sync/);
  const reusedId = copy(a.metadata);
  reusedId.runs[runId].deviceId = 'another-install';
  assert.throws(() => mergeGameSync(a.metadata, reusedId), /conflicting run identity/);
  const nonJSON = copy(a.metadata);
  Object.defineProperty(nonJSON, 'hidden', {value: 'not JSON'});
  assert.throws(() => validateGameSync(nonJSON), /Invalid Lab Adventure sync/);
  const sparse = copy(a.metadata);
  delete sparse.runs[runId].queue[0];
  sparse.runs[runId].queue.extra = {};
  assert.throws(() => validateGameSync(sparse), /Invalid Lab Adventure sync/);
  assert.deepEqual(validateGameSync(undefined), blankGameSync());
});
