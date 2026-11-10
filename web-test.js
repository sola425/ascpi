import {createHostVoiceIO} from './host-voice.js';

const $=id=>document.getElementById(id),base=new URL('./',location.href);
const at=path=>new URL(path,base).href;
const essentials=['web-test.html','web-test.js','web-test.css','index.html','compatibility.js','app.js','questions.js','learning.js','teaching.js','storage.js','sources.js','game.js','game-ui.js','game-sync.js','frenzy.js','arcade-ui.js','account-ui.js','sync.js','sync-model.js','sync-config.js','supabase-client.js','duel-client.js','voice.js','host-game.js','host-dialogue.js','host-voice.js','host-ui.js','figures.js','style.css','game.css','arcade.css','account.css','host.css','figures.css','onboarding.js','onboarding.css','icons.js','data/catalog.json','data/study-bank.json','data/study-pages.json','data/teaching.json','data/teaching-coverage.json','data/glossary.json','data/quiz-meta.json','data/figures.json'];
let catalog=null,coverage=null,figures=null,report=null,checking=false,voiceTurn=0;
let downloads=null;
const io=createHostVoiceIO({onCapabilities:showVoices});

function showVoices(cap){
  const selected=$('voice').value;
  $('voice').replaceChildren(new Option('Best available device voice',''));
  for(const v of cap.voices){$('voice').add(new Option(`${v.label} · ${v.locale}${v.network?' · online provider':' · device voice'}`,v.id));}
  if(cap.voices.some(v=>v.id===selected))$('voice').value=selected;
  $('speak').disabled=!cap.ttsAvailable;$('listen').disabled=!cap.recognitionAvailable;
}
async function json(path){const r=await fetch(at(path));if(!r.ok)throw Error('Unavailable');return r.json();}
function row(label,status,detail,tone='ok'){
  const li=document.createElement('li'),name=document.createElement('strong'),badge=document.createElement('span'),small=document.createElement('small');
  name.textContent=label;badge.className='badge';badge.dataset.tone=tone;badge.textContent=status;small.textContent=detail;li.append(name,badge,small);return li;
}
async function check(){
  if(checking)return;checking=true;$('refresh').disabled=true;
  try{
    report=null;
    [catalog,coverage,figures]=await Promise.all([json('data/catalog.json'),json('data/teaching-coverage.json'),json('data/figures.json')]);
    $('version').textContent=`Labwise ${catalog.version} · browser`;
    const secure=window.isSecureContext===true,storage=(()=>{const key=`labwise-web-check-${Date.now()}`;try{localStorage.setItem(key,'ok');const ok=localStorage.getItem(key)==='ok';localStorage.removeItem(key);return ok;}catch{return false;}})();
    const hasCache='caches'in window,registration='serviceWorker'in navigator?await navigator.serviceWorker.getRegistration(base.href):null;
    const cached=hasCache?await Promise.all(essentials.map(async path=>!!(await caches.match(at(path)))?.ok)):[];
    const core=cached.length===essentials.length&&cached.every(Boolean);
    const paths=[...new Set(Object.values(figures.figures).map(f=>f.path))];
    const pictures=hasCache?(await Promise.all(paths.map(async path=>!!(await caches.match(at(path)))?.ok))).filter(Boolean).length:0;
    const pdfs=hasCache?(await Promise.all(catalog.documents.map(async doc=>!!(await caches.match(at(doc.path)))?.ok))).filter(Boolean).length:0;
    const cap=io.capabilities();showVoices(cap);
    report={format:1,checkedAt:new Date().toISOString(),appVersion:catalog.version,questions:catalog.availableQuestions,optionExplanations:coverage.optionExplanations,secureContext:secure,localStorage:storage,serviceWorkerActive:!!registration?.active,coreFilesCached:cached.filter(Boolean).length,coreFilesChecked:essentials.length,picturesCached:pictures,pictureFiles:paths.length,pdfsCached:pdfs,pdfFiles:catalog.documents.length,speechAPI:cap.ttsAvailable,recognitionAPI:cap.recognitionAvailable,voicesListed:cap.voices.length,onlineHint:navigator.onLine,liveSignInTested:false,deviceSpeechTested:false};
    $('checks').replaceChildren(
      row('Secure browser connection',secure?'Ready':'HTTPS needed',secure?'Microphone and offline storage can be requested.':'Open the HTTPS website; ordinary HTTP on a phone cannot provide these features.',secure?'ok':'wait'),
      row('Local progress storage',storage?'Ready':'Unavailable',storage?'A temporary write/read succeeded; study history was not changed.':'Allow browser storage. Private browsing and storage limits can affect saving.',storage?'ok':'wait'),
      row('Offline study files',core&&registration?.active?'Saved':'Prepare first',`${cached.filter(Boolean).length} of ${essentials.length} study files are cached. Confirm offline behavior by disconnecting and reloading the app.`,core&&registration?.active?'ok':'wait'),
      row('Question pictures',`${pictures} / ${paths.length} saved`,pictures===paths.length?'All mapped picture files are cached. Original PDF resolution still limits detail.':'Prepare offline study to save the mapped pictures.',pictures===paths.length?'ok':'wait'),
      row('Original PDFs',`${pdfs} / ${catalog.documents.length} saved`,'Save PDFs separately, then test reading while disconnected.',pdfs===catalog.documents.length?'ok':'wait'),
      row('Reading aloud',cap.ttsAvailable?'Try the sample':'Unavailable',`${cap.voices.length} voices listed. Actual sound and offline availability need a device test.`,cap.ttsAvailable?'ok':'wait'),
      row('Spoken answers',cap.recognitionAvailable?'Try the sample':'Use taps or typing','Browser recognition often requires Internet. A listed API does not establish recognition quality.',cap.recognitionAvailable?'ok':'wait'),
      row('Accounts and Friend Duels','Test online','Sign-in, two-device sync and a two-account Duel need a live test in Labwise.','wait')
    );
  }catch{$('checks').replaceChildren(row('Study files','Could not load','Connect once and try again. If offline, first prepare the app while connected.','wait'));}
  finally{checking=false;$('refresh').disabled=false;}
}
async function prepare(){
  $('prepare').disabled=true;$('offline-status').textContent='Saving the app and pictures. Keep this page open…';
  try{
    if(!window.isSecureContext||!('serviceWorker'in navigator)||!('caches'in window))throw Error();
    const registration=await navigator.serviceWorker.register(at('sw.js'),{scope:base.href});
    const installing=registration.installing||registration.waiting;
    let timer;try{await Promise.race([(async()=>{
      if(installing&&installing.state!=='activated')await new Promise((resolve,reject)=>{
        const changed=()=>{if(installing.state==='activated'||installing.state==='redundant'){installing.removeEventListener('statechange',changed);installing.state==='activated'?resolve():reject(Error());}};
        installing.addEventListener('statechange',changed);changed();
      });
      await navigator.serviceWorker.ready;
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),60000);})]);}finally{clearTimeout(timer);}
    // Retry individual files that previously failed because of storage or connection.
    const names=(await caches.keys()).filter(name=>/^labwise-v\d+$/.test(name)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)));
    if(names.length){
      const cache=await caches.open(names[0]),manifest=figures||await json('data/figures.json');
      const paths=[...essentials,...new Set(Object.values(manifest.figures).map(f=>f.path).filter(path=>/^assets\/figures\/[a-f0-9]{24}\.webp$/.test(path)))];
      let next=0;
      await Promise.all(Array.from({length:4},async()=>{while(next<paths.length){const url=at(paths[next++]);try{if(!(await caches.match(url))?.ok)await cache.add(url);}catch{/* Report any remaining missing files below. */}}}));
    }
    await check();
    $('offline-status').textContent=report&&report.serviceWorkerActive&&report.coreFilesCached===report.coreFilesChecked&&report.picturesCached===report.pictureFiles?'Study files and pictures are saved. Now disconnect and reload Labwise to try them.':'Some files could not be saved. Check storage and connection, then try again.';
  }catch{$('offline-status').textContent='Offline preparation could not finish. Use HTTPS, allow browser storage and check your connection.';}
  finally{$('prepare').disabled=false;}
}
async function savePDFs(){
  if(downloads)return;$('pdfs').disabled=true;downloads=new AbortController();
  try{
    if(!catalog||!('caches'in window))throw Error();
    const cache=await caches.open('labwise-books-v2');
    for(const doc of catalog.documents){
      $('offline-status').textContent=`Saving ${doc.shortTitle}…`;
      if((await caches.match(at(doc.path)))?.ok)continue;
      const timer=setTimeout(()=>downloads?.abort(),120000);
      try{const response=await fetch(at(doc.path),{signal:downloads.signal});if(!response.ok)throw Error();await cache.put(at(doc.path),response);}finally{clearTimeout(timer);}
    }
    await check();$('offline-status').textContent='All three PDFs are saved. Test them in Library while disconnected.';
  }catch{$('offline-status').textContent='Some PDFs could not be saved. Earlier downloads are kept. Check storage and connection, then retry.';await check();}
  finally{downloads=null;$('pdfs').disabled=false;}
}
async function voice(kind){
  const turn=++voiceTurn;io.stop();$('transcript').textContent='';
  $('voice-status').textContent=kind==='speak'?'Reading the sample…':'Listening now. Say “option B”.';
  try{
    if(kind==='speak'){
      const done=await io.speak('Welcome to Labwise. Read, listen, and explain what you learned in your own words.',{voiceId:$('voice').value});
      if(turn===voiceTurn)$('voice-status').textContent=done?'The reading service completed. Did you hear it clearly? Try again while offline to check this voice.':'Reading paused.';
    }else{
      const words=await io.listen({onPartial:text=>{if(turn===voiceTurn)$('transcript').textContent=text;}});
      if(turn===voiceTurn){$('transcript').textContent=words;$('voice-status').textContent='Sample received. Check the words above; they are not saved or included in the report.';}
    }
  }catch(error){if(turn===voiceTurn)$('voice-status').textContent=error.message||'Speech could not finish. You can still tap or type in Labwise.';}
}
function stop(){voiceTurn++;io.stop();$('transcript').textContent='';$('voice-status').textContent='Voice is stopped.';}
function exportReport(){
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='labwise-browser-check.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('refresh').onclick=check;$('prepare').onclick=prepare;$('pdfs').onclick=savePDFs;$('export').onclick=exportReport;
$('speak').onclick=()=>voice('speak');$('listen').onclick=()=>voice('listen');$('stop').onclick=stop;
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stop();});
window.addEventListener('pagehide',()=>{downloads?.abort();io.stop();});
void check();
