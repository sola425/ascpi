import {matchSpokenChoice} from './voice.js';
import {createHostVoiceIO} from './host-voice.js';
const clean=text=>String(text||'').toLowerCase().replace(/[.!?,]/g,'').replace(/\s+/g,' ').trim().replace(/^(?:please|can you|could you|would you) /,'').replace(/ please$/,'');
const letter=index=>String.fromCharCode(65+index);
// Keep a single dialogue turn across provider-sized chunks, preserving all
// question/case text and listening only after the final chunk has finished.
// Short chunks also stay within the speech provider watchdog at gentle speed.
function speechChunks(text,maximum=2400){
 const parts=[];let start=0;
 while(start<text.length){let end=Math.min(start+maximum,text.length);
  if(end<text.length){if(/[\ud800-\udbff]/.test(text[end-1]))end--;let boundary=end;while(boundary>start+maximum/2&&!/\s/.test(text[boundary-1]))boundary--;if(boundary>start+maximum/2)end=boundary;}
  parts.push(text.slice(start,end));start=end;
 }return parts;
}
export function hostCommand(text){
 const s=clean(text);
 const groups={pause:['pause','stop','take a break'],repeat:['repeat','repeat question','read again','repeat that','read question','read the question'],next:['next','next question','next one','continue','go on'],yes:['yes','confirm','final answer','lock it in','yeah','yep','yes that is my final answer',"yes that's my final answer"],no:['no','change my answer','no change it','not my final answer'],fifty:['fifty fifty','fifty-fifty','50 50','50/50','50-50','use fifty fifty'],hint:['hint','clue','give me a clue'],skip:['skip','pass'],options:['options','explain choices','explain all choices'],rationale:['book rationale','original rationale'],recall:['why','ask why','tell me why','explain why','test me','try recall'],reveal:['reveal','show answer','tell me'],good:['got it','i remembered','i got it'],again:['review again','not yet','again']};
 return Object.keys(groups).find(k=>groups[k].includes(s))||null;
}
export function createHostDialogue({io,getContext,onChange=()=>{},onAnswer=()=>{},onNext=()=>{},onLifeline=()=>{},onRecall=()=>{},getSettings=()=>({})}={}){
 let generation=0,quiet=0,pendingKey='',disposed=false;
 let state={phase:'idle',status:'idle',transcript:'',candidate:null,error:'',running:false};
 const speech=io||createHostVoiceIO({onState:event=>emit({status:event.status}),onCapabilities:()=>Promise.resolve().then(()=>emit())});
 function emit(patch={}){if(disposed)return;state={...state,...patch};onChange(getState());}
 function getState(){const c=speech.capabilities();return {...state,micAvailable:c.recognitionAvailable,voiceAvailable:c.ttsAvailable,capabilities:c};}
 const contextKey=()=>{const c=getContext();return c?`${c.mode||'host'}:${c.roundId}:${c.index}:${c.phase}:${c.q?.id||''}`:'';};
 function pause(message='Voice paused. Your place is saved.'){generation++;speech.stop();emit({running:false,status:'paused',error:'',candidate:null,transcript:'',message});}
 async function say(text,thenListen=true){
  if(disposed)return false;
  const revision=++generation,key=contextKey();speech.stop();emit({status:'speaking',error:''});
  try{for(const chunk of speechChunks(text)){
    if(revision!==generation||key!==contextKey()||!state.running||disposed)return false;
    const ok=await speech.speak(chunk,getSettings());if(!ok&&revision===generation){pause();return false;}if(!ok||revision!==generation||key!==contextKey()||!state.running||disposed)return false;
   }
   emit({status:'ready'});if(thenListen&&getSettings().autoListen!==false&&speech.capabilities().recognitionAvailable)await listen();return true;
  }catch(error){if(revision!==generation)return false;if(error.code==='cancelled')pause();else emit({status:'error',error:error.message,running:false});}
 }
 async function listen(){
  if(disposed||!current())return;
  const revision=++generation,key=contextKey();speech.stop();emit({running:true,status:'listening',error:'',transcript:''});
  try{const text=await speech.listen({language:getSettings().language,onPartial:text=>{if(revision===generation&&key===contextKey())emit({transcript:text});}});
   if(revision!==generation||key!==contextKey())return;quiet=0;await submit(text);
  }catch(error){if(revision!==generation)return;if(error.code==='cancelled'){pause();return;}
   if(error.code==='silence'&&quiet++===0&&state.running){await say('I did not catch that. Say an option letter, repeat, or pause.');return;}
   emit({status:'error',running:false,error:error.message});}
 }
 function current(){const c=getContext();return c?.mode==='practice'&&c.phase==='complete'?null:c?.q;}
 function questionText(){const c=getContext(),q=current();if(!q)return 'Choose a question to begin.';return `Question ${c.index+1} of ${c.questionCount}. ${c.questionText||q.question}. ${q.needsSource?'Use the question visual on the screen. ':''}${q.context||q.sharedContext||''}. ${q.options.map((o,i)=>(c.hiddenChoices||[]).includes(i)?'':`Option ${letter(i)}. ${o}.`).filter(Boolean).join(' ')} Say an option letter or the answer. You can also say ${c.mode==='practice'?'repeat, hint, or pause':'repeat, hint, skip, or pause'}.`;}
 async function repeat(){if(!current())return;emit({phase:getContext().phase==='question'?'question':'ready',running:true,candidate:null});await say(questionText());}
 async function start(){if(!current())return;quiet=0;emit({running:true,error:'',transcript:''});if(getContext().phase==='question')await repeat();else if(getContext().phase==='complete'){emit({phase:'complete'});await say('Your round is complete. Every explanation is here to revisit.',false);}else await feedback();}
 async function choose(index){const c=getContext();if(c?.phase!=='question'||!Number.isInteger(index)||!c.q.options[index]||(c.hiddenChoices||[]).includes(index))return;generation++;speech.stop();pendingKey=contextKey();emit({phase:'confirm',candidate:index,error:''});if(state.running)await say(`You chose option ${letter(index)}. ${c.q.options[index]}. Is that your final answer? Say yes to confirm, or no to choose again.`);}
 async function confirm(){if(state.phase!=='confirm'||state.candidate===null)return;if(getContext()?.phase!=='question'||pendingKey!==contextKey()){pause();emit({phase:'idle'});return;}const index=state.candidate;generation++;speech.stop();emit({candidate:null,transcript:''});onAnswer(index);await feedback();}
 async function cancelConfirm(){generation++;speech.stop();emit({candidate:null,phase:'question',transcript:''});if(state.running)await say('Choose an option, or say repeat.');}
 async function feedback(){const c=getContext(),q=current(),key=contextKey();if(!q||c.phase==='question')return;emit({phase:'feedback',candidate:null,transcript:''});if(!state.running)return;
  const r=c.lastResponse,choice=Number.isInteger(r?.choice)&&r.choice>=0&&r.choice<q.options.length?r.choice:null;
  const graded=r?.skipped!==true&&choice!==null,correct=graded&&choice===q.answer;
  const result=r?.skipped?'You skipped this question. No answer was marked wrong.':graded?`Your answer is ${correct?'correct':'incorrect'} according to the book. You chose option ${letter(choice)}. ${q.options[choice]}.`:'Let us review the book answer.';
  const chosenReason=graded?q.teaching?.optionExplanations?.[choice]:'';
  const correctReason=graded&&!correct?q.teaching?.optionExplanations?.[q.answer]:'';
  const plain=q.teaching?.explanation;
  const text=[result,`The book's correct answer is option ${letter(q.answer)}. ${q.options[q.answer]}.`,
   chosenReason?`Why your chosen answer is ${correct?'correct':'wrong for this question'}. ${chosenReason}`:'',
   correctReason?`Why the correct answer fits. ${correctReason}`:'',
   q.explanation?`Here is the original book rationale. ${q.explanation}`:'',
   q.teaching?.questionInPlainEnglish?`In plain words, this question is asking: ${q.teaching.questionInPlainEnglish}`:'',
   plain&&plain.trim()!==q.explanation?.trim()?`A simpler explanation. ${plain}`:'',
   q.teaching?.sourceNote?`A note about the source. ${q.teaching.sourceNote}`:'',
   q.teaching?.memory||q.memory?`Memory cue. ${q.teaching?.memory||q.memory}`:''].filter(Boolean).join(' ');
  const finished=await say(text,false);if(!finished||!state.running||key!==contextKey())return;
  await askRecall();
 }
 async function askRecall(){const c=getContext();if(!current()||c.phase==='question')return;emit({phase:'recall',running:true,transcript:''});await say(`Now explain back what you learned from this question or its correction, in your own words. ${c.q.teaching?.quickCheck?.question||'What was the key idea you learned?'} You can say reveal if you need help, or next when you are ready to continue.`);}
 async function revealRecall(){const q=current();if(!q||getContext().phase==='question')return;emit({phase:'compare',running:true});await say(`Here is an answer to compare with your own. ${q.teaching?.quickCheck?.answer||q.options[q.answer]}. Compare the ideas. Say got it if you remembered, or review again if you want another look.`);}
 async function rateRecall(rating){if(!current()||!['compare','recall'].includes(state.phase)||getContext()?.phase==='question')return;onRecall(rating);emit({phase:'ready'});if(state.running)await say(rating==='again'?'We will revisit this idea. Say explain choices, repeat, or next when ready.':'Recall noted. Say next when you are ready.');}
 async function readOptions(){const q=current();if(!q)return;emit({running:true});if(getContext().phase==='question'){await repeat();return;}emit({phase:'ready'});await say(q.options.map((o,i)=>`Option ${letter(i)}. ${o}. ${q.teaching?.optionExplanations?.[i]||''}`).join(' '));}
 async function readRationale(){const q=current();if(!q||getContext().phase==='question')return;emit({phase:'ready',running:true});await say(`This is the original book rationale. ${q.explanation}. Say next, or why for a memory check.`);}
 async function next(){const before=getContext();if(!before||before.mode==='practice'&&before.phase==='complete')return;if(before.phase==='question'){if(state.running)await say(before.mode==='practice'?'Choose an answer before continuing. Say repeat or hint if you need help.':'Choose an answer first, or use the skip lifeline.');return;}generation++;speech.stop();onNext();emit({transcript:'',candidate:null});const after=getContext();if(!after||after.phase==='complete'){emit({phase:'complete'});if(state.running)await say(before.mode==='practice'?'Your practice session is complete. Review your results when you are ready.':'Your round is finished. Your score celebrates practice. Take your new connections with you.',false);if(before.mode==='practice')emit({running:false,status:'paused'});return;}if(state.running)await repeat();else emit({phase:'question'});}
 async function lifeline(type){const c=getContext();if(c?.phase!=='question')return;generation++;speech.stop();if(c.mode==='practice'&&type!=='hint'){emit({phase:'question',candidate:null});if(state.running)await say('Choose an answer before continuing. Say repeat or hint if you need help.');return;}const changed=onLifeline(type);if(changed===false){if(state.running)await say(c.mode==='practice'?'Choose an answer, or say repeat.':'That lifeline is not available for this question. Choose an answer, or say repeat.');return;}emit({phase:'question',candidate:null});if(type==='skip'){await feedback();return;}if(state.running)await say(type==='hint'?`Here is the question in plain words. ${current()?.teaching?.questionInPlainEnglish||current()?.question}.`:questionText());}
 async function submit(text){const c=getContext();if(!current())return;generation++;speech.stop();emit({transcript:String(text||'').slice(0,12000),error:''});const cmd=hostCommand(text);
  if(cmd==='pause'){pause();return;}if(cmd==='repeat'){await repeat();return;}if(cmd==='next'){await next();return;}
  if(['fifty','hint','skip'].includes(cmd)){await lifeline(cmd);return;}
  if(cmd==='options'){await readOptions();return;}if(cmd==='rationale'){await readRationale();return;}
  if(cmd==='recall'){if(c.phase==='question')await lifeline('hint');else await askRecall();return;}
  if(cmd==='reveal'&&c.phase!=='question'){await revealRecall();return;}
  if(state.phase==='confirm'&&cmd==='yes'){await confirm();return;}
  if(state.phase==='confirm'&&cmd==='no'){await cancelConfirm();return;}
  if(state.phase==='compare'&&['good','yes','again','no'].includes(cmd)){await rateRecall(['good','yes'].includes(cmd)?'good':'again');return;}
  if(state.phase==='recall'&&c.phase!=='question'){await revealRecall();return;}
  if(c.phase==='question'){const match=matchSpokenChoice(String(text).replace(/^(?:i think (?:it is|it's)|my final answer is|let(?:'s| us) go with|go with)\s+/i,''),c.q.options);if(match.index!==null){await choose(match.index);return;}if(state.running)await say('I could not match one choice. Say option A, option B, or repeat.');else emit({error:'Choose an option letter or tap an answer.'});return;}
  if(state.running)await say('Say next, why for a memory check, explain choices, or pause.');
 }
 function dispose(){if(disposed)return;pause();disposed=true;speech.dispose();}
 const guarded={start,pause,repeat,listen,submit,choose,confirm,cancelConfirm,feedback,readOptions,readRationale,askRecall,revealRecall,rateRecall,next,lifeline};return {...Object.fromEntries(Object.entries(guarded).map(([name,fn])=>[name,(...args)=>disposed?undefined:fn(...args)])),getState,dispose};
}
