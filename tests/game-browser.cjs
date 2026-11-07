// Local UI regression checks. No microphone or external speech provider is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const appURL = process.env.APP_URL || 'http://127.0.0.1:3000';
assert.equal(new URL(appURL).origin, 'http://127.0.0.1:3000', 'Use the authorized loopback test server.');
const artifactDir = '/tmp/labwise-game-v5';
const rawBank = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/study-bank.json'), 'utf8'));
const teaching = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/teaching.json'), 'utf8'));
const bundled = rawBank.map(q => ({...q, ...(teaching[q.id] ? {teaching: teaching[q.id]} : {})}));
const byId = new Map(bundled.map(q => [q.id, q]));
const action = async (page, name) => {
  const selector = `[data-action="${name}"]:visible`;
  const modalAction = page.locator(`#modal[open] ${selector}`);
  return (await modalAction.count() ? modalAction.first() : page.locator(selector).first()).click();
};
const nav = (page, name) => page.locator(`[data-view="${name}"]:visible`).first().click();
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('labwise-state')));
const session = page => page.evaluate(() => JSON.parse(localStorage.getItem('labwise-session')));
const currentQuestion = async page => {
  const state = await stored(page), active = state.game.active;
  return byId.get(active.queue[active.index].id);
};
async function importBank(page, questions) {
  await page.locator('#bank-input').setInputFiles({name: 'existing-math-items.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({questions}))});
  await page.getByRole('heading', {name: 'Use this collection?', exact: true}).waitFor();
  await action(page, 'confirm-import');
  await page.locator('#modal').waitFor({state: 'hidden'});
}
async function restore(page, state, confirm = true) {
  await page.locator('#progress-input').setInputFiles({name: 'game-progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))});
  await page.getByRole('heading', {name: 'Restore this progress?', exact: true}).waitFor();
  if (confirm) await action(page, 'confirm-restore');
}
async function startMath(page) {
  await nav(page, 'play');
  await page.locator('[data-game-topic="Laboratory mathematics"]').click();
  await page.locator('[data-game-answer="0"]').waitFor();
}
async function startStudy(page, kind) {
  await nav(page, 'home');
  await action(page, `setup-${kind}`);
  await page.locator('#setup-book').selectOption('success4');
  await page.locator('#setup-topic').selectOption('Laboratory mathematics');
  await page.locator('#setup-size').selectOption('5');
  await page.locator('#setup-shuffle').uncheck();
  await action(page, 'confirm-session');
  if (await page.locator('[data-action="start-new"]').isVisible()) await action(page, 'start-new');
  await page.locator('[data-answer="0"]').waitFor();
}
async function nativeToken(page) { return page.evaluate(() => window.__voiceRequests.at(-1)?.token); }
async function nativeResult(page, token, payload) {
  await page.evaluate(({token, payload}) => window.labwiseNativeVoiceResult(token, payload), {token, payload});
}
async function speak(page) {
  await action(page, 'voice-start');
  if (await page.locator('[data-action="voice-consent"]').isVisible()) await action(page, 'voice-consent');
  await page.locator('[data-action="voice-cancel"]').waitFor();
  return nativeToken(page);
}
const nativeMock = () => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  window.__voiceRequests = [];
  window.__voiceCancels = [];
  window.LabwiseAndroid = {
    startVoiceInput(token, language) { window.__voiceRequests.push({token, language}); },
    cancelVoiceInput(token) { window.__voiceCancels.push(token); },
    exportJSON(name, text) { window.__exportedBackup = {name, text}; }
  };
};
async function mathFixtures() {
  const {eligibleQuestions} = await import('../game.js');
  return eligibleQuestions(bundled, {topic: 'Laboratory mathematics'})
    .sort((a, b) => b.question.length + b.options.join('').length - a.question.length - a.options.join('').length)
    .slice(0, 5);
}

async function run() {
  fs.mkdirSync(artifactDir, {recursive: true});
  const report = {startedAt: new Date().toISOString(), environment: 'Headless Chromium; native speech bridge mocked; no audio captured.', scenarios: [], checks: [], screenshots: [], errors: []};
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const fixture = await mathFixtures();
  assert.equal(fixture.length, 5);
  const checked = (name, details = {}) => report.checks.push({name, ...details});
  const test = async (name, fn, options = {}) => {
    const context = await browser.newContext({viewport: {width: 1024, height: 900}, serviceWorkers: 'block', acceptDownloads: true});
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      if (options.native) await context.addInitScript(nativeMock);
      if (options.noProvider) await context.addInitScript(() => {delete window.SpeechRecognition; delete window.webkitSpeechRecognition;});
      if (options.seed) await context.addInitScript(state => {
        if (!localStorage.getItem('labwise-state')) localStorage.setItem('labwise-state', JSON.stringify(state));
      }, options.seed);
      if (options.clock) await page.clock.install();
      await page.goto(appURL);
      await page.getByRole('heading', {name: 'Make room for a little discovery.', exact: true}).waitFor();
      await fn(page, context);
      assert.deepEqual(pageErrors, [], 'No uncaught application errors.');
      report.scenarios.push({name, status: 'passed'});
    } catch (error) {
      const screenshot = path.join(artifactDir, `${name.replace(/[^a-z0-9]+/gi, '-')}-failure.png`);
      await page.screenshot({path: screenshot, fullPage: true}).catch(() => {});
      report.screenshots.push(screenshot);
      report.scenarios.push({name, status: 'failed', error: error.stack, pageErrors});
      report.errors.push({scenario: name, message: error.message});
    } finally { await context.close(); }
  };
  try {
    await test('Play navigation, source scope and interrupted replacement', async page => {
      assert.equal(await page.locator('.sidebar nav button:visible').count(), 7);
      await page.getByRole('button', {name: 'Play learning games', exact: true}).click();
      await page.getByRole('heading', {name: 'Your lab adventure.', exact: true}).waitFor();
      assert.equal(await page.locator('.quest').count(), 3);
      await page.locator('[data-book="success4"]').click();
      await page.locator('[data-game-topic="Laboratory mathematics"]').click();
      let state = await stored(page), original = state.game.active;
      assert.equal(original.queue.length, 5);
      for (const item of original.queue) {
        const q = byId.get(item.id);
        assert.equal(q.topic, 'Laboratory mathematics');
        assert.equal(q.bookId, 'success4');
        assert.ok(!q.needsSource && !q.context && !q.sharedContext);
      }
      await action(page, 'game-pause');
      await page.reload();
      await action(page, 'game-resume');
      assert.deepEqual((await stored(page)).game.active, original, 'An unanswered interrupted round must keep its queue and position.');
      await page.locator(`[data-game-answer="${(await currentQuestion(page)).answer}"]`).click();
      const feedback = (await stored(page)).game.active;
      await action(page, 'game-pause');
      await page.reload();
      await action(page, 'game-resume');
      assert.deepEqual((await stored(page)).game.active, feedback);
      assert.equal(await page.locator('[data-action="game-next"]').count(), 1);
      await action(page, 'game-pause');
      await page.locator('[data-book="boc7"]').click();
      await page.locator('[data-game-topic="Lab essentials"]').click();
      await page.getByRole('heading', {name: 'Keep your adventure?', exact: true}).waitFor();
      assert.deepEqual((await stored(page)).game.active, feedback, 'Preview must preserve the interrupted round.');
      await action(page, 'game-resume');
      assert.equal((await stored(page)).game.active.id, original.id);
      await action(page, 'game-pause');
      await page.locator('[data-game-topic="Lab essentials"]').click();
      await action(page, 'game-replace');
      state = await stored(page);
      assert.notEqual(state.game.active.id, original.id);
      assert.equal(state.game.active.index, 0);
      assert.equal(state.game.stats.attempted, 1, 'Replacing a round must preserve prior learning activity.');
      assert.ok(state.game.active.queue.every(item => byId.get(item.id).bookId === 'boc7' && byId.get(item.id).topic === 'Lab essentials'));
      checked('Play opens from header and desktop navigation; source and subject scopes constrain new rounds; interrupted feedback resumes and replacement preserves history');
    });

    const oldAt = Date.now() - 86400000;
    const oldRecords = Object.fromEntries(fixture.map(q => [q.id, {correct: false, at: oldAt, due: oldAt, stage: 0, reviews: 1, reviewedAt: oldAt}]));
    await test('Five questions, two recoveries, teaching and separate accuracy', async page => {
      await importBank(page, fixture);
      await nav(page, 'play');
      await page.locator('#game-clock-option').check();
      await action(page, 'game-start');
      await page.clock.fastForward(2500);
      assert.notEqual(await page.locator('.game-clock').innerText(), '0:00');
      const initialIds = (await stored(page)).game.active.queue.map(item => item.id);
      assert.equal(new Set(initialIds).size, 5);
      for (let index = 0; index < 7; index++) {
        let state = await stored(page), active = state.game.active;
        assert.equal(active.phase, 'question');
        assert.equal(active.index, index);
        // Three first-try misses must still create only two recovery entries.
        const q = await currentQuestion(page), choice = index < 3 ? (q.answer + 1) % q.options.length : q.answer;
        if (index >= 5) assert.match(await page.locator('.game-run-strip').innerText(), /RECOVERY QUESTION/);
        await page.locator(`[data-game-answer="${choice}"]`).click();
        await page.locator('.game-feedback-banner').waitFor();
        state = await stored(page);
        assert.equal(state.game.active.phase, 'feedback');
        assert.equal(state.game.active.index, index);
        assert.equal(await page.locator('[data-game-answer]').count(), 0);
        const pausedTime = await page.locator('.game-clock').innerText();
        await page.clock.fastForward(7000);
        assert.equal(await page.locator('.game-clock').innerText(), pausedTime, 'Reading feedback must pause the answering clock.');
        assert.equal((await stored(page)).game.active.index, index, 'Feedback must wait for explicit Next.');
        if (index === 0) {
          await page.getByRole('tab', {name: 'Every choice', exact: true}).click();
          assert.equal(await page.locator('.option-lesson:visible').count(), q.options.length);
          await page.getByRole('tab', {name: 'Book rationale', exact: true}).click();
          assert.equal(await page.locator('.original-rationale').innerText(), q.explanation);
          const links = await page.locator('.lesson .source-link').evaluateAll(es => es.map(e => ({href: e.getAttribute('href'), doc: e.dataset.document, page: e.dataset.page})));
          assert.equal(links.length, 2);
          assert.ok(links.every(link => /#page=\d+$/.test(link.href) && link.doc && Number(link.page) > 0));
          await page.getByRole('tab', {name: 'Understand', exact: true}).click();
          assert.equal(await page.locator('.memory-hook p').innerText(), q.teaching.memory);
        }
        if (index < 2) {
          assert.equal(await page.locator('[data-action="game-recall-good"]').isDisabled(), true);
          await page.locator('.recall-check details summary').click();
          assert.equal(await page.locator('.recall-check details p').innerText(), q.teaching.quickCheck.answer);
          const xp = (await stored(page)).game.xp;
          await action(page, index ? 'game-recall-again' : 'game-recall-good');
          const rated = await stored(page);
          assert.equal(rated.game.xp, xp, 'Self-rated recall must not award correctness XP.');
          assert.equal(rated.records[q.id].lastRecallRating, index ? 'again' : 'good');
          assert.equal(rated.records[q.id].correct, false);
        }
        assert.equal((await stored(page)).records[q.id].correct, false, 'Game choices must preserve the old MCQ correctness value.');
        assert.equal((await stored(page)).records[q.id].lastGameCorrect, choice === q.answer);
        await action(page, 'game-next');
      }
      await page.getByRole('heading', {name: 'Your lab is growing.', exact: true}).waitFor();
      const state = await stored(page), game = state.game;
      assert.equal(game.active.phase, 'complete');
      assert.equal(game.active.queue.length, 7);
      assert.equal(game.stats.attempted, 5);
      assert.equal(game.stats.correct, 2);
      assert.equal(game.stats.recoveryAttempts, 2);
      assert.equal(game.stats.recoveryCorrect, 2);
      assert.equal(game.stats.memoryChecks, 2);
      assert.equal(game.xp, 95);
      assert.equal(state.log.filter(e => e.kind === 'game').length, 7);
      assert.equal(state.log.filter(e => e.kind === 'review').length, 2);
      assert.equal(await page.locator('.quest.done').count(), 3);
      assert.match(await page.locator('.game-result-numbers').innerText(), /2\s*\/\s*5/);
      assert.match(await page.locator('.game-result-numbers').innerText(), /2\s*\/\s*2/);
      await page.reload();
      await page.getByRole('heading', {name: 'Your lab is growing.', exact: true}).waitFor();
      assert.deepEqual((await stored(page)).game, game);
      await nav(page, 'progress');
      assert.match(await page.locator('.stats .stat').last().innerText(), /0%/);
      checked('Five distinct first tries, two bounded recoveries, explicit Next, paused feedback clock, all choice/source tabs, two self-rated recalls, three quests, XP persistence and unchanged MCQ accuracy', {xp: game.xp, answers: 7});
    }, {clock: true, seed: {version: 3, records: oldRecords, saved: [], log: [], goal: 10}});

    await test('Atomic backup restore and undo of active adventure', async page => {
      await importBank(page, fixture);
      await startMath(page);
      await page.locator(`[data-game-answer="${(await currentQuestion(page)).answer}"]`).click();
      await action(page, 'game-next');
      await page.locator(`[data-game-answer="${(await currentQuestion(page)).answer}"]`).click();
      await action(page, 'game-pause');
      await nav(page, 'progress');
      const before = await stored(page);
      const [download] = await Promise.all([page.waitForEvent('download'), action(page, 'backup')]);
      const backupPath = path.join(artifactDir, 'active-round-backup.json');
      await download.saveAs(backupPath);
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      assert.equal(backup.version, 3);
      assert.deepEqual(backup.game, before.game);
      assert.deepEqual(backup.records, before.records);
      const empty = {version: 3, records: {}, saved: [], log: [], goal: 20};
      await restore(page, empty, false);
      assert.deepEqual(await stored(page), before);
      await action(page, 'close-dialog');
      assert.deepEqual(await stored(page), before);
      await restore(page, empty);
      assert.equal((await stored(page)).game.xp, 0);
      assert.equal((await stored(page)).game.active, null);
      await action(page, 'undo-restore');
      assert.deepEqual(await stored(page), before, 'Undo must restore the entire records/log/game snapshot.');
      await restore(page, empty);
      await restore(page, backup);
      assert.deepEqual((await stored(page)).game, before.game);
      const {validateBackup} = await import('../learning.js');
      assert.deepEqual((await stored(page)).records, JSON.parse(JSON.stringify(validateBackup(backup).records)));
      await page.reload();
      await nav(page, 'play');
      await action(page, 'game-resume');
      assert.equal(await page.locator('.game-feedback-banner').count(), 1);
      assert.equal((await stored(page)).game.active.index, 1);
      assert.deepEqual((await stored(page)).game.active.queue, before.game.active.queue);
      checked('Version 3 exported backup contains active queue and XP; restore preview/cancel, replacement, Undo and reload resume restore atomic progress', {backupPath});
    });

    await test('Repeated daily questions and completion XP caps', async page => {
      await importBank(page, fixture);
      await startMath(page);
      const expected = [110, 120, 130, 130];
      for (let round = 0; round < 4; round++) {
        if (round) await action(page, 'game-start');
        for (let index = 0; index < 5; index++) {
          const q = await currentQuestion(page);
          await page.locator(`[data-game-answer="${q.answer}"]`).click();
          await action(page, 'game-next');
        }
        const game = (await stored(page)).game;
        assert.equal(game.xp, expected[round]);
        assert.equal(game.active.runXP, round === 0 ? 110 : round < 3 ? 10 : 0);
        assert.equal(game.stats.completedRuns, round + 1);
      }
      await page.reload();
      await page.getByRole('heading', {name: 'Your lab is growing.', exact: true}).waitFor();
      assert.equal((await stored(page)).game.xp, 130);
      assert.equal(await page.locator('.quest.done').count(), 2, 'The memory quest must still require actual self-ratings.');
      checked('Repeated daily answers award XP once per item and correct answer; completion bonus stops after three rounds', {roundTotals: expected});
    });

    await test('Native speech review, editing, recall, cancellation and stale results', async page => {
      await importBank(page, fixture);
      await startMath(page);
      await action(page, 'voice-start');
      await page.getByRole('heading', {name: 'Answer by speaking.', exact: true}).waitFor();
      assert.equal(await page.evaluate(() => window.__voiceRequests.length), 0);
      await action(page, 'voice-consent');
      const firstToken = await nativeToken(page);
      let q = await currentQuestion(page), before = await stored(page);
      await nativeResult(page, `${firstToken}x`, {status: 'ok', text: 'option A', alternatives: []});
      assert.equal(await page.locator('#spoken-answer').inputValue(), '');
      await nativeResult(page, firstToken, {status: 'ok', text: 'option A', alternatives: []});
      assert.equal(await page.locator('#spoken-answer').inputValue(), 'option A');
      assert.match(await page.locator('.voice-match').innerText(), /Suggested choice A/);
      assert.deepEqual(await stored(page), before, 'Recognition alone must not score or schedule a review.');
      await page.locator('#spoken-answer').fill(`${q.options[q.answer]} trailing unrecognized words`);
      assert.equal(await page.locator('[data-action="voice-confirm"]').isDisabled(), true);
      await page.locator('#spoken-answer').fill(q.options[q.answer]);
      assert.equal(await page.locator('[data-action="voice-confirm"]').isEnabled(), true);
      await action(page, 'voice-confirm');
      assert.equal((await stored(page)).game.active.answers.at(-1).correct, true);
      assert.equal((await stored(page)).log.filter(e => e.kind === 'game').length, 1);
      const recallToken = await speak(page);
      const recallBefore = await stored(page);
      await nativeResult(page, recallToken, {status: 'ok', text: 'My editable recall response', alternatives: []});
      assert.deepEqual(await stored(page), recallBefore);
      await action(page, 'voice-confirm');
      assert.equal(await page.locator('.recall-check details').getAttribute('open'), '');
      assert.equal((await stored(page)).game.stats.memoryChecks, 0, 'Revealing a suggested answer must not auto-grade recall.');
      await action(page, 'game-recall-good');
      assert.equal((await stored(page)).game.stats.memoryChecks, 1);
      await action(page, 'game-next');
      const cancelled = await speak(page);
      await action(page, 'voice-cancel');
      await nativeResult(page, cancelled, {status: 'ok', text: 'option B', alternatives: []});
      assert.equal(await page.locator('#spoken-answer').count(), 0);
      const replaced = await speak(page);
      assert.notEqual(replaced, cancelled);
      await nativeResult(page, cancelled, {status: 'ok', text: 'option C', alternatives: []});
      assert.equal(await page.locator('#spoken-answer').inputValue(), '');
      q = await currentQuestion(page);
      await page.locator(`[data-game-answer="${q.answer}"]`).click();
      await action(page, 'game-next');
      const nextBefore = await stored(page);
      await nativeResult(page, replaced, {status: 'ok', text: 'option D', alternatives: []});
      assert.deepEqual(await stored(page), nextBefore);
      assert.equal(await page.locator('#spoken-answer').count(), 0);
      const unavailable = await speak(page);
      await nativeResult(page, unavailable, {status: 'unavailable'});
      assert.match(await page.locator('.voice-error').innerText(), /not available|unavailable/i);
      await action(page, 'voice-type');
      q = await currentQuestion(page);
      await page.locator('#spoken-answer').fill(`option ${String.fromCharCode(65 + q.answer)}`);
      await action(page, 'voice-confirm');
      assert.equal((await stored(page)).game.active.answers.length, 3);
      assert.ok((await page.evaluate(() => window.__voiceCancels)).includes(cancelled));
      checked('Native transcript stays editable and requires confirmation; full option text and explicit letters match; recall needs self-rating; wrong, canceled and stale tokens cannot score; unavailable provider falls back to typing');
    }, {native: true});

    await test('Practice and exam spoken answers preserve their scoring rules', async page => {
      await importBank(page, fixture);
      await startStudy(page, 'practice');
      let s = await session(page), q = byId.get(s.ids[s.index]);
      const before = (await stored(page))?.log.length || 0;
      const token = await speak(page);
      await nativeResult(page, token, {status: 'ok', text: q.options[q.answer], alternatives: []});
      assert.equal((await session(page)).selected, null);
      assert.equal((await stored(page))?.log.length || 0, before);
      await action(page, 'voice-confirm');
      assert.equal((await session(page)).selected, q.answer);
      assert.equal((await stored(page)).log.length, before + 1);
      assert.equal(await page.locator('.lesson').count(), 1);
      await action(page, 'next');
      const navigationToken = await speak(page);
      await nav(page, 'home');
      await nativeResult(page, navigationToken, {status: 'ok', text: 'option A', alternatives: []});
      assert.equal((await stored(page)).log.length, before + 1);
      await startStudy(page, 'exam');
      const examBefore = (await stored(page)).log.length;
      s = await session(page); q = byId.get(s.ids[0]);
      const examToken = await speak(page);
      await nativeResult(page, examToken, {status: 'ok', text: `option ${String.fromCharCode(65 + q.answer)}`, alternatives: []});
      assert.equal((await session(page)).selected, null);
      await action(page, 'voice-confirm');
      assert.equal((await session(page)).selected, q.answer);
      assert.equal(await page.locator('.lesson,.option.correct,.option.wrong').count(), 0);
      assert.equal((await stored(page)).log.length, examBefore);
      await action(page, 'next');
      for (let index = 1; index < 5; index++) {
        s = await session(page); q = byId.get(s.ids[index]);
        await page.locator(`[data-answer="${q.answer}"]`).click();
        assert.equal((await stored(page)).log.length, examBefore);
        await action(page, 'next');
      }
      assert.equal((await stored(page)).log.length, examBefore + 5);
      assert.equal(await page.locator('.result-row').count(), 5);
      checked('Practice speech scores only on explicit confirmation; exam speech keeps feedback and all five progress writes deferred until completion; navigation invalidates voice');
    }, {native: true});

    await test('No speech provider and provider exceptions retain manual answers', async (page, context) => {
      await importBank(page, fixture);
      await startMath(page);
      assert.equal(await page.locator('[data-action="voice-start"]').isDisabled(), true);
      assert.match(await page.locator('.voice-help').innerText(), /type|tap/);
      await action(page, 'voice-type');
      await page.locator('#spoken-answer').fill('no matching choice');
      assert.equal(await page.locator('[data-action="voice-confirm"]').isDisabled(), true);
      await page.locator('#spoken-answer').fill(`option ${String.fromCharCode(65 + (await currentQuestion(page)).answer)}`);
      await action(page, 'voice-confirm');
      await action(page, 'game-next');
      await page.evaluate(() => {
        window.LabwiseAndroid = {startVoiceInput() { throw new Error('Mock provider unavailable'); }, cancelVoiceInput() {}};
      });
      await action(page, 'voice-type'); // Refresh availability after adding the erroring mock.
      await action(page, 'voice-start');
      await action(page, 'voice-consent');
      assert.match(await page.locator('.voice-error').innerText(), /could not finish/);
      await page.locator(`[data-game-answer="${(await currentQuestion(page)).answer}"]`).click();
      assert.equal((await stored(page)).game.active.answers.length, 2);
      checked('A browser with no speech provider permits typing and tapping; a synchronous provider failure shows a recoverable error');
    }, {noProvider: true});
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(artifactDir, 'browser-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({scenarios: report.scenarios.map(({name, status, error}) => ({name, status, ...(error ? {error} : {})})), checks: report.checks.length, report: path.join(artifactDir, 'browser-report.json')}, null, 2));
  if (report.errors.length) process.exitCode = 1;
}

module.exports = {chromium, appURL, artifactDir, bundled, byId, action, nav, stored, currentQuestion, importBank, mathFixtures};
if (require.main === module) run().catch(error => {console.error(error); process.exitCode = 1;});
