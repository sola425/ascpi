import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostVoiceIO} from '../host-voice.js';

function harness(t,{native=false,browser=false,initializing=false}={}){
 const timers=new Map(),events=new Map(),docEvents=new Map(),calls=[],utterances=[],recognizers=[],states=[],caps=[];let next=0;
 const root={setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},addEventListener(name,fn){events.set(name,fn);},removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name);},document:{visibilityState:'visible',addEventListener(name,fn){docEvents.set(name,fn);},removeEventListener(name,fn){if(docEvents.get(name)===fn)docEvents.delete(name);}}};
 let nativeCaps={ttsAvailable:!initializing,initializing,recognitionAvailable:true,microphonePermission:false,permissionState:'notGranted',recognitionOnDevice:true,recognitionMayUseNetwork:false,selectedVoiceId:'native-local',voices:[{id:'native-local',name:'Local English',locale:'en-US',quality:400,network:false},{id:'native-network',name:'Online English',locale:'en-GB',quality:500,network:true}]};
 if(native)root.LabwiseAndroid={hostVoiceCapabilities(){calls.push({type:'capabilities'});return JSON.stringify(nativeCaps);},speakHost(text,token,voice,rate){calls.push({type:'speak',text,token,voice,rate});return true;},stopHostSpeech(){calls.push({type:'stop-speech'});},startHostListening(token,lang){calls.push({type:'listen',token,lang});return true;},stopHostListening(){calls.push({type:'stop-listen'});}};
 if(browser){
  const voices=[{voiceURI:'local-en',name:'English local',lang:'en-US',localService:true,default:true},{voiceURI:'network-en',name:'English Natural',lang:'en-GB',localService:false}];
  root.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  root.speechSynthesis={getVoices:()=>voices,speak(utterance){utterances.push(utterance);calls.push({type:'speak-browser'});},cancel(){calls.push({type:'cancel-browser'});},addEventListener(name,fn){events.set(name,fn);},removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name);}};
  root.SpeechRecognition=class{
   constructor(){recognizers.push(this);this.aborts=0;this.starts=0;}
   start(){this.starts++;calls.push({type:'listen-browser'});}
   abort(){this.aborts++;}
   result(text,{final=true}={}){const result=[{transcript:text}];result.isFinal=final;this.onresult?.({results:[result]});}
  };
 }
 const io=createHostVoiceIO({root,onState:s=>states.push(s),onCapabilities:c=>caps.push(c)});t.after(()=>io.dispose());
 return {root,io,timers,calls,states,caps,utterances,recognizers,events,docEvents,setCapabilities(value){nativeCaps={...nativeCaps,...value};},tick(delay){for(const [id,item]of [...timers])if(item.delay===delay){timers.delete(id);item.fn();}},last(type){return calls.findLast(c=>c.type===type);}};
}
const rejectsCode=(promise,code)=>assert.rejects(promise,error=>error.code===code&&typeof error.message==='string');

test('capability discovery prefers complete native bridge and never opens a microphone',t=>{
 const h=harness(t,{native:true,browser:true});const value=h.io.capabilities();
 assert.equal(value.kind,'native');assert.equal(value.ttsAvailable,true);assert.equal(value.recognitionOnDevice,true);assert.equal(value.recognitionMayUseNetwork,false);
 assert.equal(value.voices[1].network,true);assert.equal(value.voices[1].quality,500);assert.equal(value.selectedVoiceId,'native-local');
 assert.deepEqual(h.calls.map(c=>c.type),['capabilities']);assert.deepEqual(h.states,[]);
});

test('native initialization polling is bounded, reports changes and stops on disposal',t=>{
 const h=harness(t,{native:true,initializing:true});assert.equal(h.io.capabilities().initializing,true);assert.equal(h.timers.size,1);
 h.tick(250);h.setCapabilities({initializing:false,ttsAvailable:true});h.tick(250);
 assert.equal(h.caps.at(-1).ttsAvailable,true);assert.equal(h.timers.size,0);assert.equal(h.calls.some(c=>c.type==='listen'),false);
 h.io.dispose();assert.equal(h.timers.size,0);
});

test('native speech waits for its final callback and cancellation cannot complete a newer turn',async t=>{
 const h=harness(t,{native:true});let firstDone=false;
 const first=h.io.speak('First question',{voiceId:'native-local',rate:3});first.then(()=>firstDone=true);const firstCall=h.last('speak');
 assert.equal(firstCall.rate,1.3);h.root.labwiseNativeHostSpeech(firstCall.token,{status:'start'});await Promise.resolve();assert.equal(firstDone,false);
 const second=h.io.speak('Second question');assert.equal(await first,false);const secondCall=h.last('speak');
 h.root.labwiseNativeHostSpeech(firstCall.token,{status:'end'});assert.notEqual(secondCall.token,firstCall.token);
 h.root.labwiseNativeHostSpeech(secondCall.token,{status:'end'});assert.equal(await second,true);assert.equal(h.timers.size,0);
 assert.equal(h.states.at(-1).status,'idle');
});

test('native listening returns final text once and partial text does not resolve the answer',async t=>{
 const h=harness(t,{native:true}),partials=[];let done=false;
 const answer=h.io.listen({language:'en-GB',onPartial:text=>partials.push(text)});answer.then(()=>done=true);const call=h.last('listen');
 assert.equal(call.lang,'en-GB');h.root.labwiseNativeHostResult(call.token,{status:'partial',text:' option '});await Promise.resolve();assert.equal(done,false);assert.deepEqual(partials,['option']);
 h.root.labwiseNativeHostResult(call.token,{status:'result',text:' option B '});assert.equal(await answer,'option B');
 h.root.labwiseNativeHostResult(call.token,{status:'result',text:'option A'});assert.equal(h.timers.size,0);assert.equal(h.states.at(-1).status,'idle');
});

test('native errors are sanitized and permission, language, network and silence remain distinct',async t=>{
 const h=harness(t,{native:true});
 for(const [code,expected]of [['permission-denied','permission'],['network','network'],['language-unavailable','language'],['recognition-unavailable','unavailable'],['no-speech','silence'],['timeout','silence']]){
  const answer=h.io.listen();const failed=rejectsCode(answer,expected);h.root.labwiseNativeHostResult(h.last('listen').token,{status:'error',code,message:'Private provider diagnostics and transcript'});await failed;
 }
 const speech=h.io.speak('A short explanation'),failed=rejectsCode(speech,'error');h.root.labwiseNativeHostSpeech(h.last('speak').token,{status:'error',code:'timeout'});await failed;
 assert.equal(h.timers.size,0);
});

test('native and browser operations are mutually exclusive across instances sharing a page',async t=>{
 const h=harness(t,{native:true});const other=createHostVoiceIO({root:h.root});t.after(()=>other.dispose());
 const first=h.io.speak('Read this question');const answer=other.listen();assert.equal(await first,false);
 const cancelled=rejectsCode(answer,'cancelled');const next=h.io.speak('Read the question again');await cancelled;
 h.root.labwiseNativeHostSpeech(h.last('speak').token,{status:'end'});assert.equal(await next,true);
});

test('browser speech chunks long text without changing it or splitting surrogate pairs',async t=>{
 const h=harness(t,{browser:true}),text=('A short sentence. '.repeat(180))+'👩‍🔬'+('x'.repeat(2900));
 const spoken=h.io.speak(text,{voiceId:'network-en',rate:.1,language:'en-GB'});
 assert.ok(h.utterances.length>1);assert.equal(h.utterances.map(u=>u.text).join(''),text);
 for(const utterance of h.utterances){assert.ok(utterance.text.length<=2800);assert.equal(utterance.voice.voiceURI,'network-en');assert.equal(utterance.rate,.7);assert.equal(utterance.lang,'en-GB');assert.equal(/[\ud800-\udbff]$/.test(utterance.text),false);}
 let done=false;spoken.then(()=>done=true);h.utterances.at(-1).onend();await Promise.resolve();assert.equal(done,false);
 for(const utterance of h.utterances.slice(0,-1))utterance.onend();assert.equal(await spoken,true);assert.equal(h.timers.size,0);
});

test('browser recognition gives interim editing hints, final text and a bounded single input turn',async t=>{
 const h=harness(t,{browser:true}),partials=[];const answer=h.io.listen({language:'en-NG',onPartial:t=>partials.push(t)}),recognition=h.recognizers[0];
 assert.equal(recognition.lang,'en-NG');assert.equal(recognition.continuous,false);assert.equal(recognition.interimResults,true);assert.equal(recognition.starts,1);
 recognition.result('A partial answer',{final:false});assert.deepEqual(partials,['A partial answer']);
 recognition.result('My final answer');assert.equal(await answer,'My final answer');assert.equal(recognition.aborts,1);assert.equal(h.recognizers.length,1);assert.equal(h.timers.size,0);
});

test('browser denial, no speech and a bounded timeout require a deliberate next attempt',async t=>{
 const h=harness(t,{browser:true});
 let answer=h.io.listen(),failed=rejectsCode(answer,'permission');h.recognizers.at(-1).onerror({error:'not-allowed',message:'private details'});await failed;
 answer=h.io.listen();failed=rejectsCode(answer,'silence');h.recognizers.at(-1).onend();await failed;
 answer=h.io.listen();failed=rejectsCode(answer,'silence');h.tick(30000);await failed;
 assert.equal(h.recognizers.length,3);assert.equal(h.timers.size,0);
});

test('backgrounding cancels audio, ignores late callbacks and leaves no microphone or timers',async t=>{
 const h=harness(t,{native:true});const answer=h.io.listen(),failed=rejectsCode(answer,'cancelled'),token=h.last('listen').token;
 h.root.document.visibilityState='hidden';h.docEvents.get('visibilitychange')();await failed;
 h.root.labwiseNativeHostResult(token,{status:'result',text:'option A'});assert.equal(h.timers.size,0);assert.equal(h.last('stop-listen').type,'stop-listen');
  await rejectsCode(h.io.listen(),'cancelled');assert.equal(h.calls.filter(call=>call.type==='listen').length,1);
  h.root.document.visibilityState='visible';
 const speech=h.io.speak('A question');h.events.get('pagehide')();assert.equal(await speech,false);assert.equal(h.timers.size,0);
});

test('missing/incomplete providers reject cleanly and discovery alone has no capture side effect',async t=>{
 const h=harness(t);h.root.LabwiseAndroid={startVoiceInput(){throw Error('Old external provider should not be used');}};
 assert.equal(h.io.capabilities().kind,'none');assert.equal(h.io.capabilities().ttsAvailable,false);
 await rejectsCode(h.io.speak('Question'),'unavailable');await rejectsCode(h.io.listen(),'unavailable');assert.equal(h.timers.size,0);
 assert.equal(await h.io.speak(' '),false);await rejectsCode(h.io.speak('x'.repeat(24001)),'error');
});

test('dispose restores prior callbacks and prevents stale results from affecting another controller',async t=>{
 const previous=[];const h=harness(t,{native:true});h.io.dispose();
 h.root.labwiseNativeHostSpeech=(token,payload)=>previous.push({token,payload});const old=h.root.labwiseNativeHostSpeech;
 const io=createHostVoiceIO({root:h.root});const speech=io.speak('Read once');const callback=h.root.labwiseNativeHostSpeech,token=h.last('speak').token;io.dispose();assert.equal(await speech,false);assert.equal(h.root.labwiseNativeHostSpeech,old);
 callback(token,{status:'end'});assert.deepEqual(previous,[]);await rejectsCode(io.listen(),'cancelled');
});
