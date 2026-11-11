import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createQuizRegistry,PUBLISHED_COMPAT_SHA256} from '../scripts/prepare_quiz_registry.mjs';
import {eligibleQuestions} from '../game.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=name=>readFileSync(new URL('../'+name,import.meta.url));
const bytes=read('data/study-bank.json'),proofBytes=read('data/duel-registry-compat.json');
const bank=JSON.parse(bytes),proof=JSON.parse(proofBytes),copy=value=>JSON.parse(JSON.stringify(value));
const sha=value=>createHash('sha256').update(value).digest('hex');
const published='d0bd982f87d392e8f28575c536b2644519c657fa94b7ed186b6c666fed47cf24';

test('exact APK bank identity and the proven published Duel identity remain separate',()=>{
 const {sql,meta}=createQuizRegistry(bytes,proofBytes);
 assert.equal(meta.version,2);assert.equal(meta.contentDigest,sha(bytes));assert.equal(meta.questions,eligibleQuestions(bank).length);
 assert.equal(meta.duelContentDigest,published);assert.notEqual(meta.contentDigest,meta.duelContentDigest);
 assert.equal(meta.duelQuestions,2993);assert.equal(meta.duelRegistryProofDigest,PUBLISHED_COMPAT_SHA256);
 assert.equal(meta.duelRegistryProofDigest,sha(proofBytes));assert.deepEqual(meta,JSON.parse(read('data/quiz-meta.json')));
 assert.equal(sha(sql),proof.publishedSeedSha256);assert.equal(sql,read('supabase/quiz-seed.sql').toString());
 assert.equal((sql.match(/^\('/gm)||[]).length,2993);
 assert.equal(new Set(proof.rows.map(row=>row.id)).size,2993);
});

test('every registered stem, option list, context and grading field must stay unchanged',()=>{
 const id=proof.rows[0].id;
 for(const field of ['question','options','answer','topic','bookId','context','sharedContext']){
  const changed=copy(bank),q=changed.find(item=>item.id===id);
  if(field==='options')q.options[0]+=' changed';
  else if(field==='answer')q.answer=(q.answer+1)%q.options.length;
  else q[field]=(q[field]||'')+' changed';
  assert.throws(()=>createQuizRegistry(Buffer.from(JSON.stringify(changed)),proofBytes),new RegExp(id),field);
 }
 const removed=bank.filter(q=>q.id!==id);assert.throws(()=>createQuizRegistry(Buffer.from(JSON.stringify(removed)),proofBytes),/changed or is missing/);
 assert.throws(()=>createQuizRegistry(Buffer.from(JSON.stringify([...bank,bank[0]])),proofBytes),/inventory/);
});

test('source-display flags and non-Duel edits do not overwrite the existing backend registry',()=>{
 const changed=copy(bank),registered=changed.find(q=>q.id===proof.rows[0].id),registeredIds=new Set(proof.rows.map(row=>row.id));
 registered.needsSource=!registered.needsSource;
 changed.find(q=>!registeredIds.has(q.id)).question+=' Reviewed source clarification.';
 const old=createQuizRegistry(bytes,proofBytes),next=createQuizRegistry(Buffer.from(JSON.stringify(changed)),proofBytes);
 assert.equal(next.sql,old.sql);assert.equal(next.meta.duelContentDigest,old.meta.duelContentDigest);
 assert.notEqual(next.meta.contentDigest,old.meta.contentDigest);
});

test('rewriting even one published compatibility proof cannot silently authorize different content',()=>{
 const changed=copy(proof);changed.rows[0].answer=(changed.rows[0].answer+1)%changed.rows[0].optionCount;
 assert.throws(()=>createQuizRegistry(bytes,Buffer.from(JSON.stringify(changed))),/proof changed/);
});

test('Python packaging independently refuses stale metadata, altered questions, proofs and seeds',()=>{
 const result=spawnSync('python3',['-c',String.raw`
import copy,hashlib,json,shutil,tempfile
from pathlib import Path
from scripts.build_apk import check_quiz_registry
root=Path.cwd();bank=json.loads((root/'data/study-bank.json').read_text());meta=json.loads((root/'data/quiz-meta.json').read_text());proof=json.loads((root/'data/duel-registry-compat.json').read_text())
with tempfile.TemporaryDirectory() as temp:
 d=Path(temp);(d/'data').mkdir();(d/'supabase').mkdir();bp=d/'data/study-bank.json';mp=d/'data/quiz-meta.json';pp=d/'data/duel-registry-compat.json';sp=d/'supabase/quiz-seed.sql'
 def reset():
  for source,target in [('data/study-bank.json',bp),('data/quiz-meta.json',mp),('data/duel-registry-compat.json',pp),('supabase/quiz-seed.sql',sp)]:shutil.copyfile(root/source,target)
 def rejected(label):
  try:check_quiz_registry(bp,mp)
  except SystemExit:return
  raise AssertionError('Packaging accepted '+label)
 reset();assert check_quiz_registry(bp,mp)['duelQuestions']==2993
 bp.write_bytes(bp.read_bytes()+b' ');rejected('different exact bank bytes')
 for field in ['question','options','answer','topic','bookId','context']:
  reset();changed=copy.deepcopy(bank);q=next(q for q in changed if q['id']==proof['rows'][0]['id'])
  if field=='options':q['options'][0]+=' changed'
  elif field=='answer':q[field]=(q[field]+1)%len(q['options'])
  else:q[field]=q.get(field,'')+' changed'
  bp.write_text(json.dumps(changed,ensure_ascii=False));m=copy.deepcopy(meta);m['contentDigest']=hashlib.sha256(bp.read_bytes()).hexdigest();mp.write_text(json.dumps(m));rejected('changed registered '+field)
 reset();pp.write_bytes(pp.read_bytes()+b' ');rejected('modified published proof')
 reset();sp.write_bytes(sp.read_bytes()+b' ');rejected('modified backend seed')
 reset();m=copy.deepcopy(meta);m['duelContentDigest']=m['contentDigest'];mp.write_text(json.dumps(m));rejected('artifact digest substituted for hosted digest')
print('Independent packaging checks passed.')
`],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
