// Extract the release APK's assets to /tmp/labwise-final-apk/assets before running.
// APK_ASSETS can select another extracted release. Requests never reach a network.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const origin = 'https://appassets.androidplatform.net';
const modules = ['exam-challenge.js','exam-challenge-ui.js','app.js', 'learning.js', 'questions.js', 'teaching.js', 'storage.js', 'sources.js', 'icons.js', 'game.js', 'game-ui.js', 'voice.js', 'compatibility.js', 'host-voice.js', 'host-dialogue.js', 'host-game.js', 'host-ui.js', 'figures.js'];
const packagedAssets = ['exam-challenge.css',...modules, 'index.html', 'style.css', 'game.css', 'manifest.webmanifest',
  'sync-config.json', 'sync-config.js', 'sync-model.js', 'sync.js', 'supabase-client.js', 'duel-client.js',
  'game-sync.js', 'frenzy.js', 'arcade-ui.js', 'arcade.css', 'onboarding.js', 'onboarding.css', 'account-ui.js', 'account.css',
  'auth-callback.html', 'auth-callback.js', 'auth-callback.css', 'host.css', 'figures.css', 'data/glossary.json', 'data/boc-inventory.json', 'data/quiz-meta.json', 'data/figures.json'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let browser;
(async () => {
  const root = path.resolve(process.env.APK_ASSETS || '/tmp/labwise-final-apk/assets');
  const catalog = json(path.join(root, 'data/catalog.json'));
  const bank = json(path.join(root, 'data/study-bank.json'));
  const coverage = json(path.join(root, 'data/teaching-coverage.json'));
  const quizMeta = json(path.join(root, 'data/quiz-meta.json'));
  const figureManifest = json(path.join(root, 'data/figures.json'));
  assert.equal(quizMeta.contentDigest, digest(path.join(root, 'data/study-bank.json')), 'Duel registry must identify the exact packaged bank bytes');
  const syncConfig = json(path.join(root, 'sync-config.json'));
  const syncOrigin = syncConfig.enabled ? new URL(syncConfig.url).origin : '';
  if (syncOrigin) assert.match(syncOrigin, /^https:\/\/[a-z0-9]{20}\.supabase\.co$/, 'Account connections must use the configured Supabase origin');
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${syncOrigin ? ' ' + syncOrigin : ''}; object-src 'none'; base-uri 'none'; form-action 'none'`;
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
  for (const name of packagedAssets) {
    assert.ok(fs.statSync(path.join(root, name)).isFile(), `Missing bundled asset: ${name}`);
  }
  for (const name of packagedAssets) {
    assert.equal(digest(path.join(root, name)), digest(path.join(__dirname, '..', name)), `Extracted asset must match the current release source: ${name}`);
  }
  assert.equal(figureManifest.version, 1);
  const figurePaths = [...new Set(Object.values(figureManifest.figures).map(figure => figure.path))].sort();
  assert.equal(figurePaths.length, figureManifest.coverage.uniqueImageFiles);
  assert.equal(Object.keys(figureManifest.figures).length, figureManifest.coverage.figureRecords);
  assert.equal(figureManifest.coverage.activeQuestions, bank.length);
  assert.equal(Object.keys(figureManifest.tables).length, figureManifest.coverage.tableRecords);
  assert.equal(figureManifest.coverage.pagesVisuallyReviewed, 1100);
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets/figures')).filter(name=>name.endsWith('.webp')).map(name=>'assets/figures/'+name).sort(), figurePaths);
  for (const name of figurePaths) {
    assert.match(name, /^assets\/figures\/[a-f0-9]{24}\.webp$/);
    const file=path.join(root,name),bytes=fs.readFileSync(file);
    assert.equal(digest(file),digest(path.join(__dirname,'..',name)),`Bundled original visual differs: ${name}`);
    assert.equal(digest(file).slice(0,24),path.basename(name,'.webp'),'Visual filename must identify its exact bytes');
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(bytes.toString('ascii',12,16),'VP8L','The APK must preserve the lossless source-picture exports');
  }
  assert.equal(figurePaths.reduce((total,name)=>total+fs.statSync(path.join(root,name)).size,0),figureManifest.coverage.imageBytes);
  const bankIds=new Set(bank.map(q=>q.id));
  for (const figure of Object.values(figureManifest.figures)) {
    assert.equal(fs.statSync(path.join(root,figure.path)).size,figure.bytes);
    assert.equal(figure.quality.export,'lossless-page-render');
    assert.equal(figure.quality.addedUpscaling,false);
    assert.ok(figure.quality.exportDpi<=figure.quality.sourceDpi+.02);
    for(const id of figure.questionIds)assert.ok(bankIds.has(id),'Only active questions can receive inline visual mappings');
  }
  for (const doc of catalog.documents) {
    const file = path.resolve(root, doc.path);
    assert.ok(file.startsWith(root + path.sep), 'Catalog paths must stay inside the APK');
    assert.ok(fs.statSync(file).size > 5, `Empty bundled PDF: ${doc.id}`);
    const fd = fs.openSync(file, 'r'), header = Buffer.alloc(5);
    try { fs.readSync(fd, header, 0, 5, 0); } finally { fs.closeSync(fd); }
    assert.equal(header.toString(), '%PDF-', `Invalid PDF header: ${doc.id}`);
    assert.equal(figureManifest.documents[doc.id].sha256,digest(file),'Visual source PDF must match the packaged original');
  }
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 412, height: 915}});
  const cpuRate=Number(process.env.APK_CPU_RATE||1);
  assert.ok(Number.isFinite(cpuRate)&&cpuRate>=1&&cpuRate<=20,'Use a CPU slowdown from 1 to 20.');
  if(cpuRate>1)await(await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
  const errors = [], missing = [], requests = new Set();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(version => {
    window.nativeCalls = [];
    window.apkSpoken = []; window.apkListenToken = null;
    window.LabwiseAndroid = {
      version: () => version,
      takeReadingPosition: () => {const value = window.nativeReading || null; window.nativeReading = null; return JSON.stringify(value);},
      openDocument: (id, page) => window.nativeCalls.push({type: 'pdf', id, page}),
      openUpdates: () => window.nativeCalls.push({type: 'update'}),
      readSecureSyncSession: () => null,
      writeSecureSyncSession: () => true,
      clearSecureSyncSession: () => true,
      exportJSON: (name, content) => window.nativeCalls.push({type: 'export', name, data: JSON.parse(content)}),
      hostVoiceCapabilities: () => JSON.stringify({ttsAvailable:true,recognitionAvailable:true,microphonePermission:true,voices:[{id:'apk-test',name:'APK test voice',locale:'en-US',network:false}]}),
      speakHost: (text,token) => {window.apkSpoken.push(text);setTimeout(()=>window.labwiseNativeHostSpeech(token,{status:'end'}),0);return true;},
      stopHostSpeech: () => {},
      startHostListening: token => {window.apkListenToken=token;return true;},
      stopHostListening: () => {window.apkListenToken=null;}
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
    const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/json', '.pdf': 'application/pdf'}[path.extname(file)] || 'application/octet-stream';
    await route.fulfill({status: 200, contentType: mime, body: fs.readFileSync(file), headers: {'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff'}});
  });
  const nav = view => page.locator(`[data-view="${view}"]:visible`).first().click();
  const action = async name => {
    const selector = `[data-action="${name}"]:visible`, inModal = page.locator(`#modal[open] ${selector}`);
    return (await inModal.count() ? inModal.first() : page.locator(selector).first()).click();
  };
  const lastCall = () => page.evaluate(() => window.nativeCalls.at(-1));
  const coldStart=Date.now();
  await page.goto(`${origin}/assets/index.html`);
  await page.getByRole('heading', {name: 'Make room for a little discovery.'}).waitFor();
  console.log('APK_STARTUP '+JSON.stringify({cpuSlowdown:cpuRate,elapsedMs:Date.now()-coldStart,scope:'Extracted APK in Chromium; not a physical Android benchmark'}));
  await page.locator('.onboarding').waitFor();
  await action('tour-skip');
  assert.equal(quizMeta.questions, await page.evaluate(async () => {
    const {eligibleQuestions} = await import('./game.js');
    return eligibleQuestions(await (await fetch('./data/study-bank.json')).json()).length;
  }), 'Duel registry count must match eligible questions in the packaged release');
  for (const name of modules) assert.ok(requests.has(name), `Bundled module did not load: ${name}`);
  assert.equal(await page.locator('script:not([src])').count(), 0, 'The Android CSP disallows inline scripts');
  for (const src of await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => script.src))) {
    assert.equal(new URL(src).origin, origin, 'Scripts must be bundled locally');
  }
  assert.equal(await page.evaluate(() => window.nativeCalls.length), 0, 'Boot must not trigger native actions');
  await nav('progress'); await action('backup');
  const backup = await lastCall();
  assert.equal(backup.type, 'export'); assert.equal(backup.name, 'labwise-progress.json');
  assert.equal(backup.data.version, 4); assert.equal(backup.data.appVersion, catalog.version);
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
  await page.locator('.study > .source-links .source-link').nth(0).click();
  assert.deepEqual(await lastCall(), {type: 'pdf', id: cross.documentId, page: cross.page});
  await page.locator('.study > .source-links .source-link').nth(1).click();
  assert.deepEqual(await lastCall(), {type: 'pdf', id: cross.answerDocumentId, page: cross.answerPage});
  await page.locator('[data-answer="0"]').click();
  await page.locator('.memory-hook').waitFor(); await page.locator('.recall-check').waitFor();
  await page.getByRole('tab', {name: 'Every choice'}).click();
  assert.equal(await page.locator('.option-lesson:visible').count(), cross.options.length);
  await page.getByRole('tab', {name: 'Book rationale', exact: true}).click();
  await page.locator('.original-rationale:visible').waitFor();
  await nav('play'); await page.getByRole('heading', {name: 'Your lab adventure.'}).waitFor();
  await action('frenzy-restart'); await action('mode-confirm');
  await page.locator('[data-arcade-answer="0"]').click(); await page.locator('.arcade-feedback').waitFor();
  assert.equal(await page.locator('.arcade-clock').count(), 0, 'Explanation time must stay untimed in the APK');
  await page.getByRole('tab', {name: 'Every choice'}).click();
  assert.ok(await page.locator('.option-lesson:visible').count() >= 2);
  await nav('progress'); await action('backup');
  const frenzyBackup = (await lastCall()).data;
  assert.equal(frenzyBackup.frenzy.active.responses.length, 1);
  assert.equal(frenzyBackup.frenzy.active.phase, 'feedback');
  assert.ok(!JSON.stringify(frenzyBackup.cloud).includes('fingerprint'), 'Active question snapshots stay out of cloud progress');
  await action('settings'); await action('account');
  await page.locator('#account-email').waitFor();
  assert.equal(await page.locator('[data-action="account-signup"]').count(), 0, 'The confirmed-account pilot must not advertise hosted email flows');
  await action('arcade-hub'); await action('duel-hub');
  await page.getByRole('heading', {name: 'Bring a friend along.'}).waitFor();
  await action('arcade-hub');
  await action('game-start'); await page.locator('.game-question').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-state')).game.active.queue.length), 5);
  await page.locator('[data-game-answer="0"]').click(); await page.locator('.game-feedback-banner').waitFor();
  await nav('progress'); await action('backup');
  const gameBackup = (await lastCall()).data;
  assert.equal(gameBackup.version, 4); assert.ok(gameBackup.game.xp >= 5); assert.equal(gameBackup.game.active.phase, 'feedback');
  assert.equal(gameBackup.log.at(-1).kind, 'game');
  await nav('play'); await action('game-pause'); await action('host-open'); await action('host-setup'); await action('host-confirm-setup');
  const audioQueue = await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-host-session-v1')).active.queue.map(q=>q.id));
  for (const id of audioQueue) {
    const mapping=figureManifest.questions[id];
    assert.ok(!mapping || !mapping.tableIds.length && !mapping.figureIds.some(fid=>figureManifest.figures[fid].reveal==='question'), 'Audio-only rounds must exclude verified question visuals.');
  }
  await page.locator('[data-host-answer="0"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-host-session-v1')).active.responses.length), 0, 'Quiz Show requires a separate confirmation');
  await action('host-confirm'); await page.locator('.host-feedback').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('labwise-host-session-v1')).active.responses.length), 1);
  const pictured = bank.find(q => q.id === 'boc-4-7'); assert.ok(pictured);
  await nav('practice'); await page.locator('#practice-query').fill(pictured.source);
  await page.locator(`.question-row[data-question="${pictured.id}"]`).click();
  if (await page.locator('#modal[open] [data-action="start-new"]').count()) await action('start-new');
  const picture = page.locator('.study .source-figure img').first(); await picture.waitFor();
  await page.waitForFunction(() => {const img=document.querySelector('.study .source-figure img');return img?.complete&&img.naturalWidth>0;});
  assert.equal(await page.locator('.source-layout,.source-figure-layout').count(), 0, 'Show real pictures without question screenshots');
  await picture.click(); await page.locator('#figure-zoom-image').evaluate(img=>img.decode());
  assert.ok(await page.locator('#figure-zoom-image').evaluate(img=>img.getBoundingClientRect().width<=img.naturalWidth+1),'Opening the packaged picture must not stretch the original');
  await action('figure-actual');
  assert.equal(await page.locator('#figure-zoom-image').evaluate(img=>parseFloat(img.style.width)),await picture.evaluate(img=>img.naturalWidth));
  await action('figure-enlarge');
  assert.equal(await page.locator('#figure-zoom-image').evaluate(img=>parseFloat(img.style.width)),2*await picture.evaluate(img=>img.naturalWidth));
  await action('figure-fit');
  assert.ok(await page.locator('#figure-zoom-image').evaluate(img=>img.getBoundingClientRect().width<=Math.min(img.parentElement.clientWidth,img.naturalWidth)+1));
  await action('close-dialog');
  const panelQuestion=bank.find(q=>q.id==='book-135-94');
  await nav('practice');await page.locator('#practice-query').fill(panelQuestion.source);
  await page.locator(`.question-row[data-question="${panelQuestion.id}"]`).click();
  if(await page.locator('#modal[open] [data-action="start-new"]').count())await action('start-new');
  const panel=page.locator('.study .source-table').first();await panel.waitFor();
  const tableId=await panel.getAttribute('data-source-table'),sourceTable=figureManifest.tables[tableId];
  assert.ok(sourceTable.headers.length>20,'The packaged red-cell panel must retain its full columns.');
  assert.equal(await panel.locator('tbody tr').count(),sourceTable.rows.length);
  assert.equal(await panel.locator('.source-table-groups').count(),1);
  assert.ok(await panel.locator('.source-table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth));
  await panel.locator('[data-table-id]').click();await page.locator('#modal[open] .source-table-expanded').waitFor();
  await page.locator('#modal[open] .source-table [data-document]').click();
  assert.deepEqual(await lastCall(),{type:'pdf',id:sourceTable.documentId,page:sourceTable.page});
  await action('close-dialog');
  await page.locator('.study .practice-voice-shortcut').click();
  const consent=page.locator('#modal[open] [data-action="practice-voice-consent"]');if(await consent.isVisible())await consent.click();
  await page.waitForFunction(()=>!!window.apkListenToken);
  const speech=await page.evaluate(()=>window.apkSpoken.join(''));
  for(const option of panelQuestion.options)assert.ok(speech.includes(option),'The packaged tutor must read every source option.');
  async function hearTutor(text){await page.waitForFunction(()=>!!window.apkListenToken);await page.evaluate(text=>window.labwiseNativeHostResult(window.apkListenToken,{status:'result',text}),text);}
  await hearTutor('option '+String.fromCharCode(65+panelQuestion.answer));await page.locator('.practice-voice .host-confirmation').waitFor();
  assert.equal(await page.locator('.answer-status').count(),0,'Speech needs separate confirmation before Practice is scored.');
  await hearTutor('yes');await page.locator('.answer-status').waitFor();await page.locator('.practice-voice .host-recall').waitFor();
  await page.waitForFunction(()=>!!window.apkListenToken);
  assert.ok((await page.evaluate(()=>window.apkSpoken.join(''))).includes(panelQuestion.explanation));
  assert.ok(await page.locator('.study .source-table').count(),'The question table stays with the voice lesson.');
  await action('practice-voice-pause');
  await nav('play');
  const sprintPause=page.locator('[data-action="game-pause"]:visible');if(await sprintPause.count())await sprintPause.first().click();
  await action('exam-challenge-open');await action('exam-challenge-new');await action('exam-challenge-confirm');
  const examSaved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-exam-challenge-v1')));
  const challenge=await examSaved();assert.equal(challenge.active.total,50);
  assert.equal(new Set(challenge.active.queue.map(q=>q.id)).size,50);
  const examQ=bank.find(q=>q.id===challenge.active.queue[0].id);assert.ok(examQ);
  await page.locator(`[data-exam-challenge-answer="${examQ.answer}"]`).click();
  await page.locator('[data-action="exam-challenge-next"]').waitFor();await page.locator('.lesson').waitFor();
  assert.equal((await examSaved()).active.responses.length,1);
  await action('exam-challenge-next');await page.reload();
  await page.waitForFunction(()=>window.labwiseAppReady===true);
  assert.equal((await examSaved()).active.index,1,'The packaged challenge must retain its saved place.');
  await action('exam-challenge-bank');await action('exam-challenge-confirm-bank');
  const bankedChallenge=await examSaved();assert.equal(bankedChallenge.active.phase,'complete');
  assert.ok(bankedChallenge.records['50'].payout>0,'The packaged game must keep its best virtual prize.');
  assert.equal(await page.evaluate(() => window.nativeCalls.some(call => call.type === 'update')), false);
  await action('settings'); await action('updates'); assert.deepEqual(await lastCall(), {type: 'update'});
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  assert.deepEqual(errors, []); assert.deepEqual(missing, [], 'All requests must resolve from extracted APK assets');
  console.log(`PASS: v${catalog.version} APK assets match current sources and boot at the Android origin/CSP with every module, ${figurePaths.length} original visual files, ${Object.keys(figureManifest.tables).length} source tables, ${catalog.documents.length} PDFs, ${catalog.availableQuestions} taught questions, cross-PDF routing, reading positions, Sprint, Frenzy and confirmed Quiz Show feedback, audio-only visual exclusion, decoded BOC pictures/zoom, wide source table/enlarge/native PDF comparison, confirmed Practice voice answer/rationale/teach-back, optional pilot account and Friend Duel entry, v4 backup, and explicit update action; no external requests or page errors. Native Java and speech-provider execution are not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
