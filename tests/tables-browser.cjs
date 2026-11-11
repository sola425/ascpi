// Readable question tables in the actual shared screens; no hosted site or live accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),origin='http://127.0.0.1:3000',out='/tmp/labwise-question-tables';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/figures.json'))),bank=JSON.parse(fs.readFileSync(path.join(root,'data/study-bank.json')));
const byId=new Map(bank.map(q=>[q.id,q])),errors=[],external=[],report={layouts:[],checks:[]};
let browser;
async function action(p,name){const sel=`[data-action="${name}"]:visible`,m=p.locator(`#modal[open] ${sel}`);await(await m.count()?m.first():p.locator(sel).first()).click();}
async function ready(p){await p.waitForFunction(()=>window.labwiseAppReady===true);const skip=p.locator('#modal[open] [data-action="tour-skip"]');if(await skip.isVisible())await skip.click();}
const harness=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/figures.css"><style>#harness{box-sizing:border-box;width:900px;max-width:100%;padding:16px;margin:auto}</style><div id="harness"></div><script type="module">import{configureFigures,renderTable,getTable}from'/figures.js';const m=await(await fetch('/data/figures.json')).json();configureFigures(m);window.tableIds=Object.keys(m.tables);window.getTable=getTable;document.querySelector('#harness').innerHTML=tableIds.map(id=>renderTable(id)).join('');window.tablesReady=true;</script>`;
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
 await p.route(origin+'/__question-tables',route=>route.fulfill({status:200,contentType:'text/html',body:harness}));
 await p.goto(origin+'/__question-tables');await p.waitForFunction(()=>window.tablesReady===true);
 assert.equal(await p.locator('#harness table').count(),Object.keys(manifest.tables).length);
 const dataErrors=await p.evaluate(()=>{
  const failures=[],normal=s=>s.replace(/\s+/g,' ').trim();
  for(const id of tableIds){const table=getTable(id),node=document.querySelector(`[data-source-table="${id}"] table`),rows=[...node.tBodies[0].rows];
   if(rows.length!==table.rows.length)failures.push(id+': row count');
   table.rows.forEach((source,i)=>source.forEach((value,j)=>{if(normal(rows[i].cells[j].innerText)!==normal(value))failures.push(id+': cell '+i+','+j);}));
   const heads=node.querySelector('.source-table-columns').cells;table.headers.forEach((value,j)=>{if(normal(heads[j].innerText)!==normal(value))failures.push(id+': heading '+j);});
  }return failures;
 });assert.deepEqual(dataErrors,[]);report.checks.push('every rendered table cell/header matches reviewed data, including blank cells and zero results');
 for(const width of[320,768,1024])for(const theme of['light','dark'])for(const scale of[1,1.3]){
  await p.setViewportSize({width,height:width===320?568:1024});
  await p.evaluate(({theme,scale})=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--font-scale',scale);},{theme,scale});
  const result=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,bad:[...document.querySelectorAll('.source-table')].filter(el=>el.getBoundingClientRect().width>innerWidth+1).length,small:[...document.querySelectorAll('.source-table-actions button,.source-table-actions a')].filter(el=>el.getBoundingClientRect().height<43.5).length}));
  assert.ok(result.overflow<=1);assert.equal(result.bad,0);assert.equal(result.small,0);report.layouts.push({width,theme,scale,tables:await p.locator('.source-table').count(),...result});
 }
 await context.close();
 const app=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'}),page=await app.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await ready(page);
 async function openQuestion(id){const q=byId.get(id);await page.locator('[data-view="practice"]:visible').first().click();await page.locator('#practice-query').fill(q.source);await page.locator(`.question-row[data-question="${id}"]`).click();const replace=page.locator('#modal[open] [data-action="start-new"]');if(await replace.isVisible())await replace.click();await page.locator('.study .source-table').first().waitFor();}
 await openQuestion('book-135-94');
 const wide=page.locator('.study .source-table-scroll').first();
 assert.ok(await wide.evaluate(el=>el.scrollWidth>el.clientWidth*2),'The full panel must pan rather than squeeze its columns.');
 await wide.evaluate(el=>{el.scrollLeft=el.scrollWidth;el.scrollTop=100;});
 const sticky=await wide.evaluate(el=>{const cell=el.querySelector('tbody tr:first-child th,tbody tr:first-child td'),r=el.getBoundingClientRect(),c=cell.getBoundingClientRect();return{left:c.left-r.left,width:c.width,available:r.width};});
 assert.ok(sticky.left>=-1&&sticky.left<5);assert.ok(sticky.width<sticky.available);
 assert.equal(await page.locator('.study .source-table .source-table-groups').count(),1);report.checks.push('wide red-cell panel pans with source column groups and fixed row labels before answering');
 await page.locator('.study [data-table-id]').first().click();await page.locator('#modal[open] .source-table-expanded').waitFor();
 assert.ok(await page.locator('#modal[open] .source-table table').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
 await action(page,'close-dialog');await page.locator('.study [data-figure-id]').last().click();await page.locator('#figure-zoom-image').evaluate(el=>el.decode());await action(page,'close-dialog');
 report.checks.push('larger table and exact original-source comparison work without changing the selected question');
 await openQuestion('book-1-65');assert.ok(await page.locator('.study .source-table').count()>=2);assert.ok(!await page.locator('.study .question-text').innerText().then(text=>text.includes('WBC 1 2.2')));report.checks.push('the two CBC/electrophoresis inputs appear with the question without repeating their exact extracted table block');
 await openQuestion('boc-7-184');assert.equal(await page.locator('.study .source-table tbody tr').count(),5);report.checks.push('a single-column control series retains its five source values');
 await page.setViewportSize({width:768,height:1024});await page.screenshot({path:path.join(out,'tablet-question-table.png'),fullPage:true});
 await page.locator('[data-view="cards"]:visible').first().click();await page.locator('#cards-query').fill(byId.get('boc-1-64').source);
 await action(page,'setup-cards');await action(page,'confirm-session');await page.locator('.source-table').first().waitFor();report.checks.push('a source-matched table is available on the flashcard question side');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);report.errors=errors;report.external=external;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(`PASS: ${Object.keys(manifest.tables).length} tables checked across ${report.layouts.length} layouts; ${report.checks.length} actual question/table workflows. Report: ${out}/report.json`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
