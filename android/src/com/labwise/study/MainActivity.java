package com.labwise.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.speech.RecognizerIntent;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Bundled study host with opt-in account APIs and foreground device speech. */
public final class MainActivity extends Activity {
  private static final String HOST="appassets.androidplatform.net";
  private static final int MAX_SYNC_CONFIG_BYTES=16*1024;
  private static final String SYNC_AUTH_STORAGE_KEY="labwise-sync-auth-v1";
  private static final String SYNC_SESSION_PREFERENCES="sync-session";
  private static final String SYNC_KEY_ALIAS="LabwiseSyncSessionKeyV1";
  private static final int PICK_JSON=101, SAVE_JSON=102;
  private static int nextVoiceRequest=2000;
  private volatile SyncPolicy syncPolicy=SyncPolicy.disabled();
  private final Object secureSessionLock=new Object();
  private WebView web;
  private ValueCallback<Uri[]> chooser;
  private String pendingExport;
  private String pendingName;
  private final Handler voiceHandler=new Handler(Looper.getMainLooper());
  private String voiceToken;
  private int voiceRequest;
  private Runnable voiceTimeout;
  private HostVoice hostVoice;
  private volatile String webViewVersion="";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    syncPolicy=readSyncPolicy();
    if(state!=null){pendingExport=state.getString("export");pendingName=state.getString("exportName");}
    getWindow().setStatusBarColor(Color.rgb(35,75,62));
    getWindow().setNavigationBarColor(Color.rgb(35,75,62));
    setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
    FrameLayout root=new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(248,249,244));
    root.setOnApplyWindowInsetsListener((v,insets)->{
      v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
      return insets.consumeSystemWindowInsets();
    });
    web=new WebView(this);
    try{android.content.pm.PackageInfo engine=WebView.getCurrentWebViewPackage();if(engine!=null&&engine.versionName!=null)webViewVersion=engine.versionName;}catch(RuntimeException ignored){}
    hostVoice=new HostVoice(this,new HostVoice.Events(){
      @Override public void speech(String token,String status,String code){hostVoiceEvent("labwiseNativeHostSpeech",token,status,null,code);}
      @Override public void recognition(String token,String status,String text,String code){hostVoiceEvent("labwiseNativeHostResult",token,status,text,code);}
      @Override public void beforeHostAudio(){cancelNativeVoice(true);}
    });
    root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    setContentView(root);
    WebSettings settings=web.getSettings();
    // Every APK upgrade reads its bundled bytes, even when asset URLs are unchanged.
    // This affects HTTP resource caching, never DOM storage or saved progress.
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true); // Only URIs selected via the Android document picker.
    settings.setAllowFileAccessFromFileURLs(false);
    settings.setAllowUniversalAccessFromFileURLs(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSupportMultipleWindows(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setMediaPlaybackRequiresUserGesture(true);
    settings.setTextZoom(100);
    if(android.os.Build.VERSION.SDK_INT>=29)settings.setForceDark(WebSettings.FORCE_DARK_OFF);
    web.setBackgroundColor(Color.rgb(248,249,244));
    web.addJavascriptInterface(new NativeBridge(),"LabwiseAndroid");
    web.setWebViewClient(new WebViewClient(){
      @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){cancelNativeVoice(false);if(hostVoice!=null)hostVoice.pageChanged();}
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();
        if(!isAssetOrigin(uri)){
          // Only this immutable, bundled configuration can authorize network access.
          // Returning null keeps normal WebView TLS validation and CORS in force.
          if(syncPolicy.allows(uri.toString(),request.getMethod(),request.isForMainFrame()))return null;
          return error(403,"This connection is not enabled in Labwise.");
        }
        String path=uri.getPath();
        if(path==null||!path.startsWith("/assets/")||path.contains("..")||path.contains("\\"))return error(403,"Invalid asset path");
        path=path.substring(8);
        if(path.isEmpty())path="index.html";
        try {
          InputStream data=getAssets().open(path);
          Map<String,String> headers=new HashMap<>();
          headers.put("X-Content-Type-Options","nosniff");
          headers.put("Cache-Control","no-store");
          headers.put("Content-Security-Policy",syncPolicy.contentSecurityPolicy());
          String mime=mime(path);
          return new WebResourceResponse(mime,mime.startsWith("text/")||mime.contains("json")?"UTF-8":null,200,"OK",headers,data);
        }catch(Exception ex){return error(404,"Asset not found");}
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return openLink(request.getUrl());}
      @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return openLink(Uri.parse(url));}
      @Override public void onPageFinished(WebView view,String url){
        Uri uri=Uri.parse(url);
        if(isAssetOrigin(uri)&&uri.getPath()!=null&&uri.getPath().startsWith("/assets/"))view.evaluateJavascript("document.documentElement.classList.add('android-app')",null);
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(chooser!=null)chooser.onReceiveValue(null);
        chooser=callback;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
        try{startActivityForResult(intent,PICK_JSON);}catch(ActivityNotFoundException e){chooser.onReceiveValue(null);chooser=null;toast("No document picker is available on this device.");}
        return true;
      }
    });
    web.setDownloadListener((url,ua,disposition,mime,size)->{
      Uri uri=Uri.parse(url);
      String documentId=documentId(uri);
      if(documentId!=null)openPdf(documentId,linkPage(uri));
      else toast("Use Export progress or Export bank to save a JSON backup.");
    });
    web.loadUrl("https://"+HOST+"/assets/index.html");
  }

  private boolean openLink(Uri uri){
    if(isAssetOrigin(uri)){
      String documentId=documentId(uri);
      if(documentId!=null){openPdf(documentId,linkPage(uri));return true;}
      return uri.getPath()==null||!uri.getPath().startsWith("/assets/");
    }
    // App content cannot navigate to arbitrary schemes or expose its native bridge remotely.
    toast("External links are not opened here. Use the Updates button to check for an app update.");
    return true;
  }
  private static boolean isAssetOrigin(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&uri.getUserInfo()==null&&(uri.getPort()==-1||uri.getPort()==443);}
  private static String documentId(Uri uri){
    if(!isAssetOrigin(uri))return null;
    String path=uri.getPath();
    if("/assets/docs/textbook.pdf".equals(path))return "textbook";
    if("/assets/docs/boc-1.pdf".equals(path))return "boc1";
    if("/assets/docs/boc-2.pdf".equals(path))return "boc2";
    return null;
  }
  private static int linkPage(Uri uri){
    String fragment=uri.getFragment();
    if(fragment!=null)for(String part:fragment.split("&"))if(part.startsWith("page="))try{return Math.max(1,Integer.parseInt(part.substring(5)));}catch(NumberFormatException ignored){}
    return 1;
  }
  private void openPdf(String documentId,int page){
    if(PdfActivity.assetFor(documentId)==null){toast("This document is not available in the offline library.");return;}
    startActivity(new Intent(this,PdfActivity.class).putExtra("documentId",documentId).putExtra("page",Math.max(1,page)));
  }
  private static String mime(String path){
    if(path.endsWith(".html"))return "text/html";
    if(path.endsWith(".js"))return "text/javascript";
    if(path.endsWith(".css"))return "text/css";
    if(path.endsWith(".json")||path.endsWith(".webmanifest"))return "application/json";
    if(path.endsWith(".png"))return "image/png";
    if(path.endsWith(".jpg")||path.endsWith(".jpeg"))return "image/jpeg";
    if(path.endsWith(".webp"))return "image/webp";
    if(path.endsWith(".svg"))return "image/svg+xml";
    if(path.endsWith(".pdf"))return "application/pdf";
    return "application/octet-stream";
  }
  private static WebResourceResponse error(int status,String message){return new WebResourceResponse("text/plain","UTF-8",status,status==404?"Not Found":"Forbidden",new HashMap<>(),new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));}
  private void toast(String text){runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show());}

  private SyncPolicy readSyncPolicy(){
    try(InputStream input=getAssets().open("sync-config.json");ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] buffer=new byte[1024];int count;
      while((count=input.read(buffer))!=-1){
        if(output.size()+count>MAX_SYNC_CONFIG_BYTES)return SyncPolicy.disabled();
        output.write(buffer,0,count);
      }
      org.json.JSONObject config=new org.json.JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));
      return SyncPolicy.configured(Boolean.TRUE.equals(config.opt("enabled")),config.optString("url",null));
    }catch(Exception ignored){return SyncPolicy.disabled();}
  }

  /** Pure URL policy, shared by the asset CSP and the request interceptor. */
  static final class SyncPolicy {
    final String origin;
    private SyncPolicy(String value){origin=value;}
    static SyncPolicy disabled(){return new SyncPolicy(null);}
    static SyncPolicy configured(boolean enabled,String value){
      if(!enabled||value==null||value.length()>256)return disabled();
      try{
        URI uri=new URI(value);String host=uri.getHost();
        if(!"https".equals(uri.getScheme())||host==null||!host.matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.supabase\\.co")||!validAuthority(uri)||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!("".equals(uri.getRawPath())||"/".equals(uri.getRawPath())))return disabled();
        return new SyncPolicy("https://"+host);
      }catch(Exception ignored){return disabled();}
    }
    private static boolean validAuthority(URI uri){
      int port=uri.getPort();
      return uri.getRawUserInfo()==null&&(port==-1||port==443)&&(uri.getHost()+(port==443?":443":"")).equals(uri.getRawAuthority());
    }
    boolean allows(String value,String method,boolean mainFrame){
      if(origin==null||mainFrame||value==null||value.length()>8192)return false;
      try{
        URI uri=new URI(value);
        if(!"https".equals(uri.getScheme())||!validAuthority(uri)||!origin.equals("https://"+uri.getHost())||uri.getRawFragment()!=null)return false;
        String path=uri.getRawPath();
        boolean user="/auth/v1/user".equals(path);
        boolean diagnostic="/auth/v1/settings".equals(path)||"/auth/v1/health".equals(path);
        boolean auth=user||"/auth/v1/token".equals(path)||"/auth/v1/signup".equals(path)||"/auth/v1/recover".equals(path)||"/auth/v1/logout".equals(path);
        boolean rpc="/rest/v1/rpc/labwise_read_progress".equals(path)||"/rest/v1/rpc/labwise_write_progress".equals(path)||"/rest/v1/rpc/labwise_create_challenge".equals(path)||"/rest/v1/rpc/labwise_join_challenge".equals(path)||"/rest/v1/rpc/labwise_get_challenge".equals(path)||"/rest/v1/rpc/labwise_get_turn".equals(path)||"/rest/v1/rpc/labwise_submit_answer".equals(path)||"/rest/v1/rpc/labwise_next_turn".equals(path)||"/rest/v1/rpc/labwise_list_challenges".equals(path);
        if(!auth&&!rpc&&!diagnostic)return false;
        if(rpc&&uri.getRawQuery()!=null)return false;
        if(diagnostic&&uri.getRawQuery()!=null)return false;
        if("OPTIONS".equals(method))return true;
        if(diagnostic)return "GET".equals(method);
        return user?("GET".equals(method)||"PUT".equals(method)):"POST".equals(method);
      }catch(Exception ignored){return false;}
    }
    String contentSecurityPolicy(){
      return "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"+(origin==null?"":" "+origin)+"; object-src 'none'; base-uri 'none'; form-action 'none'";
    }
  }

  /** AES/GCM envelopes contain only ciphertext; AndroidKeyStore supplies the nonexportable key. */
  static final class SecureSyncCodec {
    static final int MAX_BYTES=64*1024;
    private static final byte[] AAD=(SYNC_AUTH_STORAGE_KEY+"|v1").getBytes(StandardCharsets.UTF_8);
    static String encrypt(String json,SecretKey key)throws GeneralSecurityException{
      if(json==null||json.length()>MAX_BYTES)throw new IllegalArgumentException("Invalid session size");
      byte[] plain=json.getBytes(StandardCharsets.UTF_8);
      if(plain.length>MAX_BYTES)throw new IllegalArgumentException("Invalid session size");
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
      // The provider generates a new random IV for every write.
      cipher.init(Cipher.ENCRYPT_MODE,key);cipher.updateAAD(AAD);
      byte[] iv=cipher.getIV();
      if(iv==null||iv.length!=12)throw new GeneralSecurityException("Invalid session IV");
      return "v1."+Base64.getEncoder().encodeToString(iv)+"."+Base64.getEncoder().encodeToString(cipher.doFinal(plain));
    }
    static String decrypt(String encoded,SecretKey key)throws GeneralSecurityException{
      if(encoded==null||encoded.length()>MAX_BYTES*2)throw new IllegalArgumentException("Invalid session size");
      String[] parts=encoded.split("\\.",-1);
      if(parts.length!=3||!"v1".equals(parts[0]))throw new IllegalArgumentException("Invalid session envelope");
      byte[] iv=Base64.getDecoder().decode(parts[1]),ciphertext=Base64.getDecoder().decode(parts[2]);
      if(iv.length!=12||ciphertext.length<16||ciphertext.length>MAX_BYTES+16)throw new IllegalArgumentException("Invalid session size");
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,iv));cipher.updateAAD(AAD);
      byte[] plain=cipher.doFinal(ciphertext);
      try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(plain)).toString();}
      catch(java.nio.charset.CharacterCodingException ex){throw new GeneralSecurityException("Invalid session encoding");}
    }
  }
  private SecretKey secureSyncKey(boolean create)throws Exception{
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
    java.security.Key existing=store.getKey(SYNC_KEY_ALIAS,null);
    if(existing!=null){if(!(existing instanceof SecretKey))throw new GeneralSecurityException("Invalid session key");return (SecretKey)existing;}
    if(!create)return null;
    KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(SYNC_KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).setRandomizedEncryptionRequired(true).build());
    return generator.generateKey();
  }
  private static boolean validSecureSyncJson(String json){
    if(json==null||json.length()>SecureSyncCodec.MAX_BYTES||json.getBytes(StandardCharsets.UTF_8).length>SecureSyncCodec.MAX_BYTES)return false;
    try{
      org.json.JSONTokener parser=new org.json.JSONTokener(json);Object value=parser.nextValue();
      return value instanceof org.json.JSONObject&&parser.nextClean()==0&&validSecureSyncValue(value,0);
    }catch(org.json.JSONException|StackOverflowError ignored){return false;}
  }
  private static boolean validSecureSyncValue(Object value,int depth)throws org.json.JSONException{
    if(depth>32)return false;
    if(value instanceof org.json.JSONObject){
      org.json.JSONObject object=(org.json.JSONObject)value;Iterator<String> keys=object.keys();
      while(keys.hasNext()){
        String key=keys.next(),name=key.toLowerCase(Locale.ROOT);
        if(name.contains("password")||"passphrase".equals(name)||"secret".equals(name)||!validSecureSyncValue(object.get(key),depth+1))return false;
      }
    }else if(value instanceof org.json.JSONArray){
      org.json.JSONArray array=(org.json.JSONArray)value;
      for(int i=0;i<array.length();i++)if(!validSecureSyncValue(array.get(i),depth+1))return false;
    }
    return true;
  }
  private String readSecureSession(String key){
    if(!SYNC_AUTH_STORAGE_KEY.equals(key))return null;
    synchronized(secureSessionLock){
      try{
        String encrypted=getSharedPreferences(SYNC_SESSION_PREFERENCES,MODE_PRIVATE).getString(key,null);
        if(encrypted==null)return null;
        SecretKey secret=secureSyncKey(false);if(secret==null)return null;
        String json=SecureSyncCodec.decrypt(encrypted,secret);
        return validSecureSyncJson(json)?json:null;
      }catch(Exception ignored){return null;}
    }
  }
  private boolean writeSecureSession(String key,String json){
    if(!SYNC_AUTH_STORAGE_KEY.equals(key)||!validSecureSyncJson(json))return false;
    synchronized(secureSessionLock){
      try{
        String encrypted=SecureSyncCodec.encrypt(json,secureSyncKey(true));
        return getSharedPreferences(SYNC_SESSION_PREFERENCES,MODE_PRIVATE).edit().putString(key,encrypted).commit();
      }catch(Exception ignored){return false;}
    }
  }
  private boolean clearSecureSession(String key){
    if(!SYNC_AUTH_STORAGE_KEY.equals(key))return false;
    synchronized(secureSessionLock){
      try{return getSharedPreferences(SYNC_SESSION_PREFERENCES,MODE_PRIVATE).edit().remove(key).commit();}
      catch(Exception ignored){return false;}
    }
  }

  private static boolean validVoiceToken(String token){return token!=null&&token.length()<=96&&token.matches("lwvoice_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+");}
  private static String voiceLanguage(String language){return language!=null&&language.length()<=63&&language.matches("[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8}){0,6}")?language:"en-US";}
  private static String javascriptString(String value){return org.json.JSONObject.quote(value).replace(String.valueOf((char)0x2028),"\\u2028").replace(String.valueOf((char)0x2029),"\\u2029");}
  private void hostVoiceEvent(String callback,String token,String status,String text,String code){
    if(!HostVoiceRules.validToken(token)||web==null)return;
    try{
      org.json.JSONObject payload=new org.json.JSONObject().put("status",status);
      if(text!=null)payload.put("text",text);if(code!=null)payload.put("code",code);
      web.evaluateJavascript("window."+callback+" && window."+callback+"("+javascriptString(token)+",JSON.parse("+javascriptString(payload.toString())+"))",null);
    }catch(org.json.JSONException ignored){/* Bounded local speech events only. */}
  }
  private void voiceResult(String token,String status,ArrayList<String> alternatives,String code,String message){
    if(!validVoiceToken(token)||web==null)return;
    try{
      org.json.JSONObject payload=new org.json.JSONObject();
      org.json.JSONArray texts=new org.json.JSONArray();
      if(alternatives!=null)for(String text:alternatives)texts.put(text);
      payload.put("status",status).put("text",texts.length()>0?texts.getString(0):"").put("alternatives",texts);
      if(code!=null)payload.put("code",code);
      if(message!=null)payload.put("message",message);
      web.evaluateJavascript("window.labwiseNativeVoiceResult && window.labwiseNativeVoiceResult("+javascriptString(token)+",JSON.parse("+javascriptString(payload.toString())+"))",null);
    }catch(org.json.JSONException ignored){/* All payload values are local strings. */}
  }
  private String clearNativeVoice(){
    String token=voiceToken;voiceToken=null;voiceRequest=0;
    if(voiceTimeout!=null){voiceHandler.removeCallbacks(voiceTimeout);voiceTimeout=null;}
    return token;
  }
  private void cancelNativeVoice(boolean notify){
    int request=voiceRequest;String token=clearNativeVoice();
    if(token==null)return;
    try{finishActivity(request);}catch(RuntimeException ignored){}
    if(notify)voiceResult(token,"cancelled",null,null,null);
  }
  private void startNativeVoice(String token,String language){
    if(!validVoiceToken(token)||isFinishing()||web==null)return;
    if(hostVoice!=null){hostVoice.stopListening();hostVoice.stopSpeech();}
    cancelNativeVoice(true);
    if(nextVoiceRequest>65000){voiceResult(token,"error",null,"error","Please reopen Labwise before starting another voice session.");return;}
    voiceToken=token;
    // Each launch gets a distinct request ID so a cancelled activity cannot satisfy a later token.
    final int request=nextVoiceRequest++;voiceRequest=request;
    Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,voiceLanguage(language));
    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,5);
    intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true);
    // Never provide question content or answer choices to the external provider.
    intent.putExtra(RecognizerIntent.EXTRA_PROMPT,"Speak your answer, then review the transcript in Labwise.");
    try{
      startActivityForResult(intent,request);
      voiceTimeout=()->{
        if(voiceRequest!=request||!token.equals(voiceToken))return;
        cancelNativeVoice(false);
        voiceResult(token,"error",null,"timeout","Voice input timed out. Try again or type your answer.");
      };
      voiceHandler.postDelayed(voiceTimeout,60000);
    }catch(ActivityNotFoundException ex){
      clearNativeVoice();voiceResult(token,"unavailable",null,"unavailable","No system speech provider is installed. You can type your answer.");
    }catch(SecurityException ex){
      clearNativeVoice();voiceResult(token,"error",null,"not-allowed","The system speech provider could not open. Check its microphone permission or type your answer.");
    }catch(RuntimeException ex){
      clearNativeVoice();voiceResult(token,"error",null,"error","The system speech provider could not open. You can type your answer.");
    }
  }

  private final class NativeBridge {
    @JavascriptInterface public String version(){return "7.4.0";}
    @JavascriptInterface public String readSecureSyncSession(String key){return readSecureSession(key);}
    @JavascriptInterface public boolean writeSecureSyncSession(String key,String json){return writeSecureSession(key,json);}
    @JavascriptInterface public boolean clearSecureSyncSession(String key){return clearSecureSession(key);}
    @JavascriptInterface public String syncCapabilities(){
      try{
        org.json.JSONObject value=new org.json.JSONObject().put("configured",syncPolicy.origin!=null).put("origin",syncPolicy.origin==null?"":syncPolicy.origin);
        return value.put("webViewVersion",webViewVersion).toString();
      }catch(RuntimeException|org.json.JSONException ignored){return "{\"configured\":false}";}
    }
    @JavascriptInterface public String hostVoiceCapabilities(){return hostVoice==null?"{}":hostVoice.capabilities();}
    @JavascriptInterface public boolean speakHost(String text,String token,String voiceId,double rate){return hostVoice!=null&&hostVoice.speak(text,token,voiceId,rate);}
    @JavascriptInterface public void stopHostSpeech(){if(hostVoice!=null)hostVoice.stopSpeech();}
    @JavascriptInterface public boolean startHostListening(String token,String language){return hostVoice!=null&&hostVoice.listen(token,language);}
    @JavascriptInterface public void stopHostListening(){if(hostVoice!=null)hostVoice.stopListening();}
    @JavascriptInterface public void startVoiceInput(String token,String language){if(validVoiceToken(token))runOnUiThread(()->startNativeVoice(token,language));}
    @JavascriptInterface public void cancelVoiceInput(String token){if(validVoiceToken(token))runOnUiThread(()->{if(token.equals(voiceToken))cancelNativeVoice(true);});}
    @JavascriptInterface public void openTextbook(int page){openDocument("textbook",page);}
    @JavascriptInterface public void openDocument(String documentId,int page){runOnUiThread(()->openPdf(documentId,page));}
    @JavascriptInterface public String takeReadingPosition(){
      SharedPreferences prefs=getSharedPreferences("reader-position",MODE_PRIVATE);
      if(!prefs.getBoolean("pending",false))return "null";
      String id=prefs.getString("documentId","");int page=prefs.getInt("page",1);
      prefs.edit().putBoolean("pending",false).apply();
      if(PdfActivity.assetFor(id)==null)return "null";
      return "{\"documentId\":"+org.json.JSONObject.quote(id)+",\"page\":"+Math.max(1,page)+"}";
    }
    @JavascriptInterface public void openUpdates(){
      runOnUiThread(()->{
        Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk"));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try{startActivity(intent);}catch(ActivityNotFoundException e){toast("No browser is available. Open the Labwise GitHub releases page on another device.");}
      });
    }
    @JavascriptInterface public void exportJSON(String filename,String content){
      if(content==null||content.length()>25*1024*1024){toast("Backup is too large to save.");return;}
      final String safeName=filename!=null&&filename.matches("[a-zA-Z0-9._-]{1,80}\\.json")?filename:"labwise-backup.json";
      runOnUiThread(()->{
        if(pendingExport!=null){toast("Finish or cancel the open save dialog first.");return;}
        pendingExport=content;pendingName=safeName;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,safeName);
        try{startActivityForResult(intent,SAVE_JSON);}catch(ActivityNotFoundException e){pendingExport=null;pendingName=null;toast("No document saver is available on this device.");}
      });
    }
  }
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==voiceRequest&&voiceToken!=null){
      String token=clearNativeVoice();
      if(result==RESULT_CANCELED){voiceResult(token,"cancelled",null,null,null);return;}
      if(result==RESULT_OK){
        try{
          ArrayList<String> values=data==null?null:data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
          ArrayList<String> alternatives=new ArrayList<>();
          if(values!=null)for(String value:values){
            if(value==null)continue;
            String text=value.trim();if(text.length()>12000)text=text.substring(0,12000);
            if(!text.isEmpty()&&!alternatives.contains(text))alternatives.add(text);
            if(alternatives.size()>=5)break;
          }
          if(!alternatives.isEmpty())voiceResult(token,"ok",alternatives,null,null);
          else voiceResult(token,"error",null,"no-speech","No speech was recognized. Try again or type your answer.");
        }catch(RuntimeException ex){voiceResult(token,"error",null,"error","The speech provider returned an unreadable result. You can type your answer.");}
        return;
      }
      String code=result==RecognizerIntent.RESULT_NO_MATCH?"no-speech":result==RecognizerIntent.RESULT_NETWORK_ERROR?"network":result==RecognizerIntent.RESULT_AUDIO_ERROR?"audio-capture":"error";
      voiceResult(token,"error",null,code,"The system speech provider could not finish. Try again or type your answer.");
      return;
    }
    if(request==PICK_JSON&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);chooser=null;}
    if(request==SAVE_JSON){
      String content=pendingExport;pendingExport=null;pendingName=null;
      if(result==RESULT_OK&&data!=null&&data.getData()!=null&&content!=null){
        Uri dest=data.getData();new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(dest,"wt")){if(out==null)throw new java.io.IOException();out.write(content.getBytes(StandardCharsets.UTF_8));toast("Backup saved.");}catch(Exception e){toast("Could not save this backup. Try another location.");}},"LabwiseExport").start();
      }
    }
  }
  @Override public void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);/* Large export contents are deliberately not placed in Binder state. */}
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(hostVoice!=null)hostVoice.permissionResult(request,grants);}
  @Override public void onBackPressed(){web.evaluateJavascript("window.labwiseBack ? window.labwiseBack() : false",result->{if(!"true".equals(result))new AlertDialog.Builder(this).setTitle("Close Labwise?").setMessage("Saved progress stays on this device. Export a backup before closing if you saw a storage warning.").setNegativeButton("Keep studying",null).setPositiveButton("Close",(d,w)->finish()).show();});}
  @Override protected void onPause(){if(hostVoice!=null)hostVoice.pause();if(web!=null)web.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(hostVoice!=null)hostVoice.resume();if(web!=null){web.onResume();web.evaluateJavascript("window.labwiseNativeReading && window.labwiseNativeReading()",null);}}
  @Override protected void onDestroy(){cancelNativeVoice(false);if(hostVoice!=null){hostVoice.destroy();hostVoice=null;}if(chooser!=null){chooser.onReceiveValue(null);chooser=null;}if(web!=null){web.removeJavascriptInterface("LabwiseAndroid");web.destroy();web=null;}super.onDestroy();}
}
