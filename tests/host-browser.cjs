// Actual app with mock Android speech; generic labels only, no real audio.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const appURL=process.env.APP_URL||'http://127.0.0.1:3000',dir='/tmp/labwise-host-loop-v8';
const appVersion=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'))).version;
assert.equal(new URL(appURL).origin,'http://127.0.0.1:3000');
const PRIVATE_RECALL='PRIVATE_RECALL_7f3b I compared the label and the choices.',PRIVATE_CORRECT_RECALL='PRIVATE_CORRECT_RECALL_42e8 I matched the blue label.',PRIVATE_EDIT='PRIVATE_EDIT_65a2 my unfinished answer';
const fixtures=['Host labels','Host patterns'].flatMap((topic,g)=>Array.from({length:6},(_,i)=>({
 id:`host-fixture-${g}-${i}`,topic,bookId:i%2?'boc7':'success4',documentId:i%2?'boc1':'textbook',answerDocumentId:i%2?'boc1':'textbook',page:1,answerPage:1,
 question:`Which choice matches label ${g}-${i}?`,options:['Amber label','Blue label','Coral label','Dune label'],answer:1,source:'Original generic host fixture',explanation:'Original rationale: the blue choice matches the stated label.',
 teaching:{questionInPlainEnglish:'Compare the label and the four choices.',explanation:'The blue label matches this question. Compare before deciding.',
 optionExplanations:['Amber does not match.','Blue matches the label.','Coral differs from the label.','Dune differs from the label.'],memory:'Read, compare, match.',quickCheck:{question:'What comparison helped you choose?',answer:'Compare the label with the available choices.'}}
})));
const byId=new Map(fixtures.map(q=>[q.id,q]));
// Use one unchanged, supplied BOC hematology photograph to verify real mapping.
const bundled=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/study-bank.json')));
const teaching=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/teaching.json')));
const figureManifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/figures.json')));
const photoRaw=bundled.find(q=>q.id==='boc-4-7');
assert.ok(photoRaw,'The reviewed BOC hematology photo fixture must remain available');
const photo={...photoRaw,teaching:teaching[photoRaw.id]};
const photoFigures=figureManifest.questions[photo.id].figureIds.map(id=>figureManifest.figures[id]).filter(f=>f.reveal==='question');
assert.ok(photoFigures.some(f=>f.method==='embedded-image-inside-question'),'Use a photograph embedded beside the original question');
const photoFixtures=[fixtures[0],photo,{...fixtures[1],id:'host-unmapped-visual',topic:'Unmapped visual',question:'Which label is shown in the drawing?',needsSource:true}];
const host=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('labwise-host-session-v1'))),progress=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state'))||{log:[],records:{},saved:[]});
async function action(p,name){const s=`[data-action="${name}"]:visible`,m=p.locator(`#modal[open] ${s}`);await(await m.count()?m.first():p.locator(s).first()).click()}
const nav=(p,name)=>p.locator(`[data-view="${name}"]:visible`).first().click();
function mockSpeech(version){
 window.__hostSpoken=[];window.__hostListens=[];window.__hostExports=[];window.__hostSpeech=null;window.__hostListen=null;window.__hostHold=false;window.__hostStops=0;
 window.LabwiseAndroid={version:()=>version,takeReadingPosition:()=> 'null',openDocument:()=>{},openUpdates:()=>{},exportJSON:(name,text)=>window.__hostExports.push({name,data:JSON.parse(text)}),
 hostVoiceCapabilities:()=>JSON.stringify({ttsAvailable:true,recognitionAvailable:true,initializing:false,microphonePermission:true,permissionState:'granted',recognitionOnDevice:true,recognitionMayUseNetwork:false,selectedVoiceId:'mock-natural-en',voices:[{id:'mock-natural-en',name:'Test natural English',locale:'en-US',quality:500,network:false}]}),
 speakHost:(text,token,voiceId,rate)=>{window.__hostSpoken.push({text,token,voiceId,rate});window.__hostSpeech=token;setTimeout(()=>{if(!window.__hostHold&&window.__hostSpeech===token)window.labwiseNativeHostSpeech(token,{status:'end'})},0);return true},
 stopHostSpeech:()=>{window.__hostSpeech=null;window.__hostStops++},startHostListening:(token,language)=>{window.__hostListens.push({token,language});window.__hostListen=token;return true},stopHostListening:()=>{window.__hostListen=null;window.__hostStops++}};
}
async function ready(p){await p.waitForFunction(()=>{const h=document.querySelector('#content h1');return h&&!/Opening your study space|could not load/i.test(h.textContent)},undefined,{timeout:20000});const skip=p.locator('#modal[open] [data-action="tour-skip"]');if(await skip.isVisible())await skip.click()}
async function listen(p){await p.waitForFunction(()=>!!window.__hostListen,undefined,{timeout:8000})}
async function hear(p,text){await listen(p);const token=await p.evaluate(text=>{const t=window.__hostListen;window.labwiseNativeHostResult(t,{status:'result',text});return t},text);await p.waitForFunction(t=>window.__hostListen!==t,token)}
async function startVoice(p){await action(p,'host-voice-start');const c=p.locator('#modal[open] [data-action="host-voice-consent"]');if(await c.isVisible())await c.click();await listen(p)}
const spoken=p=>p.evaluate(()=>window.__hostSpoken.map(s=>s.text).join('\n'));
async function layout(p,label,report){
 const found=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,small:[...document.querySelectorAll('#content .host button,#content .host select,#content .host textarea,#content .host summary,#content .host input,#content .host a[href]')].flatMap(e=>{
  if(e.hidden||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden')return[];const target=e.matches('input[type="checkbox"]')?e.closest('label'):e,r=target.getBoundingClientRect();return r.width+.1<44||r.height+.1<44?[{tag:e.tagName,text:(e.textContent||e.id).trim().slice(0,60),width:r.width,height:r.height}]:[]})}));
 report.layouts.push({label,...found});assert.ok(found.overflow<=1,`${label}: horizontal overflow`);assert.deepEqual(found.small,[],`${label}: interactive targets >=44px`);
}
async function shot(p,name,report){const file=path.join(dir,name+'.png');await p.screenshot({path:file,fullPage:true});report.screenshots.push(file)}
let browser;
(async()=>{
 fs.mkdirSync(dir,{recursive:true});const report={environment:'Actual app, mock Android speech; no real audio or external requests.',checks:[],layouts:[],screenshots:[],errors:[],externalRequests:[]},checked=name=>report.checks.push(name);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 async function setup(viewport,options={},bank=fixtures,makeRound=true){
  const context=await browser.newContext({viewport,serviceWorkers:'block',...options});await context.addInitScript(mockSpeech,appVersion);const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==new URL(appURL).origin){report.externalRequests.push(r.request().url());return r.abort()}return r.continue()});
  await p.goto(appURL);await ready(p);assert.equal(await p.evaluate(()=>window.__hostSpoken.length+window.__hostListens.length),0);
  await p.locator('#bank-input').setInputFiles({name:'host-original-labels.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions:bank}))});await p.getByRole('heading',{name:'Use this collection?',exact:true}).waitFor();await action(p,'confirm-import');await p.locator('#modal').waitFor({state:'hidden'});
  await nav(p,'play');await action(p,'host-open');if(!makeRound)return{context,p};await action(p,'host-setup');await p.locator('[name="host-topic"]').first().waitFor();
  assert.equal(await p.locator('[name="host-topic"]:checked').count(),2);await action(p,'host-topic-clear');assert.equal(await p.locator('[data-action="host-confirm-setup"]').isDisabled(),true);await p.locator('[name="host-topic"]').first().check();assert.equal(await p.locator('[data-action="host-confirm-setup"]').isEnabled(),true);await action(p,'host-topic-all');await p.locator('#host-limit').selectOption('5');await action(p,'host-confirm-setup');await p.locator('[data-host-answer="0"]').waitFor();assert.equal((await host(p)).active.queue.length,5);return{context,p};
 }
 const {context,p}=await setup({width:320,height:568});checked('tour and topic All/Clear/minimum stay silent');
 await layout(p,'320-question',report);await startVoice(p);let saved=await host(p);const firstId=saved.active.queue[0].id,before=(await progress(p)).log.length;
 assert.match(await spoken(p),/Question 1 of 5/);assert.match(await spoken(p),/Option A/);assert.equal((await spoken(p)).includes(byId.get(firstId).teaching.explanation),false);
 await hear(p,'option B');await listen(p);assert.equal((await host(p)).active.responses.length,0);assert.equal((await progress(p)).log.length,before);await p.locator('.host-confirmation').waitFor();assert.match(await spoken(p),/final answer/);
 const correctStart=await p.evaluate(()=>window.__hostSpoken.length);
 await hear(p,'yes');await p.locator('.host-feedback').waitFor();await p.locator('.host-recall').waitFor();await listen(p);saved=await host(p);assert.equal(saved.active.responses.length,1);assert.equal(saved.active.score,100);assert.equal(saved.active.hearts,3);assert.equal(saved.active.index,0);
 const correctSpeech=await p.evaluate(start=>window.__hostSpoken.slice(start).map(s=>s.text).join('\n'),correctStart),first=byId.get(firstId);
 assert.match(correctSpeech,/Your answer is correct according to the book/);assert.match(correctSpeech,/Why your chosen answer is correct/);assert.ok(correctSpeech.includes(first.teaching.optionExplanations[1]));assert.ok(correctSpeech.includes(first.explanation));assert.ok(correctSpeech.includes(first.teaching.explanation));assert.ok(correctSpeech.indexOf('Here is the original book rationale.')<correctSpeech.indexOf('A simpler explanation.'));assert.match(correctSpeech,/explain back what you learned.*in your own words/);assert.equal(correctSpeech.includes(first.teaching.quickCheck.answer),false);
 const correctReviews=(await progress(p)).log.filter(e=>e.kind==='review').length;
 await hear(p,PRIVATE_CORRECT_RECALL);await p.locator('.host-suggested').waitFor();await listen(p);assert.equal((await progress(p)).log.filter(e=>e.kind==='review').length,correctReviews);assert.ok((await spoken(p)).includes(first.teaching.quickCheck.answer));await hear(p,'got it');await listen(p);assert.equal((await host(p)).active.recalls[firstId].rating,'good');assert.equal((await host(p)).active.index,0);
 checked('read → spoken answer → separate yes → explicit correct result/choice reason/book rationale → teach-back and self-rating on the first question; no automatic Next');
 await layout(p,'320-correct-feedback',report);
 await hear(p,'next');await listen(p);assert.equal((await host(p)).active.index,1);await hear(p,'option A');await listen(p);const wrongStart=await p.evaluate(()=>window.__hostSpoken.length);await hear(p,'yes');await p.locator('.host-recall').waitFor();await listen(p);
 saved=await host(p);const wrongId=saved.active.responses[1].id;assert.equal(saved.active.hearts,2);assert.equal(saved.active.index,1);assert.ok((await spoken(p)).includes(byId.get(wrongId).teaching.quickCheck.question));
 const wrongSpeech=await p.evaluate(start=>window.__hostSpoken.slice(start).map(s=>s.text).join('\n'),wrongStart),wrong=byId.get(wrongId);
 assert.match(wrongSpeech,/Your answer is incorrect according to the book/);assert.match(wrongSpeech,/You chose option A/);assert.match(wrongSpeech,/Why your chosen answer is wrong for this question/);assert.ok(wrongSpeech.includes(wrong.teaching.optionExplanations[0]));assert.match(wrongSpeech,/Why the correct answer fits/);assert.ok(wrongSpeech.includes(wrong.teaching.optionExplanations[1]));assert.ok(wrongSpeech.includes(wrong.explanation));assert.match(wrongSpeech,/explain back what you learned.*in your own words/);
 const reviews=(await progress(p)).log.filter(e=>e.kind==='review').length;await hear(p,PRIVATE_RECALL);await p.locator('.host-suggested').waitFor();await listen(p);assert.equal((await progress(p)).log.filter(e=>e.kind==='review').length,reviews);assert.ok((await spoken(p)).includes(byId.get(wrongId).teaching.quickCheck.answer));await hear(p,'got it');await listen(p);
 saved=await host(p);assert.equal(saved.active.recalls[wrongId].rating,'good');assert.equal(saved.active.index,1);assert.equal(saved.active.score,100);checked('wrong result explains the chosen option and book answer, then free recall comparison and explicit self-rating');
 await hear(p,'next');await listen(p);const readCount=await p.evaluate(()=>window.__hostSpoken.length);await hear(p,'repeat');await listen(p);assert.ok(await p.evaluate(()=>window.__hostSpoken.length)>readCount);
 await hear(p,'fifty fifty');await listen(p);saved=await host(p);assert.equal(saved.active.lifelines.fifty,true);assert.equal(await p.locator('[data-host-answer]:visible').count(),2);assert.equal(saved.active.hiddenChoices.includes(1),false);
 await hear(p,'hint');await p.locator('.host-hint').waitFor();await listen(p);assert.equal((await host(p)).active.lifelines.hint,true);
 const beforeSkip=(await progress(p)).log.length;await hear(p,'skip');await p.locator('.host-feedback.is-skipped').waitFor();await listen(p);saved=await host(p);assert.equal(saved.active.responses[2].skipped,true);assert.equal(saved.active.hearts,2);assert.equal((await progress(p)).log.length,beforeSkip);
 await hear(p,'reveal');await p.locator('.host-suggested').waitFor();await listen(p);await hear(p,'review again');await listen(p);checked('spoken repeat/50-50/hint/skip/reveal; no heart or incorrect attempt from skip');
 await hear(p,'next');await listen(p);saved=await host(p);assert.equal(saved.active.index,3);const stale=await p.evaluate(()=>window.__hostListen);
 await hear(p,'pause');await p.locator('#host-voice-panel[data-host-voice-state="paused"]').waitFor();await p.evaluate(t=>window.labwiseNativeHostResult(t,{status:'result',text:'option B'}),stale);assert.equal((await host(p)).active.responses.length,3);
 await p.reload();await ready(p);await p.locator('[data-host-answer="1"]').waitFor();assert.equal((await host(p)).active.id,saved.active.id);assert.equal((await host(p)).active.index,3);assert.equal(await p.evaluate(()=>window.__hostSpoken.length+window.__hostListens.length),0);checked('pause cancels old callbacks; reload resumes saved round silently');
 await startVoice(p);const hiddenToken=await p.evaluate(()=>window.__hostListen),stops=await p.evaluate(()=>window.__hostStops);
 await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))});await p.locator('#host-voice-panel[data-host-voice-state="paused"]').waitFor();assert.ok(await p.evaluate(()=>window.__hostStops)>stops);await p.evaluate(t=>window.labwiseNativeHostResult(t,{status:'result',text:'yes'}),hiddenToken);assert.equal((await host(p)).active.responses.length,3);await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))});checked('background stops recognition and stale result grading');
 await startVoice(p);await hear(p,'option B');await listen(p);await p.evaluate(()=>{window.__hostHold=true});await hear(p,'yes');await p.locator('.host-feedback').waitFor();await p.waitForFunction(()=>!!window.__hostSpeech);
 await p.getByRole('tab',{name:'Every choice',exact:true}).click();await p.locator('.host-voice-settings summary').click();await p.locator('.host-transcript-editor summary').click();await p.locator('#host-transcript').fill(PRIVATE_EDIT);
 await p.evaluate(()=>window.labwiseNativeHostSpeech(window.__hostSpeech,{status:'end'}));await p.waitForFunction(()=>document.querySelector('.host-voice-settings')?.open&&document.querySelector('#host-transcript')?.value.includes('PRIVATE_EDIT_65a2'));
 assert.equal(await p.getByRole('tab',{name:'Every choice'}).getAttribute('aria-selected'),'true');assert.equal(await p.locator('#host-transcript').inputValue(),PRIVATE_EDIT);assert.equal(await p.locator('#host-transcript').evaluate(e=>document.activeElement===e),true);
 await p.evaluate(()=>{window.__hostHold=false;if(window.__hostSpeech)window.labwiseNativeHostSpeech(window.__hostSpeech,{status:'end'})});await listen(p);checked('speech updates preserve lesson tab, open settings and focused unsent transcript');await shot(p,'320-voice-feedback',report);
 await hear(p,'next');await listen(p);await hear(p,'option B');await listen(p);await hear(p,'yes');await p.locator('.host-feedback').waitFor();await listen(p);saved=await host(p);assert.equal(saved.active.index,4);assert.equal(saved.active.phase,'feedback');assert.equal(saved.active.score,300);assert.equal(saved.active.hearts,2);assert.equal(await p.locator('.host-results').count(),0);
 await hear(p,'next');await p.locator('.host-results').waitFor();assert.equal((await host(p)).active.phase,'complete');await layout(p,'320-complete',report);checked('final explanation waits for spoken Next before results');
 await nav(p,'progress');await action(p,'backup');const privacy=await p.evaluate(()=>({local:Object.keys(localStorage).map(k=>localStorage.getItem(k)).join('\n'),backup:JSON.stringify(window.__hostExports.at(-1))}));for(const secret of[PRIVATE_RECALL,PRIVATE_CORRECT_RECALL,PRIVATE_EDIT]){assert.equal(privacy.local.includes(secret),false);assert.equal(privacy.backup.includes(secret),false)}checked('correct/wrong recall and unfinished transcript never enter persisted progress/session/backups');await context.close();
 for(const viewport of[{width:568,height:320},{width:768,height:1024}]){
  const other=await setup(viewport,{colorScheme:'dark',reducedMotion:'reduce'}),p=other.p;await p.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.style.setProperty('--font-scale','1.3')});await layout(p,`${viewport.width}-question-dark-large`,report);
  await startVoice(p);await hear(p,'option A');await listen(p);await hear(p,'yes');await p.locator('.host-recall').waitFor();await listen(p);await layout(p,`${viewport.width}-recall-dark-large`,report);await hear(p,'reveal');await p.locator('.host-suggested').waitFor();await listen(p);await layout(p,`${viewport.width}-compare-dark-large`,report);await shot(p,`${viewport.width}-dark-large-feedback`,report);
  assert.equal(await p.locator('.host-voice-panel').evaluate(e=>getComputedStyle(e).animationName),'none');checked(`${viewport.width}×${viewport.height} dark/large/reduced-motion question, recall and comparison`);await other.context.close();
 }
 const visual=await setup({width:768,height:1024},{},photoFixtures,false),vp=visual.p;
 const rawVisualPool=await vp.evaluate(async bank=>{const{eligibleHostQuestions}=await import('./host-game.js');return eligibleHostQuestions(bank,{includeVisual:true}).map(q=>q.id)},photoFixtures);
 assert.ok(rawVisualPool.includes(photo.id)&&rawVisualPool.includes('host-unmapped-visual'),'The negative-control item is engine-eligible but has no verified picture');
 await action(vp,'host-setup');await vp.locator('[name="host-topic"]').first().waitFor();
 assert.deepEqual(await vp.locator('[name="host-topic"]').evaluateAll(es=>es.map(e=>e.value)),['Host labels']);
 assert.match(await vp.locator('#host-setup-count').innerText(),/1 eligible/);
 await vp.locator('#host-visual').check();await vp.locator('[name="host-topic"][value="Hematology"]').waitFor();
 assert.deepEqual(new Set(await vp.locator('[name="host-topic"]').evaluateAll(es=>es.map(e=>e.value))),new Set(['Host labels','Hematology']));
 assert.equal(await vp.locator('[name="host-topic"][value="Unmapped visual"]').count(),0);
 await action(vp,'host-topic-clear');await vp.locator('[name="host-topic"][value="Hematology"]').check();
 assert.match(await vp.locator('#host-setup-count').innerText(),/1 eligible/);await action(vp,'host-confirm-setup');
 const inline=vp.locator('.host-question .source-figure img').first();await inline.waitFor();
 await inline.evaluate(img=>img.decode());
 const visualState=await host(vp);assert.equal(visualState.active.queue.length,1);assert.equal(visualState.active.queue[0].id,photo.id);
 assert.equal(JSON.parse(visualState.active.queue[0].fingerprint)[3],photo.answer);assert.equal(visualState.active.responses.length,0);
 assert.equal(visualState.active.phase,'question');assert.equal(visualState.active.score,0);
 assert.equal((await vp.locator('.host-question .question-text').innerText()).replace(/\s+/g,' ').trim(),photo.question.replace(/\s+/g,' ').trim());
 assert.equal(await vp.locator('[data-host-answer]').count(),photo.options.length);
 for(let i=0;i<photo.options.length;i++)assert.ok((await vp.locator(`[data-host-answer="${i}"]`).innerText()).replace(/\s+/g,' ').includes(photo.options[i].replace(/\s+/g,' ')));
 const imageSource=(await inline.getAttribute('src')).replace(/^\.\//,'');assert.ok(photoFigures.some(f=>f.path===imageSource));
 assert.ok(await inline.evaluate(img=>img.complete&&img.naturalWidth>0));
 assert.equal(await vp.locator('.source-layout,.question-screenshot,.source-figure-layout').count(),0);
 assert.equal(await vp.locator('.host-feedback').count(),0);assert.equal(await vp.evaluate(()=>window.__hostSpoken.length+window.__hostListens.length),0);
 await layout(vp,'768-original-photo-question',report);await vp.locator('#toast.visible').waitFor({state:'hidden',timeout:8000});await shot(vp,'768-original-photo-question',report);
 await vp.locator('.host-question .source-figure-open').first().click();await vp.locator('#figure-zoom-image').waitFor();
 assert.equal((await vp.locator('#figure-zoom-image').getAttribute('src')).replace(/^\.\//,''),imageSource);
 await action(vp,'figure-actual');assert.equal(await vp.locator('#figure-zoom-image').evaluate(e=>e.style.width),photoFigures.find(f=>f.path===imageSource).width+'px');
 await action(vp,'figure-fit');await vp.locator('#figure-zoom-image').evaluate(e=>e.decode());
 assert.ok(await vp.locator('#figure-zoom-image').evaluate(e=>e.getBoundingClientRect().width<=Math.min(e.naturalWidth,e.parentElement.clientWidth)+1),'Fit must preserve source size instead of stretching the photograph.');await action(vp,'close-dialog');
 assert.equal((await host(vp)).active.queue[0].id,photo.id);assert.equal((await host(vp)).active.responses.length,0);
 assert.equal(await vp.evaluate(()=>window.__hostSpoken.length+window.__hostListens.length),0);
 checked('picture opt-in adds the verified BOC photograph, excludes an unmapped visual, preserves question/key, and supports silent zoom');await visual.context.close();
 const languageCase=await setup({width:390,height:844}),lp=languageCase.p;
 await lp.locator('.host-voice-settings summary').click();await lp.locator('#host-rate').selectOption('1.15');
 await action(lp,'settings');await lp.locator('#voice-language').selectOption('en-GB');await action(lp,'close-dialog');
 assert.equal(await lp.evaluate(()=>JSON.parse(localStorage.getItem('labwise-ui-v4')).hostVoice.language),'en-US','Retain the stale per-voice setting as a negative control');
 await action(lp,'host-listen');await listen(lp);
 assert.equal(await lp.evaluate(()=>window.__hostListens.at(-1).language),'en-GB','The current app recognition language must override old voice preferences');
 checked('changing recognition language after voice preferences reaches the device recognizer');await languageCase.context.close();
 assert.deepEqual(report.errors,[],'No uncaught app errors');assert.deepEqual(report.externalRequests,[],'No remote voice or Auth requests');fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`PASS: ${report.checks.length} integrated Quiz Show checks and ${report.layouts.length} layouts; no app errors or external requests. Report: ${dir}/report.json`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()});
