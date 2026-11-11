import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {configureFigures,figureQuestionKey,renderFigures,questionText} from '../figures.js';

const load=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const manifest=load('data/figures.json'),audit=load('data/visual-audit/manifest.json'),bank=load('data/study-bank.json');
const byId=new Map(bank.map(q=>[q.id,q]));
const hash=path=>createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex');

test('the audit covers every supplied page once and is tied to the exact reviewed PDFs/files',()=>{
 assert.equal(audit.pagesReviewed,1100);assert.equal(manifest.coverage.pagesVisuallyReviewed,1100);
 for(const [doc,expected]of Object.entries({textbook:434,boc1:333,boc2:333})){
  let pages=load(`data/visual-audit/${doc}-pages.json`);pages=Array.isArray(pages)?pages:pages.pages;
  assert.deepEqual(pages.map(row=>row.page).sort((a,b)=>a-b),Array.from({length:expected},(_,i)=>i+1));
  const record=audit.documents[doc];assert.equal(record.pagesReviewed,expected);
  assert.equal(record.sourceSha256,hash(manifest.documents[doc].path));assert.equal(record.ledgerSha256,hash(`data/visual-audit/${doc}-pages.json`));assert.equal(record.additionsSha256,hash(`data/visual-audit/${doc}-additions.json`));
 }
});

test('reviewed question tables reach the manifest without altering values, units, blanks or source column groups',()=>{
 configureFigures(manifest);
 for(const doc of ['textbook','boc1','boc2'])for(const entry of load(`data/visual-audit/${doc}-additions.json`)){
  assert.equal(entry.reveal,'question');for(const id of entry.questionIds){assert.ok(byId.has(id));assert.equal(audit.questionKeys[id],figureQuestionKey(byId.get(id)));if(entry.required)assert.equal(byId.get(id).needsSource,true);}
  if(!entry.table)continue;
  const table=Object.values(manifest.tables).find(t=>t.documentId===doc&&t.page===entry.page&&JSON.stringify(t.rect)===JSON.stringify(entry.rect)&&JSON.stringify(t.headers)===JSON.stringify(entry.table.headers)&&JSON.stringify(t.rows)===JSON.stringify(entry.table.rows));
  assert.ok(table,entry.id||entry.auditId);assert.deepEqual(table.headers,entry.table.headers);assert.deepEqual(table.rows,entry.table.rows);assert.deepEqual(table.headerGroups,entry.table.headerGroups||[]);
  for(const note of entry.table.notes||[])assert.ok(table.notes.includes(note));
  for(const id of entry.questionIds){assert.ok(table.questionIds.includes(id));assert.ok(renderFigures(byId.get(id)).includes(`data-source-table="${table.id}"`));}
  if(entry.useSourceCrop===false||entry.includeSourceCrop===false||entry.sourceContainsOptions)assert.equal(table.sourceFigureId,null,'Choice matrices stay structured rather than becoming question-option screenshots.');
 }
});

test('exact source-table text elision changes presentation only, with canonical source matching preserved',()=>{
 configureFigures(manifest);let count=0;
 for(const [id,entry]of Object.entries(manifest.questions))if(entry.displayQuestion){
  const q=byId.get(id);assert.ok(entry.tableIds.length);assert.equal(questionText(q),entry.displayQuestion);assert.ok(entry.displayQuestion.length<q.question.replace(/\s+/g,' ').trim().length);
  assert.equal(questionText({...q,options:['Changed','Choices']}),q.question);assert.ok(renderFigures(q).includes('data-source-table'));count++;
  if(entry.displayQuestionMethod==='exact-source-table-text-elision'){
   const source=q.question.trim().split(/\s+/);let cursor=0;
   for(const token of entry.displayQuestion.split(/\s+/)){while(cursor<source.length&&source[cursor]!==token)cursor++;assert.ok(cursor<source.length,'Elision must preserve complete source words in their original order: '+id);cursor++;}
  }
 }
 assert.ok(count>0);
});

test('printed option repairs remove the two captured table tails while preserving the answer positions',()=>{
 const a=byId.get('book-135-95'),b=byId.get('book-135-96');assert.equal(a.options[3],'Anti-K, anti-Jsᵃ, and anti-Leᵃ');assert.equal(b.options[3],'2, 3, 4, 6, 9');
 const raw=load('data/book-bank.json');for(const q of[a,b]){const old=raw.find(v=>v.id===q.id);assert.equal(q.answer,old.answer);assert.equal(q.options.length,old.options.length);}
});
