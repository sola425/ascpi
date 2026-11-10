// Failure recovery for the shared APK screens; no hosted site or live account is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),url=process.env.APP_URL||'http://127.0.0.1:3000';
assert.equal(new URL(url).origin,'http://127.0.0.1:3000');
const config=JSON.parse(fs.readFileSync(path.join(root,'sync-config.json'))),errors=[],checks=[];
let browser;
async function ready(page){await page.waitForFunction(()=>window.labwiseAppReady===true,undefined,{timeout:20000});const skip=page.locator('#modal[open] [data-action="tour-skip"]');if(await skip.isVisible())await skip.click();}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const stalled=await browser.newContext({viewport:{width:800,height:1280},serviceWorkers:'block'});
 await stalled.addInitScript(()=>{
  Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){return{};}}});
  localStorage.setItem('labwise-state',JSON.stringify({version:4,records:{},saved:['book-1-1'],log:[],goal:10}));
 });
 let unsolicited=0;await stalled.route(config.url+'/**',route=>{unsolicited++;return route.abort();});
 const p=await stalled.newPage();p.on('pageerror',error=>errors.push(error.message));
 await p.goto(url);await ready(p);
 assert.match(await p.locator('#persistent-notice').innerText(),/Question-bank storage could not be read fully/);
 assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).saved),['book-1-1']);
 await p.locator('[data-view="practice"]:visible').first().click();await p.locator('.question-row').first().click();await p.locator('[data-answer="0"]').click();await p.locator('.lesson').waitFor();
 assert.equal(unsolicited,0);checks.push('stalled IndexedDB opens the bundled study app with a warning, preserves progress and permits answering');await stalled.close();

 const slow=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let authRoute=null,calls=0;
 await slow.route(config.url+'/**',route=>{
  if(new URL(route.request().url()).pathname==='/auth/v1/token'){authRoute=route;calls++;return;}
  return route.abort();
 });
 const page=await slow.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await ready(page);await page.locator('[data-action="account"]').first().click();
 const email='timeout-learner@example.test',password='PRIVATE_TIMEOUT_SAMPLE_927';
 await page.locator('#account-email').fill(email);await page.locator('#account-password').fill(password);await page.locator('#account-form [type="submit"]').click();
 await page.locator('#account-form fieldset[disabled]').waitFor();
 await page.waitForFunction(()=>document.querySelector('#account-form fieldset')?.disabled===false,undefined,{timeout:22000});
 assert.equal(calls,1);assert.match(await page.locator('.account-error').innerText(),/too long|connection/i);
 assert.equal(await page.locator('#account-email').inputValue(),email);assert.equal(await page.locator('#account-password').inputValue(),'');
 assert.ok(!await page.evaluate(secret=>Object.keys(localStorage).some(key=>localStorage.getItem(key).includes(secret)),password));
 await page.locator('[data-view="practice"]:visible').first().click();await page.locator('.question-row').first().click();await page.locator('[data-answer="0"]').click();await page.locator('.lesson').waitFor();
 checks.push('a hanging sign-in ends with a useful error, releases the form, preserves email, stores no password and leaves study usable');
 if(authRoute)try{await authRoute.abort();}catch{/* AbortController may already have closed the intercepted request. */}
 await slow.close();assert.deepEqual(errors,[]);
 fs.mkdirSync('/tmp/labwise-reliability',{recursive:true});fs.writeFileSync('/tmp/labwise-reliability/report.json',JSON.stringify({checks,errors,environment:'Shared APK screens, injected storage/network failures; no actual Android hardware or live service'},null,2));
 console.log('PASS: stalled database startup and hanging sign-in recover without clearing progress or retaining a password. Report: /tmp/labwise-reliability/report.json');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
