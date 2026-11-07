// Generate ID-only private answer registry; no question text or source PDFs.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {eligibleQuestions} from '../game.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bytes=readFileSync(resolve(root,'data/study-bank.json'));
const digest=createHash('sha256').update(bytes).digest('hex');
const bank=JSON.parse(bytes),questions=eligibleQuestions(bank);
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const rows=questions.map(q=>`(${quote(q.id)},${quote(q.topic)},${quote(q.bookId)},${q.answer},${q.options.length},${quote(digest)})`);
const sql='-- Generated shared-quiz metadata. Contains IDs, topics and answer indices only.\n-- Actual questions and explanations remain in the app.\nbegin;\ninsert into public.labwise_quiz_questions(id,topic,book_id,answer_index,option_count,content_digest) values\n'+rows.join(',\n')+'\non conflict(id) do update set topic=excluded.topic,book_id=excluded.book_id,answer_index=excluded.answer_index,option_count=excluded.option_count,content_digest=excluded.content_digest,enabled=true;\ncommit;\n';
writeFileSync(resolve(root,'supabase/quiz-seed.sql'),sql);
writeFileSync(resolve(root,'data/quiz-meta.json'),JSON.stringify({version:1,contentDigest:digest,questions:questions.length,topics:[...new Set(questions.map(q=>q.topic))]},null,2)+'\n');
console.log(`Prepared ${questions.length} eligible IDs; digest ${digest}`);
