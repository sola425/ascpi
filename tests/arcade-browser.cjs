// Integration checks against the authorized loopback server. All question and
// teaching fixtures below are original generic labels, with no source PDF reads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const appURL = process.env.APP_URL || 'http://127.0.0.1:3000';
assert.equal(new URL(appURL).origin, 'http://127.0.0.1:3000', 'Use the authorized loopback test server.');
const artifactDir = '/tmp/labwise-arcade-v6';
const NOW = Date.parse('2026-11-07T12:00:00Z');
const SECOND = 1000, MINUTE = 60000;
const TOPICS = ['Arcade numbers', 'Arcade patterns', 'Arcade tiny'];
const fixtures = TOPICS.flatMap((topic, group) => Array.from({length: group === 2 ? 2 : 12}, (_, index) => {
  const id = `arcade-fixture-${group}-${index}`;
  const bookId = group < 2 && index >= 6 ? 'boc7' : 'success4', documentId = bookId === 'boc7' ? 'boc1' : 'textbook';
  return {id, topic, bookId, documentId, answerDocumentId: documentId, page: 1, answerPage: 1,
    question: `Which choice matches label ${group}-${index}?`, options: ['First label', 'Second label', 'Third label'], answer: 1,
    source: 'Original browser-test label fixture', explanation: `The second choice matches label ${group}-${index}.`,
    teaching: {questionInPlainEnglish: 'Choose the matching label.', explanation: 'Read the stated label and compare the three choices.',
      optionExplanations: ['The first label differs from the stated label.', 'The second label matches the stated label.', 'The third label differs from the stated label.'],
      memory: 'Read the label, then compare the choices.', quickCheck: {question: 'Which choice matches the stated label?', answer: 'The second label.'}}};
}));
const byId = new Map(fixtures.map(q => [q.id, q]));
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('labwise-state')));
const frenzy = async page => (await stored(page)).frenzy;
const action = async (page, name) => {
  const inDialog = page.locator(`#modal[open] [data-action="${name}"]:visible`);
  await (await inDialog.count() ? inDialog.first() : page.locator(`[data-action="${name}"]:visible`).first()).click();
};
const nav = (page, name) => page.locator(`[data-view="${name}"]:visible`).first().click();

function speechMock() {
  delete window.webkitSpeechRecognition;
  window.__arcadeSpeech = [];
  window.__arcadeSpeechStarts = 0;
  window.SpeechRecognition = class {
    constructor() { window.__arcadeSpeech.push(this); }
    start() { window.__arcadeSpeechStarts++; }
    stop() {}
    abort() {}
  };
}
async function ready(page, checked) {
  await page.waitForFunction(() => {
    const heading = document.querySelector('#content h1');
    return heading && !/Opening your study space|could not load/i.test(heading.textContent);
  }, undefined, {timeout: 20000});
  const skip = page.locator('#modal[open] [data-action="tour-skip"]');
  // First-use presentation can be scheduled just after the first app render.
  await skip.waitFor({state: 'visible', timeout: 1200}).catch(() => {});
  if (await skip.isVisible()) {
    assert.equal(await page.evaluate(() => window.__arcadeSpeechStarts), 0, 'The first-use tour must not open the microphone.');
    await skip.click();
    await page.locator('#modal').waitFor({state: 'hidden'});
    checked('first-use tour dismissed without microphone or account requests');
  }
}
async function importFixtures(page) {
  await page.locator('#bank-input').setInputFiles({name: 'arcade-original-labels.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({questions: fixtures}))});
  await page.getByRole('heading', {name: 'Use this collection?', exact: true}).waitFor();
  await action(page, 'confirm-import');
  await page.locator('#modal').waitFor({state: 'hidden'});
}
async function openSetup(page) {
  await nav(page, 'play');
  const candidates = page.locator('[data-action="frenzy-start"]:visible,[data-action="mode-frenzy"]:visible,[data-action="arcade-frenzy"]:visible,button[data-mode="frenzy"]:visible,[data-action="frenzy-restart"]:visible');
  if (await candidates.count()) await candidates.first().click();
  else await page.getByRole('button', {name: /Frenzy/i}).first().click();
  await page.locator('#modal[open] input[name="arcade-topic"]').first().waitFor();
}
async function resume(page) {
  if (await page.locator('.arcade-frenzy:visible').count()) return;
  await nav(page, 'play');
  const candidates = page.locator('[data-action="frenzy-resume"]:visible,[data-action="frenzy-continue"]:visible');
  if (await candidates.count()) await candidates.first().click();
  else await page.getByRole('button', {name: /(?:Resume|Continue).*Frenzy|Frenzy.*(?:Resume|Continue)/i}).first().click();
  await page.locator('.arcade-frenzy').waitFor();
}
async function choose(page, names, limit = '10') {
  await action(page, 'topic-clear');
  for (const name of names) await page.locator(`input[name="arcade-topic"][value="${name}"]`).check();
  await page.locator('#arcade-limit').selectOption(limit);
  assert.equal(await page.locator('[data-action="mode-confirm"]').isDisabled(), false);
  await action(page, 'mode-confirm');
  await page.locator('[data-arcade-answer]').first().waitFor();
}
async function visibleTargets(page, tag, checked) {
  const result = await page.evaluate(() => {
    const selector = '.arcade button,.arcade input,.arcade select,.arcade textarea,.arcade summary,.arcade a[href]';
    const small = [...document.querySelectorAll(selector)].flatMap(element => {
      let box = element.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') return [];
      if (element.matches('input[type="checkbox"],input[type="radio"]') && element.closest('label')) box = element.closest('label').getBoundingClientRect();
      return box.width < 43.9 || box.height < 43.9 ? [{tag: element.tagName, action: element.dataset.action || '', text: element.textContent.trim().slice(0, 60), width: box.width, height: box.height}] : [];
    });
    const dialog = document.querySelector('#modal[open]');
    return {overflow: document.documentElement.scrollWidth - innerWidth, dialogOverflow: dialog ? dialog.scrollWidth - dialog.clientWidth : 0, small,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      timerAnimation: document.querySelector('.arcade-timer-bar') ? getComputedStyle(document.querySelector('.arcade-timer-bar')).animationName : 'none'};
  });
  checked(tag, result);
  assert.ok(result.overflow <= 1, `${tag}: no horizontal page overflow.`);
  assert.ok(result.dialogOverflow <= 1, `${tag}: no horizontal dialog overflow.`);
  assert.deepEqual(result.small, [], `${tag}: every interactive target has a 44 px target or enclosing label.`);
  assert.equal(result.reducedMotion, true);
  assert.equal(result.timerAnimation, 'none');
}
async function reachable(page, selector, tag, checked) {
  const element = page.locator(selector).first();
  await element.evaluate(e => e.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}));
  const result = await element.evaluate(e => {
    const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
    return {width: r.width, height: r.height, hit: !!hit && (hit === e || e.contains(hit)), x, y, viewportHeight: innerHeight};
  });
  checked(tag, result);
  assert.ok(result.hit && result.y >= 0 && result.y < result.viewportHeight, `${tag}: visible control center is not covered by fixed controls.`);
  assert.ok(result.width >= 44 && result.height >= 44, `${tag}: 44 px touch target.`);
}
async function tabsAndRecall(page, state, checked) {
  const active = state.active, q = byId.get(active.responses.at(-1).id);
  await page.locator('.lesson').waitFor();
  await page.locator('.arcade-question-again summary').click();
  assert.ok((await page.locator('.arcade-question-again').innerText()).includes(q.teaching.questionInPlainEnglish), 'The final question retains its plain-language help.');
  await page.locator('.arcade-question-again summary').click();
  await page.getByRole('tab', {name: 'Every choice', exact: true}).click();
  assert.equal(await page.locator('.option-lesson:visible').count(), q.options.length);
  assert.deepEqual(await page.locator('.option-lesson:visible p').allTextContents(), q.teaching.optionExplanations);
  await page.getByRole('tab', {name: 'Book rationale', exact: true}).click();
  assert.equal(await page.locator('.original-rationale').innerText(), q.explanation);
  await page.getByRole('tab', {name: 'Understand', exact: true}).click();
  assert.equal(await page.locator('.memory-hook p').innerText(), q.teaching.memory);
  await page.locator('.recall-check details summary').click();
  assert.equal(await page.locator('.recall-check details p').innerText(), q.teaching.quickCheck.answer);
  const voice = page.locator('.recall-check [data-action="voice-start"]');
  assert.equal(await voice.isEnabled(), true, 'The retained final explanation keeps its optional voice control.');
  await reachable(page, '.recall-check [data-action="voice-start"]', 'final recall voice is clear of fixed controls', checked);
  await voice.click();
  if (await page.locator('#modal[open] [data-action="voice-consent"]').isVisible()) await action(page, 'voice-consent');
  await page.locator('[data-action="voice-cancel"]').waitFor();
  await action(page, 'voice-cancel');
  assert.equal((await frenzy(page)).active.hearts, active.hearts);
  assert.equal((await frenzy(page)).active.score, active.score);
  checked('final explanation retains every option, original rationale, memory check and optional voice after hearts reach zero');
}

async function run() {
  fs.mkdirSync(artifactDir, {recursive: true});
  const report = {startedAt: new Date().toISOString(), environment: 'Headless Chromium; simulated touch viewports, reduced motion, fake wall clock and mocked speech constructor; no audio or real account requests.', checks: [], scenarios: [], screenshots: [], errors: []};
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const scenario = async (name, viewport, fn) => {
    const context = await browser.newContext({viewport, isMobile: viewport.width < 720, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce'});
    const page = await context.newPage(), pageErrors = [], external = [];
    const checked = (check, details = {}) => report.checks.push({scenario: name, check, ...details});
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.addInitScript(speechMock);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(appURL).origin) {
        external.push({method: route.request().method(), origin: url.origin, path: url.pathname});
        await route.abort();
      } else await route.continue();
    });
    try {
      await page.clock.install({time: new Date(NOW - 2 * MINUTE)});
      await page.goto(appURL);
      await ready(page, checked);
      await importFixtures(page);
      await page.clock.pauseAt(new Date(NOW));
      assert.equal(await page.evaluate(() => window.__arcadeSpeechStarts), 0, 'Solo setup must not open the microphone.');
      await fn(page, checked);
      assert.deepEqual(pageErrors, [], 'No uncaught application errors.');
      assert.deepEqual(external, [], 'Solo play must not request authentication or other external services.');
      report.scenarios.push({name, viewport, status: 'passed'});
    } catch (error) {
      const screenshot = path.join(artifactDir, `${name}-failure.png`);
      await page.screenshot({path: screenshot, fullPage: true}).catch(() => {});
      report.screenshots.push(screenshot);
      report.scenarios.push({name, viewport, status: 'failed', error: error.stack, pageErrors, external});
      report.errors.push({scenario: name, message: error.message});
    } finally { await context.close(); }
  };
  try {
    await scenario('mobile-deadline-background-and-final-rationale', {width: 320, height: 568}, async (page, checked) => {
      await openSetup(page);
      await action(page, 'topic-clear');
      assert.equal(await page.locator('[data-action="mode-confirm"]').isDisabled(), true);
      assert.equal(await page.locator('input[name="arcade-topic"]:checked').count(), 0);
      await action(page, 'topic-all');
      assert.equal(await page.locator('input[name="arcade-topic"]:checked').count(), 3);
      assert.match(await page.locator('#topic-count').innerText(), /26/);
      await visibleTargets(page, 'multi-subject setup on 320 px', checked);
      await choose(page, TOPICS.slice(0, 2));
      const initial = await frenzy(page), runId = initial.active.id;
      assert.deepEqual(initial.active.topics, TOPICS.slice(0, 2));
      assert.equal(initial.active.queue.length, 10);
      assert.ok(initial.active.queue.every(entry => TOPICS.slice(0, 2).includes(byId.get(entry.id).topic)));
      assert.equal(initial.active.deadlineAt - initial.active.questionStartedAt, 30000);
      assert.equal(initial.active.hearts, 3);
      assert.equal(await page.locator('.arcade-question .plain-question p').innerText(), byId.get(initial.active.queue[0].id).teaching.questionInPlainEnglish);
      await visibleTargets(page, 'active Frenzy on 320 px', checked);
      await page.clock.runFor(29999);
      assert.equal((await frenzy(page)).active.phase, 'question');
      assert.equal((await frenzy(page)).active.hearts, 3);
      await page.clock.runFor(1);
      await page.locator('[data-action="frenzy-next"]').waitFor();
      const first = await frenzy(page);
      assert.equal(first.active.phase, 'feedback'); assert.equal(first.active.hearts, 2);
      assert.equal(first.active.responses.length, 1); assert.equal(first.active.responses[0].timedOut, true);
      assert.equal(await page.locator('.arcade-clock,.arcade-timer-bar').count(), 0);
      await page.clock.fastForward(20 * MINUTE);
      assert.deepEqual(await frenzy(page), first, 'Feedback never advances or consumes another heart.');
      await page.reload(); await ready(page, checked); await resume(page);
      assert.deepEqual(await frenzy(page), first, 'Reload preserves the exact feedback and deadline.');
      assert.equal(await page.locator('[data-action="tour-skip"]').count(), 0, 'A dismissed first-use tour must stay dismissed.');
      await action(page, 'frenzy-next');
      const second = await frenzy(page);
      assert.equal(second.active.deadlineAt - second.active.questionStartedAt, 30000);
      assert.equal(second.active.hearts, 2); assert.equal(second.active.index, 1);
      await action(page, 'frenzy-leave');
      assert.equal((await frenzy(page)).active.deadlineAt, second.active.deadlineAt, 'Leaving does not pause or extend the question deadline.');
      await page.clock.fastForward(10 * MINUTE);
      await page.reload(); await ready(page, checked); await resume(page);
      const returned = await frenzy(page);
      assert.equal(returned.active.phase, 'feedback'); assert.equal(returned.active.hearts, 1);
      assert.equal(returned.active.responses.length, 2, 'Long background time expires exactly one question.');
      await action(page, 'frenzy-next');
      await page.locator('[data-arcade-answer="0"]').click();
      await page.locator('.arcade-results').waitFor();
      const complete = await frenzy(page);
      assert.equal(complete.active.phase, 'complete'); assert.equal(complete.active.hearts, 0);
      assert.equal(complete.active.reason, 'hearts'); assert.equal(complete.active.responses.length, 3);
      assert.equal(complete.completed[runId].answered, 3); assert.equal(complete.completed[runId].score, 0);
      assert.equal(Object.keys(complete.completed).length, 1);
      assert.equal(await page.locator('[data-action="frenzy-next"]').count(), 0);
      await tabsAndRecall(page, complete, checked);
      await visibleTargets(page, 'final rationale and recall on 320 px', checked);
      await reachable(page, '[data-action="arcade-review"]', 'review action remains reachable', checked);
      const screenshot = path.join(artifactDir, '320-final-rationale.png');
      await page.screenshot({path: screenshot, fullPage: true}); report.screenshots.push(screenshot);
      await page.reload(); await ready(page, checked); await resume(page);
      assert.deepEqual((await frenzy(page)).completed, complete.completed, 'Completed history persists through reload without duplicate summaries.');
      checked('exact deadline, untimed feedback, one bulk-background penalty, reload persistence, multi-subject scope and three-heart completion');
    });

    await scenario('compact-landscape-dark-and-reduced-motion', {width: 568, height: 320}, async (page, checked) => {
      await action(page, 'settings');
      await page.locator('#font-size').selectOption('1.3');
      if (await page.locator('html').getAttribute('data-theme') !== 'dark') await action(page, 'theme');
      await action(page, 'close-dialog');
      await openSetup(page); await choose(page, TOPICS.slice(0, 2));
      await visibleTargets(page, 'landscape dark active with large text', checked);
      await reachable(page, '[data-arcade-answer="0"]', 'landscape answer remains reachable', checked);
      await page.clock.fastForward(30000);
      await page.locator('[data-action="frenzy-next"]').waitFor();
      await page.locator('.recall-check details summary').click();
      await visibleTargets(page, 'landscape feedback with recall open', checked);
      await reachable(page, '[data-action="frenzy-next"]', 'Next does not obscure recall in landscape', checked);
      const before = await frenzy(page); await page.clock.fastForward(30 * MINUTE);
      assert.deepEqual(await frenzy(page), before);
      const screenshot = path.join(artifactDir, '568-dark-feedback.png');
      await page.screenshot({path: screenshot, fullPage: true}); report.screenshots.push(screenshot);
    });

    await scenario('tablet-partial-topic-and-confirmed-voice-answer', {width: 768, height: 1024}, async (page, checked) => {
      await openSetup(page); await choose(page, [TOPICS[2]]);
      assert.equal((await frenzy(page)).active.queue.length, 2, 'A partial eligible topic uses available questions without repeats.');
      await visibleTargets(page, 'tablet question and voice controls', checked);
      await action(page, 'voice-start');
      if (await page.locator('#modal[open] [data-action="voice-consent"]').isVisible()) await action(page, 'voice-consent');
      await page.locator('[data-action="voice-cancel"]').waitFor();
      await page.evaluate(() => {
        const result = [{transcript: 'option B', confidence: 1}]; result.isFinal = true;
        window.__arcadeSpeech.at(-1).onresult({results: [result]});
      });
      await page.locator('[data-action="voice-confirm"]').waitFor();
      assert.equal((await frenzy(page)).active.responses.length, 0, 'Speech never auto-submits a choice.');
      await action(page, 'voice-confirm');
      assert.equal((await frenzy(page)).active.score, 100); assert.equal((await frenzy(page)).active.hearts, 3);
      await action(page, 'frenzy-next'); await page.locator('[data-arcade-answer="1"]').click();
      const complete = await frenzy(page);
      assert.equal(complete.active.phase, 'complete'); assert.equal(complete.active.reason, 'finished');
      assert.equal(complete.active.hearts, 3); assert.equal(complete.active.score, 200);
      assert.equal(complete.active.responses.length, 2);
      await tabsAndRecall(page, complete, checked);
      await visibleTargets(page, 'tablet completed round', checked);
      checked('partial-topic queue completion with hearts remaining and exactly 100 points per correct answer');
    });

    await scenario('selected-book-constrains-the-full-frenzy-queue', {width: 390, height: 844}, async (page, checked) => {
      const uuid = '00000000-0000-4000-8000-000000000099', seed = 0.375;
      const {blankFrenzy, startFrenzy} = await import('../frenzy.js');
      // This fixed UUID/seed proves that the same full-bank start would select
      // questions from the other book, so the source regression cannot pass by
      // a lucky random queue. Both books have the same selected topic names.
      const unscoped = startFrenzy(blankFrenzy(), fixtures, {topics: TOPICS.slice(0, 2), limit: 10, now: NOW, seed, runId: `frenzy-${uuid}`});
      assert.ok(unscoped.active.queue.some(entry => byId.get(entry.id).bookId !== 'boc7'), 'Fixture must reject the old unscoped start.');
      await nav(page, 'play');
      await page.locator('[data-book="boc7"]:visible').click();
      assert.equal(await page.locator('[data-book="boc7"]:visible').getAttribute('aria-pressed'), 'true');
      await openSetup(page);
      await page.evaluate(({uuid, seed}) => {
        Object.defineProperty(globalThis.crypto, 'randomUUID', {configurable: true, value: () => uuid});
        Math.random = () => seed;
      }, {uuid, seed});
      await action(page, 'topic-clear');
      for (const topic of TOPICS.slice(0, 2)) await page.locator(`input[name="arcade-topic"][value="${topic}"]`).check();
      assert.match(await page.locator('#topic-count').innerText(), /^12\b/, 'Picker count must reflect the selected book.');
      await page.locator('#arcade-limit').selectOption('10');
      await action(page, 'mode-confirm');
      await page.locator('[data-arcade-answer]').first().waitFor();
      const active = (await frenzy(page)).active;
      assert.equal(active.id, `frenzy-${uuid}`);
      assert.equal(active.queue.length, 10, 'Fill the selected ten-question limit, rather than relying on a tiny bank.');
      assert.equal(new Set(active.queue.map(entry => entry.id)).size, 10);
      assert.ok(active.queue.every(entry => byId.get(entry.id).bookId === 'boc7'), 'Every queued ID must belong to the book selected in the source pills.');
      assert.ok(active.queue.every(entry => TOPICS.slice(0, 2).includes(byId.get(entry.id).topic)));
      await visibleTargets(page, 'book-scoped Frenzy with plain-language help', checked);
      checked('book-filtered picker and actual ten-question queue use the same scope with identical topic names in both books');
    });

    await scenario('background-frenzy-timeout-preserves-practice-voice-draft', {width: 390, height: 844}, async (page, checked) => {
      await openSetup(page); await choose(page, TOPICS.slice(0, 2));
      const original = (await frenzy(page)).active;
      await action(page, 'frenzy-leave');
      await nav(page, 'practice');
      await page.locator('[data-question="arcade-fixture-0-0"]').click();
      await page.locator('[data-answer]').first().waitFor();
      await action(page, 'voice-type');
      const draft = 'Option B';
      await page.locator('#spoken-answer').fill(draft);
      assert.equal(await page.locator('#spoken-answer').inputValue(), draft);
      assert.equal(await page.locator('[data-action="voice-confirm"]').isEnabled(), true);
      await page.clock.fastForward(MINUTE);
      const expired = (await frenzy(page)).active;
      assert.equal(expired.id, original.id); assert.equal(expired.deadlineAt, original.deadlineAt);
      assert.equal(expired.phase, 'feedback'); assert.equal(expired.hearts, 2);
      assert.equal(expired.responses.length, 1); assert.equal(expired.responses[0].timedOut, true);
      assert.equal(await page.locator('#spoken-answer').inputValue(), draft, 'A background Frenzy timeout must leave the visible Practice draft untouched.');
      const practice = await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-session')));
      assert.equal(practice.selected, null, 'The background timeout must not submit the Practice choice.');
      // Reopening the existing editor refreshes its HTML from the draft model.
      // This catches an erased internal voiceDraft even if an old textarea was
      // left on screen by the timeout handler.
      await action(page, 'voice-type');
      assert.equal(await page.locator('#spoken-answer').inputValue(), draft, 'The Practice draft must also survive an editor refresh.');
      await action(page, 'voice-confirm');
      await page.locator('.answer-status').waitFor();
      assert.equal((await stored(page)).records['arcade-fixture-0-0'].correct, true, 'The unrelated Practice voice context stays valid for explicit confirmation.');
      await page.clock.fastForward(10 * MINUTE);
      const after = (await frenzy(page)).active;
      assert.equal(after.responses.length, 1); assert.equal(after.hearts, 2);
      assert.equal(after.phase, 'feedback');
      checked('background Frenzy expires once without clearing, submitting or invalidating an unrelated Practice voice draft');
    });
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({scenarios: report.scenarios.map(({name, status}) => ({name, status})), checks: report.checks.length, errors: report.errors, report: path.join(artifactDir, 'report.json')}, null, 2));
  assert.deepEqual(report.errors, [], 'Arcade integration checks must pass.');
}

module.exports = {fixtures, byId, action, nav, stored, frenzy, openSetup, resume, visibleTargets};
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
