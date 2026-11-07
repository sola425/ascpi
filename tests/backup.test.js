import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBackup} from '../learning.js';
import {blankGame, startRun, answerRun, validateGame} from '../game.js';
import {blankFrenzy, startFrenzy, validateFrenzy} from '../frenzy.js';
import {blankSyncDocument, captureProgress, projectProgress} from '../sync-model.js';

const clone = value => JSON.parse(JSON.stringify(value));
const bank = Array.from({length: 5}, (_, i) => ({id: `item-${i}`, topic: 'Numbers', question: `Choose label ${i}.`, options: ['First', 'Second'], answer: 0}));
const historicalSummary = () => ({id: 'historical-frenzy', topics: ['Archived topic'], questionCount: 10, answered: 3, correct: 0, hearts: 0, score: 0, startedAt: 100, endedAt: 200, reason: 'hearts'});
function base(version = 4) {
  return {
    version,
    records: {'retired-q': {due: 5000, stage: 2, reviews: 7, correct: true, at: 100, reviewedAt: 100, lastRecallRating: 'good', lastRecallAt: 150, lastGameCorrect: false, lastGameAt: 200}},
    saved: ['retired-q', 'retired-q'],
    log: [{id: 'retired-q', at: 100, kind: 'answer', correct: true}],
    reading: {'retired-book': 120}, prefs: {sessionSize: 20, fontScale: 1.3}, goal: 30
  };
}
function withLocalGames() {
  let game = startRun(blankGame(), bank, {now: 1000});
  game = answerRun(game, bank, 0, {now: 1100});
  const frenzy = startFrenzy(blankFrenzy(), bank, {runId: 'local-frenzy', now: 1200});
  frenzy.completed['historical-frenzy'] = historicalSummary();
  return {...base(), game, frenzy};
}

test('backup versions one through four retain legacy fields, defaults and duplicate legacy history', () => {
  for (const version of [1, 2, 3, 4]) {
    const input = base(version);
    input.log.push({...input.log[0]});
    const restored = validateBackup(input);
    assert.equal(restored.records['retired-q'].reviews, 7);
    assert.equal(restored.records['retired-q'].correct, true);
    assert.equal(restored.records['retired-q'].lastRecallRating, 'good');
    assert.equal(restored.records['retired-q'].lastGameCorrect, false);
    assert.deepEqual(restored.saved, ['retired-q']);
    assert.deepEqual(restored.log, input.log);
    assert.equal(restored.reading['retired-book'], 120);
    assert.deepEqual(restored.prefs, input.prefs);
    assert.equal(restored.goal, 30);
    for (const name of ['cloud', 'frenzy', 'game']) assert.equal(Object.hasOwn(restored, name), false);
  }
  const minimal = validateBackup({version: 4, records: {}, saved: [], log: []});
  assert.equal(minimal.goal, 10);
  assert.deepEqual(minimal.prefs, {sessionSize: 10, fontScale: 1});
  assert.throws(() => validateBackup({...base(), version: 5}));
});

test('v4 export and restore retain sync metadata, stable log IDs and both device-local game sessions', () => {
  const original = withLocalGames();
  original.log[0].eventId = 'evt:a.1';
  original.log.push({id: 'retired-q', at: 200, kind: 'game', correct: false});
  const doc = captureProgress(undefined, original, original, {deviceId: 'phone-a', now: 2000, bank});
  const projected = projectProgress(doc, original, {bank});
  const exported = {version: 4, ...projected, cloud: doc, access_token: 'private-token', transcript: 'private-transcript'};
  const encoded = JSON.stringify(exported);
  const restored = validateBackup(JSON.parse(encoded), bank);
  assert.deepEqual(restored.cloud, doc);
  assert.equal(restored.game.xp, 20);
  assert.equal(restored.game.active.id, original.game.active.id);
  assert.match(restored.game.active.syncId, /^g-/);
  assert.equal(validateGame(restored.game, bank).active.phase, 'feedback');
  assert.deepEqual(restored.frenzy, validateFrenzy(original.frenzy, bank));
  assert.deepEqual(restored.log, projected.log);
  assert.equal(restored.log[0].eventId, 'evt:a.1');
  assert.ok(restored.log.every(entry => typeof entry.eventId === 'string'));
  assert.equal(Object.hasOwn(restored, 'access_token'), false);
  assert.equal(Object.hasOwn(restored, 'transcript'), false);
  assert.equal(JSON.stringify(restored.cloud).includes('Choose label'), false);
  assert.deepEqual(captureProgress(restored.cloud, restored, restored, {deviceId: 'phone-a', now: 9000, bank}), restored.cloud);
  assert.deepEqual(captureProgress(restored.cloud, original, restored, {deviceId: 'phone-a', now: 9000, bank}), restored.cloud);
  restored.cloud.saved['retired-q'].value = false;
  restored.frenzy.completed['historical-frenzy'].topics.push('Another topic');
  assert.equal(JSON.stringify(exported), encoded);
});

test('stable event IDs deduplicate only the same event and retain distinct equal-looking events', () => {
  const input = base(), event = input.log[0];
  input.log = [
    {...event, eventId: 'one'}, {...event, eventId: 'one'},
    {...event, eventId: 'two'}, {...event}, {...event}
  ];
  const restored = validateBackup(input);
  assert.equal(restored.log.length, 4);
  assert.deepEqual(restored.log.map(entry => entry.eventId), ['one', 'two', undefined, undefined]);
  assert.equal(input.log.length, 5);
  for (const changed of [{id: 'different-q'}, {at: 200}, {kind: 'review'}, {correct: false}]) {
    assert.throws(() => validateBackup({...base(), log: [{...event, eventId: 'one'}, {...event, ...changed, eventId: 'one'}]}), /conflicting/);
  }
});

test('event IDs accept model-generated metadata IDs and reject unsafe or oversized optional values', () => {
  const event = base().log[0];
  for (const eventId of ['x'.repeat(1024), 'event:["phone-a",100,0,2]', 'legacy:["retired-q",100,"answer",true]:1', 'event-λ']) {
    assert.equal(validateBackup({...base(), log: [{...event, eventId}]}).log[0].eventId, eventId);
  }
  for (const eventId of ['', 'x'.repeat(1025), '\u0000', 'line\nbreak', '\u007f', '__proto__', 'constructor', 'prototype', 100, null, {}, []]) {
    assert.throws(() => validateBackup({...base(), log: [{...event, eventId}]}), /event ID/);
  }
  assert.equal(Object.hasOwn(validateBackup({...base(), log: [{...event, eventId: undefined}]}).log[0], 'eventId'), false);
  const accessor = {...event};
  let called = false;
  Object.defineProperty(accessor, 'eventId', {enumerable: true, get() { called = true; return 'private'; }});
  assert.throws(() => validateBackup({...base(), log: [accessor]}), /invalid optional/);
  assert.equal(called, false);
});

test('invalid optional cloud documents reject the backup without modifying valid local history', () => {
  for (const cloud of [null, {}, {version: 2}, {...blankSyncDocument(), password: 'private'}, {...blankSyncDocument(), records: []}, {...blankSyncDocument(), clock: [-1, 0]}]) {
    const input = {...base(), cloud}, encoded = JSON.stringify(input);
    assert.throws(() => validateBackup(input), /Invalid progress sync/);
    assert.equal(JSON.stringify(input), encoded);
  }
  const inherited = Object.assign(Object.create({access_token: 'private'}), blankSyncDocument());
  assert.throws(() => validateBackup({...base(), cloud: inherited}), /prototype/);
  const input = base();
  let called = false;
  Object.defineProperty(input, 'cloud', {enumerable: true, get() { called = true; return blankSyncDocument(); }});
  assert.throws(() => validateBackup(input), /invalid optional/);
  assert.equal(called, false);
});

test('the optional bank drops stale local rounds while retaining historical progress and cloud IDs', () => {
  const original = withLocalGames();
  const cloud = captureProgress(undefined, original, original, {deviceId: 'phone-a', now: 2000, bank});
  const restored = validateBackup({...original, cloud}, []);
  assert.equal(restored.game.active, null);
  assert.equal(restored.frenzy.active, null);
  assert.equal(restored.game.xp, 20);
  assert.deepEqual(restored.frenzy.completed['historical-frenzy'], historicalSummary());
  assert.deepEqual(restored.cloud, cloud);
  assert.equal(restored.records['retired-q'].correct, true);
  assert.deepEqual(restored.saved, ['retired-q']);
  const withoutBank = validateBackup({...original, cloud});
  assert.ok(withoutBank.game.active);
  assert.ok(withoutBank.frenzy.active);
});

test('Frenzy history is validated strictly while a corrupt active round cannot erase completed summaries', () => {
  const input = withLocalGames();
  input.frenzy.active.deadlineAt = -1;
  const restored = validateBackup(input);
  assert.equal(restored.frenzy.active, null);
  assert.deepEqual(restored.frenzy.completed['historical-frenzy'], historicalSummary());
  for (const frenzy of [null, {}, {...blankFrenzy(), version: 2}, {version: 1, active: null, completed: {bad: historicalSummary()}}, {version: 1, active: null, completed: {'historical-frenzy': {...historicalSummary(), score: 1}}}]) {
    assert.throws(() => validateBackup({...base(), frenzy}), /Invalid Frenzy progress/);
  }
});
