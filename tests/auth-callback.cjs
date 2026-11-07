// Browser-only HTTP mocks: never sends email or contacts a live Auth project.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
let chromium;
try{({chromium}=require('playwright'));}
catch{({chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}

const root=path.resolve(__dirname,'..');
const config={...JSON.parse(fs.readFileSync(path.join(root,'sync-config.json'),'utf8')),enabled:true,publishableKey:'sb_publishable_callback_tests'};
const project=config.url;
const user={id:'10000000-0000-0000-0000-000000000001',email:'learner@example.test'};
const allowed=new Set(['auth-callback.html','auth-callback.js','auth-callback.css','sync-config.js','supabase-client.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
let browser,server;
const checked=[];

async function isolated(base,handler,settings=config){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{
    window.__callbackWrites=0;
    window.__callbackErrors=[];
    const blocked=()=>{window.__callbackWrites++;throw new Error('Callback must not persist account secrets.');};
    Storage.prototype.setItem=blocked;
    if(window.indexedDB)window.indexedDB.open=blocked;
    window.addEventListener('error',()=>window.__callbackErrors.push('page error'));
  });
  const page=await context.newPage(),requests=[];
  page.on('request',request=>requests.push({url:request.url(),headers:request.headers()}));
  await page.route(`${base}/ascpi/sync-config.json`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(settings)}));
  await page.route('https://**/*',async route=>{
    const request=route.request();
    if(!request.url().startsWith(`${project}/auth/v1/`))throw new Error('Unexpected external callback request.');
    await handler(route,request,page);
  });
  return{context,page,requests};
}
const json=(route,value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
async function privatePage(page,requests){
  assert.equal(new URL(page.url()).hash,'');
  assert.equal(new URL(page.url()).search,'');
  assert.equal(await page.evaluate(()=>window.__callbackWrites),0);
  assert.deepEqual(await page.evaluate(()=>window.__callbackErrors),[]);
  assert.deepEqual(await page.context().storageState(),{cookies:[],origins:[]});
  for(const request of requests){
    assert.equal(request.url.includes('access_token'),false);
    assert.equal(request.url.includes('refresh_token'),false);
    assert.equal(request.headers.referer,undefined);
  }
  for(const href of await page.locator('a').evaluateAll(links=>links.map(link=>link.getAttribute('href'))))assert.equal(href,'./index.html');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}

(async()=>{
  server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    const name=url.pathname.startsWith('/ascpi/')?url.pathname.slice('/ascpi/'.length):'';
    if(!allowed.has(name)){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(name)],'Cache-Control':'no-store'});
    response.end(fs.readFileSync(path.join(root,name)));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`,callback=`${base}/ascpi/auth-callback.html`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

  // A delayed config response proves stripping precedes config/Auth work.
  let allowConfig;
  const configGate=new Promise(resolve=>{allowConfig=resolve;});
  const actions=[];
  const recovery=await isolated(base,async(route,request)=>{
    const url=new URL(request.url());
    assert.equal(request.headers().authorization,'Bearer callback-recovery-token');
    actions.push({method:request.method(),path:url.pathname,query:url.search});
    if(request.method()==='GET')return json(route,{...user,email:'<img id="email-injection">@example.test'});
    if(request.method()==='PUT'){
      const body=request.postDataJSON();
      assert.deepEqual(Object.keys(body),['password']);
      assert.equal(body.password==='quiet-lab-lantern-72',true);
      return json(route,user);
    }
    assert.equal(url.pathname,'/auth/v1/logout');
    assert.equal(url.search,'?scope=local');
    return route.fulfill({status:204,body:''});
  });
  await recovery.page.route(`${base}/ascpi/sync-config.json`,async route=>{await configGate;return json(route,config);});
  await recovery.page.goto(`${callback}?source=email#access_token=callback-recovery-token&refresh_token=discard-this-refresh-token&type=recovery`,{waitUntil:'domcontentloaded'});
  await recovery.page.waitForURL(callback);
  assert.equal(actions.length,0);
  assert.equal(await recovery.page.locator('#password-form').isVisible(),false);
  allowConfig();
  await recovery.page.getByRole('heading',{name:'Choose a new password.'}).waitFor();
  assert.equal(await recovery.page.locator('#email-injection').count(),0);
  assert.equal((await recovery.page.locator('#account-status').innerText()).includes('<img'),true);
  await recovery.page.locator('#new-password').fill('short');
  await recovery.page.locator('#confirm-password').fill('short');
  await recovery.page.getByRole('button',{name:'Save new password'}).click();
  assert.match(await recovery.page.locator('#account-notice').innerText(),/at least 12/);
  assert.equal(actions.length,1);
  await recovery.page.locator('#new-password').fill('quiet-lab-lantern-72');
  await recovery.page.locator('#confirm-password').fill('different-password-72');
  await recovery.page.getByRole('button',{name:'Save new password'}).click();
  assert.match(await recovery.page.locator('#account-notice').innerText(),/do not match/);
  await recovery.page.locator('#confirm-password').fill('quiet-lab-lantern-72');
  await recovery.page.getByRole('button',{name:'Save new password'}).click();
  await recovery.page.getByRole('heading',{name:'Password updated.'}).waitFor();
  assert.deepEqual(actions.map(action=>action.method),['GET','PUT','POST']);
  assert.equal(await recovery.page.locator('#new-password').inputValue(),'');
  assert.equal(await recovery.page.locator('#confirm-password').inputValue(),'');
  assert.equal(await recovery.page.locator('#password-form').isVisible(),false);
  await privatePage(recovery.page,recovery.requests);
  await recovery.page.reload();
  await recovery.page.getByRole('heading',{name:'Open your email link.'}).waitFor();
  assert.equal(actions.length,3);
  await recovery.context.close();
  checked.push('Recovery verifies the account, enforces password confirmation/length, updates once and revokes only the temporary session.');

  let verify;
  const verification=new Promise(resolve=>{verify=resolve;});
  const confirmation=await isolated(base,async(route,request)=>{
    assert.equal(request.method(),'GET');
    await verification;return json(route,user);
  });
  await confirmation.page.goto(`${callback}#access_token=callback-confirmation-token&type=signup`);
  await confirmation.page.getByRole('heading',{name:'Checking your account link…'}).waitFor();
  assert.equal(await confirmation.page.getByRole('heading',{name:'Your account link is verified.'}).count(),0);
  verify();
  await confirmation.page.getByRole('heading',{name:'Your account link is verified.'}).waitFor();
  assert.equal(await confirmation.page.locator('#password-form').isVisible(),false);
  await privatePage(confirmation.page,confirmation.requests);
  await confirmation.context.close();
  checked.push('Confirmation reports verification only after getUser succeeds and never signs the app in.');

  let authCalls=0;
  const linkError=await isolated(base,()=>{authCalls++;throw new Error('Error fragments must not call Auth.');});
  const injected='<img id="injected" src="https://attacker.invalid/x" onerror="alert(1)">';
  await linkError.page.goto(`${callback}?error_description=${encodeURIComponent(injected)}#error=access_denied&error_code=otp_expired&access_token=unused`);
  await linkError.page.getByRole('heading',{name:'This link is no longer available.'}).waitFor();
  assert.equal(await linkError.page.locator('#injected').count(),0);
  assert.equal((await linkError.page.locator('body').innerText()).includes(injected),false);
  assert.equal(authCalls,0);
  await privatePage(linkError.page,linkError.requests);
  await linkError.context.close();
  checked.push('Expired/error fragments are stripped without echoing untrusted HTML or contacting Auth.');

  const expired=await isolated(base,route=>json(route,{message:'private SQL and token callback-expired-token'},401));
  await expired.page.goto(`${callback}#access_token=callback-expired-token&type=recovery`);
  await expired.page.getByRole('heading',{name:'This link is no longer valid.'}).waitFor();
  assert.equal(await expired.page.locator('#password-form').isVisible(),false);
  assert.equal((await expired.page.locator('body').innerText()).includes('private SQL'),false);
  await privatePage(expired.page,expired.requests);
  await expired.context.close();
  checked.push('An invalid/expired server session cannot open the recovery form or claim success.');

  const empty=await isolated(base,()=>{throw new Error('An empty link must not contact Auth.');});
  await empty.page.goto(callback);
  await empty.page.getByRole('heading',{name:'Open your email link.'}).waitFor();
  await privatePage(empty.page,empty.requests);
  await empty.page.evaluate(()=>{location.hash='access_token=callback-new-fragment&type=recovery';});
  await empty.page.getByRole('heading',{name:'Open a new email link.'}).waitFor();
  await privatePage(empty.page,empty.requests);
  await empty.context.close();
  checked.push('Empty/reloaded links and later same-tab fragments keep no stored session or URL credential.');

  const unavailable=await isolated(base,route=>route.abort('failed'));
  await unavailable.page.goto(`${callback}#access_token=callback-network-token&type=recovery`);
  await unavailable.page.getByRole('heading',{name:'Could not verify this link.'}).waitFor();
  assert.equal(await unavailable.page.locator('#password-form').isVisible(),false);
  await privatePage(unavailable.page,unavailable.requests);
  await unavailable.context.close();
  checked.push('A connection failure is reported without claiming the link expired or an update succeeded.');

  const wrongProject=await isolated(base,()=>{throw new Error('Configuration must not send tokens to another project.');},{...config,url:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'});
  await wrongProject.page.goto(`${callback}#access_token=callback-wrong-project-token&type=recovery`);
  await wrongProject.page.getByRole('heading',{name:'Email links are not ready here.'}).waitFor();
  const csp=await wrongProject.page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes(`connect-src 'self' ${project}`));
  assert.equal(csp.includes("'unsafe-inline'"),false);
  assert.equal(await wrongProject.page.locator('meta[name="referrer"]').getAttribute('content'),'no-referrer');
  await privatePage(wrongProject.page,wrongProject.requests);
  await wrongProject.context.close();
  checked.push('Configuration and CSP restrict token requests to the approved project; all links and referrers stay clean.');

  process.stdout.write(`Account callback browser checks passed (${checked.length} scenarios).\n`);
})().catch(error=>{process.stderr.write(`${error.name}: ${error.message}\n`);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
});
