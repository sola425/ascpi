import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHost,renderPracticeVoice} from '../host-ui.js';
const q={id:'practice-case',question:'A longer question',options:['<script>wrong()</script>','A useful answer'],answer:1,explanation:'Original source rationale',teaching:{quickCheck:{question:'What clue helped?',answer:'THE_MODEL_ANSWER'},explanation:'Simple explanation'}};

test('Practice offers its tutor on long questions without exposing feedback before an answer',()=>{
 const html=renderPracticeVoice({q:{...q,question:'Case detail. '.repeat(6000)}});
 assert.match(html,/Study with a voice tutor/);assert.match(html,/data-action="practice-voice-start"/);
 assert.doesNotMatch(html,/THE_MODEL_ANSWER|Original source rationale|practice-voice-options|hearts|lifelines|host-ladder/);
 assert.doesNotMatch(html,/id="host-|data-action="host-/);
});

test('Practice confirmation escapes source text and provides only namespaced actions',()=>{
 const html=renderPracticeVoice({q,conversation:{phase:'confirm',candidate:0,transcript:'<svg onload=bad()>',status:'listening',running:true}});
 assert.match(html,/class="host-confirmation"/);assert.match(html,/&lt;script&gt;wrong\(\)&lt;\/script&gt;/);assert.match(html,/&lt;svg onload=bad\(\)&gt;/);
 assert.match(html,/data-action="practice-voice-confirm"/);assert.match(html,/data-action="practice-voice-cancel-confirm"/);
 assert.match(html,/data-action="practice-voice-pause"/);assert.match(html,/id="practice-voice-transcript"/);
 assert.doesNotMatch(html,/<script>|<svg onload=bad|data-action="host-/);
});

test('a completed answer can be explored while voice is paused, and recall comparison waits for reveal',()=>{
 const paused=renderPracticeVoice({q,answered:true});
 assert.match(paused,/data-action="practice-voice-options"/);assert.match(paused,/data-action="practice-voice-rationale"/);assert.match(paused,/data-action="practice-voice-recall"/);
 const recall=renderPracticeVoice({q,answered:true,conversation:{phase:'recall'}});
 assert.match(recall,/What clue helped\?/);assert.match(recall,/data-action="practice-voice-reveal"/);assert.doesNotMatch(recall,/THE_MODEL_ANSWER/);
 const compare=renderPracticeVoice({q,answered:true,conversation:{phase:'compare'}});
 assert.match(compare,/class="host-suggested"/);assert.match(compare,/THE_MODEL_ANSWER/);assert.match(compare,/data-action="practice-voice-recall-good"/);
 const rated=renderPracticeVoice({q,answered:true,conversation:{phase:'compare'},recallRating:'good'});
 assert.match(rated,/Recall noted: you remembered the idea/);assert.doesNotMatch(rated,/data-action="practice-voice-recall-good"/);
});

test('a custom question without separate teaching compares against its supplied rationale',()=>{
 const custom={...q,teaching:undefined,explanation:'A source <mark>rationale</mark>'};
 const html=renderPracticeVoice({q:custom,answered:true,conversation:{phase:'compare'}});
 assert.match(html,/A source &lt;mark&gt;rationale&lt;\/mark&gt;/);assert.match(html,/Compare the ideas, then rate your recall/);
 assert.doesNotMatch(html,/<mark>/);
});

test('voice settings and unavailable-device fallbacks remain usable and uniquely labelled',()=>{
 const html=renderPracticeVoice({q,conversation:{voiceAvailable:false,micAvailable:false},settings:{rate:.8,autoListen:false,voiceId:'test'},voices:[{id:'test',name:'A <device> voice',locale:'en-US',network:true}]});
 for(const id of ['practice-voice-voice','practice-voice-rate','practice-voice-auto-listen','practice-voice-transcript'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/A &lt;device&gt; voice · en-US · online/);assert.match(html,/Use the choices or type a response/);
 assert.match(html,/data-action="practice-voice-submit"/);assert.doesNotMatch(html,/id="practice-voice-auto-listen" checked/);
 assert.match(html,/data-action="practice-voice-start" disabled/);
});

test('Quiz Show retains its original host controls and IDs',()=>{
 const html=renderHost({q,game:{active:{phase:'question',index:0,queue:[q],responses:[],topics:[],score:0,hearts:3}},conversation:{},summary:{questionCount:1}});
 assert.match(html,/id="host-voice-panel"/);assert.match(html,/id="host-transcript"/);assert.match(html,/data-action="host-voice-start"/);
 assert.match(html,/Start voice host/);assert.doesNotMatch(html,/practice-voice-/);
});
