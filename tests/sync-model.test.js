import test from 'node:test';
import assert from 'node:assert/strict';
import {blankSyncDocument, validateSyncDocument, captureProgress, mergeSyncDocuments, projectProgress} from '../sync-model.js';
import {validateBackup} from '../learning.js';
import {blankGame, startRun, answerRun} from '../game.js';
import {blankFrenzy, validateFrenzy, startFrenzy} from '../frenzy.js';

const clone = value => JSON.parse(JSON.stringify(value));
const blank = () => ({records: {}, saved: [], log: [], reading: {}, prefs: {sessionSize: 10, fontScale: 1}, goal: 10});
const record = (extra = {}) => ({due: 1000, stage: 1, reviews: 2, correct: true, at: 100, reviewedAt: 100, ...extra});
const baseline = () => ({...blank(), records: {q1: record()}, saved: ['q1'], reading: {book: 20}});
const capture = (doc, before, after, deviceId, now = 2000) => captureProgress(doc, before, after, {deviceId, now});
const boot = (progress = baseline()) => capture(undefined, progress, progress, 'origin', 1000);
const project = doc => projectProgress(doc, blank());
const summary = (id, extra = {}) => ({id, topics: ['Numbers'], questionCount: 10, answered: 3, correct: 0, hearts: 0, score: 0, startedAt: 100, endedAt: 200, reason: 'hearts', ...extra});
const withFrenzy = (...summaries) => ({...blank(), frenzy: {version: 1, active: null, completed: Object.fromEntries(summaries.map(s => [s.id, s]))}});

test('blank document projects to a valid progress backup without device-only fields', () => {
  const doc = blankSyncDocument();
  assert.deepEqual(validateSyncDocument(doc), doc);
  const projected = projectProgress(doc, {...blank(), password: 'private', practice: {index: 4}, transcript: 'private'});
  const restored = validateBackup({version: 3, ...projected});
  assert.equal(restored.goal, 10);
  assert.equal(Object.keys(restored.records).length, 0);
  assert.deepEqual(restored.prefs, {sessionSize: 10, fontScale: 1});
  assert.equal('password' in projected, false);
  assert.equal('practice' in projected, false);
});

test('independent MCQ, recall and game edits converge without erasing other dimensions', () => {
  const before = baseline(), doc = boot(before);
  const a = clone(before), b = clone(before), c = clone(before);
  Object.assign(a.records.q1, {correct: false, at: 1100, reviews: 3, reviewedAt: 1100, due: 2100});
  Object.assign(b.records.q1, {lastRecallRating: 'hard', lastRecallAt: 1200, reviews: 3, reviewedAt: 1200, due: 2200});
  Object.assign(c.records.q1, {lastGameCorrect: false, lastGameAt: 1300, reviews: 3, reviewedAt: 1300, due: 2300});
  const da = capture(doc, before, a, 'a', 1100), db = capture(doc, before, b, 'b', 1200), dc = capture(doc, before, c, 'c', 1300);
  const merged = mergeSyncDocuments(mergeSyncDocuments(da, db), dc);
  const r = project(merged).records.q1;
  assert.equal(r.correct, false);
  assert.equal(r.at, 1100);
  assert.equal(r.lastRecallRating, 'hard');
  assert.equal(r.lastRecallAt, 1200);
  assert.equal(r.lastGameCorrect, false);
  assert.equal(r.lastGameAt, 1300);
  assert.equal(r.due, 2300);
  assert.equal(r.reviews, 5);
  assert.deepEqual(mergeSyncDocuments(da, db), mergeSyncDocuments(db, da));
  assert.deepEqual(mergeSyncDocuments(da, da), da);
  assert.deepEqual(merged, mergeSyncDocuments(da, mergeSyncDocuments(dc, db)));
  assert.deepEqual(merged, mergeSyncDocuments(mergeSyncDocuments(dc, da), db));
  assert.equal(validateBackup({version: 3, ...project(merged)}).records.q1.reviews, 5);
});

test('saving a game result on another phone retains an older MCQ result', () => {
  const old = baseline(), empty = blank();
  const mcq = capture(undefined, old, old, 'a', 1000);
  const gameProgress = {...empty, records: {q1: record({correct: undefined, at: 0, lastGameCorrect: false, lastGameAt: 3000})}};
  const game = capture(undefined, gameProgress, gameProgress, 'b', 4000);
  const restored = project(mergeSyncDocuments(game, mcq));
  assert.equal(restored.records.q1.correct, true);
  assert.equal(restored.records.q1.lastGameCorrect, false);
  assert.equal(restored.records.q1.at, 100);
});

test('a saved-question removal survives an offline phone retaining an old favorite', () => {
  const before = baseline(), doc = boot(before);
  const removed = clone(before), offline = clone(before);
  removed.saved = [];
  offline.saved.push('q2');
  const a = capture(doc, before, removed, 'a', 3000), b = capture(doc, before, offline, 'b', 4000);
  const merged = mergeSyncDocuments(a, b);
  assert.deepEqual(projectProgress(merged, before).saved, ['q2']);
  assert.equal(merged.saved.q1.value, false);
  assert.deepEqual(project(mergeSyncDocuments(merged, doc)).saved, ['q2']);
});

test('reading positions and each preference merge independently with deterministic device ties', () => {
  const before = baseline(), doc = boot(before), a = clone(before), b = clone(before);
  a.reading.book = 3;
  a.prefs.fontScale = 1.3;
  a.goal = 30;
  b.reading.appendix = 7;
  b.prefs.sessionSize = 50;
  const da = capture(doc, before, a, 'a', 3000), db = capture(doc, before, b, 'b', 3000);
  const projected = project(mergeSyncDocuments(da, db));
  assert.deepEqual({...projected.reading}, {appendix: 7, book: 3});
  assert.deepEqual(projected.prefs, {sessionSize: 50, fontScale: 1.3});
  assert.equal(projected.goal, 30);
  const tieA = clone(before), tieB = clone(before);
  tieA.goal = 5;
  tieB.goal = 20;
  const tied = mergeSyncDocuments(capture(doc, before, tieA, 'a', 3000), capture(doc, before, tieB, 'b', 3000));
  assert.equal(project(tied).goal, 20);
});

test('hybrid clocks survive a backwards phone clock and advance only for captured changes', () => {
  const before = baseline(), doc = boot(before), changed = clone(before);
  changed.goal = 20;
  const updated = capture(doc, before, changed, 'phone', 10);
  assert.equal(updated.clock[0], doc.clock[0]);
  assert.equal(updated.clock[1], doc.clock[1] + 1);
  assert.deepEqual(capture(updated, changed, changed, 'phone', 9999), updated);
  const projected = projectProgress(updated, before);
  assert.deepEqual(capture(updated, before, projected, 'phone', 9999), updated);
});

test('a new question dimension observes received clocks, while legacy bootstrap retains the activity date', () => {
  const legacy = baseline(), oldCopy = clone(legacy);
  oldCopy.records.q1.correct = false;
  oldCopy.records.q1.at = 50;
  const old = capture(undefined, oldCopy, oldCopy, 'old-phone', 10000);
  assert.equal(project(mergeSyncDocuments(boot(legacy), old)).records.q1.correct, true);
  const before = {...blank(), records: {q1: record({correct: undefined})}};
  const seeded = boot(before), preferences = clone(before);
  preferences.goal = 20;
  const received = capture(seeded, before, preferences, 'remote-phone', 5000);
  const answered = clone(preferences);
  Object.assign(answered.records.q1, {correct: true, at: 1000});
  const updated = capture(received, preferences, answered, 'local-phone', 1000);
  assert.deepEqual(updated.records.q1.mcq.clock, [5000, 1, 'local-phone']);
});

test('identical legacy histories deduplicate across copied backups while preserving duplicate occurrences', () => {
  const old = baseline();
  old.log = [{id: 'q1', at: 100, kind: 'answer', correct: true}, {id: 'q1', at: 100, kind: 'answer', correct: true}];
  const a = capture(undefined, old, old, 'a', 2000), b = capture(undefined, old, old, 'b', 3000);
  const merged = mergeSyncDocuments(a, b);
  assert.equal(Object.keys(merged.events).length, 2);
  assert.equal(projectProgress(merged, old).log.length, 2);
  assert.equal(new Set(project(merged).log.map(e => e.eventId)).size, 2);
  assert.deepEqual(capture(merged, old, projectProgress(merged, old), 'a', 4000), merged);
});

test('two phones recording the same new event retain distinct events, with or without stable event IDs', () => {
  for (const stable of [false, true]) {
    const before = blank(), a = blank(), b = blank(), doc = blankSyncDocument();
    const event = {id: 'q1', at: 100, kind: 'review', correct: false};
    a.log.push({...event, ...(stable ? {eventId: 'a-unique-event'} : {})});
    b.log.push({...event, ...(stable ? {eventId: 'b-unique-event'} : {})});
    const da = capture(doc, before, a, 'a', 200), db = capture(doc, before, b, 'b', 200);
    const merged = mergeSyncDocuments(da, db), projected = project(merged);
    assert.equal(projected.log.length, 2);
    assert.equal(new Set(projected.log.map(e => e.eventId)).size, 2);
    assert.deepEqual(mergeSyncDocuments(merged, da), merged);
    assert.deepEqual(capture(merged, before, projected, 'a', 1000), merged);
    assert.equal(validateBackup({version: 3, ...projected}).log.length, 2);
  }
});

test('explicit removals use tombstones, but initial missing dimensions create no deletion', () => {
  const before = baseline(), doc = boot(before), after = clone(before);
  delete after.records.q1.correct;
  delete after.reading.book;
  delete after.prefs.fontScale;
  const removed = capture(doc, before, after, 'a', 3000);
  assert.equal(removed.records.q1.mcq.value, null);
  assert.equal(removed.reading.book.value, null);
  assert.equal(removed.prefs.fontScale.value, null);
  const projected = projectProgress(mergeSyncDocuments(removed, doc), before);
  assert.equal(projected.records.q1.correct, undefined);
  assert.equal(projected.reading.book, undefined);
  assert.equal(projected.prefs.fontScale, 1);
  const noMcq = {...blank(), records: {q1: record({correct: undefined})}};
  const seeded = capture(undefined, undefined, noMcq, 'b', 4000);
  assert.equal(own(seeded.records.q1, 'mcq'), false);
  assert.equal(project(mergeSyncDocuments(seeded, doc)).records.q1.correct, true);
});

const own = (value, name) => Object.hasOwn(value, name);

test('local history and review counts cannot be reduced by an older backup or lower local counter', () => {
  const before = baseline(), doc = boot(before), after = clone(before);
  after.records.q1.reviews = 3;
  const newer = capture(doc, before, after, 'a', 3000);
  const lower = clone(before);
  lower.records.q1.reviews = 0;
  const captured = capture(newer, after, lower, 'a', 4000);
  assert.equal(project(mergeSyncDocuments(captured, doc)).records.q1.reviews, 3);
  assert.equal(projectProgress(doc, after).records.q1.reviews, 3);
});

test('capture and projection allowlist progress metadata and never copy content, auth or transcripts', () => {
  const input = baseline();
  Object.assign(input, {password: 'secret-password', access_token: 'secret-token', transcript: 'secret-transcript', pdf: 'secret-pdf', questions: ['secret-question']});
  Object.assign(input.records.q1, {question: 'secret-question', audio: 'secret-audio'});
  input.log.push({id: 'q1', at: 100, kind: 'answer', correct: true, transcript: 'secret-transcript'});
  const original = JSON.stringify(input), doc = boot(input), encoded = JSON.stringify(doc);
  for (const secret of ['secret-password', 'secret-token', 'secret-transcript', 'secret-pdf', 'secret-question', 'secret-audio']) assert.equal(encoded.includes(secret), false);
  assert.equal(JSON.stringify(input), original);
  assert.equal('password' in projectProgress(doc, input), false);
});

test('malformed documents, prototype payloads, accessors, cycles and oversized data are rejected', () => {
  const doc = boot();
  const mutations = [
    d => { d.version = 2; },
    d => { d.password = 'private'; },
    d => { d.records.q1.question = 'content'; },
    d => { d.saved.q1.value = null; },
    d => { d.records.q1.mcq.clock[1] = -1; },
    d => { d.records.q1.reviews.base = Number.MAX_SAFE_INTEGER + 1; },
    d => { d.reading.book.value = 0; },
    d => { d.clock = [0, 0]; },
    d => { d.events.bad = {id: 'q1', at: 0, kind: 'voice', correct: false}; },
    d => { d.saved = JSON.parse('{"__proto__":{"value":true,"clock":[0,0,"a"]}}'); }
  ];
  for (const mutate of mutations) {
    const malformed = clone(doc);
    mutate(malformed);
    assert.throws(() => validateSyncDocument(malformed), /Invalid progress sync/);
  }
  assert.throws(() => validateSyncDocument(Object.assign(Object.create({auth: 'inherited'}), doc)), /prototype/);
  let called = false;
  const accessor = clone(doc);
  Object.defineProperty(accessor, 'password', {enumerable: true, get() { called = true; return 'private'; }});
  assert.throws(() => validateSyncDocument(accessor), /accessor/);
  assert.equal(called, false);
  const circular = clone(doc);
  circular.loop = circular;
  assert.throws(() => validateSyncDocument(circular), /circular/);
  const deep = clone(doc);
  let branch = deep;
  for (let i = 0; i < 40; i++) branch = branch.child = {};
  assert.throws(() => validateSyncDocument(deep), /deeply nested/);
  assert.throws(() => validateSyncDocument({...doc, content: 'x'.repeat(9 * 1024 * 1024)}), /too large/);
});

test('one stable event ID cannot silently discard conflicting history', () => {
  const a = blank(), b = blank();
  a.log.push({id: 'q1', at: 100, kind: 'answer', correct: true, eventId: 'same-id'});
  b.log.push({id: 'q1', at: 100, kind: 'answer', correct: false, eventId: 'same-id'});
  const da = boot(a), db = boot(b);
  assert.throws(() => mergeSyncDocuments(da, db), /conflicting/);
  assert.throws(() => projectProgress(da, b), /conflicting/);
});

test('completed Frenzy summaries union across devices and clone IDs deduplicate deterministically', () => {
  const empty = blank(), base = boot(empty);
  const a = capture(base, empty, withFrenzy(summary('frenzy-a')), 'a', 3000);
  const b = capture(base, empty, withFrenzy(summary('frenzy-b')), 'b', 3000);
  const merged = mergeSyncDocuments(a, b);
  assert.deepEqual(Object.keys(merged.frenzy), ['frenzy-a', 'frenzy-b']);
  assert.deepEqual(mergeSyncDocuments(a, b), mergeSyncDocuments(b, a));
  assert.deepEqual(mergeSyncDocuments(merged, a), merged);
  const projected = project(merged);
  assert.deepEqual(Object.keys(validateFrenzy(projected.frenzy).completed), ['frenzy-a', 'frenzy-b']);
  assert.equal(projected.frenzy.active, null);
  assert.deepEqual(capture(merged, projected, projected, 'a', 9999), merged);
  assert.deepEqual(capture(merged, empty, projected, 'a', 9999), merged);
  const farther = summary('frenzy-a', {answered: 4, correct: 1, score: 100, endedAt: 150});
  const later = {...farther, endedAt: 400};
  const dc = capture(base, empty, withFrenzy(farther), 'c', 3000);
  const dd = capture(base, empty, withFrenzy(later), 'd', 3000);
  const furthest = mergeSyncDocuments(a, dc);
  assert.deepEqual(furthest.frenzy['frenzy-a'], farther);
  const latest = mergeSyncDocuments(dd, furthest);
  assert.deepEqual(latest.frenzy['frenzy-a'], later);
  assert.deepEqual(mergeSyncDocuments(a, mergeSyncDocuments(dc, dd)), latest);
  const tieA = summary('frenzy-tie', {topics: ['Numbers']});
  const tieB = summary('frenzy-tie', {topics: ['Patterns']});
  const ta = boot(withFrenzy(tieA)), tb = boot(withFrenzy(tieB));
  assert.deepEqual(mergeSyncDocuments(ta, tb), mergeSyncDocuments(tb, ta));
});

test('Frenzy documents reject active rounds, extra content, inconsistent scores and mismatched IDs', () => {
  const doc = boot(withFrenzy(summary('frenzy-a')));
  const invalid = [
    d => { d.frenzy.active = {question: 'private-content'}; },
    d => { d.frenzy['frenzy-a'].question = 'private-content'; },
    d => { d.frenzy['frenzy-a'].access_token = 'private-token'; },
    d => { d.frenzy['frenzy-a'].score = 100; },
    d => { d.frenzy['frenzy-a'].id = 'other-id'; },
    d => { d.frenzy['frenzy-a'].answered = 11; },
    d => { d.frenzy['frenzy-a'].endedAt = 99; }
  ];
  for (const mutate of invalid) {
    const malformed = clone(doc);
    mutate(malformed);
    assert.throws(() => validateSyncDocument(malformed), /Invalid/);
  }
  const local = withFrenzy(summary('frenzy-a'));
  local.frenzy.active = {queue: [{question: 'private-content', fingerprint: 'private-fingerprint'}], transcript: 'private-transcript'};
  local.frenzy.access_token = 'private-token';
  const encoded = JSON.stringify(boot(local));
  for (const secret of ['private-content', 'private-fingerprint', 'private-transcript', 'private-token']) assert.equal(encoded.includes(secret), false);
});

test('Frenzy projection preserves this phone’s valid active round and syncs no active fingerprints', () => {
  const bank = Array.from({length: 5}, (_, i) => ({id: `item-${i}`, topic: 'Numbers', question: `Choose label ${i}.`, options: ['First', 'Second'], answer: 0}));
  const a = withFrenzy(summary('frenzy-old'));
  a.frenzy = startFrenzy(a.frenzy, bank, {runId: 'active-a', now: 1000});
  const b = {...blank(), frenzy: startFrenzy(blankFrenzy(), bank, {runId: 'active-b', now: 2000})};
  const doc = boot(a), projected = projectProgress(doc, b, {bank});
  assert.deepEqual(projected.frenzy.active, b.frenzy.active);
  assert.deepEqual(Object.keys(projected.frenzy.completed), ['frenzy-old']);
  assert.deepEqual(Object.keys(doc.frenzy), ['frenzy-old']);
  const encoded = JSON.stringify(doc.frenzy);
  assert.equal(encoded.includes('fingerprint'), false);
  assert.equal(encoded.includes('active-a'), false);
  assert.equal(encoded.includes('Choose label'), false);
  assert.deepEqual(capture(doc, projected, projected, 'b', 9999), doc);
});

test('omitting before during first boot retains all legacy values, including existing game totals', () => {
  const bank = Array.from({length: 5}, (_, i) => ({id: `item-${i}`, topic: 'Numbers', question: `Choose label ${i}.`, options: ['First', 'Second'], answer: 0}));
  let game = startRun(blankGame(), bank, {now: 1000});
  game = answerRun(game, bank, 0, {now: 1100});
  const legacy = {...baseline(), game, frenzy: withFrenzy(summary('frenzy-old')).frenzy};
  legacy.log.push({id: 'q1', at: 100, kind: 'answer', correct: true});
  const doc = capture(undefined, undefined, legacy, 'a', 2000), projected = projectProgress(doc, legacy, {bank});
  assert.equal(projected.game.xp, legacy.game.xp);
  assert.equal(projected.game.stats.attempted, legacy.game.stats.attempted);
  assert.equal(projected.game.active.id, legacy.game.active.id);
  assert.equal(projected.records.q1.correct, true);
  assert.deepEqual(projected.saved, legacy.saved);
  assert.equal(projected.reading.book, legacy.reading.book);
  assert.equal(projected.log.length, legacy.log.length);
  assert.deepEqual(projected.frenzy.completed, validateFrenzy(legacy.frenzy).completed);
  assert.deepEqual(capture(doc, projected, projected, 'a', 9999), doc);
  assert.deepEqual(capture(doc, legacy, projected, 'a', 9999), doc);
});
