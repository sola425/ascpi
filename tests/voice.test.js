import {test} from 'node:test';
import assert from 'node:assert/strict';
import {voiceAvailability, matchSpokenChoice, createVoiceController} from '../voice.js';

const options = ['Carry oxygen', 'Attack bacteria', 'Clot blood', 'Make antibodies'];

test('spoken letters, phonetic letters and explicit ordinals identify option positions', () => {
  for (const [text, index] of [['option B', 1], ['bee', 1], ['Bravo.', 1], ['I choose C', 2], ['my choice is delta', 3], ['option one', 0], ['option number 2', 1], ['choice fourth', 3], ['option 1.', 0]]) {
    assert.deepEqual(matchSpokenChoice(text, options), {index, reason: 'explicit-choice'}, text);
  }
  for (const text of ['option E', 'B or C', 'not B', 'option B because it carries oxygen', 'two', '2']) assert.equal(matchSpokenChoice(text, options).index, null, text);
});

test('full option text tolerates safe answer prefixes and ordinary sentence punctuation', () => {
  for (const text of ['carry oxygen', '  Carry   oxygen! ', 'my answer is carry oxygen', 'The answer is: carry oxygen.', 'I select carry oxygen']) {
    assert.deepEqual(matchSpokenChoice(text, options), {index: 0, reason: 'exact-text'}, text);
  }
  for (const text of ['oxygen', 'carries oxygen', 'transport oxygen', 'carry oxygen please', 'do not carry oxygen']) assert.equal(matchSpokenChoice(text, options).index, null, text);
});

test('bare numbers and number words are exact option text rather than assumed ordinals', () => {
  assert.deepEqual(matchSpokenChoice('1', ['2', '1', '3']), {index: 1, reason: 'exact-text'});
  assert.deepEqual(matchSpokenChoice('one', ['two', 'one', 'three']), {index: 1, reason: 'exact-text'});
  assert.deepEqual(matchSpokenChoice('my answer is 2', ['3', '1', '2']), {index: 2, reason: 'exact-text'});
  assert.deepEqual(matchSpokenChoice('option two', ['2', '1', '3']), {index: 1, reason: 'explicit-choice'});
});

test('numeric text retains signs, decimals, concentrations and unit case', () => {
  const values = ['0.5', '5', '-5', '+5', '0.5 mg/dL', '0.5 mmol/L', '5 mM', '5 mm'];
  for (const [index, value] of values.entries()) assert.deepEqual(matchSpokenChoice(`my answer is ${value}`, values), {index, reason: 'exact-text'}, value);
  for (const value of ['05', '.5', '0 5', '5 mg/dL', '0.5 MG/DL', '0.5mg/dL', '5!']) assert.equal(matchSpokenChoice(value, values).index, null, value);
  assert.equal(matchSpokenChoice('5.', ['5', '-5']).index, null, 'a trailing decimal is not silently deleted');
});

test('duplicate text or conflicting letter/text interpretations require manual selection', () => {
  assert.deepEqual(matchSpokenChoice('carry oxygen', ['Carry oxygen', 'carry oxygen']), {index: null, reason: 'ambiguous'});
  assert.deepEqual(matchSpokenChoice('bee', ['bee', 'blood']), {index: null, reason: 'ambiguous'});
  assert.deepEqual(matchSpokenChoice('option B', ['same', 'same']), {index: 1, reason: 'explicit-choice'});
  assert.deepEqual(matchSpokenChoice('my answer is red', ['my answer is red', 'red']), {index: null, reason: 'ambiguous'});
});

test('matcher handles empty or invalid data and reads no answer or explanation metadata', () => {
  assert.deepEqual(matchSpokenChoice('', options), {index: null, reason: 'empty'});
  assert.deepEqual(matchSpokenChoice(null, options), {index: null, reason: 'empty'});
  for (const bad of [null, [], ['a', null], [{text: 'red'}]]) assert.deepEqual(matchSpokenChoice('B', bad), {index: null, reason: 'invalid-options'});
  const isolated = ['red', 'blue'];
  Object.defineProperty(isolated, 'correct', {get() { throw Error('Correct answer was inspected'); }});
  assert.deepEqual(matchSpokenChoice('blue', isolated), {index: 1, reason: 'exact-text'});
});

function harness(t, {native = false, browser = false, prefixed = false} = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map(), timers = new Map(), calls = [], recognizers = [];
  let timerId = 0;
  const root = {
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); }
  };
  class Recognition {
    constructor() { this.starts = 0; this.aborts = 0; this.stops = 0; recognizers.push(this); }
    start() { this.starts++; }
    abort() { this.aborts++; this.onend?.(); }
    stop() { this.stops++; }
    result(...transcripts) {
      const result = transcripts.map(transcript => ({transcript}));
      result.isFinal = true;
      this.onresult?.({results: [result]});
    }
  }
  if (native) root.LabwiseAndroid = {
    startVoiceInput(token, language) { calls.push({type: 'start', token, language}); },
    cancelVoiceInput(token) { calls.push({type: 'cancel', token}); }
  };
  if (browser) root[prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = Recognition;
  Object.defineProperty(globalThis, 'window', {value: root, configurable: true, writable: true});
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  });
  return {
    root, calls, timers, listeners, recognizers,
    tick() { const first = timers.entries().next().value; assert.ok(first, 'a finite timeout is scheduled'); timers.delete(first[0]); first[1].fn(); },
    navigate(event = 'pagehide') { for (const callback of [...listeners.get(event) || []]) callback(); }
  };
}
function controller() {
  const states = [], results = [], errors = [];
  const voice = createVoiceController({onState: value => states.push(value), onResult: value => results.push(value), onError: value => errors.push(value)});
  return {voice, states, results, errors};
}

test('capability discovery never starts a microphone and prefers the native bridge', t => {
  const h = harness(t, {native: true, browser: true}), c = controller();
  assert.deepEqual(voiceAvailability(), {available: true, kind: 'native'});
  assert.equal(c.voice.supported(), true);
  assert.deepEqual(h.calls, []); assert.deepEqual(h.recognizers, []); assert.equal(h.timers.size, 0);
  assert.equal(c.voice.start({questionId: 'q1'}), true);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].type, 'start'); assert.equal(h.recognizers.length, 0);
  c.voice.cancel();
});

test('unsupported input fails usefully without a provider or timers', t => {
  const h = harness(t), c = controller(), context = {questionId: 'q1'};
  assert.deepEqual(voiceAvailability(), {available: false, kind: 'unavailable'});
  assert.equal(c.voice.supported(), false); assert.equal(c.voice.start(context), false);
  assert.equal(c.errors[0].code, 'unavailable'); assert.equal(c.errors[0].context, context);
  assert.equal(h.timers.size, 0); assert.deepEqual(c.results, []);
});

test('native transcript and alternatives are returned once with their original context', t => {
  const h = harness(t, {native: true}), c = controller(), context = {questionId: 'q1', mode: 'recall'};
  c.voice.start(context, 'en-GB');
  const call = h.calls[0];
  assert.match(call.token, /^lwvoice_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/);
  assert.deepEqual(Object.keys(call), ['type', 'token', 'language']); assert.equal(call.language, 'en-GB');
  h.root.labwiseNativeVoiceResult(call.token, {status: 'ok', text: ' carry oxygen ', alternatives: ['carry oxygen', 'carry Oxygen', '', 9]});
  assert.deepEqual(c.results, [{text: 'carry oxygen', alternatives: ['carry oxygen', 'carry Oxygen'], context}]);
  assert.deepEqual(c.states.map(state => state.status), ['listening', 'idle']);
  h.root.labwiseNativeVoiceResult(call.token, {status: 'ok', text: 'second result'});
  assert.equal(c.results.length, 1); assert.equal(h.timers.size, 0); assert.deepEqual(c.errors, []);
});

test('cancel, replacement and navigation reject cached native callbacks and old tokens', t => {
  const h = harness(t, {native: true}), c = controller();
  c.voice.start('q1'); const first = h.calls[0].token;
  c.voice.cancel(); c.voice.cancel();
  h.root.labwiseNativeVoiceResult(first, {status: 'ok', text: 'B'});
  c.voice.start('q2'); const second = h.calls.at(-1).token;
  assert.notEqual(first, second);
  h.root.labwiseNativeVoiceResult(first, {status: 'ok', text: 'A'});
  h.root.labwiseNativeVoiceResult('unsafe";alert(1)', {status: 'ok', text: 'A'});
  assert.deepEqual(c.results, []);
  h.navigate('popstate');
  h.root.labwiseNativeVoiceResult(second, {status: 'ok', text: 'C'});
  assert.deepEqual(c.results, []); assert.deepEqual(c.errors, []); assert.equal(h.timers.size, 0);
  assert.equal(h.calls.filter(call => call.type === 'cancel').length, 2);
});

test('provider cancellation, missing provider, failure and missing transcript terminate cleanly', t => {
  const h = harness(t, {native: true}), c = controller();
  for (const [payload, code] of [[{status: 'cancelled'}, null], [{status: 'unavailable'}, 'unavailable'], [{status: 'error', code: 'network'}, 'network'], [{status: 'ok', text: ' '}, 'no-speech'], [null, 'error']]) {
    c.voice.start('q');
    const token = h.calls.findLast(call => call.type === 'start').token, count = c.errors.length;
    h.root.labwiseNativeVoiceResult(token, payload);
    assert.equal(c.errors.length, count + (code ? 1 : 0));
    if (code) assert.equal(c.errors.at(-1).code, code);
    assert.equal(h.timers.size, 0);
  }
  assert.deepEqual(c.results, []);
});

test('native sessions have finite timeouts and stop cancels the external activity', t => {
  const h = harness(t, {native: true}), c = controller();
  c.voice.start('q1'); const token = h.calls[0].token;
  assert.ok([...h.timers.values()][0].delay <= 60000);
  h.tick(); assert.equal(c.errors[0].code, 'timeout');
  h.root.labwiseNativeVoiceResult(token, {status: 'ok', text: 'B'});
  assert.deepEqual(c.results, []); assert.equal(h.calls.at(-1).type, 'cancel');
  c.voice.start('q2'); c.voice.stop(); c.voice.stop();
  assert.equal(h.calls.at(-1).type, 'cancel'); assert.equal(h.timers.size, 0);
});

test('native bridge exceptions reset state and an invalid language falls back safely', t => {
  const h = harness(t, {native: true}), c = controller();
  const original = h.root.LabwiseAndroid.startVoiceInput;
  h.root.LabwiseAndroid.startVoiceInput = (token, language) => { original(token, language); throw Error('Bridge unavailable'); };
  assert.equal(c.voice.start('q', 'en-US;question=private'), false);
  assert.equal(h.calls[0].language, 'en-US'); assert.equal(c.errors[0].code, 'error');
  assert.equal(h.timers.size, 0); assert.equal(h.calls.at(-1).type, 'cancel');
});

test('browser and prefixed browser recognition return final text with no automatic restart', t => {
  const h = harness(t, {browser: true, prefixed: true}), c = controller();
  assert.deepEqual(voiceAvailability(), {available: true, kind: 'browser'});
  assert.deepEqual(h.recognizers, []);
  c.voice.start('recall-q', 'fr-FR');
  const recognition = h.recognizers[0];
  assert.equal(recognition.lang, 'fr-FR'); assert.equal(recognition.continuous, false); assert.equal(recognition.interimResults, false);
  const queued = recognition.onresult;
  recognition.onspeechend(); recognition.result('my spoken recall', 'another transcript');
  assert.deepEqual(c.results, [{text: 'my spoken recall', alternatives: ['my spoken recall', 'another transcript'], context: 'recall-q'}]);
  assert.deepEqual(c.states.map(value => value.status), ['listening', 'processing', 'idle']);
  queued({results: [[{transcript: 'a delayed result'}]]});
  assert.equal(c.results.length, 1); assert.equal(recognition.aborts, 1); assert.equal(recognition.starts, 1); assert.equal(h.recognizers.length, 1);
  assert.equal(h.timers.size, 0);
});

test('browser interim speech stays private until a final result and stop waits a bounded time', t => {
  const h = harness(t, {browser: true}), c = controller();
  c.voice.start('q'); const recognition = h.recognizers[0];
  const interim = [{transcript: 'partial'}]; interim.isFinal = false;
  recognition.onresult({results: [interim]}); assert.deepEqual(c.results, []);
  c.voice.stop(); c.voice.stop(); assert.equal(recognition.stops, 1);
  assert.equal([...h.timers.values()][0].delay, 5000);
  recognition.result('full answer'); assert.equal(c.results[0].text, 'full answer'); assert.equal(h.timers.size, 0);
});

test('browser cancel and navigation suppress queued results even after a new session', t => {
  const h = harness(t, {browser: true}), c = controller();
  c.voice.start('old'); const old = h.recognizers[0], queued = old.onresult;
  c.voice.start('new'); assert.equal(old.aborts, 1);
  queued({results: [[{transcript: 'old answer'}]]});
  const newer = h.recognizers[1], current = newer.onresult;
  h.navigate(); current({results: [[{transcript: 'new answer after navigation'}]]});
  assert.deepEqual(c.results, []); assert.deepEqual(c.errors, []); assert.equal(newer.aborts, 1); assert.equal(h.timers.size, 0);
});

test('browser permission errors, end without speech, start exceptions and timeouts are recoverable', t => {
  const h = harness(t, {browser: true}), c = controller();
  c.voice.start('permission'); h.recognizers.at(-1).onerror({error: 'not-allowed'});
  assert.equal(c.errors.at(-1).code, 'not-allowed');
  c.voice.start('empty'); h.recognizers.at(-1).onend(); assert.equal(c.errors.at(-1).code, 'no-speech');
  c.voice.start('timeout'); h.tick(); assert.equal(c.errors.at(-1).code, 'timeout');
  h.root.SpeechRecognition = class { start() { throw Error('unavailable'); } abort() {} };
  assert.equal(c.voice.start('throwing'), false); assert.equal(c.errors.at(-1).code, 'error');
  assert.equal(h.timers.size, 0); assert.deepEqual(c.results, []);
});

test('navigation during a final state callback suppresses the pending result', t => {
  const h = harness(t, {native: true}), results = [];
  let voice;
  voice = createVoiceController({onState: state => { if (state.status === 'idle') voice.cancel(); }, onResult: result => results.push(result)});
  voice.start('q');
  h.root.labwiseNativeVoiceResult(h.calls[0].token, {status: 'ok', text: 'B'});
  assert.deepEqual(results, []); assert.equal(h.timers.size, 0);
});
