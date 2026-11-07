// Six responsive viewports, including short landscape, dark theme and largest text.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, appURL, artifactDir, action, nav, stored, currentQuestion, importBank, mathFixtures} = require('./game-browser.cjs');
const sizes = [{width: 320, height: 568}, {width: 390, height: 844}, {width: 568, height: 320}, {width: 768, height: 1024}, {width: 820, height: 1180}, {width: 1024, height: 768}];

(async () => {
  fs.mkdirSync(artifactDir, {recursive: true});
  const report = {startedAt: new Date().toISOString(), environment: 'Headless Chromium with simulated touch/CSS viewports; not a physical Android device or WebView.', viewports: sizes, checks: [], issues: [], screenshots: [], errors: []};
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const fixture = await mathFixtures();
  try {
    for (const size of sizes) {
      const context = await browser.newContext({viewport: size, serviceWorkers: 'block', isMobile: size.width < 720, hasTouch: true, reducedMotion: 'reduce'});
      await context.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      const checked = (tag, data = {}) => report.checks.push({size, tag, ...data});
      const issue = (tag, type, data = {}) => report.issues.push({size, tag, type, ...data});
      const shot = async tag => {
        const file = path.join(artifactDir, `${size.width}x${size.height}-${tag}.png`);
        await page.screenshot({path: file, fullPage: false});
        report.screenshots.push(file);
      };
      const overflow = async tag => {
        const result = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('main *, dialog[open] *')].flatMap(e => {
          const r = e.getBoundingClientRect(), style = getComputedStyle(e);
          return r.width && style.visibility !== 'hidden' && (r.right > innerWidth + 1 || r.left < -1) ? [{tag: e.tagName, cls: typeof e.className === 'string' ? e.className : '', left: r.left, right: r.right}] : [];
        }).slice(0, 8)}));
        checked(tag, {overflow: result.scroll - result.width});
        if (result.scroll > result.width + 1) issue(tag, 'horizontal-overflow', result);
        if (await page.locator('#modal[open]').count()) {
          const modal = await page.locator('#modal').evaluate(e => ({width: e.clientWidth, scroll: e.scrollWidth}));
          if (modal.scroll > modal.width + 1) issue(tag, 'dialog-horizontal-overflow', modal);
        }
      };
      const reachable = async (selector, tag, scroll = false, wholeControl = true) => {
        const element = page.locator(selector).first();
        // Let keyboard-focus scroll adjustments settle before measuring a new target.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (scroll) await element.evaluate(e => e.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}));
        const result = await element.evaluate((e, wholeControl) => {
          const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
          const sidebar = document.querySelector('.sidebar'), navRect = sidebar.getBoundingClientRect(), mobile = innerWidth < 720, modal = !!e.closest('dialog[open]');
          const bottom = mobile && !modal ? navRect.top : innerHeight;
          return {rect: {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right}, viewport: {width: innerWidth, height: innerHeight}, bottomNavigationTop: mobile ? navRect.top : null, modal, centerHit: !!hit && (hit === e || e.contains(hit)), visible: wholeControl ? r.y >= 0 && r.x >= 0 && r.right <= innerWidth + 1 && r.bottom <= bottom + 1 : x >= 0 && x <= innerWidth && y >= 0 && y < bottom, minTouchTarget: r.height >= 44 && r.width >= 44, hit: hit?.tagName + '.' + (hit?.className || ''), font: getComputedStyle(e).fontSize};
        }, wholeControl);
        checked(tag, result);
        if (!result.centerHit || !result.visible) issue(tag, 'control-obscured-or-outside-usable-viewport', result);
        if (!result.minTouchTarget) issue(tag, 'control-smaller-than-44px', result);
        return result;
      };
      try {
        await page.goto(appURL);
        await page.getByRole('heading', {name: 'Make room for a little discovery.', exact: true}).waitFor();
        assert.equal(await page.locator('.sidebar nav button:visible').count(), size.width < 720 ? 5 : 7);
        assert.equal(await page.getByRole('button', {name: 'Play learning games', exact: true}).count(), 1);
        await reachable('.play-header', 'header-play-access');
        await overflow('home-light-standard');
        await shot('home-light-standard');
        await action(page, 'settings');
        await page.locator('#font-size').selectOption('1.3');
        if (await page.locator('html').getAttribute('data-theme') !== 'dark') await action(page, 'theme');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        assert.equal(await page.locator('html').evaluate(e => getComputedStyle(e).getPropertyValue('--font-scale').trim()), '1.3');
        await overflow('settings-dark-largest');
        await reachable('#modal [data-action="close-dialog"].primary', 'settings-done', true);
        await action(page, 'close-dialog');
        await importBank(page, fixture);
        await page.locator('#toast').waitFor({state: 'hidden'});
        await page.getByRole('button', {name: 'Play learning games', exact: true}).click();
        await page.getByRole('heading', {name: 'Your lab adventure.', exact: true}).waitFor();
        await overflow('hub-dark-largest');
        await reachable('[data-action="game-start"]', 'hub-start', true);
        await shot('hub-dark-largest');
        const rooms = await page.locator('.lab-room').count();
        assert.equal(rooms, 1);
        await reachable('.lab-room', 'subject-room', true, false);
        await page.locator('.lab-room').focus();
        await page.keyboard.press('Enter');
        await page.locator('.game-question').waitFor();
        assert.equal((await stored(page)).game.active.topic, 'Laboratory mathematics');
        await overflow('question-dark-largest');
        await shot('question-dark-largest');
        await reachable('[data-action="voice-type"]', 'type-fallback', true);
        await page.locator('[data-action="voice-type"]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#spoken-answer').evaluate(e => e === document.activeElement), true);
        const q = await currentQuestion(page), wrong = (q.answer + 1) % q.options.length;
        await page.locator('#spoken-answer').fill(`option ${String.fromCharCode(65 + wrong)}`);
        assert.match(await page.locator('.voice-match').innerText(), new RegExp(`Suggested choice ${String.fromCharCode(65 + wrong)}`));
        await reachable('[data-action="voice-confirm"]', 'transcript-confirm', true);
        await overflow('transcript-review');
        await shot('transcript-review');
        await page.locator('[data-action="voice-confirm"]').focus();
        await page.keyboard.press('Enter');
        await page.locator('.game-feedback-banner').waitFor();
        assert.equal((await stored(page)).game.active.phase, 'feedback');
        assert.equal((await stored(page)).game.active.index, 0);
        assert.equal(await page.locator('[data-action="game-recall-good"]').isDisabled(), true);
        for (const position of ['top', 'middle', 'bottom']) {
          await page.evaluate(position => window.scrollTo(0, position === 'top' ? 0 : position === 'middle' ? document.documentElement.scrollHeight / 2 : document.documentElement.scrollHeight), position);
          await reachable('[data-action="game-next"]', `required-next-${position}`, size.width >= 720);
          await overflow(`feedback-${position}`);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot('feedback-dark-largest');
        const understand = page.getByRole('tab', {name: 'Understand', exact: true});
        await understand.focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('tab', {name: 'Every choice', exact: true}).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('.option-lesson:visible').count(), q.options.length);
        await overflow('every-choice');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.getByRole('tab', {name: 'Book rationale', exact: true}).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('.original-rationale:visible').innerText(), q.explanation);
        const links = await page.locator('.source-links a').evaluateAll(es => es.map(e => ({href: e.getAttribute('href'), doc: e.dataset.document, page: e.dataset.page})));
        assert.equal(links.length, 2);
        assert.ok(links.every(link => link.doc && /#page=\d+$/.test(link.href)));
        await overflow('source-rationale');
        await page.keyboard.press('ArrowRight');
        assert.equal(await understand.getAttribute('aria-selected'), 'true');
        await reachable('.recall-check details summary', 'reveal-recall', true);
        await page.locator('.recall-check details summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('.recall-check details').getAttribute('open'), '');
        await reachable('[data-action="game-recall-again"]', 'recall-again', true);
        await reachable('[data-action="game-recall-good"]', 'recall-good', true);
        await overflow('recall-rating');
        await shot('recall-rating-dark-largest');
        await page.locator('[data-action="game-recall-good"]').focus();
        await page.keyboard.press('Enter');
        assert.equal((await stored(page)).game.stats.memoryChecks, 1);
        await reachable('[data-action="game-next"]', 'required-next-after-recall', size.width >= 720);
        await page.locator('[data-action="game-next"]').focus();
        await page.keyboard.press('Enter');
        assert.equal((await stored(page)).game.active.index, 1);
        assert.equal((await stored(page)).game.active.phase, 'question');
        checked('keyboard-room-transcript-confirm-tabs-reveal-self-rate-and-next');
        // Finish the remaining four initial questions and the single recovery.
        for (let index = 1; index < 6; index++) {
          const item = await currentQuestion(page);
          await page.locator(`[data-game-answer="${item.answer}"]`).click();
          await reachable('[data-action="game-next"]', `next-${index}`, true);
          await action(page, 'game-next');
        }
        await page.getByRole('heading', {name: 'Your lab is growing.', exact: true}).waitFor();
        await overflow('results');
        await reachable('[data-action="game-start"]', 'results-next-round', true);
        await shot('results-dark-largest');
        const gameBefore = (await stored(page)).game;
        await page.reload();
        await page.getByRole('heading', {name: 'Your lab is growing.', exact: true}).waitFor();
        assert.deepEqual((await stored(page)).game, gameBefore);
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        checked('dark-theme-largest-text-and-results-survive-reload');
        assert.deepEqual(pageErrors, []);
      } catch (error) {
        report.errors.push({size, fatal: error.stack, pageErrors});
        await shot('failure').catch(() => {});
      } finally { await context.close(); }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(artifactDir, 'ux-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({checks: report.checks.length, issues: report.issues, errors: report.errors, screenshots: report.screenshots.length, report: path.join(artifactDir, 'ux-report.json')}, null, 2));
  if (report.issues.length || report.errors.length) process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
