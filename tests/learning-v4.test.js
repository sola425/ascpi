import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectQueue,validateBackup,schedule} from '../learning.js';
const bank=[{id:'old-id',bookId:'success',topic:'Blood',question:'Oxygen',explanation:'Cells'},{id:'boc-a',bookId:'boc',topic:'Blood',question:'Oxygen',explanation:'Cells'},{id:'boc-b',bookId:'boc',topic:'Chemistry',question:'Glucose',explanation:'Sugar'},{id:'new',bookId:'other',topic:'Blood',question:'DNA',explanation:'Genome'}];
const records={'old-id':{correct:true,lastRecallRating:'again',due:10},'boc-a':{correct:false,lastRecallRating:'good',due:20},'boc-b':{correct:true,lastRecallRating:'easy',due:30}};
const ids=(options)=>selectQueue(bank,records,options).map(q=>q.id);
test('source scope composes with subject, query, due and limit without changing old defaults',()=>{
 assert.deepEqual(ids(),bank.map(q=>q.id));assert.deepEqual(ids({bookId:'boc',topic:'Blood',query:'oxygen',limit:1}),['boc-a']);assert.deepEqual(ids({bookId:['boc','success'],mode:'due',now:25}),['old-id','boc-a']);assert.deepEqual(ids({sourceId:'other'}),['new']);assert.deepEqual(ids({bookId:[]}),bank.map(q=>q.id));assert.deepEqual(ids({bookId:'missing'}),[]);
});
test('missed recall is independent of latest MCQ answer and review scheduling',()=>{
 assert.deepEqual(ids({mode:'mistakes'}),['boc-a']);assert.deepEqual(ids({mode:'forgotten'}),['old-id']);assert.deepEqual(ids({mode:'weak'}),['old-id','boc-a']);assert.deepEqual(ids({bookId:'boc',mode:'weak'}),['boc-a']);const scheduled=schedule(records['old-id'],'again',100);assert.equal(scheduled.correct,true);assert.equal(scheduled.lastRecallRating,'again');assert.equal(records['old-id'].due,10);
});
function backup(version=2){return {version,records:{'old-id':{due:100,stage:1,reviews:2,correct:true,lastRecallRating:'again',lastRecallAt:45},'absent-from-current-bank':{due:200,stage:0,reviews:1}},saved:['old-id','absent-from-current-bank'],log:[{id:'absent-from-current-bank',at:10,kind:'review',correct:false}],goal:20,reading:{success:42,boc:150},prefs:{sessionSize:20,fontScale:1.25}};}
test('v1 and v2 backups retain old identities, recall state, reading and preferences',()=>{
 for(const version of [1,2]){const restored=validateBackup(backup(version));assert.deepEqual(Object.keys(restored.records),['old-id','absent-from-current-bank']);assert.equal(restored.records['old-id'].correct,true);assert.equal(restored.records['old-id'].lastRecallRating,'again');assert.equal(restored.records['old-id'].lastRecallAt,45);assert.equal(restored.reading.boc,150);assert.deepEqual(restored.prefs,{sessionSize:20,fontScale:1.25});assert.deepEqual(restored.saved,backup().saved);assert.deepEqual(restored.log,backup().log);}
});
test('optional metadata is sanitized without poisoning maps or losing old progress',()=>{
 const original=backup();original.reading=JSON.parse('{"__proto__":12,"boc":-1,"fraction":1.5,"bad":"20","valid":2}');original.prefs={sessionSize:Infinity,fontScale:10};original.records['old-id'].lastRecallRating='invalid';original.records['old-id'].lastRecallAt=-1;const restored=validateBackup(original);assert.equal(Object.getPrototypeOf(restored.reading),null);assert.equal(restored.reading.__proto__,12);assert.deepEqual(Object.keys(restored.reading),['__proto__','valid']);assert.equal(restored.records['old-id'].lastRecallRating,undefined);assert.equal(restored.records['old-id'].lastRecallAt,undefined);assert.deepEqual(restored.prefs,{sessionSize:10,fontScale:1});assert.equal(restored.records['old-id'].correct,true);assert.throws(()=>validateBackup({...backup(),version:99}));
});
test('backup validation preserves valid long history instead of truncating source IDs',()=>{const data=backup();data.log=Array.from({length:10001},(_,at)=>({id:`historical-${at}`,at,kind:'answer',correct:true}));assert.equal(validateBackup(data).log[0].id,'historical-0');assert.equal(validateBackup(data).log.length,10001);});
