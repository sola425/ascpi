// Older WebView regression. No live account, email, microphone or API calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(__dirname,'..'),appURL=process.env.APP_URL||'http://127.0.0.1:3000';
assert.equal(new URL(appURL).origin,'http://127.0.0.1:3000');
const config=JSON.parse(fs.readFileSync(path.join(root,'sync-config.json'),'utf8'));
assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/<script\b[^>]*src=["'](?:\.\/)?compatibility\.js["']/,'Load compatibility before the app module.');
const user={id:'11111111-1111-4111-8111-111111111111',email:'learner@example.test'};
const artifact='/tmp/labwise-compatibility-v7';fs.mkdirSync(artifact,{recursive:true});let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const startup=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});
 await startup.addInitScript(()=>{if(!localStorage.getItem('labwise-state'))localStorage.setItem('labwise-state',JSON.stringify({version:4,records:{},saved:['startup-preserved'],log:[],goal:10}));});
 let brokenModule=true,unexpectedStartupRequests=0;
 await startup.route('**/app.js',route=>brokenModule?route.fulfill({status:200,contentType:'text/javascript',body:'const unsupportedStartup = ; // PRIVATE_STARTUP_DETAIL'}):route.continue());
 await startup.route(config.url+'/**',route=>{unexpectedStartupRequests++;return route.abort();});
 const startupPage=await startup.newPage();
 await startupPage.goto(appURL);await startupPage.locator('#labwise-startup-help').waitFor();
 assert.match(await startupPage.locator('#content').innerText(),/Update Android System WebView or Chrome/);
 assert.doesNotMatch(await startupPage.locator('#content').innerText(),/PRIVATE_STARTUP_DETAIL|Unexpected token|SyntaxError/);
 assert.deepEqual(await startupPage.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).saved),['startup-preserved']);
 assert.equal(await startupPage.locator('#labwise-startup-reload').getAttribute('onclick'),null,'Reload must use a DOM listener under the strict CSP.');
 assert.equal(await startupPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await startupPage.screenshot({path:path.join(artifact,'startup-help-320.png'),fullPage:true});
 brokenModule=false;
 await Promise.all([startupPage.waitForEvent('domcontentloaded'),startupPage.locator('#labwise-startup-reload').click()]);
 await startupPage.getByRole('heading',{name:'Make room for a little discovery.'}).waitFor();await startupPage.waitForFunction(()=>window.labwiseAppReady===true);
 assert.deepEqual(await startupPage.evaluate(()=>JSON.parse(localStorage.getItem('labwise-state')).saved),['startup-preserved']);
 await startupPage.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{filename:new URL('./app.js',location.href).href,error:new SyntaxError('PRIVATE_HEALTHY_DETAIL'),message:'PRIVATE_HEALTHY_DETAIL'})));
 assert.equal(await startupPage.locator('#labwise-startup-help').count(),0,'A healthy app must never be replaced by startup help.');
 await startupPage.getByRole('heading',{name:'Make room for a little discovery.'}).waitFor();assert.equal(unexpectedStartupRequests,0);
 await startup.close();
 const context=await browser.newContext({viewport:{width:800,height:1280},serviceWorkers:'block'});
 await context.addInitScript(()=>{Object.hasOwn=undefined;Array.prototype.at=undefined;});
 const calls=[],errors=[];let row=null,revision=0;
 await context.route(config.url+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();calls.push({path:url.pathname,method:request.method()});
  const reply=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(url.pathname==='/auth/v1/token')return reply({access_token:'fake-access-compat',refresh_token:'fake-refresh-compat',expires_at:Math.floor(Date.now()/1000)+3600,user});
  if(url.pathname==='/auth/v1/user')return reply(user);
  if(url.pathname==='/auth/v1/settings')return reply({external:{email:true}});
  if(url.pathname==='/rest/v1/rpc/labwise_read_progress')return reply({accepted:true,revision,document:row,updatedAt:row?new Date().toISOString():null});
  if(url.pathname==='/rest/v1/rpc/labwise_write_progress'){assert.equal(body.expected_revision,revision);row=body.document;revision++;return reply({accepted:true,revision,document:row,updatedAt:new Date().toISOString()});}
  throw new Error('Unexpected account request: '+url.pathname);
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(appURL);await page.getByRole('heading',{name:'Make room for a little discovery.'}).waitFor();
 const skip=page.locator('[data-action="tour-skip"]');if(await skip.isVisible())await skip.click();
 assert.deepEqual(await page.evaluate(()=>({own:Object.hasOwn({value:true},'value'),last:[1,2].at(-1)})),{own:true,last:2});
 assert.equal(calls.length,0,'Repairing helpers must not opt in to account requests.');
 await page.locator('[data-action="account"]').first().click();await page.locator('#account-email').fill(user.email);await page.locator('#account-password').fill('fake-password-not-a-real-service');
 await page.locator('#account-form [type="submit"]').click();await page.getByRole('heading',{name:'Progress is up to date.'}).waitFor();
 assert.equal(calls.filter(call=>call.path==='/auth/v1/token').length,1);assert.ok(calls.some(call=>call.path==='/rest/v1/rpc/labwise_write_progress'));assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(artifact,'tablet-signed-in.png'),fullPage:true});
 fs.writeFileSync(path.join(artifact,'report.json'),JSON.stringify({checks:['module parse failure shows fixed accessible startup help','reload recovers without clearing saved progress','healthy boot never replaced by startup error help','missing helpers installed before bootstrap','no account traffic before opt-in','actual Auth adapter reached','automatic cloud progress write','no unexpected browser errors'],requests:calls,errors},null,2));
 console.log('PASS: failed module shows private startup help, reload preserves progress, healthy boot stays intact; missing Object.hasOwn/Array.at repaired and tablet sign-in/sync use actual clients with mocked HTTP.');await context.close();
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
