import test from 'node:test';
import assert from 'node:assert/strict';
import {examChallengeSetup,renderExamChallenge} from '../exam-challenge-ui.js';
const q={id:'ui-q',topic:'A <topic>',question:'Which <label> matches?',options:['Wrong <script>answer</script>','Correct answer','Other','Last'],answer:1,source:'A <source>',explanation:'SOURCE_REASON',teaching:{questionInPlainEnglish:'A <plain> clue',optionExplanations:['WHY_WRONG','WHY_RIGHT','Other reason','Last reason']}};
const active={phase:'question',index:0,total:50,topics:['A <topic>'],responses:[]};
const summary={active,total:50,index:0,answered:0,correct:0,prize:0,banked:0,nextPrize:400,nextCheckpointAt:10,nextCheckpointPrize:40000,best:{50:120000,100:50000},history:[],hiddenChoices:[],lifelines:{fifty:false,hint:false,swap:false},canSwap:true};
test('setup requires enough unique questions for the chosen exact size',()=>{
 const topics=[{name:'First',count:40},{name:'Second',count:60}];const small=examChallengeSetup({topics,selected:['First']});assert.match(small.footer,/exam-challenge-confirm" disabled/);assert.match(small.body,/40 eligible/);assert.match(small.body,/Choose at least 50/);
 const full=examChallengeSetup({topics,total:100});assert.match(full.body,/value="100" selected/);assert.doesNotMatch(full.footer,/exam-challenge-confirm" disabled/);assert.match(full.body,/100 different questions/);assert.match(full.body,/exam-challenge-topics-all/);assert.match(full.body,/exam-challenge-topics-clear/);
 assert.match(examChallengeSetup({topics,selected:[]}).body,/0 eligible/);
});
test('welcome identifies separate device records and virtual stakes',()=>{
 const html=renderExamChallenge({summary:{best:{50:120000,100:50000}}});for(const text of ['50-question challenge','100-question challenge','$120,000','$50,000','on this device','no cash value'])assert.ok(html.includes(text));assert.doesNotMatch(html,/leaderboard|global rank|Who Wants/i);
});
test('unanswered source content is escaped and visuals remain with its question',()=>{
 const html=renderExamChallenge({q,summary,visualsHTML:'<div data-source-table="verified">Original input</div>'});assert.match(html,/Which &lt;label&gt; matches/);assert.match(html,/Wrong &lt;script&gt;answer&lt;\/script&gt;/);assert.match(html,/A &lt;topic&gt;/);assert.match(html,/data-source-table="verified"/);assert.doesNotMatch(html,/<script>|SOURCE_REASON|WHY_WRONG|WHY_RIGHT/);assert.match(html,/data-action="exam-challenge-bank" disabled/);assert.match(html,/Your 50-question best/);assert.match(html,/\$120,000/);assert.match(html,/data-exam-challenge-answer="3"/);
});
test('lifelines render supplied state without exposing an answer rationale',()=>{
 const html=renderExamChallenge({q,summary:{...summary,hiddenChoices:[0,3],hintShown:true,lifelines:{fifty:true,hint:true,swap:false},canSwap:false}});assert.match(html,/data-exam-challenge-answer="0" hidden disabled/);assert.doesNotMatch(html,/data-exam-challenge-answer="1" hidden/);assert.match(html,/data-exam-challenge-lifeline="fifty" disabled/);assert.match(html,/data-exam-challenge-lifeline="swap" disabled/);assert.match(html,/No reserve question/);assert.match(html,/A &lt;plain&gt; clue/);assert.doesNotMatch(html,/SOURCE_REASON|WHY_RIGHT/);
});
test('a terminal miss keeps explanations before explicit result navigation',()=>{
 const html=renderExamChallenge({q,summary:{...summary,active:{...active,phase:'feedback'},lastResponse:{choice:0,correct:false},terminal:true,answered:1},lessonHTML:'<section class="lesson">SOURCE_REASON</section>',visualsHTML:'<div data-original-visual>Original</div>'});assert.match(html,/exam-challenge-feedback is-missed/);assert.match(html,/WHY_WRONG/);assert.match(html,/SOURCE_REASON/);assert.match(html,/data-original-visual/);assert.match(html,/See my result/);assert.doesNotMatch(html,/class="exam-challenge-results"|data-exam-challenge-answer/);
});
test('results show final payout rather than the unbanked peak; history stays newest first',()=>{
 const s={...summary,active:{...active,phase:'complete',reason:'wrong'},answered:11,correct:10,prize:50000,banked:40000,payout:40000,history:[{total:50,correct:10,payout:40000},{total:100,correct:5,payout:10000}]};const html=renderExamChallenge({summary:s});assert.match(html,/class="exam-challenge-results"[\s\S]*?<h2>\$40,000<\/h2>/);assert.match(html,/10 correct answers · 11 questions answered/);assert.match(html,/exam-challenge-review/);assert.ok(html.indexOf('<strong>$40,000</strong>')<html.indexOf('<strong>$10,000</strong>'));assert.doesNotMatch(html,/data-exam-challenge-answer/);
});
