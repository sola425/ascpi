package com.labwise.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
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
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Offline-only asset host. No INTERNET or storage permission is requested. */
public final class MainActivity extends Activity {
  private static final String HOST="appassets.androidplatform.net";
  private static final int PICK_JSON=101, SAVE_JSON=102;
  private WebView web;
  private ValueCallback<Uri[]> chooser;
  private String pendingExport;
  private String pendingName;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    if(state!=null){pendingExport=state.getString("export");pendingName=state.getString("exportName");}
    getWindow().setStatusBarColor(Color.rgb(35,75,62));
    getWindow().setNavigationBarColor(Color.rgb(35,75,62));
    FrameLayout root=new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(248,249,244));
    root.setOnApplyWindowInsetsListener((v,insets)->{
      v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
      return insets.consumeSystemWindowInsets();
    });
    web=new WebView(this);
    root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    setContentView(root);
    WebSettings settings=web.getSettings();
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
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();
        if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost()))return error(403,"Network unavailable in offline app");
        String path=uri.getPath();
        if(path==null||!path.startsWith("/assets/")||path.contains("..")||path.contains("\\"))return error(403,"Invalid asset path");
        path=path.substring(8);
        if(path.isEmpty())path="index.html";
        try {
          InputStream data=getAssets().open(path);
          Map<String,String> headers=new HashMap<>();
          headers.put("X-Content-Type-Options","nosniff");
          headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
          String mime=mime(path);
          return new WebResourceResponse(mime,mime.startsWith("text/")||mime.contains("json")?"UTF-8":null,200,"OK",headers,data);
        }catch(Exception ex){return error(404,"Asset not found");}
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return openLink(request.getUrl());}
      @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return openLink(Uri.parse(url));}
      @Override public void onPageFinished(WebView view,String url){
        if(url.startsWith("https://"+HOST+"/assets/"))view.evaluateJavascript("document.documentElement.classList.add('android-app')",null);
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
    if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost())){
      String documentId=documentId(uri);
      if(documentId!=null){openPdf(documentId,linkPage(uri));return true;}
      return uri.getPath()==null||!uri.getPath().startsWith("/assets/");
    }
    // App content cannot navigate to arbitrary schemes or expose its native bridge remotely.
    toast("This study app works offline. External links are not opened here.");
    return true;
  }
  private static String documentId(Uri uri){
    if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost()))return null;
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
    if(path.endsWith(".svg"))return "image/svg+xml";
    if(path.endsWith(".pdf"))return "application/pdf";
    return "application/octet-stream";
  }
  private static WebResourceResponse error(int status,String message){return new WebResourceResponse("text/plain","UTF-8",status,status==404?"Not Found":"Forbidden",new HashMap<>(),new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));}
  private void toast(String text){runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show());}

  private final class NativeBridge {
    @JavascriptInterface public String version(){return "4.0.0";}
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
    if(request==PICK_JSON&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);chooser=null;}
    if(request==SAVE_JSON){
      String content=pendingExport;pendingExport=null;pendingName=null;
      if(result==RESULT_OK&&data!=null&&data.getData()!=null&&content!=null){
        Uri dest=data.getData();new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(dest,"wt")){if(out==null)throw new java.io.IOException();out.write(content.getBytes(StandardCharsets.UTF_8));toast("Backup saved.");}catch(Exception e){toast("Could not save this backup. Try another location.");}},"LabwiseExport").start();
      }
    }
  }
  @Override public void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);/* Large export contents are deliberately not placed in Binder state. */}
  @Override public void onBackPressed(){web.evaluateJavascript("window.labwiseBack ? window.labwiseBack() : false",result->{if(!"true".equals(result))new AlertDialog.Builder(this).setTitle("Close Labwise?").setMessage("Your progress is saved on this device.").setNegativeButton("Keep studying",null).setPositiveButton("Close",(d,w)->finish()).show();});}
  @Override protected void onPause(){web.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();web.evaluateJavascript("window.labwiseNativeReading && window.labwiseNativeReading()",null);}}
  @Override protected void onDestroy(){if(chooser!=null){chooser.onReceiveValue(null);chooser=null;}if(web!=null){web.removeJavascriptInterface("LabwiseAndroid");web.destroy();}super.onDestroy();}
}
