// Extract the release APK's assets to /tmp/labwise-final-apk/assets before running.
// APK_ASSETS can select another extracted release. Requests never reach a network.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = 'https://appassets.androidplatform.net';
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const modules = ['app.js', 'learning.js', 'questions.js', 'teaching.js', 'storage.js', 'sources.js', 'icons.js', 'game.js', 'game-ui.js', 'voice.js'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let browser;
(async () => {
  const root = path.resolve(process.env.APK_ASSETS || '/tmp/labwise-final-apk/assets');
  const catalog = json(path.join(root, 'data/catalog.json'));
  const bank = json(path.join(root, 'data/study-bank.json'));
  const coverage = json(path.join(root, 'data/teaching-coverage.json'));
  assert.equal(catalog.version, '5.0.0', 'Extracted APK assets must be the v5 release');
  assert.equal(catalog.version, json(path.join(__dirname, '../package.json')).version, 'Extracted assets must match this release');
  assert.deepEqual(catalog.documents.map(d => d.id), ['textbook', 'boc1', 'boc2']);
  assert.equal(catalog.availableQuestions, 3760); assert.equal(catalog.excludedQuestions, 193); assert.equal(catalog.missingSourceQuestions, 93);
  assert.equal(bank.reduce((n, q) => n + q.options.length, 0), 15046);
  assert.equal(bank.length, catalog.availableQuestions);
  assert.equal(Object.keys(json(path.join(root, 'data/teaching.json'))).length, catalog.availableQuestions);
  assert.equal(coverage.complete, true);
  assert.equal(coverage.completeTeachingNotes, catalog.availableQuestions);
  assert.equal(coverage.optionExplanations, bank.reduce((n, q) => n + q.options.length, 0));
  assert.equal(json(path.join(root, 'data/study-pages.json')).length, catalog.documents.reduce((n, d) => n + d.pages, 0));
  for (const name of [...modules, 'index.html', 'style.css', 'game.css', 'manifest.webmanifest', 'data/glossary.json', 'data/boc-inventory.json']) {
    assert.ok(fs.statSync(path.join(root, name)).isFile(), `Missing bundled asset: ${name}`);
  }
  for (const name of [...modules, 'index.html', 'style.css', 'game.css', 'manifest.webmanifest']) {
    assert.equal(digest(path.join(root, name)), digest(path.join(__dirname, '..', name)), `Extracted asset must match the current release source: ${name}`);
  }
  for (const doc of catalog.documents) {
    const file = path.resolve(root, doc.path);
    assert.ok(file.startsWith(root + path.sep), 'Catalog paths must stay inside the APK');
    assert.ok(fs.statSync(file).size > 5, `Empty bundled PDF: ${doc.id}`);
    const fd = fs.openSync(file, 'r'), header = Buffer.alloc(5);
    try { fs.readSync(fd, header, 0, 5, 0); } finally { fs.closeSync(fd); }
    assert.equal(header.toString(), '%PDF-', `Invalid PDF header: ${doc.id}`);
  }
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 412, height: 915}});
  const errors = [], missing = [], requests = new Set();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(version => {
    window.nativeCalls = [];
    window.LabwiseAndroid = {
      version: () => version,
      takeReadingPosition: () => {const value = window.nativeReading || null; window.nativeReading = null; return JSON.stringify(value);},
      openDocument: (id, page) => window.nativeCalls.push({type: 'pdf', id, page}),
      openUpdates: () => window.nativeCalls.push({type: 'update'}),
      exportJSON: (name, content) => window.nativeCalls.push({type: 'export', name, data: JSON.parse(content)})
    };
  }, catalog.version);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith('/assets/')) {
      missing.push(url.href); return route.abort();
    }
    const relative = decodeURIComponent(url.pathname.slice(8)), file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      missing.push(relative); return route.fulfill({status: 404, body: 'Not found'});
    }
    requests.add(relative);
    const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json', '.pdf': 'application/pdf'}[path.extname(file)] || 'application/octet-stream';
    await route.fulfill({status: 200, contentType: mime, body: fs.readFileSync(file), headers: {'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff'}});
  });
  const nav = view => page.locator(`[data-view="${view}"]:visible`).first().click();
  const action = name => page.locator(`[data-action="${name}"]:visible`).first().click();
  const lastCall = () => page.evaluate(() => window.nativeCalls.at(-1));
  await page.goto(`${origin}/assets/index.html`);
  await page.getByRole('heading', {name: 'Make room for a little discovery.'}).waitFor();
  for (const name of modules) assert.ok(requests.has(name), `Bundled module did not load: ${name}`);
  assert.equal(await page.locator('script:not([src])').count(), 0, 'The Android CSP disallows inline scripts');
  for (const src of await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => script.src))) {
    assert.equal(new URL(src).origin, origin, 'Scripts must be bundled locally');
  }
  assert.equal(await page.evaluate(() => window.nativeCalls.length), 0, 'Boot must not trigger native actions');
  await nav('progress'); await action('backup');
  const backup = await lastCall();
  assert.equal(backup.type, 'export'); assert.equal(backup.name, 'labwise-progress.json');
  assert.equal(backup.data.version, 3); assert.equal(backup.data.appVersion, '5.0.0');
  assert.equal(backup.data.game.version, 1); assert.equal(backup.data.game.xp, 0); assert.equal(backup.data.game.active, null);
  await nav('library');
  assert.equal(await page.locator('[data-action="cache-pdf"]').count(), 0);
  await page.getByText('All PDFs bundled offline', {exact: true}).waitFor();
  assert.equal(await page.locator('#reader-document option').count(), catalog.documents.length);
  for (const doc of catalog.documents) for (const pageNumber of [1, doc.pages]) {
    await page.locator('#reader-document').selectOption(doc.id);
    await page.locator('#page-number').fill(String(pageNumber)); await page.locator('#page-form button').click();
    assert.deepEqual(await lastCall(), {type: 'pdf', id: doc.id, page: pageNumber});
  }
  await page.evaluate(() => {window.nativeReading = {documentId: 'boc2', page: 42}; window.labwiseNativeReading();});
  await page.locator('#reader-document').selectOption('boc2');
  assert.equal(await page.locator('#page-number').inputValue(), '42');
  await page.evaluate(() => window.labwiseNativeReading());
  assert.equal(await page.locator('#page-number').inputValue(), '42');
  await nav('progress'); await action('backup'); assert.equal((await lastCall()).data.reading.boc2, 42);
  // Search by source metadata; question text stays in the app.
  const cross = bank.find(q => q.documentId && q.answerDocumentId && q.documentId !== q.answerDocumentId);
  assert.ok(cross, 'Packaged cross-PDF source/rationale metadata must remain available');
  await nav('practice'); await page.locator('#practice-query').fill(cross.source);
  await page.locator(`.question-row[data-question="${cross.id}"]`).click(); await page.locator('.plain-question').waitFor();
  await page.locator('.study .source-link').nth(0).click();
  assert.deepEqual(await lastCall(), {type: 'pdf', id: cross.documentId, page: cross.page});
  await page.locator('.study .source-link').nth(1).click();
  assert.deepEqual(await lastCall(), {type: 'pdf', id: cross.answerDocumentId, page: cross.answerPage});
  await page.locator('[data-answer="0"]').click();
  await page.locator('.memory-hook').waitFor(); await page.locator('.recall-check').waitFor();
  await page.getByRole('tab', {name: 'Every choice'}).click();
  assert.equal(await page.locator('.option-lesson:visible').count(), cross.options.length);
  await page.getByRole('tab', {name: 'Book rationale', exact: true}).click();
  await page.locator('.original-rationale:visible').waitFor();
  await nav('play'); await page.getByRole('heading', {name: 'Your lab adventure.'}).waitFor();
  await action('game-start'); await page.locator('.game-question').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-state')).game.active.queue.length), 5);
  await page.locator('[data-game-answer="0"]').click(); await page.locator('.game-feedback-banner').waitFor();
  await nav('progress'); await action('backup');
  const gameBackup = (await lastCall()).data;
  assert.equal(gameBackup.version, 3); assert.ok(gameBackup.game.xp >= 5); assert.equal(gameBackup.game.active.phase, 'feedback');
  assert.equal(gameBackup.log.at(-1).kind, 'game');
  assert.equal(await page.evaluate(() => window.nativeCalls.some(call => call.type === 'update')), false);
  await action('settings'); await action('updates'); assert.deepEqual(await lastCall(), {type: 'update'});
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  assert.deepEqual(errors, []); assert.deepEqual(missing, [], 'All requests must resolve from extracted APK assets');
  console.log(`PASS: v${catalog.version} APK assets match current release sources and boot at the Android origin/CSP with all legacy/game/voice modules, ${catalog.documents.length} bundled PDFs, ${catalog.availableQuestions} taught questions, cross-PDF routing, consumed reading positions, a five-question adventure/feedback, v3 backup with game state and explicit update action; no external requests or page errors. Native Java and speech-provider execution are not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
