// Run against the loopback server: npm run test:browser.
const assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const fs=require('node:fs');
const path=require('node:path');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/catalog.json'),'utf8'));
const bundled=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/study-bank.json'),'utf8'));
const appURL=process.env.APP_URL||'http://127.0.0.1:3000';
assert.equal(new URL(appURL).origin,'http://127.0.0.1:3000','Browser checks must use the loopback test server.');
const artifactDir='/tmp/labwise-browser-v5';fs.mkdirSync(artifactDir,{recursive:true});
const report={version:'5.0.0',catalog:{availableQuestions:catalog.availableQuestions,books:catalog.books.map(({id,questions})=>({id,questions}))},checks:[],screenshots:[],errors:[]};
let testBrowser;
(async()=>{
 const browser=testBrowser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const checked=(name,details={})=>report.checks.push({name,...details});
 const shot=async name=>{const file=path.join(artifactDir,name+'.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);};
 const nav=async v=>page.locator(`[data-view="${v}"]:visible`).first().click();
 const action=async a=>page.locator(`[data-action="${a}"]:visible`).first().click();
 const start=async(kind,opts={})=>{await action(`setup-${kind}`);if(opts.book)await page.locator('#setup-book').selectOption(opts.book);if(opts.mode)await page.locator('#setup-mode').selectOption(opts.mode);await page.locator('#setup-size').selectOption(String(opts.size||5));await page.locator('#setup-shuffle').uncheck();await action('confirm-session');if(await page.locator('[data-action="start-new"]').isVisible())await action('start-new');};
 await page.goto(appURL);await page.getByRole('heading',{name:'Make room for a little discovery.'}).waitFor();
 assert.equal(catalog.version,'5.0.0');assert.equal(catalog.availableQuestions,3760);assert.equal(catalog.excludedQuestions,193);assert.equal(catalog.missingSourceQuestions,93);assert.equal(bundled.reduce((n,q)=>n+q.options.length,0),15046);assert.deepEqual(catalog.documents.map(d=>d.id),['textbook','boc1','boc2']);
 assert.equal(bundled.length,catalog.availableQuestions);assert.equal(await page.locator('.topic').count(),new Set(bundled.map(q=>q.topic)).size);
 assert.equal((await page.locator('.stat').first().locator('small').innerText()).trim(),`/ ${catalog.availableQuestions.toLocaleString('en-US')}`);
 checked('active bank and subject totals match catalog',{questions:bundled.length});await shot('desktop-light-standard');
 await start('practice',{book:'success4'});assert.match(await page.locator('.study-top').innerText(),/1 \/ 5/);
 await page.locator('[data-answer="0"]').click();await page.locator('.lesson').waitFor();assert.equal(await page.locator('.option.correct').count(),1);
 await page.getByRole('tab',{name:'Every choice'}).click();assert.equal(await page.locator('.option-lesson:visible').count(),await page.locator('.option').count());
 await page.getByRole('tab',{name:'Book rationale',exact:true}).click();assert.ok((await page.locator('.original-rationale:visible').innerText()).length>20);
 const practiceIds=await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-session')).ids);assert.equal(practiceIds.length,5);
 await action('toggle-save');await action('pause');await action('resume-practice');assert.equal(await page.locator('.option.correct').count(),1);
 await page.reload();await page.locator('[data-action="resume-practice"]').waitFor();await action('resume-practice');assert.equal(await page.locator('.option.correct').count(),1);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-session')).ids),practiceIds);checked('bounded practice, every-choice/source tabs, and pause/reload resume');
 await nav('saved');assert.equal(await page.locator('.saved-row').count(),1);
 await nav('practice');await page.locator('[data-book="boc7"]').click();assert.equal(await page.locator('.section-head h2').first().innerText(),`${catalog.books.find(b=>b.id==='boc7').questions.toLocaleString('en-US')} matching questions`);
 await page.locator('#practice-query').fill('no-match-labwise-browser-test');assert.equal(await page.locator('.question-row').count(),0);
 await page.locator('#practice-query').fill('hemoglobin');assert.ok(await page.locator('.question-row').count()>0);
 await page.locator('#practice-query').fill('');checked('source scope and empty/populated question search');
 await nav('home');await start('exam',{book:'success4'});
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).log.length);
 for(let i=0;i<5;i++){await page.locator('[data-answer="0"]').click();assert.equal(await page.locator('.lesson').count(),0);assert.equal(await page.locator('.option.correct,.option.wrong,.plain-question').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).log.length),before);await action('next');}
 await page.getByRole('heading',{name:'Look at what you’ve learned.'}).waitFor();assert.equal(await page.locator('.result-row').count(),5);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).log.length),before+5);
 checked('exam feedback and progress commit deferred until completion');
 await nav('cards');await start('cards',{book:'success4',mode:'new'});
 let queue=await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-cards-session')).ids);
 for(let i=0;i<3;i++){assert.equal(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('labwise-cards-session'));return s.ids[s.index]}),queue[i]);await action('flip');await page.locator('[data-rating="again"]').click();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-cards-session')).ids),queue);}
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-cards-session')).index),3);
 const prior=await page.evaluate(id=>JSON.parse(localStorage.getItem('labwise-state')).records[id],queue[0]);assert.equal(prior.lastRecallRating,'again');assert.equal(prior.correct,undefined);
 checked('new-card queue remains stable and recall ratings stay separate');
 await nav('progress');assert.equal(await page.locator('.heat-cell').count(),84);
 await nav('library');await page.locator('[data-book=""]').click();assert.equal(await page.locator('.library-card').count(),catalog.books.length);assert.equal(await page.locator('#reader-document option').count(),catalog.documents.length);
 for(const book of catalog.books)assert.ok((await page.locator('.library-card').filter({has:page.getByRole('heading',{name:book.title,exact:true})}).innerText()).includes(`${book.questions.toLocaleString('en-US')} STUDY QUESTIONS`));
 await page.locator('#reader-document').selectOption('boc2');await page.locator('#page-number').fill('333');await page.locator('#page-form button').click();assert.match(await page.locator('object').getAttribute('data'),/boc-2.pdf#page=333/);
 await page.locator('#reader-document').selectOption('boc1');await page.locator('#page-number').fill('21');await page.locator('#page-form button').click();assert.match(await page.locator('object').getAttribute('data'),/boc-1.pdf#page=21/);
 await page.locator('#reader-document').selectOption('boc2');assert.equal(await page.locator('#page-number').inputValue(),'333');
 await page.locator('#book-search').fill('erythropoietin');await action('search-book');assert.ok(await page.locator('.book-result').count()>0);
 checked('catalog book totals, three source documents, page memory, source search');
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')));
 assert.equal(original.game.version,1);assert.equal(original.game.xp,0);assert.equal(original.game.active,null);
 for(const version of [1,2,3]){const backup={version,records:{},saved:[],log:[],goal:20,...(version===3?{game:original.game}:{})},backupFile={name:`progress-v${version}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};await page.locator('#progress-input').setInputFiles(backupFile);await page.getByRole('heading',{name:'Restore this progress?'}).waitFor();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state'))),original);await action('close-dialog');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state'))),original);await page.locator('#progress-input').setInputFiles(backupFile);await action('confirm-restore');const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')));assert.equal(restored.goal,20);assert.deepEqual(restored.game,original.game);await action('undo-restore');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state'))),original);checked('restore preview, cancel, confirm, and undo preserve expected state',{backupVersion:version});}
 const q={id:'custom"<tag>',topic:'Test',question:'A <b>safe</b> question?',options:['one','two'],answer:0,explanation:'The first option is the expected answer.',source:'Test'};
 await page.locator('#bank-input').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions:[q]}))});await page.getByRole('heading',{name:'Use this collection?'}).waitFor();await action('close-dialog');await nav('practice');assert.ok(await page.locator('.question-row').count()>1);
 await page.locator('#bank-input').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions:[q]}))});await action('confirm-import');await page.waitForFunction(()=>document.querySelectorAll('.question-row').length===1);await page.locator('.question-row').click();assert.equal(await page.locator('.question-text').innerText(),q.question);assert.equal(await page.locator('.question-text b').count(),0);await page.locator('[data-answer="0"]').click();await action('next');
 const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('labwise-content',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('banks','readonly'),get=tx.objectStore('banks').get('custom');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};}));assert.equal(stored[0].id,q.id);assert.equal(stored[0].question,q.question);
 await page.reload();await nav('practice');assert.equal(await page.locator('.question-row').count(),1);await nav('library');await action('bundled');await nav('home');
 assert.equal((await page.locator('.stat').first().locator('small').innerText()).trim(),`/ ${catalog.availableQuestions.toLocaleString('en-US')}`);checked('import preview/cancel, safe text and quoted IDs, IndexedDB persistence, bundled recovery');
 await action('settings');await page.locator('#font-size').selectOption('1.3');await action('theme');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await action('close-dialog');
 await shot('desktop-dark-largest');
 for(const size of [{width:320,height:568},{width:390,height:844},{width:568,height:320},{width:768,height:1024},{width:820,height:1180},{width:1024,height:768}]){
  await page.setViewportSize(size);assert.equal(await page.locator('.sidebar nav button:visible').count(),size.width<720?5:7);assert.equal(await page.locator('.sidebar [data-view="play"]:visible').count(),size.width<720?0:1);assert.equal(await page.locator('.play-header:visible').count(),1);for(const v of ['home','play','practice','cards','library','progress','saved']){if(v==='saved')await page.getByRole('button',{name:'Saved questions',exact:true}).click();else await nav(v);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${size.width}px overflow in ${v}`);checked('responsive destination',{size,view:v});}
  await nav('home');await shot(`${size.width}x${size.height}-dark-largest`);
 }
 assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(path.join(artifactDir,'report.json'),JSON.stringify(report,null,2));console.log(`PASS: ${report.checks.length} checks; v5.0.0, ${catalog.availableQuestions} active questions; bounded sessions, every-choice/source tabs, resume/reload, source scopes/search, deferred exams, stable new-card queue, separate recall ratings, three readers and saved pages, v1/v2/v3 restore preview/undo, import preview/IndexedDB persistence/safe text, dark large type, six viewports and seven destinations including Play. Report: ${artifactDir}/report.json`);await browser.close();
})().catch(async e=>{report.errors.push({fatal:e.stack});fs.writeFileSync(path.join(artifactDir,'report.json'),JSON.stringify(report,null,2));await testBrowser?.close();console.error(e);process.exitCode=1});
