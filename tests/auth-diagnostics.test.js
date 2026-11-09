import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseClient, accountErrorDetails} from '../supabase-client.js';
import {createSyncController} from '../sync.js';
import {renderAccount} from '../account-ui.js';

const config = {enabled:true,url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fake-public',redirectUrl:''};
const response = (body,status=200) => ({ok:status>=200&&status<300,status,json:async()=>body});
const blank = () => ({records:{},saved:[],log:[],reading:{},prefs:{sessionSize:10,fontScale:1},goal:10});
function controllerWith(client) {
  let progress=blank();const values=new Map();
  const controller=createSyncController({config,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},nativeBridge:null,getProgress:()=>progress,setProgress:value=>{progress=value;},clientFactory:()=>client,debounceMs:60000,pollMs:60000});
  return {controller,get progress(){return progress;}};
}

test('real provider failure variants have fixed useful reasons without copying server internals', async () => {
  const cases=[
    [400,{error_code:'invalid_credentials',msg:'PRIVATE password-token'},'invalid_credentials','auth'],
    [400,{code:'email_not_confirmed',message:'PRIVATE password-token'},'email_not_confirmed','auth'],
    [401,{message:'Invalid API key',hint:'PRIVATE password-token'},'invalid_api_key','configuration'],
    [404,{code:'PGRST202',message:'PRIVATE SQL schema'},'backend_setup','backend_setup'],
    [403,{code:'42501',message:'PRIVATE SQL permissions'},'backend_permissions','backend_setup'],
    [503,{message:'This project is paused. PRIVATE'},'project_unavailable','server'],
    [429,{message:'PRIVATE'},'rate_limited','server']
  ];
  for(const [status,body,reason,code] of cases){
    const client=createSupabaseClient({...config,fetch:async()=>response(body,status)});
    const action=reason.startsWith('backend_')?()=>client.readProgress('fake-session'):()=>client.signIn('learner@example.test','not-a-real-password');
    await assert.rejects(action, error=>{
      assert.equal(error.code,code);assert.equal(error.reason,reason);
      assert.doesNotMatch(error.message,/PRIVATE|password-token|SQL/);
      assert.equal(accountErrorDetails(error).code,reason);
      return true;
    });
  }
  assert.equal(accountErrorDetails({reason:'<script>private</script>',message:'PRIVATE'}),null);
});

test('empty pilot redirect is valid and the public connection check sends no user credentials', async () => {
  let call;
  const client=createSupabaseClient({...config,fetch:async(url,request)=>{call={url,request};return response({external:{email:true},disable_signup:true,mailer_autoconfirm:false});}});
  assert.deepEqual(await client.checkConnection(),{emailEnabled:true});
  assert.equal(call.url,config.url+'/auth/v1/settings');assert.equal(call.request.method,'GET');
  assert.equal(call.request.headers.Authorization,undefined);assert.equal(call.request.body,undefined);
  assert.equal(call.request.credentials,'omit');assert.equal(call.request.cache,'no-store');
});

test('fresh GoTrue session duration tolerates a tablet clock ahead of the server', async () => {
  const before=Date.now();
  const client=createSupabaseClient({...config,fetch:async()=>response({access_token:'fake-access',refresh_token:'fake-refresh',expires_at:Math.floor(before/1000)-7200,expires_in:3600,user:{id:'learner',email:'learner@example.test'}})});
  const session=await client.signIn('learner@example.test','not-real');
  assert.ok(session.expiresAt>=before+3600000 && session.expiresAt<=Date.now()+3600000);
});

test('signed-out diagnostics do not sign in, upload progress, or report progress as synced', async t => {
  let checks=0;
  const p=controllerWith({checkConnection:async()=>{checks++;return{emailEnabled:true};}});t.after(()=>p.controller.stop());
  const result=await p.controller.checkConnection();
  assert.equal(checks,1);assert.equal(result.ok,true);assert.equal(result.stage,'auth');assert.equal(result.authenticated,false);
  assert.equal(result.code,'sign_in_required');assert.equal(p.controller.getStatus().phase,'signedOut');assert.equal(p.controller.getStatus().lastSyncedAt,null);
  assert.doesNotMatch(JSON.stringify(result),/publishable|supabase\.co|session|password/);
});

test('diagnostics distinguish successful sign-in from missing cloud setup and keep the account signed in', async t => {
  const client={
    signIn:async()=>({accessToken:'fake-access',refreshToken:'fake-refresh',expiresAt:Date.now()+3600000,user:{id:'learner',email:'learner@example.test'}}),
    checkConnection:async()=>({emailEnabled:true}),
    readProgress:async()=>{throw Object.assign(new Error('PRIVATE'),{code:'backend_setup',reason:'backend_setup'});}
  };
  const p=controllerWith(client);t.after(()=>p.controller.stop());assert.equal((await p.controller.signIn('learner@example.test','not-real')).ok,true);
  const result=await p.controller.checkConnection();assert.equal(result.ok,false);assert.equal(result.stage,'progress');assert.equal(result.code,'backend_setup');
  assert.match(result.message,/Sign-in worked/);assert.doesNotMatch(result.message,/PRIVATE/);
  assert.equal(p.controller.getStatus().user.id,'learner');assert.equal(p.controller.getStatus().lastSyncedAt,null);
  await p.controller.syncNow();assert.equal(p.controller.getStatus().errorCode,'backend_setup');assert.equal(p.controller.getStatus().user.id,'learner');
});

test('credential-specific errors survive coordinator sanitization and successful retry clears help code', async t => {
  let failed=true;
  const client={signIn:async()=>{
    if(failed)throw Object.assign(new Error('PRIVATE'),{code:'auth',reason:'invalid_credentials'});
    return{accessToken:'fake-access',refreshToken:'fake-refresh',expiresAt:Date.now()+3600000,user:{id:'learner',email:'learner@example.test'}};
  }};
  const p=controllerWith(client);t.after(()=>p.controller.stop());
  const failure=await p.controller.signIn('learner@example.test','wrong');assert.equal(failure.code,'invalid_credentials');assert.match(failure.error,/email or password did not match/);
  assert.equal(p.controller.getStatus().errorCode,'invalid_credentials');failed=false;
  assert.equal((await p.controller.signIn('learner@example.test','correct')).ok,true);assert.equal(p.controller.getStatus().errorCode,null);
});

test('account help preserves only escaped email and exposes explicit diagnosis/password controls', () => {
  const html=renderAccount({status:{configured:true,phase:'signedOut'},emailAddress:'learner"<@example.test',diagnostics:{ok:false,code:'network',message:'Could not connect <retry>'}});
  assert.match(html,/value="learner&amp;quot;|value="learner&quot;/);assert.doesNotMatch(html,/learner"</);
  assert.match(html,/data-action="account-check"/);assert.match(html,/data-action="account-password-toggle"/);
  assert.match(html,/Help code: network/);assert.match(html,/Could not connect &lt;retry&gt;/);
  assert.doesNotMatch(html,/<input id="account-password"[^>]*\bvalue=/);
});
