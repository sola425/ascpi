// Extract the release APK's assets to /tmp/labwise-final-apk/assets before running.
// APK_ASSETS can select another extracted release. Requests never reach a network.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = 'https://appassets.androidplatform.net';
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const modules = ['app.js', 'learning.js', 'questions.js', 'teaching.js', 'storage.js', 'sources.js', 'icons.js'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
let browser;
(async () => {
  const root = path.resolve(process.env.APK_ASSETS || '/tmp/labwise-final-apk/assets');
  const catalog = json(path.join(root, 'data/catalog.json'));
  const bank = json(path.join(root, 'data/study-bank.json'));
  const coverage = json(path.join(root, 'data/teaching-coverage.json'));
  assert.equal(catalog.version, json(path.join(__dirname, '../package.json')).version, 'Extracted assets must match this release');
  assert.deepEqual(catalog.documents.map(d => d.id), ['textbook', 'boc1', 'boc2']);
  assert.equal(bank.length, catalog.availableQuestions);
  assert.equal(Object.keys(json(path.join(root, 'data/teaching.json'))).length, catalog.availableQuestions);
  assert.equal(coverage.complete, true);
  assert.equal(coverage.completeTeachingNotes, catalog.availableQuestions);
  assert.equal(coverage.optionExplanations, bank.reduce((n, q) => n + q.options.length, 0));
  assert.equal(json(path.join(root, 'data/study-pages.json')).length, catalog.documents.reduce((n, d) => n + d.pages, 0));
  for (const name of [...modules, 'index.html', 'style.css', 'manifest.webmanifest', 'data/glossary.json', 'data/boc-inventory.json']) {
    assert.ok(fs.statSync(path.join(root, name)).isFile(), `Missing bundled asset: ${name}`);
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
  assert.equal(backup.data.version, 2); assert.equal(backup.data.appVersion, catalog.version);
  await nav('library');
  assert.equal(await page.locator('[data-action="cache-pdf"]').count(), 0);
  await page.getByText('All PDFs bundled offline', {exact: true}).waitFor();
  assert.equal(await page.locator('#reader-document option').count(), catalog.documents.length);
  for (const doc of catalog.documents) for (const pageNumber of [1, doc.pages]) {
    await page.locator('#reader-document').selectOption(doc.id);
    await page.locator('#page-number').fill(String(pageNumber)); await page.locator('#page-form button').click();
    assert.deepEqual(await lastCall(), {type: 'pdf', id: doc.id, page: pageNumber});
  }
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
  assert.equal(await page.evaluate(() => window.nativeCalls.some(call => call.type === 'update')), false);
  await action('settings'); await action('updates'); assert.deepEqual(await lastCall(), {type: 'update'});
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  assert.deepEqual(errors, []); assert.deepEqual(missing, [], 'All requests must resolve from extracted APK assets');
  console.log(`PASS: v${catalog.version} APK assets boot at the Android origin/CSP with all modules, ${catalog.documents.length} bundled PDFs, ${catalog.availableQuestions} taught questions, cross-PDF routing, v2 backup and explicit update action; no external requests or page errors.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
