// Verify exact APK bank bytes separately from the unchanged published Duel collection.
// Only reviewed, hash-pinned question proofs may reuse the hosted registry.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {eligibleQuestions} from '../game.js';
export const PUBLISHED_COMPAT_SHA256='e4c7d4f64b0a9b2fc830f481fee4c8c23d6b7fcf4f3aea66458eda54729b29ae';
const PUBLISHED_DUEL_DIGEST='d0bd982f87d392e8f28575c536b2644519c657fa94b7ed186b6c666fed47cf24';
const sha=value=>createHash('sha256').update(value).digest('hex');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const proofFor=q=>sha(JSON.stringify([q.id,q.topic,q.bookId,q.question,q.options,q.answer,q.context||'',q.sharedContext||'']));

export function createQuizRegistry(bytes,compatBytes){
 if(sha(compatBytes)!==PUBLISHED_COMPAT_SHA256)throw Error('The published Duel compatibility proof changed. Review a new registry migration instead of reusing its digest.');
 const compatibility=JSON.parse(compatBytes),bank=JSON.parse(bytes),byId=new Map(bank.map(q=>[q.id,q]));
 if(byId.size!==bank.length||compatibility.version!==1||compatibility.duelContentDigest!==PUBLISHED_DUEL_DIGEST||compatibility.publishedBankSha256!==PUBLISHED_DUEL_DIGEST||compatibility.duelQuestions!==2993||compatibility.rows.length!==2993)throw Error('Invalid published Duel collection inventory.');
 const ids=new Set();
 for(const row of compatibility.rows){
  const q=byId.get(row.id);
  if(ids.has(row.id)||!q||q.topic!==row.topic||q.bookId!==row.bookId||q.answer!==row.answer||q.options?.length!==row.optionCount||sha(q.question)!==row.questionSha256||sha(JSON.stringify(q.options))!==row.optionsSha256||proofFor(q)!==row.contentProofSha256)throw Error('Published Duel question changed or is missing: '+row.id+'. A matching reviewed backend registry is required.');
  ids.add(row.id);
 }
 const questions=eligibleQuestions(bank);
 const rows=compatibility.rows.map(row=>`(${quote(row.id)},${quote(row.topic)},${quote(row.bookId)},${row.answer},${row.optionCount},${quote(compatibility.duelContentDigest)})`);
 const sql='-- Generated shared-quiz metadata. Contains IDs, topics and answer indices only.\n-- Actual questions and explanations remain in the app.\nbegin;\ninsert into public.labwise_quiz_questions(id,topic,book_id,answer_index,option_count,content_digest) values\n'+rows.join(',\n')+'\non conflict(id) do update set topic=excluded.topic,book_id=excluded.book_id,answer_index=excluded.answer_index,option_count=excluded.option_count,content_digest=excluded.content_digest,enabled=true;\ncommit;\n';
 if(sha(sql)!==compatibility.publishedSeedSha256)throw Error('The reused Duel seed differs from its published original.');
 return {sql,meta:{version:2,contentDigest:sha(bytes),questions:questions.length,topics:[...new Set(questions.map(q=>q.topic))],duelContentDigest:compatibility.duelContentDigest,duelQuestions:compatibility.duelQuestions,duelRegistryProofDigest:PUBLISHED_COMPAT_SHA256}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const {sql,meta}=createQuizRegistry(readFileSync(resolve(root,'data/study-bank.json')),readFileSync(resolve(root,'data/duel-registry-compat.json')));
 writeFileSync(resolve(root,'supabase/quiz-seed.sql'),sql);
 writeFileSync(resolve(root,'data/quiz-meta.json'),JSON.stringify(meta,null,2)+'\n');
 console.log(`Verified ${meta.duelQuestions} published Duel IDs; ${meta.questions} current solo IDs; exact bank digest ${meta.contentDigest}; compatible hosted digest ${meta.duelContentDigest}.`);
}
