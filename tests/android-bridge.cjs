// Browser simulation of the Android bridge; this does not execute native Java.
const assert = require('node:assert/strict');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
let browser;
(async () => {
  const appURL = process.env.APP_URL || 'http://127.0.0.1:3000', origin = new URL(appURL).origin;
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 412, height: 915}});
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.LabwiseAndroid = {
      version: () => '4.0.0',
      takeReadingPosition: () => {const value=window.nativeReading||null;window.nativeReading=null;return JSON.stringify(value)},
      openDocument: (id, page) => window.nativeCalls.push({type: 'pdf', id, page}),
      openUpdates: () => window.nativeCalls.push({type: 'update'}),
      exportJSON: (name, content) => window.nativeCalls.push({type: 'export', name, data: JSON.parse(content)})
    };
    // Existing v1 progress uses the same origin and storage key after an upgrade.
    localStorage.setItem('labwise-state', JSON.stringify({version: 1, records: {'book-1-1': {due: 1700000000000, stage: 2, reviews: 3, correct: true, at: 1699999999000}}, saved: ['book-1-1'], log: [{id: 'book-1-1', at: 1699999999000, kind: 'answer', correct: true}], goal: 20}));
  });
  const nav = view => page.locator(`[data-view="${view}"]:visible`).first().click();
  const action = name => page.locator(`[data-action="${name}"]:visible`).first().click();
  const lastCall = () => page.evaluate(() => window.nativeCalls.at(-1));
  await page.goto(appURL);
  await page.getByRole('heading', {name: 'Make room for a little discovery.'}).waitFor();
  assert.equal(await page.evaluate(() => window.nativeCalls.length), 0);
  const catalog = await page.evaluate(async () => (await fetch('./data/catalog.json')).json());
  assert.deepEqual(catalog.documents.map(doc => doc.id), ['textbook', 'boc1', 'boc2']);
  await nav('progress'); await action('backup');
  const backup = await lastCall();
  assert.equal(backup.type, 'export'); assert.equal(backup.name, 'labwise-progress.json');
  assert.equal(backup.data.version, 2); assert.equal(backup.data.appVersion, catalog.version);
  assert.equal(backup.data.records['book-1-1'].reviews, 3); assert.equal(backup.data.records['book-1-1'].correct, true);
  assert.equal(backup.data.goal, 20); assert.deepEqual(backup.data.saved, ['book-1-1']);
  assert.deepEqual(backup.data.log, [{id: 'book-1-1', at: 1699999999000, kind: 'answer', correct: true}]);
  await nav('library');
  assert.equal(await page.locator('[data-action="cache-pdf"]').count(), 0);
  await page.getByText('All PDFs bundled offline', {exact: true}).waitFor();
  for (const doc of catalog.documents) for (const pageNumber of [1, doc.pages]) {
    await page.locator('#reader-document').selectOption(doc.id);
    await page.locator('#page-number').fill(String(pageNumber)); await page.locator('#page-form button').click();
    assert.deepEqual(await lastCall(), {type: 'pdf', id: doc.id, page: pageNumber});
  }
  await nav('progress'); await action('backup');
  const reading = (await lastCall()).data.reading;
  for (const doc of catalog.documents) assert.equal(reading[doc.id], doc.pages);
  const cross = await page.evaluate(async () => {
    const bank = await (await fetch('./data/study-bank.json')).json();
    const q = bank.find(q => q.documentId && q.answerDocumentId && q.documentId !== q.answerDocumentId);
    return q ? {id: q.id, source: q.source, documentId: q.documentId, answerDocumentId: q.answerDocumentId, page: q.page, answerPage: q.answerPage} : null;
  });
  assert.ok(cross, 'A cross-PDF question must be available');
  await nav('practice'); await page.locator('#practice-query').fill(cross.source);
  await page.locator(`.question-row[data-question="${cross.id}"]`).click();
  await page.locator('.study .source-link').nth(0).click();
  assert.deepEqual(await lastCall(), {type: 'pdf', id: cross.documentId, page: cross.page});
  await page.locator('.study .source-link').nth(1).click();
  assert.deepEqual(await lastCall(), {type: 'pdf', id: cross.answerDocumentId, page: cross.answerPage});
  assert.equal(await page.evaluate(() => window.nativeCalls.some(call => call.type === 'update')), false);
  await action('settings'); await action('updates'); assert.deepEqual(await lastCall(), {type: 'update'});
  assert.equal(await page.evaluate(() => window.labwiseBack()), true);
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false);
  assert.equal(await page.evaluate(() => window.labwiseBack()), true);
  assert.equal(await page.locator('.question-list').count(), 1);
  assert.equal(await page.evaluate(() => window.labwiseBack()), true);
  await page.getByRole('heading', {name: 'Make room for a little discovery.'}).waitFor();
  assert.equal(await page.evaluate(() => window.labwiseBack()), false);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  await nav('library');
  await page.evaluate(()=>{window.nativeReading={documentId:'boc2',page:42};window.labwiseNativeReading()});
  await page.locator('#reader-document').selectOption('boc2');
  assert.equal(await page.locator('#page-number').inputValue(),'42');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).reading.boc2),42);
  await page.evaluate(()=>window.labwiseNativeReading());
  assert.equal(await page.locator('#page-number').inputValue(),'42');
  await nav('progress');await action('backup');assert.equal((await lastCall()).data.reading.boc2,42);
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log('PASS: Android bridge simulation preserves v1 progress in v2 backups, routes three PDF IDs at both page boundaries and across source/rationale PDFs, saves per-document positions, opens updates only on click, handles Android back, and makes no external requests or service-worker registrations. Native Java interaction is not exercised.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
