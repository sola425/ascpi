import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(join(root, 'android/src/com/labwise/study/MainActivity.java'), 'utf8');
const manifest = readFileSync(join(root, 'android/AndroidManifest.xml'), 'utf8');
const tools = process.env.LABWISE_ANDROID_TOOLS || '/workspace/android-tools';
const platform = join(tools, 'platform/android-35/android.jar');
const stubs = join(tools, 'build-tools/android-15/core-lambda-stubs.jar');

test('native bridge keeps auth private, durable and separate from exported progress', () => {
  assert.match(source, /SYNC_AUTH_STORAGE_KEY="labwise-sync-auth-v1"/);
  assert.match(source, /@JavascriptInterface public String readSecureSyncSession\(String key\)/);
  assert.match(source, /@JavascriptInterface public boolean writeSecureSyncSession\(String key,String json\)/);
  assert.match(source, /@JavascriptInterface public boolean clearSecureSyncSession\(String key\)/);
  assert.match(source, /KeyStore\.getInstance\("AndroidKeyStore"\)/);
  assert.match(source, /KeyGenerator\.getInstance\(KeyProperties\.KEY_ALGORITHM_AES,"AndroidKeyStore"\)/);
  assert.match(source, /setRandomizedEncryptionRequired\(true\)/);
  assert.doesNotMatch(source, /\.getEncoded\(/);
  const sessionMethods = source.slice(source.indexOf('private String readSecureSession('), source.indexOf('private static boolean validVoiceToken('));
  assert.equal((sessionMethods.match(/SYNC_AUTH_STORAGE_KEY\.equals\(key\)/g) || []).length, 3);
  assert.equal((sessionMethods.match(/getSharedPreferences\(SYNC_SESSION_PREFERENCES,MODE_PRIVATE\)/g) || []).length, 3);
  assert.match(sessionMethods, /putString\(key,encrypted\)\.commit\(\)/);
  assert.match(sessionMethods, /remove\(key\)\.commit\(\)/);
  assert.doesNotMatch(sessionMethods, /putString\(key,json\)|\.apply\(|Intent|pendingExport|println|Log\./);
  assert.match(source, /name\.contains\("password"\)/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:versionCode="60000" android:versionName="6\.0\.0"/);
  assert.deepEqual([...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(match => match[1]), ['android.permission.INTERNET']);
});

test('network policy reads only bounded bundled configuration and retains normal WebView TLS', () => {
  assert.match(source, /getAssets\(\)\.open\("sync-config\.json"\)/);
  assert.match(source, /output\.size\(\)\+count>MAX_SYNC_CONFIG_BYTES/);
  assert.match(source, /Boolean\.TRUE\.equals\(config\.opt\("enabled"\)\)/);
  assert.match(source, /syncPolicy\.allows\(uri\.toString\(\),request\.getMethod\(\),request\.isForMainFrame\(\)\)\)return null/);
  assert.match(source, /headers\.put\("Content-Security-Policy",syncPolicy\.contentSecurityPolicy\(\)\)/);
  assert.doesNotMatch(source, /onReceivedSslError|\.proceed\(|setWebContentsDebuggingEnabled\(true\)/);
  const bridge = source.slice(source.indexOf('private final class NativeBridge {'));
  assert.doesNotMatch(bridge, /syncPolicy\s*=|setSyncConfig|setSyncOrigin/);
  assert.match(bridge, /Uri\.parse\("https:\/\/github\.com\/sola425\/ascpi\/raw\/refs\/heads\/main\/releases\/Labwise-latest\.apk"\)/);
  assert.match(source, /App content cannot navigate to arbitrary schemes/);
});

// This harness executes the actual pure policy and AES/GCM classes compiled
// from MainActivity, not a JavaScript model. AndroidKeyStore and a physical
// WebView are deliberately outside the scope of this host-JVM test.
const harness = `package com.labwise.study;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

public final class NativeSyncHarness {
  private static int checks=0;
  private static void check(boolean value,String message){
    checks++;if(!value)throw new AssertionError(message);
  }
  private interface Checked { void run() throws Exception; }
  private static void rejected(Checked run,String message)throws Exception{
    boolean rejected=false;
    try{run.run();}catch(Exception expected){rejected=true;}
    check(rejected,message);
  }
  public static void main(String[] args)throws Exception{
    final String origin="https://ncfovahpjofwrygxnbst.supabase.co";
    final MainActivity.SyncPolicy policy=MainActivity.SyncPolicy.configured(true,origin);
    check(origin.equals(policy.origin),"configured origin");
    check(origin.equals(MainActivity.SyncPolicy.configured(true,origin+":443").origin),"normalize standard HTTPS port");
    check(MainActivity.SyncPolicy.configured(false,origin).origin==null,"disabled configuration");
    check(MainActivity.SyncPolicy.configured(true,null).origin==null,"missing configuration");
    String[] invalidOrigins={
      "http://ncfovahpjofwrygxnbst.supabase.co",
      "https://supabase.co","https://example.org",
      origin+".attacker.test",origin+".",origin+"/",origin+"/auth/v1/token",
      origin+"?x=1",origin+"#x",origin+":444",origin+":0443",
      "https://user:password@ncfovahpjofwrygxnbst.supabase.co",
      "https://ncfovahpjofwrygxnbst.supabase.co@attacker.test",
      "https://-bad.supabase.co","https://bad-.supabase.co",
      "https://bad_name.supabase.co","https://UPPER.supabase.co",
      " "+origin,origin+" ","", "https://a.b.supabase.co"
    };
    for(String value:invalidOrigins)check(MainActivity.SyncPolicy.configured(true,value).origin==null,"invalid origin accepted: "+value);
    final MainActivity.SyncPolicy different=MainActivity.SyncPolicy.configured(true,"https://another-project.supabase.co");
    check(different.allows("https://another-project.supabase.co/auth/v1/token?grant_type=password","POST",false),"origin derives from asset");
    check(!different.allows(origin+"/auth/v1/token?grant_type=password","POST",false),"old project denied");
    String[] authPosts={"/auth/v1/token?grant_type=password","/auth/v1/token?grant_type=refresh_token","/auth/v1/signup","/auth/v1/signup?redirect_to=https%3A%2F%2Fexample.org%2Fauth-callback.html","/auth/v1/recover","/auth/v1/logout?scope=local"};
    for(String path:authPosts){
      check(policy.allows(origin+path,"POST",false),"auth POST");
      check(policy.allows(origin+path,"OPTIONS",false),"auth preflight");
      for(String method:new String[]{"GET","PUT","PATCH","DELETE","HEAD","post"})
        check(!policy.allows(origin+path,method,false),"unexpected auth method");
      check(!policy.allows(origin+path,"POST",true),"external main-frame navigation");
      check(!MainActivity.SyncPolicy.disabled().allows(origin+path,"POST",false),"unconfigured network");
    }
    for(String method:new String[]{"GET","PUT","OPTIONS"})
      check(policy.allows(origin+"/auth/v1/user",method,false),"user method");
    for(String method:new String[]{"POST","PATCH","DELETE"})
      check(!policy.allows(origin+"/auth/v1/user",method,false),"unexpected user method");
    String[] rpcs={"labwise_read_progress","labwise_write_progress","labwise_create_challenge","labwise_join_challenge","labwise_get_challenge","labwise_get_turn","labwise_submit_answer","labwise_next_turn","labwise_list_challenges"};
    for(String name:rpcs){
      String path="/rest/v1/rpc/"+name;
      check(policy.allows(origin+path,"POST",false),"RPC POST");
      check(policy.allows(origin+":443"+path,"POST",false),"standard HTTPS port");
      check(policy.allows(origin+path,"OPTIONS",false),"RPC preflight");
      for(String method:new String[]{"GET","PUT","PATCH","DELETE","HEAD"})
        check(!policy.allows(origin+path,method,false),"unexpected RPC method");
      check(!policy.allows(origin+path+"?select=*","POST",false),"RPC query");
      check(!policy.allows(origin+path,"POST",true),"RPC main frame");
    }
    String[] badRequests={
      "http://ncfovahpjofwrygxnbst.supabase.co/auth/v1/token",
      "https://another-project.supabase.co/auth/v1/token",
      origin+".attacker.test/auth/v1/token",
      origin+":444/auth/v1/token",
      "https://user@ncfovahpjofwrygxnbst.supabase.co/auth/v1/token",
      origin+"/auth/v1/token#fragment",origin+"/auth/v1/token/",
      origin+"/auth/v1/%74oken",origin+"/auth/v1/../v1/token",
      origin+"/auth/v1/admin/users",origin+"/rest/v1/labwise_progress",
      origin+"/storage/v1/object/test",origin+"/rest/v1/rpc/labwise_arbitrary",
      origin+"/rest/v1/rpc/labwise_read_progress/extra"
    };
    for(String value:badRequests)check(!policy.allows(value,"POST",false),"unexpected request: "+value);
    check(!policy.allows(null,"POST",false),"null URL");
    check(!policy.allows(origin+"/auth/v1/token",null,false),"null method");
    check(policy.contentSecurityPolicy().contains("connect-src 'self' "+origin+";"),"exact CSP connect origin");
    check(policy.contentSecurityPolicy().contains("script-src 'self';"),"bundled scripts only");
    check(!policy.contentSecurityPolicy().contains("*"),"no CSP wildcard");
    check(MainActivity.SyncPolicy.disabled().contentSecurityPolicy().contains("connect-src 'self';"),"disabled CSP");

    final String json=args[0];
    final SecretKey key=new SecretKeySpec(new byte[32],"AES");
    byte[] otherBytes=new byte[32];Arrays.fill(otherBytes,(byte)7);
    final SecretKey otherKey=new SecretKeySpec(otherBytes,"AES");
    final String first=MainActivity.SecureSyncCodec.encrypt(json,key);
    final String second=MainActivity.SecureSyncCodec.encrypt(json,key);
    check(first.startsWith("v1."),"versioned ciphertext");
    check(!first.contains("access.fake")&&!first.contains("refresh.fake"),"no plaintext credentials");
    check(!first.equals(second),"fresh random envelope");
    check(!first.split("[.]")[1].equals(second.split("[.]")[1]),"fresh random IV");
    check(json.equals(MainActivity.SecureSyncCodec.decrypt(first,key)),"encryption roundtrip");
    rejected(()->MainActivity.SecureSyncCodec.decrypt(first,otherKey),"wrong-key authentication");
    String[] pieces=first.split("[.]");
    byte[] changed=Base64.getDecoder().decode(pieces[2]);changed[0]^=1;
    final String changedCipher=pieces[0]+"."+pieces[1]+"."+Base64.getEncoder().encodeToString(changed);
    rejected(()->MainActivity.SecureSyncCodec.decrypt(changedCipher,key),"ciphertext authentication");
    byte[] changedIv=Base64.getDecoder().decode(pieces[1]);changedIv[0]^=1;
    final String changedIvEnvelope=pieces[0]+"."+Base64.getEncoder().encodeToString(changedIv)+"."+pieces[2];
    rejected(()->MainActivity.SecureSyncCodec.decrypt(changedIvEnvelope,key),"IV authentication");
    rejected(()->MainActivity.SecureSyncCodec.decrypt("v2."+pieces[1]+"."+pieces[2],key),"unknown version");
    rejected(()->MainActivity.SecureSyncCodec.decrypt("v1.AA==.AA==",key),"short IV and tag");
    rejected(()->MainActivity.SecureSyncCodec.decrypt(first+".extra",key),"extra envelope field");
    rejected(()->MainActivity.SecureSyncCodec.decrypt("not-base64",key),"malformed envelope");
    char[] large=new char[MainActivity.SecureSyncCodec.MAX_BYTES+1];Arrays.fill(large,'x');
    rejected(()->MainActivity.SecureSyncCodec.encrypt(new String(large),key),"plaintext byte limit");
    char[] utf8Large=new char[MainActivity.SecureSyncCodec.MAX_BYTES/2+1];Arrays.fill(utf8Large,(char)233);
    rejected(()->MainActivity.SecureSyncCodec.encrypt(new String(utf8Large),key),"UTF-8 byte limit");
    char[] exact=new char[MainActivity.SecureSyncCodec.MAX_BYTES];Arrays.fill(exact,'x');
    final String maximum=new String(exact);
    check(maximum.equals(MainActivity.SecureSyncCodec.decrypt(MainActivity.SecureSyncCodec.encrypt(maximum,key),key)),"maximum-size roundtrip");
    char[] giant=new char[MainActivity.SecureSyncCodec.MAX_BYTES*2+1];Arrays.fill(giant,'x');
    rejected(()->MainActivity.SecureSyncCodec.decrypt(new String(giant),key),"bounded ciphertext input");
    System.out.println("PASS: "+checks+" production native policy and AES/GCM checks; AndroidKeyStore/device execution requires Android.");
  }
}
`;

test('production native allowlist and AES/GCM reject bypasses, tampering and oversized sessions', {skip: !existsSync(platform) || !existsSync(stubs)}, t => {
  const workspace = mkdtempSync(join(tmpdir(), 'labwise-native-sync-'));
  t.after(() => rmSync(workspace, {recursive: true, force: true}));
  const harnessFile = join(workspace, 'NativeSyncHarness.java');
  writeFileSync(harnessFile, harness);
  const classpath = workspace + delimiter + platform;
  const options = {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000};
  execFileSync('java', ['com.sun.tools.javac.Main', '-source', '8', '-target', '8', '-Xlint:-options', '-bootclasspath', platform + delimiter + stubs, '-encoding', 'UTF-8', '-d', workspace, 'android/src/com/labwise/study/MainActivity.java', 'android/src/com/labwise/study/PdfActivity.java'], options);
  execFileSync('java', ['com.sun.tools.javac.Main', '-source', '8', '-target', '8', '-Xlint:-options', '-classpath', classpath, '-encoding', 'UTF-8', '-d', workspace, harnessFile], options);
  const output = execFileSync('java', ['-cp', classpath, 'com.labwise.study.NativeSyncHarness', JSON.stringify({version: 1, project: 'https://ncfovahpjofwrygxnbst.supabase.co', session: {accessToken: 'access.fake', refreshToken: 'refresh.fake', expiresAt: 1794000000000, user: {id: 'fake-user', email: 'fake@example.org'}}})], options);
  assert.match(output, /PASS: \d+ production native policy and AES\/GCM checks/);
  t.diagnostic(output.trim());
});
