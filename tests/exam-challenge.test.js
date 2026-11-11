import test from 'node:test';
import assert from 'node:assert/strict';
import {blankExamChallenge,validateExamChallenge,startExamChallenge,answerExamChallenge,nextExamChallenge,useExamLifeline,bankExamChallenge,examChallengeSummary,examChallengePrize,eligibleExamQuestions} from '../exam-challenge.js';
const bank=Array.from({length:125},(_,i)=>({id:'exam-'+i,topic:i%2?'Hematology':'Chemistry',bookId:'success4',documentId:'textbook',page:i+1,question:'Choose the matching label for source case '+i+'?',context:i===0?'Shared observations. '.repeat(1000):'',options:['Amber','Blue','Coral','Dune'],answer:i%4,explanation:'Compare every label with the case.'}));
const copy=v=>JSON.parse(JSON.stringify(v));
const start=(total=50,runId='round-1',more={})=>startExamChallenge(blankExamChallenge(),bank,{total,runId,seed:4,now:1000,...more});
const current=s=>bank.find(q=>q.id===s.active.queue[s.active.index].id);
const right=(s,now=2000)=>answerExamChallenge(s,bank,current(s).answer,{now});
function correctThrough(s,count){let now=2000;for(let i=0;i<count;i++){s=right(s,now++);if(i<count-1)s=nextExamChallenge(s,bank,{now:now++});}return {s,now};}

test('exact 50/100 unique source-ready questions and deterministic scope selection',()=>{
 for(const total of [50,100]){const s=start(total),again=start(total);assert.equal(s.active.queue.length,total);assert.equal(new Set(s.active.queue.map(q=>q.id)).size,total);assert.deepEqual(s,again);assert.equal(s.active.reserve.length,10);assert.equal(s.active.phase,'question');assert.equal(s.active.prize,0);}
 const selected=start(50,'scope',{topics:['Chemistry'],bookId:'success4'});assert.ok(selected.active.queue.every(q=>q.topic==='Chemistry'&&q.bookId==='success4'));
 assert.throws(()=>start(100,'too-few',{topics:['Chemistry']}),/provide 100 distinct/);assert.throws(()=>start(75),/settings/);
 assert.equal(eligibleExamQuestions([...bank,bank[0]]).some(q=>q.id===bank[0].id),false);
 const long={...bank[0],question:'A longer case. '.repeat(900)};assert.ok(eligibleExamQuestions([long]).length);
 assert.notDeepEqual(start(50,'different').active.queue,start().active.queue);
});

test('answer gives feedback once; explicit Next controls the learning pace and restore is exact',()=>{
 const original=start(),s=right(original);assert.equal(original.active.responses.length,0);assert.equal(s.active.responses.length,1);assert.equal(s.active.phase,'feedback');assert.equal(s.active.index,0);assert.equal(s.active.prize,400);assert.equal(s.active.banked,0);
 assert.deepEqual(answerExamChallenge(s,bank,0,{now:2100}),s);assert.deepEqual(validateExamChallenge(copy(s),bank),s);assert.deepEqual(nextExamChallenge(original,bank,{now:2100}),original);
 const next=nextExamChallenge(s,bank,{now:2200});assert.equal(next.active.index,1);assert.equal(next.active.phase,'question');assert.equal(next.active.responses.length,1);
 assert.deepEqual(answerExamChallenge(original,bank,null,{now:2000}),original);assert.deepEqual(answerExamChallenge(original,bank,99,{now:2000}),original);
});

test('wrong answer ends at previous ten-question checkpoint and keeps terminal explanation',()=>{
 let {s,now}=correctThrough(start(),12);s=nextExamChallenge(s,bank,{now:now++});const q=current(s);s=answerExamChallenge(s,bank,(q.answer+1)%4,{now:now++});
 assert.equal(s.active.phase,'feedback');assert.equal(s.active.reason,'wrong');assert.equal(s.active.responses.length,13);assert.equal(s.active.prize,examChallengePrize(12,50));assert.equal(s.active.banked,examChallengePrize(10,50));assert.equal(s.completed.length,1);assert.equal(s.completed[0].payout,40000);
 assert.equal(examChallengeSummary(s,bank).terminal,true);assert.equal(examChallengeSummary(s,bank).best[50],40000);
 const done=nextExamChallenge(s,bank,{now:now++});assert.equal(done.active.phase,'complete');assert.equal(examChallengeSummary(done,bank).prize,40000);
 assert.deepEqual(answerExamChallenge(done,bank,q.answer,{now:now++}),done);assert.deepEqual(bankExamChallenge(s,bank,{now:now++}),s);assert.deepEqual(validateExamChallenge(copy(done),bank),done);
});

test('banking protects current amount without a fabricated answer or duplicate record',()=>{
 let {s,now}=correctThrough(start(),3);s=nextExamChallenge(s,bank,{now:now++});s=useExamLifeline(s,bank,'fifty',{now:now++});s=bankExamChallenge(s,bank,{now:now++});
 assert.equal(s.active.phase,'complete');assert.equal(s.active.responses.length,3);assert.equal(s.active.reason,'banked');assert.equal(s.completed[0].payout,3600);assert.equal(s.records[50].payout,3600);assert.ok(validateExamChallenge(copy(s),bank).active);
 assert.deepEqual(bankExamChallenge(s,bank,{now:now++}),s);assert.deepEqual(nextExamChallenge(s,bank,{now:now++}),s);
 const untouched=bankExamChallenge(start(100,'empty-bank'),bank,{now:2000});assert.equal(untouched.completed[0].answered,0);assert.equal(untouched.completed[0].payout,0);
});

test('50/50 retains the answer, clue and swap are once each, and reserves do not repeat',()=>{
 let s=start();const before=current(s),originalIDs=new Set(s.active.queue.map(q=>q.id));s=useExamLifeline(s,bank,'fifty',{now:1100});assert.equal(s.active.hiddenChoices.length,2);assert.ok(!s.active.hiddenChoices.includes(before.answer));assert.deepEqual(useExamLifeline(s,bank,'fifty',{now:1200}),s);
 s=useExamLifeline(s,bank,'hint',{now:1300});assert.equal(s.active.hintShown,true);assert.deepEqual(useExamLifeline(s,bank,'hint',{now:1400}),s);
 const hidden=s.active.hiddenChoices[0];assert.deepEqual(answerExamChallenge(s,bank,hidden,{now:1500}),s);
 s=useExamLifeline(s,bank,'swap',{now:1600});assert.equal(s.active.responses.length,0);assert.notEqual(current(s).id,before.id);assert.ok(!originalIDs.has(current(s).id));assert.deepEqual(s.active.swappedIds,[before.id]);assert.equal(s.active.hiddenChoices.length,0);assert.equal(s.active.hintShown,false);assert.equal(s.active.lifelines.fifty,true);assert.deepEqual(useExamLifeline(s,bank,'swap',{now:1700}),s);assert.ok(validateExamChallenge(copy(s),bank).active);
 const exact=bank.slice(0,50);const noReserve=startExamChallenge(blankExamChallenge(),exact,{runId:'no-reserve',total:50,now:1000});assert.equal(examChallengeSummary(noReserve,exact).canSwap,false);assert.deepEqual(useExamLifeline(noReserve,exact,'swap',{now:2000}),noReserve);
 const binaryBank=bank.map(q=>({...q,options:['Amber','Blue'],answer:q.answer%2})),binary=startExamChallenge(blankExamChallenge(),binaryBank,{runId:'binary',total:50,now:1000});assert.deepEqual(useExamLifeline(binary,binaryBank,'fifty',{now:2000}),binary);
});

test('complete 50 and 100 question rounds reach a million and keep separate best records',()=>{
 let state=blankExamChallenge();
 for(const total of [50,100]){state=startExamChallenge(state,bank,{total,runId:'complete-'+total,now:1000+total,seed:2});let now=10000;for(let i=0;i<total;i++){state=right(state,now++);if(i<total-1)state=nextExamChallenge(state,bank,{now:now++});}
 assert.equal(state.active.phase,'feedback');assert.equal(state.active.reason,'finished');assert.equal(state.records[total].payout,1000000);state=nextExamChallenge(state,bank,{now:now++});assert.equal(state.active.phase,'complete');}
 const summary=examChallengeSummary(state,bank);assert.deepEqual(summary.best,{50:1000000,100:1000000});assert.equal(summary.history.length,2);assert.equal(summary.ladder.length,100);assert.equal(summary.ladder.at(-1).amount,1000000);assert.ok(summary.ladder.filter(s=>s.safe).length===10);assert.deepEqual(validateExamChallenge(copy(state),bank),state);
});

test('bounded history retains a lifetime best even after it falls outside recent rounds',()=>{
 let {s,now}=correctThrough(start(50,'old-best'),10);s=bankExamChallenge(s,bank,{now:now++});
 for(let i=0;i<55;i++){s=startExamChallenge(s,bank,{runId:'later-'+i,total:50,now:10000+i*2,seed:i});s=bankExamChallenge(s,bank,{now:10001+i*2});}
 assert.equal(s.completed.length,50);assert.ok(!s.completed.some(r=>r.id==='old-best'));assert.equal(s.records[50].id,'old-best');assert.equal(examChallengeSummary(s,bank).best[50],40000);assert.deepEqual(validateExamChallenge(copy(s),bank),s);
});

test('edits to queued source text, choices, answers or shared context safely discard only active progress',()=>{
 let {s,now}=correctThrough(start(50,'prior-best'),2);s=bankExamChallenge(s,bank,{now:now++});s=startExamChallenge(s,bank,{runId:'active',total:50,now:10000});const id=s.active.queue[0].id;
 for(const patch of[{question:'Changed source question.'},{options:['New','Options'],answer:1},{answer:(current(s).answer+1)%4},{context:'New shared case.'},{page:999}]){
 const changed=bank.map(q=>q.id===id?{...q,...patch}:q),restored=validateExamChallenge(copy(s),changed);assert.equal(restored.active,null);assert.equal(restored.records[50].payout,1600);assert.equal(restored.completed.length,1);}
});

test('invalid local score, grading, scope and unsafe JSON are never accepted as active records',()=>{
 const s=right(start());for(const change of[v=>v.active.prize=999999,v=>v.active.responses[0].correct=false,v=>v.active.queue[1].id=v.active.queue[0].id,v=>v.active.hiddenChoices=[v.active.queue[0].answer],v=>v.active.topics=['Unrelated'],v=>v.active.responses[0].at=500]){const bad=copy(s);change(bad);assert.equal(validateExamChallenge(bad,bank).active,null);}
 assert.throws(()=>validateExamChallenge({...blankExamChallenge(),audio:'not allowed'}),/fields/);const cycle=blankExamChallenge();cycle.active=cycle;assert.throws(()=>validateExamChallenge(cycle),/plain JSON/);
 const sparse=blankExamChallenge();sparse.completed=new Array(1);assert.throws(()=>validateExamChallenge(sparse),/sparse/);
 const getter=blankExamChallenge();Object.defineProperty(getter,'active',{enumerable:true,get(){throw Error('must not execute');}});assert.throws(()=>validateExamChallenge(getter),/unsafe saved property/);
 assert.throws(()=>right(start(),999),/predates/);
});
