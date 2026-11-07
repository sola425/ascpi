// Test the actual service worker, cached PDFs and recovery when persistence fails.
const assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const url=process.env.APP_URL||'http://127.0.0.1:3000';await p.goto(url);await p.getByRole('heading',{name:'Make room for a little discovery.'}).waitFor();
 await p.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
 await p.locator('[data-view="library"]:visible').first().click();
 for(const id of ['textbook','boc1','boc2']){
  await p.locator('#reader-document').selectOption(id);await p.locator('[data-action="cache-pdf"]').click();await p.getByRole('button',{name:'✓ Available offline',exact:true}).waitFor({timeout:60000});
 }
 await c.setOffline(true);await p.reload();await p.getByRole('heading',{name:'A whole shelf of understanding.'}).waitFor();
 const offline=await p.evaluate(async()=>{
  const catalog=await(await fetch('./data/catalog.json')).json(),bank=await(await fetch('./data/study-bank.json')).json(),teaching=await(await fetch('./data/teaching.json')).json(),result=[];
  for(const d of catalog.documents){const r=await fetch('./'+d.path,{headers:{Range:'bytes=0-4'}});result.push({id:d.id,status:r.status,text:await r.text()});}
  const bad=await fetch('./docs/boc-1.pdf',{headers:{Range:'bytes=999999999-'}});
  return {active:catalog.availableQuestions,questions:bank.length,notes:Object.keys(teaching).length,result,bad:bad.status};
 });assert.equal(offline.questions,3760);assert.equal(offline.active,offline.questions);assert.equal(offline.notes,offline.questions);assert.deepEqual(offline.result.map(r=>[r.status,r.text]),[[206,'%PDF-'],[206,'%PDF-'],[206,'%PDF-']]);assert.equal(offline.bad,416);
 await p.locator('[data-view="practice"]:visible').first().click();await p.locator('.question-row').first().click();await p.locator('[data-answer="0"]').click();await p.locator('.lesson').waitFor();assert.equal(await p.locator('.option-lesson').count(),4);await c.setOffline(false);await c.close();
 const broken=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await broken.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage quota exceeded','QuotaExceededError')}});const q=await broken.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(url);await q.getByRole('heading',{name:'Make room for a little discovery.'}).waitFor();await q.locator('[data-view="practice"]:visible').first().click();await q.locator('.question-row').first().click();await q.locator('[data-answer="0"]').click();await q.locator('#persistent-notice .banner').waitFor();assert.match(await q.locator('#persistent-notice').innerText(),/Export/);await q.locator('[data-action="pause"]').click();assert.equal(await q.locator('#persistent-notice .banner').count(),1);await q.locator('[data-view="library"]:visible').first().click();assert.equal(await q.locator('#persistent-notice .banner').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: actual SW offline reload, all active questions/teaching available offline, three cached PDFs serving byte ranges, invalid range 416, offline practice feedback, persistent export prompt on storage failure without a crash.');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
