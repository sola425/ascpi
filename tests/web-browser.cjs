// Test the packaged website at its GitHub Pages subpath with a real service worker.
// Browser speech APIs are mocked; no real audio or external service is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const base=process.env.WEB_APP_URL||'http://127.0.0.1:3001/ascpi/';
assert.equal(new URL(base).origin,'http://127.0.0.1:3001');
const root=path.resolve(__dirname,'..'),out='/tmp/labwise-web-test';
const bank=JSON.parse(fs.readFileSync(path.join(root,'data/study-bank.json')));
const byId=new Map(bank.map(q=>[q.id,q]));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/figures.json')));
const image=Object.values(manifest.figures)[0].path;
const photo=byId.get('boc-4-7');
const checks=[],errors=[],external=[];
let browser;
function mockBrowserSpeech(){
  window.__spoken=[];window.__recognition=null;
  const voice={voiceURI:'local-test-en',name:'Local test English',lang:'en-US',localService:true,default:true};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    getVoices:()=>[voice],addEventListener(){},removeEventListener(){},cancel(){},
    speak(utterance){window.__spoken.push(utterance.text);setTimeout(()=>utterance.onend?.(),0);}
  }});
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  window.SpeechRecognition=class{start(){window.__recognition=this;}abort(){if(window.__recognition===this)window.__recognition=null;}};
}
async function action(page,name){const s=`[data-action="${name}"]:visible`,m=page.locator(`#modal[open] ${s}`);await(await m.count()?m.first():page.locator(s).first()).click();}
async function hear(page,text){
  await page.waitForFunction(()=>!!window.__recognition);
  await page.evaluate(text=>{const result=[{transcript:text}];result.isFinal=true;window.__recognition.onresult({results:[result]});},text);
}
async function layout(page,label){
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' must not overflow');
  assert.deepEqual(await page.locator('button,.button,select').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).filter(e=>e.getBoundingClientRect().height<44).map(e=>e.id||e.textContent)),[]);
  checks.push(label);
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:375,height:812}});
  await context.addInitScript(mockBrowserSpeech);
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(new URL(base).origin)&&!request.url().startsWith('blob:'))external.push(request.url());});
  await page.goto(base+'web-test.html');
  await page.locator('#checks').getByText('Local progress storage',{exact:true}).waitFor();
  assert.match(await page.locator('#checks').innerText(),/Prepare first/);
  await page.locator('#prepare').click();
  await page.waitForFunction(()=>document.getElementById('offline-status').textContent.startsWith('Study files and pictures are saved'),undefined,{timeout:60000});
  assert.match(await page.locator('#checks').innerText(),/155 \/ 155 saved/);
  checks.push('actual service-worker installation caches the app, test page and all 155 pictures at /ascpi/');

  // A retry repairs files removed after installation; do not claim ready from API presence alone.
  await page.evaluate(async image=>{for(const name of await caches.keys()){const c=await caches.open(name);await c.delete(new URL(image,location.href));await c.delete(new URL('./host-ui.js',location.href));}},image);
  await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('refresh').disabled===false);
  assert.match(await page.locator('#checks').innerText(),/154 \/ 155 saved/);
  await page.locator('#prepare').click();
  await page.waitForFunction(()=>document.getElementById('offline-status').textContent.startsWith('Study files and pictures are saved'));
  assert.match(await page.locator('#checks').innerText(),/155 \/ 155 saved/);
  checks.push('offline readiness detects missing picture/module files and preparation repairs them');

  await page.locator('#speak').click();
  await page.waitForFunction(()=>document.getElementById('voice-status').textContent.startsWith('The reading service completed'));
  assert.ok(await page.evaluate(()=>window.__spoken.some(text=>text.startsWith('Welcome to Labwise'))));
  const privateWords='PRIVATE_BROWSER_SAMPLE_82f option B';
  await page.locator('#listen').click();await hear(page,privateWords);
  await page.waitForFunction(words=>document.getElementById('transcript').textContent===words,privateWords);
  const download=page.waitForEvent('download');await page.locator('#export').click();
  const diagnostic=JSON.parse(fs.readFileSync(await(await download).path()));
  assert.equal(diagnostic.questions,3760);assert.equal(diagnostic.picturesCached,155);
  assert.equal(diagnostic.liveSignInTested,false);assert.equal(diagnostic.deviceSpeechTested,false);
  assert.ok(!JSON.stringify(diagnostic).includes(privateWords));
  assert.ok(!await page.evaluate(words=>Object.keys(localStorage).some(key=>localStorage.getItem(key).includes(words)),privateWords));
  await page.locator('#stop').click();assert.equal(await page.locator('#transcript').innerText(),'');
  checks.push('browser speech adapter sample, cancellation and report/transcript privacy (mock providers)');

  await page.locator('#pdfs').click();
  await page.waitForFunction(()=>document.getElementById('offline-status').textContent.startsWith('All three PDFs are saved'),undefined,{timeout:60000});
  await context.setOffline(true);await page.reload();
  await page.locator('#checks').getByText('155 / 155 saved',{exact:true}).waitFor();
  assert.match(await page.locator('#checks').innerText(),/3 \/ 3 saved/);
  const pdf=await page.evaluate(async()=>{const r=await fetch('./docs/boc-1.pdf',{headers:{Range:'bytes=0-4'}});return{status:r.status,text:await r.text()};});
  assert.deepEqual(pdf,{status:206,text:'%PDF-'});
  checks.push('offline test-page reload, all PDFs and real cached PDF byte ranges');
  for(const viewport of [{width:320,height:568},{width:768,height:1024},{width:1024,height:768}]){
    await page.setViewportSize(viewport);await layout(page,`${viewport.width}×${viewport.height} test page`);
  }
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.setViewportSize({width:375,height:812});await layout(page,'dark phone test page');
  await page.screenshot({path:path.join(out,'device-checks-phone.png'),fullPage:true});

  await page.getByRole('link',{name:'Open Labwise',exact:true}).click();
  await page.waitForFunction(()=>window.labwiseAppReady===true);
  const skip=page.locator('#modal[open] [data-action="tour-skip"]');if(await skip.isVisible())await skip.click();
  const nav=name=>page.locator(`[data-view="${name}"]:visible`).first().click();
  await nav('practice');await page.locator('#practice-query').fill(photo.source);await page.locator(`.question-row[data-question="${photo.id}"]`).click();
  const picture=page.locator('.study .source-figure img').first();await picture.evaluate(img=>img.decode());
  assert.ok(await picture.evaluate(img=>img.getBoundingClientRect().width<=img.naturalWidth+1));
  await page.locator(`[data-answer="${photo.answer}"]`).click();await page.locator('.lesson').waitFor();
  await page.getByRole('tab',{name:'Book rationale',exact:true}).click();await page.locator('.original-rationale:visible').waitFor();
  assert.ok(await page.evaluate(id=>JSON.parse(localStorage.getItem('labwise-state')).records[id],photo.id));
  checks.push('packaged web app boots offline; real picture, answer, book rationale and local progress work');

  await nav('play');await action(page,'frenzy-restart');await action(page,'mode-confirm');
  await page.locator('.arcade-clock').waitFor();await page.locator('[data-arcade-answer="0"]').click();await page.locator('.arcade-feedback').waitFor();
  assert.equal(await page.locator('.arcade-clock').count(),0);
  checks.push('Frenzy starts offline and explanations remain untimed');

  await nav('play');await action(page,'host-open');await action(page,'host-setup');await action(page,'host-confirm-setup');
  await action(page,'host-voice-start');const consent=page.locator('#modal[open] [data-action="host-voice-consent"]');if(await consent.isVisible())await consent.click();
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-host-session-v1')).active.queue[0].id),q=byId.get(id);
  await hear(page,'option '+String.fromCharCode(65+q.answer));
  await page.waitForFunction(()=>!!window.__recognition);await hear(page,'yes');
  await page.locator('.host-recall').waitFor();await page.waitForFunction(()=>!!window.__recognition);
  const speech=await page.evaluate(()=>window.__spoken.join('\n'));
  assert.match(speech,/Your answer is correct according to the book/);assert.match(speech,/Here is the original book rationale/);assert.match(speech,/explain back what you learned/);
  await hear(page,'I compared the question and answer carefully.');await page.locator('.host-suggested').waitFor();
  await hear(page,'got it');await hear(page,'next');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('labwise-host-session-v1')).active.index),1);
  checks.push('complete browser-API Quiz Show voice/confirmation/rationale/teach-back/Next loop offline (mock providers)');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({environment:'Packaged site at /ascpi/, real offline caching, mocked browser speech, no live account service',checks,errors,external},null,2));
  console.log(`PASS: ${checks.length} web checks; real offline app/PDF/image behavior, responsive test center, browser speech orchestration and privacy. Actual microphone, voice quality and live accounts are not exercised. Report: ${out}/report.json`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
