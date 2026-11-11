import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configureFigures, figureQuestionKey, renderFigures, renderTable, getTable, hasQuestionFigure} from '../figures.js';

const source=JSON.parse(readFileSync(new URL('../data/figures.json',import.meta.url)));
const copy=value=>JSON.parse(JSON.stringify(value));
const tid='tbl-'+'a'.repeat(18);
function fixture(){
 const data=copy(source),f=Object.values(data.figures).find(f=>f.reveal==='question');
 const q={id:'table-fixture',question:'Which sample fits the stated results?',options:['Sample A','Sample B'],answer:0,documentId:f.documentId,page:f.page};
 f.questionIds.push(q.id);
 data.tables={...(data.tables||{}),[tid]:{id:tid,kind:'table',reveal:'question',documentId:f.documentId,page:f.page,caption:'Source sample results',headers:['Sample','Reading (%)','Reaction'],rows:[['A','0',''],['B','12.5','3+']],notes:['Blank is printed blank; 0 is a measured zero.'],rowHeaders:true,sourceFigureId:f.id,questionIds:[q.id]}};
 data.questions[q.id]={key:figureQuestionKey(q),figureIds:[],tableIds:[tid],notes:[]};return{data,q,f};
}

test('question tables render before a choice and preserve source values, blanks, units and semantics',()=>{
 const{data,q}=fixture();configureFigures(data);const html=renderFigures(q,{exam:true});
 assert.match(html,/<table>/);assert.match(html,/<caption>Source sample results<\/caption>/);assert.match(html,/scope="col"/);assert.match(html,/scope="row"/);
 assert.match(html,/Reading \(%\)/);assert.match(html,/>0<\/td>/);assert.match(html,/<td><\/td>/);assert.match(html,/>12\.5<\/td>/);assert.match(html,/>3\+<\/td>/);
 assert.match(html,/data-table-id/);assert.match(html,/Compare original table/);assert.ok(hasQuestionFigure(q));
 assert.equal(renderFigures({...q,options:['Different','Choices']}),'');
 assert.ok(Object.isFrozen(getTable(tid).rows));assert.ok(Object.isFrozen(getTable(tid).rows[0]));
 configureFigures(source);
});

test('option-matrix tables can link to the PDF without adding an option screenshot',()=>{
 const{data,q}=fixture();data.tables[tid].sourceFigureId=null;configureFigures(data);
 const html=renderFigures(q);assert.match(html,/<table>/);assert.match(html,/Compare original table/);assert.doesNotMatch(html,/data-figure-id/);
 assert.match(renderTable(tid,{expanded:true}),/source-table-expanded/);assert.doesNotMatch(renderTable(tid,{expanded:true}),/Read table larger/);
 assert.equal(getTable('__proto__'),null);assert.equal(renderTable('missing'),'');configureFigures(source);
});

test('source column groups preserve their exact spans and relationships',()=>{
 const{data,q}=fixture();data.tables[tid].headerGroups=[{label:'Sample',span:1},{label:'Measurements',span:2}];configureFigures(data);
 const html=renderFigures(q);assert.match(html,/<colgroup span="2"><\/colgroup>/);assert.match(html,/scope="colgroup" colspan="2">Measurements/);
 const bad=copy(data);bad.tables[tid].headerGroups[1].span=3;assert.throws(()=>configureFigures(bad));configureFigures(source);
});

test('unsafe or inconsistent table manifests fail atomically',()=>{
 const{data,q}=fixture();configureFigures(data);const expected=renderFigures(q);
 const changes=[t=>{t.rows[0].pop();},t=>{t.rows[0][0]={html:'unsafe'};},t=>{t.sourceFigureId='fig-'+'0'.repeat(18);},t=>{t.documentId='unknown';},t=>{t.page=999999;},t=>{t.rowHeaders='yes';},t=>{t.notes=[{}];}];
 for(const mutate of changes){const bad=copy(data);mutate(bad.tables[tid]);assert.throws(()=>configureFigures(bad));assert.equal(renderFigures(q),expected);}
 const bad=copy(data);bad.questions[q.id].tableIds=['tbl-'+'0'.repeat(18)];assert.throws(()=>configureFigures(bad));assert.equal(renderFigures(q),expected);configureFigures(source);
});

test('table captions, cells and footnotes are escaped and never become executable markup',()=>{
 const{data,q}=fixture();data.tables[tid].caption='<img src=x onerror=bad()>';data.tables[tid].rows[0][1]='<script>bad()</script>';data.tables[tid].notes=['<svg onload=bad()>'];configureFigures(data);
 const html=renderFigures(q);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.match(html,/&lt;svg/);assert.doesNotMatch(html,/<script>|<svg onload|<img src=x/);configureFigures(source);
});

test('existing reveal rules remain valid for imported manifests with an answer-only table',()=>{
 const{data,q,f}=fixture();data.tables[tid].reveal='answer';f.reveal='answer';configureFigures(data);
 assert.doesNotMatch(renderFigures(q),/data-source-table/);assert.doesNotMatch(renderFigures(q,{revealed:true,exam:true}),/data-source-table/);
 assert.match(renderFigures(q,{revealed:true}),/data-source-table/);assert.equal(hasQuestionFigure(q),false);configureFigures(source);
});
