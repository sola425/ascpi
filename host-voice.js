// Foreground speech transport. Audio and transcripts are never persisted here.
const routers=new WeakMap();
let sequence=0;
const messages={unavailable:'Speech is unavailable. Use the on-screen controls.',permission:'Allow microphone access, or use the buttons.',network:'The speech service could not connect.',silence:'No answer was heard. Choose Listen when ready.',language:'Choose an installed voice language.',cancelled:'Voice is paused.',error:'The device speech service could not finish.'};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const language=value=>typeof value==='string'&&/^[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,6}$/i.test(value)?value:'en-US';
const trimText=(value,maximum=12000)=>{
 if(typeof value!=='string')return '';
 let text=value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').trim();
 if(text.length>maximum){let end=maximum;if(/[\ud800-\udbff]/.test(text[end-1]))end--;text=text.slice(0,end);}return text;
};
function speechError(code){const error=new Error(messages[code]||messages.error);error.code=code;return error;}
function classify(code,speaking=false){
 const value=String(code||'').toLowerCase();
 return /permission|not.allowed|denied/.test(value)?'permission':/network|server/.test(value)?'network':/cancel|abort|background|interrupted/.test(value)?'cancelled':/language/.test(value)?'language':/unavailable|not.supported|no.service|not.installed/.test(value)?'unavailable':/no.speech|no.match|timeout/.test(value)?speaking?'error':'silence':'error';
}
function nativeBridge(root){
 const bridge=root.LabwiseAndroid;
 return bridge&&['hostVoiceCapabilities','speakHost','stopHostSpeech','startHostListening','stopHostListening'].every(name=>typeof bridge[name]==='function')?bridge:null;
}
function routerFor(root){
 let router=routers.get(root);if(router){router.users++;return router;}
 const handlers=new Map(),oldSpeech=root.labwiseNativeHostSpeech,oldResult=root.labwiseNativeHostResult;
 const dispatch=kind=>(token,payload)=>{
  const callback=handlers.get(token);
  if(callback)callback(kind,payload);
  else if(typeof token==='string'&&!token.startsWith('lwhost_')){const previous=kind==='speech'?oldSpeech:oldResult;if(typeof previous==='function')previous(token,payload);}
 };
 router={users:1,owner:null,handlers,oldSpeech,oldResult,speech:dispatch('speech'),result:dispatch('result')};
 root.labwiseNativeHostSpeech=router.speech;root.labwiseNativeHostResult=router.result;routers.set(root,router);return router;
}
function splitSpeech(text,maximum=2800){
 const chunks=[];let start=0;
 while(start<text.length){
  let end=Math.min(text.length,start+maximum);
  if(end<text.length){if(/[\ud800-\udbff]/.test(text[end-1]))end--;let boundary=end;while(boundary>start+maximum/2&&!/\s/.test(text[boundary-1]))boundary--;if(boundary>start+maximum/2)end=boundary;}
  chunks.push(text.slice(start,end));start=end;
 }return chunks;
}

/** Speak and listen are separate turns; the host owns conversation and scoring. */
export function createHostVoiceIO({root=globalThis,onState=()=>{},onCapabilities=()=>{}}={}){
 const router=routerFor(root),bridge=nativeBridge(root),synth=root.speechSynthesis;
 const BrowserRecognition=root.SpeechRecognition||root.webkitSpeechRecognition;
 const timeout=root.setTimeout?.bind(root)||globalThis.setTimeout.bind(globalThis),clear=root.clearTimeout?.bind(root)||globalThis.clearTimeout.bind(globalThis);
 let disposed=false,active=null,capabilityTimer=null,capabilityAttempts=0,lastCapabilities='',voiceListener=null;
 const emit=value=>{try{onState(value);}catch{/* UI listeners do not own device speech. */}};
 const notify=value=>{const encoded=JSON.stringify(value);if(encoded!==lastCapabilities){lastCapabilities=encoded;try{onCapabilities(value);}catch{/* Capability observers cannot start a microphone. */}}};
 function capabilities(){
  let value={};
  if(bridge){try{const raw=bridge.hostVoiceCapabilities();value=typeof raw==='string'?JSON.parse(raw):raw;if(!object(value))value={};}catch{value={};}}
  const browserVoices=!bridge&&synth&&typeof synth.getVoices==='function'?(()=>{try{return synth.getVoices()||[];}catch{return [];}})():[];
  const rawVoices=bridge&&Array.isArray(value.voices)?value.voices:browserVoices;
  const voices=rawVoices.slice(0,200).filter(v=>v&&typeof (bridge?v.id:v.voiceURI||v.name)==='string').map(v=>({
   id:String(bridge?v.id:v.voiceURI||v.name).slice(0,256),name:String(v.name||v.id||'Device voice').slice(0,256),
   label:String(v.label||v.name||v.id||'Device voice').slice(0,512),locale:language(v.locale||v.lang||'en-US'),
   network:bridge?v.network===true:v.localService===false,quality:Number.isFinite(v.quality)?Math.max(0,Math.min(500,v.quality)):0,default:v.default===true
  }));
  const result={kind:bridge?'native':synth||BrowserRecognition?'browser':'none',ttsAvailable:bridge?value.ttsAvailable===true:!!synth&&typeof synth.speak==='function'&&typeof root.SpeechSynthesisUtterance==='function',recognitionAvailable:bridge?value.recognitionAvailable===true:typeof BrowserRecognition==='function',initializing:bridge&&value.initializing===true,
   microphonePermission:bridge?value.microphonePermission===true:null,permissionState:bridge?String(value.permissionState||'notGranted'):'unknown',recognitionOnDevice:bridge&&value.recognitionOnDevice===true,recognitionMayUseNetwork:bridge?value.recognitionMayUseNetwork!==false:true,
   selectedVoiceId:typeof value.selectedVoiceId==='string'?value.selectedVoiceId.slice(0,256):voices.find(v=>v.default)?.id||'',voices};
  notify(result);
  if(bridge&&!result.ttsAvailable&&!disposed&&capabilityTimer===null&&capabilityAttempts<60){capabilityTimer=timeout(()=>{capabilityTimer=null;capabilityAttempts++;capabilities();},250);}
  else if(result.ttsAvailable&&capabilityTimer!==null){clear(capabilityTimer);capabilityTimer=null;}
  return result;
 }
 function finish(turn,{value,error,cancelled=false}={}){
  if(active!==turn||turn.settled)return;
  turn.settled=true;active=null;router.handlers.delete(turn.token);if(turn.timer!==null)clear(turn.timer);
  if(turn.recognition){turn.recognition.onresult=null;turn.recognition.onerror=null;turn.recognition.onend=null;try{turn.recognition.abort();}catch{/* Provider already ended. */}}
  if(bridge){try{if(turn.kind==='speaking')bridge.stopHostSpeech();else bridge.stopHostListening();}catch{/* A stopped bridge is already inactive. */}}
  else if(turn.kind==='speaking'&&synth){try{synth.cancel();}catch{/* Browser service already stopped. */}}
  if(router.owner===api)router.owner=null;emit({status:'idle',kind:bridge?'native':'browser'});
  if(cancelled&&turn.kind==='speaking')turn.resolve(false);
  else if(error||cancelled)turn.reject(error||speechError('cancelled'));
  else turn.resolve(value);
 }
 function stop(){if(active)finish(active,{cancelled:true});}
 function begin(kind){
  stop();if(disposed||root.document?.visibilityState==='hidden')throw speechError('cancelled');if(router.owner&&router.owner!==api)router.owner.stop();router.owner=api;
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const turn={kind,token:`lwhost_${Date.now().toString(36)}_${(++sequence).toString(36)}`,resolve,reject,promise,settled:false,timer:null,recognition:null};active=turn;
  emit({status:kind,kind:bridge?'native':'browser'});return turn;
 }
 function speak(text,{voiceId='',rate=1,language:locale='en-US'}={}){
  if(typeof text!=='string'||!text.trim())return Promise.resolve(false);
  if(text.length>24000)return Promise.reject(speechError('error'));
  const speed=Number.isFinite(rate)?Math.max(.7,Math.min(1.3,rate)):1;
  let turn;try{turn=begin('speaking');}catch(error){return Promise.reject(error);}
  turn.timer=timeout(()=>finish(turn,{error:speechError('error')}),Math.min(330000,Math.max(45000,text.length*100/speed+20000)));
  if(bridge){
   router.handlers.set(turn.token,(kind,payload)=>{
    if(kind!=='speech'||!object(payload))return;
    if(payload.status==='end')finish(turn,{value:true});
    else if(payload.status==='error'){const code=classify(payload.code,true);finish(turn,code==='cancelled'?{cancelled:true}:{error:speechError(code)});}
   });
   try{if(bridge.speakHost(text,turn.token,typeof voiceId==='string'?voiceId.slice(0,256):'',speed)!==true)finish(turn,{error:speechError('unavailable')});}
   catch{finish(turn,{error:speechError('unavailable')});}
   return turn.promise;
  }
  if(!synth||typeof synth.speak!=='function'||typeof root.SpeechSynthesisUtterance!=='function'){finish(turn,{error:speechError('unavailable')});return turn.promise;}
  const current=(()=>{try{return synth.getVoices?.()||[];}catch{return [];}})();
  let selected=null;
  if(voiceId){selected=current.find(v=>(v.voiceURI||v.name)===voiceId);if(!selected){finish(turn,{error:speechError('unavailable')});return turn.promise;}}
  else{const matching=current.filter(v=>String(v.lang||'').toLowerCase().startsWith(language(locale).split('-')[0].toLowerCase()));selected=matching.find(v=>v.default)||matching.find(v=>/natural|neural/i.test(v.name||''))||matching[0]||null;}
  try{
   synth.cancel();const chunks=splitSpeech(text),ended=new Set();turn.utterances=[];
   chunks.forEach((chunk,index)=>{
    const utterance=new root.SpeechSynthesisUtterance(chunk);utterance.rate=speed;utterance.lang=language(locale);if(selected)utterance.voice=selected;
    utterance.onend=()=>{if(active!==turn)return;ended.add(index);if(ended.size===chunks.length)finish(turn,{value:true});};
    utterance.onerror=event=>{if(active!==turn)return;const code=classify(event?.error,true);finish(turn,code==='cancelled'?{cancelled:true}:{error:speechError(code)});};
    turn.utterances.push(utterance);synth.speak(utterance);
   });
  }catch{finish(turn,{error:speechError('error')});}
  return turn.promise;
 }
 function listen({language:locale='en-US',onPartial=()=>{}}={}){
  let turn;try{turn=begin('listening');}catch(error){return Promise.reject(error);}
  let lastPartial='';const partial=text=>{if(active!==turn)return;const clean=trimText(text);if(clean&&clean!==lastPartial){lastPartial=clean;try{onPartial(clean);}catch{/* Editing hints never submit an answer. */}}};
  turn.timer=timeout(()=>finish(turn,{error:speechError('silence')}),30000);
  if(bridge){
   router.handlers.set(turn.token,(kind,payload)=>{
    if(kind!=='result'||!object(payload))return;
    if(payload.status==='partial')partial(payload.text);
    else if(payload.status==='result'){const text=trimText(payload.text);finish(turn,text?{value:text}:{error:speechError('silence')});}
    else if(payload.status==='error'||payload.status==='cancelled')finish(turn,{error:speechError(payload.status==='cancelled'?'cancelled':classify(payload.code))});
   });
   try{if(bridge.startHostListening(turn.token,language(locale))!==true)finish(turn,{error:speechError('unavailable')});}
   catch{finish(turn,{error:speechError('unavailable')});}
   return turn.promise;
  }
  if(typeof BrowserRecognition!=='function'){finish(turn,{error:speechError('unavailable')});return turn.promise;}
  try{
   const recognition=new BrowserRecognition();turn.recognition=recognition;recognition.lang=language(locale);recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=3;
   recognition.onresult=event=>{
    if(active!==turn)return;const final=[],interim=[];
    for(let index=0;index<Math.min(event?.results?.length||0,30);index++){const result=event.results[index],text=trimText(result?.[0]?.transcript);if(text)(result.isFinal?final:interim).push(text);}
    if(final.length){const text=trimText(final.join(' '));finish(turn,{value:text});}else partial(interim.join(' '));
   };
   recognition.onerror=event=>finish(turn,{error:speechError(classify(event?.error))});
   recognition.onend=()=>finish(turn,{error:speechError('silence')});recognition.start();
  }catch{finish(turn,{error:speechError('unavailable')});}
  return turn.promise;
 }
 const hidden=()=>{if(root.document?.visibilityState==='hidden')stop();};
 root.document?.addEventListener?.('visibilitychange',hidden);root.addEventListener?.('pagehide',stop);
 voiceListener=()=>{capabilityAttempts=0;if(!disposed)capabilities();};synth?.addEventListener?.('voiceschanged',voiceListener);
 function dispose(){
  if(disposed)return;stop();disposed=true;if(capabilityTimer!==null){clear(capabilityTimer);capabilityTimer=null;}
  root.document?.removeEventListener?.('visibilitychange',hidden);root.removeEventListener?.('pagehide',stop);synth?.removeEventListener?.('voiceschanged',voiceListener);
  if(--router.users===0){if(root.labwiseNativeHostSpeech===router.speech)root.labwiseNativeHostSpeech=router.oldSpeech;if(root.labwiseNativeHostResult===router.result)root.labwiseNativeHostResult=router.oldResult;routers.delete(root);}
 }
 const api={capabilities,speak,listen,stop,dispose};return api;
}
