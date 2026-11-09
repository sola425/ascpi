// Source-visual component review. Every request resolves from local files.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(__dirname, '..'), origin = 'http://127.0.0.1:3000', artifacts = '/tmp/labwise-figures-v7';
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/study-bank.json'))), manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/figures.json')));
const math = bank.find(q => q.topic === 'Laboratory mathematics' && q.needsSource);
const bocPicture = bank.find(q => q.id === 'boc-4-8');
const rationale = Object.values(manifest.figures).find(f => f.reveal === 'answer');
const cases = [{id: 'book-1-44'}, {id: 'boc-8-68'}, {id: bocPicture.id}, {id: rationale.questionIds[0], revealed: true}];
const report = {checks: [], screenshots: [], errors: [], external: []};
report.integration = [];
const byId = new Map(bank.map(q => [q.id, q]));
const integratedRationale = bank.find(q => q.id === 'boc-4-256');
assert.ok(integratedRationale, 'Use an existing hematology question with both input and rationale figures.');
const script = `
import {configureFigures,renderFigures,getFigure} from './figures.js';
const [manifest,bank]=await Promise.all(['./data/figures.json','./data/study-bank.json'].map(p=>fetch(p).then(r=>r.json())));
configureFigures(manifest);const params=new URL(location.href).searchParams,q=bank.find(q=>q.id===params.get('id'));
document.documentElement.dataset.theme=params.get('theme');document.documentElement.style.setProperty('--font-scale','1.3');
document.querySelector('#content').innerHTML=renderFigures(q,{revealed:params.get('revealed')==='true'});
document.addEventListener('click',event=>{const b=event.target.closest('[data-figure-id]');if(!b)return;const f=getFigure(b.dataset.figureId),d=document.querySelector('dialog');d.replaceChildren();const title=document.createElement('h2');title.textContent=f.caption;const box=document.createElement('div');box.className='figure-zoom';const im=document.createElement('img');im.src='./'+f.path;im.width=f.width;im.height=f.height;im.alt=f.alt;box.append(im);const close=document.createElement('button');close.className='btn';close.textContent='Close picture';close.onclick=()=>d.close();d.append(title,box,close);d.showModal();});
window.figureReviewReady=true;`;

async function action(page, name) {
  const selector = `[data-action="${name}"]:visible`, modal = page.locator(`#modal[open] ${selector}`);
  return (await modal.count() ? modal.first() : page.locator(selector).first()).click();
}
const nav = (page, name) => page.locator(`[data-view="${name}"]:visible`).first().click();
const expected = (q, phase) => manifest.questions[q.id]?.figureIds.map(id => manifest.figures[id]).filter(f => f.reveal === phase) || [];

async function decodeVisible(page) {
  await page.locator('#content .question-figures img:visible').evaluateAll(async images => {
    for (const im of images) { im.loading = 'eager'; await im.decode(); }
  });
}
async function checkLayout(page, label) {
  await decodeVisible(page);
  const result = await page.evaluate(() => ({overflow: document.documentElement.scrollWidth - innerWidth,
    badImages: [...document.querySelectorAll('#content .question-figures img')].filter(im => im.offsetHeight && (!im.complete || !im.naturalWidth)).length,
    smallTargets: [...document.querySelectorAll('#content .question-figures button,#content .question-figures a,#content .question-figures summary')].filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 43.9).map(el => el.tagName)}));
  assert.ok(result.overflow <= 1, label + ' full-app overflow'); assert.equal(result.badImages, 0, label + ' image decoding');
  assert.deepEqual(result.smallTargets, [], label + ' figure controls must be at least 44 px');
  report.integration.push({label, ...result});
}
async function findInBrowse(page, q, kind = 'practice') {
  await nav(page, kind);
  if (await page.locator(`#${kind}-query`).count() === 0) {
    throw Error('The test must finish its previous card session before choosing a new source.');
  }
  if (await page.locator('[data-book=""]:visible').count()) await page.locator('[data-book=""]:visible').first().click();
  await page.locator(`#${kind}-topic`).selectOption(''); await page.locator(`#${kind}-mode`).selectOption('all');
  await page.locator(`#${kind}-query`).fill(q.source);
}
async function openPractice(page, q) {
  await findInBrowse(page, q);
  await page.locator(`.question-row[data-question="${q.id}"]`).click();
  if (await page.locator('#modal[open] [data-action="start-new"]').isVisible()) await action(page, 'start-new');
  await page.locator('.study .question-text').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-session')).ids[0]), q.id);
}
async function startBounded(page, q, kind) {
  await findInBrowse(page, q, kind === 'cards' ? 'cards' : 'practice');
  await action(page, 'setup-' + kind); await page.locator('#setup-size').selectOption('5');
  await page.locator('#setup-shuffle').uncheck(); await action(page, 'confirm-session');
  if (await page.locator('#modal[open] [data-action="start-new"]').isVisible()) await action(page, 'start-new');
  await page.locator('.study .question-text').waitFor();
  const session = await page.evaluate(kind => JSON.parse(localStorage.getItem(kind === 'cards' ? 'labwise-cards-session' : 'labwise-session')), kind);
  assert.deepEqual(session.ids, [q.id], 'Exact source search must make a bounded one-item session.');
}
async function assertPhase(page, q, revealed, article = '.study') {
  for (const f of expected(q, 'question')) {
    const button = page.locator(`${article} [data-figure-id="${f.id}"]`).first();
    await button.waitFor({state: 'visible'});
    assert.equal(await button.locator('img').getAttribute('src'), './' + f.path);
    const link = button.locator('..').locator('.source-link');
    assert.equal(await link.getAttribute('data-document'), f.documentId); assert.equal(await link.getAttribute('data-page'), String(f.page));
  }
  for (const f of expected(q, 'answer')) {
    if (revealed) await page.locator(`${article} [data-figure-id="${f.id}"]`).first().waitFor({state: 'visible'});
    else assert.equal(await page.locator(`#content [data-figure-id="${f.id}"]`).count(), 0, 'Rationale image must not be inserted before answer reveal.');
  }
}
async function fullAppReview() {
  for (const viewport of [{width: 320, height: 568}, {width: 568, height: 320}, {width: 768, height: 1024}]) {
    const context = await browser.newContext({viewport, serviceWorkers: 'block'});
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      report.external.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      window.nativeFigureCalls = [];
      window.LabwiseAndroid = {takeReadingPosition: () => 'null',
        openDocument: (id, page) => window.nativeFigureCalls.push({id, page})};
    });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin); await page.getByRole('heading', {name: 'Make room for a little discovery.'}).waitFor();
    if (await page.locator('#modal[open] [data-action="tour-skip"]').isVisible()) await action(page, 'tour-skip');
    for (const theme of ['light', 'dark']) {
      const prefix = `${viewport.width}x${viewport.height}-${theme}`;
      await action(page, 'settings'); await page.locator('#font-size').selectOption('1.3');
      if (await page.locator('html').getAttribute('data-theme') !== theme) await action(page, 'theme');
      await action(page, 'close-dialog');
      const plate = byId.get('book-1-44'); await openPractice(page, plate); await assertPhase(page, plate, false);
      const f = expected(plate, 'question')[0], picture = page.locator(`.study [data-figure-id="${f.id}"]`).first();
      await picture.locator('img').evaluate(im => im.decode());
      const hash = await picture.locator('img').evaluate(async im => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(im.src)).arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join(''));
      const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, f.path))).digest('hex'); assert.equal(hash, actual);
      await picture.click(); await page.locator('#figure-zoom-image').evaluate(im => im.decode());
      await action(page, 'figure-actual'); assert.equal(await page.locator('#figure-zoom-image').evaluate(im => parseFloat(im.style.width)), f.width);
      assert.ok(await page.locator('.figure-zoom').evaluate(el => el.scrollWidth > el.clientWidth), 'Actual-size picture should pan within the modal.');
      await action(page, 'figure-fit'); assert.ok(await page.locator('#figure-zoom-image').evaluate(im => im.getBoundingClientRect().width <= im.parentElement.clientWidth));
      await action(page, 'close-dialog');
      await picture.locator('..').locator('.source-link').click(); assert.deepEqual(await page.evaluate(() => window.nativeFigureCalls.at(-1)), {id: f.documentId, page: f.page});
      await page.locator('.study > .source-links .source-link').first().click(); assert.deepEqual(await page.evaluate(() => window.nativeFigureCalls.at(-1)), {id: plate.documentId, page: plate.page});
      await checkLayout(page, prefix + '-practice-picture-zoom-and-sources');

      const shared = byId.get('boc-8-68'); await openPractice(page, shared); await assertPhase(page, shared, false);
      assert.ok(expected(shared, 'question').some(f => f.page !== shared.page)); await checkLayout(page, prefix + '-shared-cross-page-picture');
      await openPractice(page, math); await checkLayout(page, prefix + '-unverified-visual-pdf-fallback');
      assert.equal(await page.locator('#content .source-layout,#content .source-figure-layout').count(), 0, 'Question text must never be repeated as a picture.');
      assert.equal(await page.locator('#content .source-figure-open').count(), 0, 'Do not invent a picture when the source visual is not verified.');
      const fallback = page.locator('.study .source-figure-fallback .source-link'); await fallback.waitFor();
      assert.equal(await fallback.getAttribute('data-document'), math.documentId); assert.equal(await fallback.getAttribute('data-page'), String(math.page));

      const q = integratedRationale; await openPractice(page, q); await assertPhase(page, q, false);
      await page.locator(`[data-answer="${q.answer}"]`).click(); await assertPhase(page, q, true);
      await page.getByRole('tab', {name: 'Every choice', exact: true}).click(); assert.equal(await page.locator('.option-lesson:visible').count(), q.options.length);
      await page.getByRole('tab', {name: 'Book rationale', exact: true}).click();
      for (const f of expected(q, 'answer')) await page.locator(`.lesson [data-figure-id="${f.id}"]`).waitFor({state: 'visible'});
      await checkLayout(page, prefix + '-practice-answer-and-rationale-visuals');

      await startBounded(page, q, 'exam'); await assertPhase(page, q, false);
      await page.locator('[data-answer="0"]').click(); await assertPhase(page, q, false); assert.equal(await page.locator('.lesson').count(), 0);
      await action(page, 'next'); await page.getByRole('heading', {name: 'Look at what you’ve learned.'}).waitFor();
      await page.locator('.result-row > summary').click(); await page.getByRole('tab', {name: 'Book rationale', exact: true}).click();
      for (const f of expected(q, 'answer')) await page.locator(`.lesson [data-figure-id="${f.id}"]`).waitFor({state: 'visible'});
      await checkLayout(page, prefix + '-exam-reveal-after-completion');

      await startBounded(page, q, 'cards'); await assertPhase(page, q, false);
      await action(page, 'flip'); await assertPhase(page, q, true); await checkLayout(page, prefix + '-flashcard-reveal');
      await page.locator('[data-rating="good"]').click();
    }
    if (viewport.width === 768) {
      const original = byId.get('book-1-44'); const custom = {...original, question: 'Which original test label is first?', options: ['First label', 'Second label'], answer: 0,
        explanation: 'This is an original test fixture.', source: 'Original figure-ID collision fixture', topic: 'Figure testing'};
      await page.locator('#bank-input').setInputFiles({name: 'figure-collision.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({questions: [custom]}))});
      await action(page, 'confirm-import'); await nav(page, 'practice');
      await page.locator('#practice-query').fill(''); await page.locator('.question-row').click(); await page.locator('.study .question-text').waitFor();
      assert.equal(await page.locator('#content [data-figure-id]').count(), 0, 'A custom question that reuses an ID must not display the source question picture.');
      await checkLayout(page, 'custom-bank-id-collision');
      await nav(page, 'library'); await action(page, 'bundled');
    }
    await context.close();
  }
}
let browser;
(async () => {
  fs.mkdirSync(artifacts, {recursive: true});
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  for (const viewport of [{width: 320, height: 568}, {width: 568, height: 320}, {width: 768, height: 1024}]) {
    const context = await browser.newContext({viewport, serviceWorkers: 'block'});
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { report.external.push(url.origin); return route.abort(); }
      if (url.pathname === '/figure-review.html') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./style.css"><link rel="stylesheet" href="./figures.css"></head><body><main id="content" style="margin:0;padding:18px;width:100%;box-sizing:border-box"></main><dialog aria-label="Enlarged source picture"></dialog><script type="module" src="./figure-review.mjs"></script></body></html>'});
      if (url.pathname === '/figure-review.mjs') return route.fulfill({contentType: 'text/javascript', body: script});
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status: 404, body: 'Missing fixture'});
      return route.fulfill({contentType: {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp'}[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
    });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    for (const theme of ['light', 'dark']) for (const sample of cases) {
      await page.goto(`${origin}/figure-review.html?id=${sample.id}&theme=${theme}&revealed=${sample.revealed === true}`);
      await page.waitForFunction(() => window.figureReviewReady);
      await page.locator('img').evaluateAll(async images => { for (const im of images) { im.loading = 'eager'; await im.decode(); } });
      const key = `${viewport.width}x${viewport.height}-${theme}-${sample.id}`;
      const layout = await page.evaluate(() => ({overflow: document.documentElement.scrollWidth - innerWidth,
        broken: [...document.images].filter(im => !im.complete || !im.naturalWidth).length,
        undersized: [...document.querySelectorAll('button,a,summary')].filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 43.9).map(el => el.tagName),
        paper: getComputedStyle(document.querySelector('.source-figure-open')).backgroundColor}));
      assert.ok(layout.overflow <= 1, key + ' overflow'); assert.equal(layout.broken, 0, key + ' broken image');
      assert.deepEqual(layout.undersized, [], key + ' small target'); assert.equal(layout.paper, 'rgb(255, 255, 255)', key + ' paper');
      await page.locator('[data-figure-id]').first().click(); await page.locator('dialog[open] img').evaluate(im => im.decode());
      assert.ok(await page.locator('dialog[open] img').evaluate(im => im.naturalWidth > 0));
      await page.getByRole('button', {name: 'Close picture'}).click(); assert.equal(await page.locator('dialog[open]').count(), 0);
      report.checks.push({key, ...layout});
      if ((viewport.width === 320 && theme === 'light' && sample.id === 'book-1-44') || (viewport.width === 568 && theme === 'dark' && sample.id === 'boc-8-68') || (viewport.width === 768 && theme === 'light' && sample.id === bocPicture.id)) {
        const file = path.join(artifacts, key + '.png'); await page.screenshot({path: file, fullPage: true}); report.screenshots.push(file);
      }
    }
    await context.close();
  }
  await fullAppReview();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS: ${report.checks.length} component layouts and ${report.integration.length} full-app figure checks; source bytes, zoom, Practice, exam, Cards, reveal timing, ID collisions, 44px controls and no overflow or external requests.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
