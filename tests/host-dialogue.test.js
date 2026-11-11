// Dialogue tests use fake speech promises. No microphone, TTS service or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHostDialogue, hostCommand} from '../host-dialogue.js';

const EXPLANATION = 'EXPLANATION_AFTER_CONFIRMED_CHOICE';
const SOURCE = 'ORIGINAL_RATIONALE_AFTER_CONFIRMED_CHOICE';
const RECALL = 'RECALL_MODEL_AFTER_LEARNER_RESPONSE';
const OPTION_NOTES = ['FIRST_CHOICE_NOTE', 'SECOND_CHOICE_NOTE', 'THIRD_CHOICE_NOTE', 'FOURTH_CHOICE_NOTE'];
const question = (id = 'label-a', changes = {}) => ({id, topic: 'Labels', question: `Which label belongs to ${id}?`,
  options: ['Amber label', 'Blue label', 'Coral label', 'Dune label'], answer: 1, explanation: SOURCE,
  teaching: {questionInPlainEnglish: 'Compare the label with the choices.', explanation: EXPLANATION,
    memory: 'Read, compare, match.', optionExplanations: [...OPTION_NOTES],
    quickCheck: {question: 'What comparison helped you decide?', answer: RECALL}}, ...changes});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const error = (code, message = `Mock speech ${code}.`) => Object.assign(new Error(message), {code});
async function pump() { for (let index = 0; index < 30; index++) await Promise.resolve(); }

function harness({autoListen = false, manualSpeech = false, ignoreStop = false, completeWithNull = false, context: overrides = {}, settings: settingOverrides = {}} = {}) {
  let context = {roundId: 'round-a', index: 0, phase: 'question', q: question(), questionCount: 3,
    hiddenChoices: [], lastResponse: null, terminal: false, ...overrides};
  let settings = {autoListen, language: 'en-US', rate: 1, ...settingOverrides};
  const spoken = [], listened = [], changed = [], answers = [], nexts = [], lifelines = [], recalls = [];
  let pendingSpeech = null, pendingListening = null, stops = 0;
  const io = {
    capabilities: () => ({ttsAvailable: true, recognitionAvailable: true, initializing: false, voices: []}),
    speak(text, options) {
      const operation = deferred();
      const record = {text, options, ...operation}; spoken.push(record);
      pendingSpeech = record;
      if (!manualSpeech) {pendingSpeech = null; operation.resolve(true);}
      return operation.promise;
    },
    listen(options) {
      const operation = deferred(); const record = {options, ...operation}; listened.push(record);
      pendingListening = record;
      return operation.promise;
    },
    stop() {
      stops++;
      if (!ignoreStop) {
        if (pendingSpeech) pendingSpeech.resolve(false);
        if (pendingListening) pendingListening.reject(error('cancelled'));
      }
      pendingSpeech = pendingListening = null;
    },
    dispose() { io.stop(); }
  };
  const dialogue = createHostDialogue({io, getContext: () => context, getSettings: () => settings,
    onChange: state => changed.push(state),
    onAnswer: choice => {
      answers.push({roundId: context?.roundId, index: context?.index, choice});
      const q = context.q;
      context = {...context, phase: 'feedback', lastResponse: {id: q.id, choice, correct: choice === q.answer,
        skipped: false, at: 1000}};
    },
    onNext: () => {
      nexts.push({roundId: context.roundId, index: context.index});
      context = context.terminal ? completeWithNull ? null : {...context, phase: 'complete'} : {...context, index: context.index + 1,
        phase: 'question', q: question(`label-${context.index + 1}`), lastResponse: null, hiddenChoices: []};
    },
    onLifeline: type => {
      lifelines.push(type);
      if (type === 'fifty') context = {...context, hiddenChoices: [0, 2]};
      if (type === 'skip') context = {...context, phase: 'feedback', lastResponse: {id: context.q.id,
        choice: null, correct: false, skipped: true, at: 1000}};
    },
    onRecall: rating => recalls.push({rating, id: context.q.id})
  });
  return {dialogue, io, spoken, listened, changed, answers, nexts, lifelines, recalls,
    setContext: value => {context = value;}, updateContext: value => {context = {...context, ...value};},
    context: () => context, setSettings: value => {settings = {...settings, ...value};},
    speech: () => pendingSpeech, listening: () => pendingListening, stops: () => stops,
    async hear(text) {assert.ok(pendingListening, 'Expected an active mocked recognizer');
      const active = pendingListening; pendingListening = null; active.resolve(text); await pump();},
    async rejectListening(code) {assert.ok(pendingListening, 'Expected an active mocked recognizer');
      const active = pendingListening; pendingListening = null; active.reject(error(code)); await pump();},
    async endSpeech(ok = true) {assert.ok(pendingSpeech, 'Expected a queued mocked utterance');
      const active = pendingSpeech; pendingSpeech = null; active.resolve(ok); await pump();}
  };
}
const allSpeech = fixture => fixture.spoken.map(item => item.text).join('\n');
function noTeachingLeak(fixture) {
  for (const sentinel of [EXPLANATION, SOURCE, RECALL, ...OPTION_NOTES]) assert.equal(allSpeech(fixture).includes(sentinel), false, sentinel);
}

test('spoken command matching is bounded to whole commands and accepts polite punctuation', () => {
  for (const [utterance, expected] of [['Pause!', 'pause'], ['Please repeat question.', 'repeat'],
    ['Final answer', 'yes'], ['No', 'no'], ['50 50', 'fifty'], ['give me a clue', 'hint'], ['pass', 'skip'],
    ['explain all choices', 'options'], ['original rationale', 'rationale'], ['ask why', 'recall'],
    ['show answer', 'reveal'], ['I remembered', 'good'], ['not yet', 'again'],
    ['50/50', 'fifty'], ['Could you read the question please?', 'repeat'],
    ['Yes, that is my final answer!', 'yes'], ["Yes, that's my final answer, please.", 'yes'],
    ['Can you explain why please?', 'recall']]) {
    assert.equal(hostCommand(utterance), expected, utterance);
  }
  for (const utterance of ['', 'blue label', 'yes because I compared the labels', 'next I compared both choices']) {
    assert.equal(hostCommand(utterance), null, utterance);
  }
});

test('starting reads the question and visible choices without revealing teaching or grading', async () => {
  const f = harness(); await f.dialogue.start();
  assert.match(allSpeech(f), /Question 1 of 3/); assert.match(allSpeech(f), /Which label belongs/);
  for (const option of f.context().q.options) assert.ok(allSpeech(f).includes(option));
  assert.equal(f.answers.length, 0); assert.equal(f.nexts.length, 0); assert.equal(f.listened.length, 0);
  assert.equal(f.dialogue.getState().running, true); noTeachingLeak(f); f.dialogue.dispose();
});

test('a spoken choice requires a separate explicit yes before scoring', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.submit('option B');
  assert.equal(f.answers.length, 0); assert.equal(f.dialogue.getState().candidate, 1);
  assert.match(allSpeech(f), /final answer|confirm/i); noTeachingLeak(f);
  await f.dialogue.submit('yes');
  assert.deepEqual(f.answers, [{roundId: 'round-a', index: 0, choice: 1}]);
  assert.ok(allSpeech(f).includes(EXPLANATION)); assert.equal(f.nexts.length, 0);
  await f.dialogue.submit('yes'); assert.equal(f.answers.length, 1); f.dialogue.dispose();
});

test('every correct answer explains the selected choice and book rationale, then asks for teach-back', async () => {
  for (const index of [0, 1, 2]) {
    const f = harness({context: {index, terminal: index === 2}});
    await f.dialogue.start(); await f.dialogue.submit('option B'); noTeachingLeak(f);
    const start = f.spoken.length;
    await f.dialogue.submit('yes');
    const feedback = f.spoken.slice(start).map(item => item.text).join('\n');
    assert.match(feedback, /Your answer is correct according to the book\. You chose option B\. Blue label/);
    assert.match(feedback, /Why your chosen answer is correct\. SECOND_CHOICE_NOTE/);
    assert.match(feedback, /Here is the original book rationale\. ORIGINAL_RATIONALE_AFTER_CONFIRMED_CHOICE/);
    assert.match(feedback, /A simpler explanation\. EXPLANATION_AFTER_CONFIRMED_CHOICE/);
    assert.ok(feedback.indexOf(SOURCE) < feedback.indexOf(EXPLANATION), 'The original and simplified explanations are clearly separated');
    assert.match(feedback, /explain back what you learned.*in your own words/i);
    assert.equal(feedback.includes(RECALL), false, 'Teach-back does not reveal the comparison answer first');
    assert.equal(feedback.includes(OPTION_NOTES[0]), false, 'Only the chosen option needs an automatic choice explanation');
    assert.equal(f.dialogue.getState().phase, 'recall');
    assert.equal(f.answers.length, 1); assert.equal(f.recalls.length, 0); assert.equal(f.nexts.length, 0);
    f.dialogue.dispose();
  }
});

test('a wrong answer explains the actual wrong choice and correct choice before book rationale and teach-back', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.submit('option A'); noTeachingLeak(f);
  const start = f.spoken.length; await f.dialogue.submit('yes');
  const feedback = f.spoken.slice(start).map(item => item.text).join('\n');
  assert.match(feedback, /Your answer is incorrect according to the book\. You chose option A\. Amber label/);
  assert.match(feedback, /The book's correct answer is option B\. Blue label/);
  assert.match(feedback, /Why your chosen answer is wrong for this question\. FIRST_CHOICE_NOTE/);
  assert.match(feedback, /Why the correct answer fits\. SECOND_CHOICE_NOTE/);
  assert.match(feedback, /Here is the original book rationale\. ORIGINAL_RATIONALE_AFTER_CONFIRMED_CHOICE/);
  assert.match(feedback, /A simpler explanation\. EXPLANATION_AFTER_CONFIRMED_CHOICE/);
  assert.match(feedback, /explain back what you learned from this question or its correction, in your own words/);
  assert.equal(f.dialogue.getState().phase, 'recall'); assert.equal(f.nexts.length, 0);
  await f.dialogue.submit('I compared the label to all the choices.');
  assert.equal(f.dialogue.getState().phase, 'compare'); assert.ok(allSpeech(f).includes(RECALL));
  assert.equal(f.recalls.length, 0, 'Speaking freely is not automatically graded');
  await f.dialogue.submit('review again');
  assert.deepEqual(f.recalls, [{rating: 'again', id: 'label-a'}]); assert.equal(f.answers.length, 1);
  assert.equal(f.nexts.length, 0); f.dialogue.dispose();
});

test('an imported question without teaching still reads its book rationale and asks for teach-back', async () => {
  const f = harness({context: {q: question('unannotated', {teaching: undefined})}});
  await f.dialogue.start(); await f.dialogue.choose(0); await f.dialogue.confirm();
  const spoken = allSpeech(f);
  assert.match(spoken, /Your answer is incorrect according to the book/);
  assert.match(spoken, /Here is the original book rationale\. ORIGINAL_RATIONALE_AFTER_CONFIRMED_CHOICE/);
  assert.match(spoken, /What was the key idea you learned/);
  for (const note of OPTION_NOTES) assert.equal(spoken.includes(note), false, 'Do not invent missing choice explanations');
  assert.equal(f.dialogue.getState().phase, 'recall'); assert.equal(f.nexts.length, 0); f.dialogue.dispose();
});

test('confirm without a candidate cannot grade, and no cancels a pending choice', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.confirm(); await f.dialogue.submit('yes');
  assert.equal(f.answers.length, 0);
  await f.dialogue.choose(2); assert.equal(f.dialogue.getState().candidate, 2);
  await f.dialogue.submit('no'); assert.equal(f.dialogue.getState().candidate, null);
  await f.dialogue.confirm(); assert.equal(f.answers.length, 0); noTeachingLeak(f); f.dialogue.dispose();
});

test('changing a choice starts another confirmation instead of grading immediately', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.choose(0); await f.dialogue.cancelConfirm();
  await f.dialogue.submit('blue label'); assert.equal(f.dialogue.getState().candidate, 1);
  assert.equal(f.answers.length, 0); await f.dialogue.confirm(); assert.equal(f.answers[0].choice, 1); f.dialogue.dispose();
});

test('removed choices cannot be selected through speech or an on-screen choose action', async () => {
  const f = harness({context: {hiddenChoices: [0, 2]}}); await f.dialogue.start();
  assert.equal(allSpeech(f).includes('Amber label'), false); assert.equal(allSpeech(f).includes('Coral label'), false);
  await f.dialogue.choose(0); await f.dialogue.submit('option C'); await f.dialogue.confirm();
  assert.equal(f.answers.length, 0); assert.equal(f.dialogue.getState().candidate, null);
  await f.dialogue.submit('option B'); await f.dialogue.confirm(); assert.equal(f.answers[0].choice, 1); f.dialogue.dispose();
});

test('ambiguous or unmatched speech never guesses or submits an answer', async () => {
  const f = harness(); await f.dialogue.start();
  for (const text of ['I am not sure about any of these', 'B or C', ' ', 'not one answer']) await f.dialogue.submit(text);
  assert.equal(f.answers.length, 0); assert.equal(f.dialogue.getState().candidate, null);
  noTeachingLeak(f); f.dialogue.dispose();
});

test('feedback, rationale and choice notes cannot leak the answer before confirmation', async () => {
  const f = harness(); await f.dialogue.start();
  await f.dialogue.feedback(); await f.dialogue.readOptions(); await f.dialogue.readRationale();
  await f.dialogue.askRecall(); await f.dialogue.revealRecall();
  await f.dialogue.submit('original rationale'); await f.dialogue.submit('show answer');
  assert.equal(f.answers.length, 0); noTeachingLeak(f); f.dialogue.dispose();
});

test('explanations and every-choice/source readings wait for the learner to request next', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.choose(0); await f.dialogue.confirm();
  assert.ok(allSpeech(f).includes(EXPLANATION)); assert.equal(f.nexts.length, 0);
  await f.dialogue.readOptions(); for (const note of OPTION_NOTES) assert.ok(allSpeech(f).includes(note));
  await f.dialogue.readRationale(); assert.ok(allSpeech(f).includes(SOURCE));
  assert.equal(f.nexts.length, 0); await f.dialogue.next(); assert.equal(f.nexts.length, 1); f.dialogue.dispose();
});

test('next during an unanswered question or pending confirmation cannot skip grading', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.next(); await f.dialogue.submit('next');
  assert.equal(f.nexts.length, 0); await f.dialogue.choose(1); await f.dialogue.next();
  assert.equal(f.nexts.length, 0); assert.equal(f.answers.length, 0); noTeachingLeak(f); f.dialogue.dispose();
});

test('recall captures the learner response then compares without pretending to grade its meaning', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.choose(0); await f.dialogue.confirm();
  await f.dialogue.askRecall(); assert.match(allSpeech(f), /What comparison helped/);
  assert.equal(allSpeech(f).includes(RECALL), false);
  const personal = 'My private explanation is that I compared the two labels.';
  await f.dialogue.submit(personal); assert.ok(allSpeech(f).includes(RECALL));
  assert.equal(f.recalls.length, 0); assert.equal(f.nexts.length, 0);
  await f.dialogue.submit('got it'); assert.deepEqual(f.recalls, [{rating: 'good', id: 'label-a'}]);
  assert.equal(f.answers.length, 1); assert.equal(f.nexts.length, 0); f.dialogue.dispose();
});

test('explicit recall reveal still requires self-rating and never creates an automatic grade', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.choose(1); await f.dialogue.confirm();
  await f.dialogue.askRecall(); await f.dialogue.revealRecall();
  assert.ok(allSpeech(f).includes(RECALL)); assert.equal(f.recalls.length, 0);
  await f.dialogue.rateRecall('again'); assert.deepEqual(f.recalls, [{rating: 'again', id: 'label-a'}]);
  assert.equal(f.nexts.length, 0); f.dialogue.dispose();
});

test('question lifeline commands route to the engine and skip stays separate from a wrong answer', async () => {
  const f = harness(); await f.dialogue.start(); await f.dialogue.submit('fifty fifty');
  assert.deepEqual(f.lifelines, ['fifty']); assert.equal(f.answers.length, 0);
  await f.dialogue.submit('hint'); assert.deepEqual(f.lifelines, ['fifty', 'hint']);
  assert.equal(f.answers.length, 0); await f.dialogue.submit('skip');
  assert.deepEqual(f.lifelines, ['fifty', 'hint', 'skip']); assert.equal(f.answers.length, 0);
  assert.equal(f.nexts.length, 0); assert.ok(allSpeech(f).includes(EXPLANATION));
  assert.match(allSpeech(f), /You skipped this question\. No answer was marked wrong/);
  assert.equal(allSpeech(f).includes('Your answer is incorrect'), false);
  assert.equal(f.dialogue.getState().phase, 'recall'); f.dialogue.dispose();
});

test('a paused manual session supports explicit choices without reopening the microphone', async () => {
  const f = harness(); await f.dialogue.start(); f.dialogue.pause(); await f.dialogue.choose(1);
  assert.equal(f.answers.length, 0); await f.dialogue.confirm();
  assert.equal(f.answers.length, 1); assert.equal(f.listened.length, 0); f.dialogue.dispose();
});

test('automatic listening moves through choice and yes while leaving next explicit', async () => {
  const f = harness({autoListen: true}), started = f.dialogue.start(); await pump();
  assert.equal(f.listened.length, 1); await f.hear('option B');
  assert.equal(f.answers.length, 0); assert.equal(f.listened.length, 2);
  await f.hear('yes'); assert.equal(f.answers.length, 1); assert.equal(f.nexts.length, 0);
  f.dialogue.pause(); await started; assert.equal(f.dialogue.getState().running, false); f.dialogue.dispose();
});

test('a single silence retry is bounded, then listening stops with manual controls available', async () => {
  const f = harness({autoListen: true}), started = f.dialogue.start(); await pump();
  await f.rejectListening('silence'); assert.equal(f.listened.length, 2);
  assert.match(allSpeech(f), /did not catch/i); await f.rejectListening('silence');
  assert.equal(f.listened.length, 2); assert.equal(f.dialogue.getState().running, false);
  assert.equal(f.answers.length, 0); assert.equal(f.nexts.length, 0); await started; f.dialogue.dispose();
});

test('permission denial or unavailable recognition stops without automatic retry or grading', async () => {
  for (const code of ['permission', 'unavailable']) {
    const f = harness({autoListen: true}), started = f.dialogue.start(); await pump();
    await f.rejectListening(code); assert.equal(f.listened.length, 1); assert.equal(f.answers.length, 0);
    assert.equal(f.dialogue.getState().running, false); assert.ok(f.dialogue.getState().error);
    await started; f.dialogue.dispose();
  }
});

test('pause cancels pending speech and does not open recognition after a late speech result', async () => {
  const f = harness({autoListen: true, manualSpeech: true, ignoreStop: true}), started = f.dialogue.start();
  await pump(); const speech = f.speech(); assert.ok(speech);
  f.dialogue.pause(); speech.resolve(true); await pump(); await started;
  assert.equal(f.listened.length, 0); assert.equal(f.answers.length, 0); assert.equal(f.dialogue.getState().running, false);
  assert.equal(f.dialogue.getState().candidate, null); f.dialogue.dispose();
});

test('speech completion from a different round or question cannot start another listening turn', async () => {
  const f = harness({autoListen: true, manualSpeech: true, ignoreStop: true}), started = f.dialogue.start();
  await pump(); const speech = f.speech(); f.updateContext({roundId: 'round-b', q: question('other-label')});
  speech.resolve(true); await pump(); await started;
  assert.equal(f.listened.length, 0); assert.equal(f.answers.length, 0); f.dialogue.dispose();
});

test('late recognition results and partials from an old context cannot become a new candidate', async () => {
  const f = harness({autoListen: true, ignoreStop: true}), started = f.dialogue.start(); await pump();
  const recognition = f.listening(); assert.ok(recognition);
  f.updateContext({index: 1, q: question('new-label')});
  recognition.options.onPartial?.('option B');
  assert.equal(f.dialogue.getState().transcript, '');
  recognition.resolve('option B'); await pump(); await started;
  assert.equal(f.dialogue.getState().candidate, null); assert.equal(f.answers.length, 0); f.dialogue.dispose();
});

test('a pending confirmation cannot grade a changed question or account round', async () => {
  for (const change of [{index: 1, q: question('next-label')}, {roundId: 'other-account-round', q: question('other-label')}]) {
    const f = harness(); await f.dialogue.start(); await f.dialogue.choose(1);
    f.updateContext(change); await f.dialogue.confirm();
    assert.equal(f.answers.length, 0); assert.equal(f.dialogue.getState().candidate, null); f.dialogue.dispose();
  }
});

test('dispose cancels active recognition and late input cannot submit or restart speech', async () => {
  const f = harness({autoListen: true, ignoreStop: true}), started = f.dialogue.start(); await pump();
  const recognition = f.listening(), spokenBefore = f.spoken.length;
  f.dialogue.dispose(); recognition.resolve('option B'); await pump(); await started;
  assert.equal(f.answers.length, 0); assert.equal(f.spoken.length, spokenBefore); assert.ok(f.stops() > 0);
});

test('an interrupted feedback reading cannot replace a newly requested choice explanation with recall', async () => {
  const q = question(), f = harness({manualSpeech: true, context: {phase: 'feedback',
    lastResponse: {id: q.id, choice: 0, correct: false, skipped: false}}});
  const started = f.dialogue.start(); await pump();
  assert.ok(f.speech()?.text.includes(EXPLANATION));
  const requested = f.dialogue.readOptions(); await pump();
  assert.ok(f.speech()?.text.includes(OPTION_NOTES[0]), 'The latest learner request must keep control of the audio turn');
  assert.equal(allSpeech(f).includes('What comparison helped'), false, 'Interrupted feedback must not auto-start a memory check');
  f.dialogue.pause(); await Promise.all([started, requested]); f.dialogue.dispose();
});

test('disposing is final: retained callbacks cannot restart speech or grade another choice', async () => {
  const f = harness(); await f.dialogue.start(); f.dialogue.dispose();
  const spokenBefore = f.spoken.length, listenedBefore = f.listened.length;
  await f.dialogue.start(); await f.dialogue.choose(1); await f.dialogue.confirm(); await f.dialogue.submit('next');
  assert.equal(f.spoken.length, spokenBefore); assert.equal(f.listened.length, listenedBefore);
  assert.equal(f.answers.length, 0); assert.equal(f.nexts.length, 0);
});

test('external cancellation of the current spoken turn pauses instead of opening the microphone', async () => {
  const f = harness({autoListen: true, manualSpeech: true}), started = f.dialogue.start();
  await pump(); await f.endSpeech(false); await started;
  assert.equal(f.dialogue.getState().running, false);
  assert.equal(f.dialogue.getState().status, 'paused');
  assert.equal(f.listened.length, 0); assert.equal(f.answers.length, 0); f.dialogue.dispose();
});

test('external cancellation of current recognition clears the listening state and waits for the user', async () => {
  const f = harness({autoListen: true}), started = f.dialogue.start(); await pump();
  await f.rejectListening('cancelled'); await started;
  assert.equal(f.dialogue.getState().running, false);
  assert.equal(f.dialogue.getState().status, 'paused');
  assert.equal(f.listened.length, 1); assert.equal(f.answers.length, 0); f.dialogue.dispose();
});

test('cancelling an older speech generation does not pause a newly requested reading', async () => {
  const f = harness({autoListen: true, manualSpeech: true}), started = f.dialogue.start(); await pump();
  const repeated = f.dialogue.repeat(); await pump();
  assert.equal(f.dialogue.getState().running, true);
  await f.endSpeech(true); assert.equal(f.listened.length, 1);
  assert.equal(f.dialogue.getState().running, true);
  f.dialogue.pause(); await Promise.all([started, repeated]); f.dialogue.dispose();
});

test('natural final-answer confirmation reads plain wording and source caveats after grading', async () => {
  const plain = 'PLAIN_WORDS_FOR_THE_CONFIRMED_QUESTION', sourceNote = 'SOURCE_CAVEAT_AFTER_LEARNING';
  const q = question(); q.teaching = {...q.teaching, questionInPlainEnglish: plain, sourceNote};
  const f = harness({context: {q}}); await f.dialogue.start();
  assert.equal(allSpeech(f).includes(sourceNote), false);
  await f.dialogue.submit('option B'); assert.equal(f.answers.length, 0);
  await f.dialogue.submit("Yes, that's my final answer, please.");
  assert.equal(f.answers.length, 1); assert.ok(allSpeech(f).includes(plain));
  assert.ok(allSpeech(f).includes(sourceNote)); assert.equal(f.nexts.length, 0); f.dialogue.dispose();
});

test('Practice reads every long question, case and option chunk before opening the microphone', async () => {
  const q=question('long-practice',{question:'Long question detail. '.repeat(1800)+'QUESTION_TAIL',
    context:'Shared case observations. '.repeat(1400)+'CASE_TAIL',
    options:['First option details. '.repeat(1300)+'OPTION_TAIL','Second option']});
  const f=harness({autoListen:true,manualSpeech:true,context:{mode:'practice',q}});
  const started=f.dialogue.start();await pump();
  let completed=0;
  while(f.speech()){
    assert.equal(f.listened.length,0,'No listening turn may interrupt the reading');
    assert.ok(f.speech().text.length<=2400);assert.ok(++completed<100);
    await f.endSpeech();
  }
  assert.ok(completed>2);assert.equal(f.listened.length,1);
  const full=f.spoken.map(part=>part.text).join('');
  assert.ok(full.includes(q.question));assert.ok(full.includes(q.context));
  assert.ok(full.includes(q.options[0]));assert.ok(full.includes('Option B. Second option.'));
  assert.doesNotMatch(full,/skip|lifeline/);noTeachingLeak(f);
  f.dialogue.pause();await started;f.dialogue.dispose();
});

test('Practice long explanations retain the ending and ask teach-back only after all feedback',async()=>{
  const q=question('long-feedback',{explanation:'Printed source rationale. '.repeat(1100)+'SOURCE_TAIL'});
  q.teaching={...q.teaching,explanation:'A complete simpler explanation. '.repeat(1200)+'PLAIN_TAIL'};
  const f=harness({context:{mode:'practice',q}});await f.dialogue.start();await f.dialogue.choose(0);const from=f.spoken.length;await f.dialogue.confirm();
  const spoken=f.spoken.slice(from);assert.ok(spoken.length>4);assert.ok(spoken.every(part=>part.text.length<=2400));
  const full=spoken.map(part=>part.text).join('');assert.ok(full.includes(q.explanation));assert.ok(full.includes(q.teaching.explanation));
  assert.ok(full.indexOf('PLAIN_TAIL')<full.indexOf('Now explain back'));assert.equal(f.dialogue.getState().phase,'recall');
  assert.equal(f.answers.length,1);assert.equal(f.nexts.length,0);f.dialogue.dispose();
});

test('pausing a later Practice speech chunk prevents all remaining chunks and recognition',async()=>{
  const f=harness({autoListen:true,manualSpeech:true,ignoreStop:true,context:{mode:'practice',q:question('long',{question:'Case details. '.repeat(3000)+'END_OF_CASE'})}});
  const started=f.dialogue.start();await pump();await f.endSpeech();const pending=f.speech();assert.ok(pending);assert.equal(f.spoken.length,2);
  f.dialogue.pause();pending.resolve(true);await pump();await started;
  assert.equal(f.spoken.length,2);assert.equal(f.listened.length,0);assert.equal(f.answers.length,0);assert.equal(f.dialogue.getState().running,false);f.dialogue.dispose();
});

test('changed Practice context during a long reading cannot read its remaining source or listen',async()=>{
  const f=harness({autoListen:true,manualSpeech:true,ignoreStop:true,context:{mode:'practice',q:question('long',{question:'Case details. '.repeat(3000)+'STALE_CASE_END'})}});
  const started=f.dialogue.start();await pump();const pending=f.speech();f.updateContext({q:question('replacement-at-same-index')});pending.resolve(true);await pump();await started;
  assert.equal(f.spoken.length,1);assert.equal(f.listened.length,0);assert.equal(f.answers.length,0);assert.equal(allSpeech(f).includes('STALE_CASE_END'),false);f.dialogue.dispose();
});

test('a Practice candidate cannot grade a replacement question at the same session index',async()=>{
  const f=harness({context:{mode:'practice'}});await f.dialogue.start();await f.dialogue.choose(1);
  f.updateContext({q:question('same-index-replacement')});await f.dialogue.confirm();
  assert.equal(f.answers.length,0);assert.equal(f.dialogue.getState().candidate,null);f.dialogue.dispose();
});

test('Practice does not promise game lifelines or permit skipping an unanswered question',async()=>{
  const f=harness({context:{mode:'practice'}});await f.dialogue.start();
  await f.dialogue.submit('next');await f.dialogue.submit('skip');await f.dialogue.submit('fifty fifty');
  assert.equal(f.lifelines.length,0);assert.equal(f.answers.length,0);assert.equal(f.nexts.length,0);noTeachingLeak(f);
  assert.doesNotMatch(allSpeech(f),/skip lifeline|three hearts|fifty fifty/);
  await f.dialogue.submit('hint');assert.deepEqual(f.lifelines,['hint']);assert.match(allSpeech(f),/Here is the question in plain words/);f.dialogue.dispose();
});

test('finishing Practice speaks a completion line once and ignores stale last-question actions',async()=>{
  for(const returnsNull of [false,true]){
    const f=harness({completeWithNull:returnsNull,context:{mode:'practice',terminal:true}});await f.dialogue.start();await f.dialogue.choose(1);await f.dialogue.confirm();
    await f.dialogue.next();const count=f.spoken.length;assert.match(f.spoken.at(-1).text,/Your practice session is complete/);
    assert.equal(f.dialogue.getState().running,false);assert.equal(f.dialogue.getState().phase,'complete');
    await f.dialogue.repeat();await f.dialogue.listen();await f.dialogue.choose(0);await f.dialogue.confirm();await f.dialogue.feedback();await f.dialogue.askRecall();await f.dialogue.revealRecall();await f.dialogue.readOptions();await f.dialogue.readRationale();await f.dialogue.submit('option A');await f.dialogue.next();
    assert.equal(f.spoken.length,count);assert.equal(f.listened.length,0);assert.equal(f.answers.length,1);assert.equal(f.nexts.length,1);f.dialogue.dispose();
  }
});
