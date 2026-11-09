package com.labwise.study;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Foreground, half-duplex speech. No audio files, transcripts or credentials are stored. */
final class HostVoice {
  interface Events {
    void speech(String token,String status,String code);
    void recognition(String token,String status,String text,String code);
    void beforeHostAudio();
  }
  static final int MICROPHONE_REQUEST=1031;
  private final Activity activity;
  private final Events events;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private TextToSpeech tts;
  private SpeechRecognizer recognizer;
  private volatile String capabilities="{\"ttsAvailable\":false,\"initializing\":false,\"recognitionAvailable\":false,\"microphonePermission\":false,\"permissionState\":\"notGranted\",\"voices\":[]}";
  private volatile boolean foreground=false,destroyed=false;
  private boolean initializing=false,ttsReady=false,recognitionAvailable=false,onDevice=false;
  private boolean permissionInFlight=false;
  private long lastInitFailure=0,speechGeneration=0,recognitionGeneration=0;
  private String speechToken,recognitionToken,pendingPermissionToken,pendingLanguage;
  private Speech pendingSpeech;
  private Runnable speechTimeout,recognitionTimeout,permissionTimeout,beginListening;
  private List<Voice> voices=new ArrayList<>();
  private Voice bestVoice;
  private AudioManager audioManager;
  private AudioFocusRequest audioFocus;
  private boolean ownsAudioFocus=false;

  private static final class Speech {
    final String text,token,voice;final float rate;
    Speech(String text,String token,String voice,double rate){this.text=text;this.token=token;this.voice=voice;this.rate=HostVoiceRules.rate(rate);}
  }
  HostVoice(Activity activity,Events events){
    this.activity=activity;this.events=events;refreshRecognition();
    audioManager=activity.getSystemService(AudioManager.class);
    AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    audioFocus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes).setOnAudioFocusChangeListener(change->{
      if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT){cancelSpeech("interrupted",true);cancelRecognition("interrupted",true,true);}
    },handler).build();
    publishCapabilities();
  }
  private boolean claimAudioFocus(){
    if(ownsAudioFocus||audioManager==null)return true;
    try{ownsAudioFocus=audioManager.requestAudioFocus(audioFocus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;return ownsAudioFocus;}catch(RuntimeException ignored){return false;}
  }
  private void releaseAudioFocus(){if(ownsAudioFocus&&speechToken==null&&recognitionToken==null){ownsAudioFocus=false;try{audioManager.abandonAudioFocusRequest(audioFocus);}catch(RuntimeException ignored){}}}

  String capabilities(){handler.post(()->{if(foreground)ensureTts();publishCapabilities();});return capabilities;}
  boolean speak(String text,String token,String voice,double rate){
    if(destroyed||!HostVoiceRules.validToken(token)||!HostVoiceRules.validText(text)||!HostVoiceRules.validVoice(voice))return false;
    Speech request=new Speech(text,token,voice,rate);handler.post(()->speakOnMain(request));return true;
  }
  void stopSpeech(){handler.post(()->cancelSpeech("cancelled",true));}
  boolean listen(String token,String language){
    if(destroyed||!HostVoiceRules.validToken(token))return false;
    handler.post(()->listenOnMain(token,HostVoiceRules.language(language)));return true;
  }
  void stopListening(){handler.post(()->cancelRecognition("cancelled",true,true));}
  void resume(){
    if(destroyed)return;foreground=true;refreshRecognition();publishCapabilities();
    if(pendingPermissionToken!=null&&!permissionInFlight){String token=pendingPermissionToken,language=pendingLanguage;clearPendingPermission();listenOnMain(token,language);}
  }
  void pause(){
    foreground=false;cancelSpeech("background",true);
    // A permission dialog may briefly pause the Activity. It never opens a mic
    // in the background; the pending request can resume only in resume().
    cancelRecognition("background",true,!permissionInFlight);publishCapabilities();
  }
  void pageChanged(){cancelSpeech("cancelled",false);cancelRecognition("cancelled",false,true);}
  void destroy(){
    if(destroyed)return;destroyed=true;foreground=false;
    cancelSpeech("cancelled",false);cancelRecognition("cancelled",false,true);
    if(tts!=null){try{tts.shutdown();}catch(RuntimeException ignored){}tts=null;}
    voices.clear();bestVoice=null;ttsReady=false;initializing=false;publishCapabilities();
  }
  boolean permissionResult(int request,int[] grants){
    if(request!=MICROPHONE_REQUEST)return false;
    permissionInFlight=false;
    String token=pendingPermissionToken,language=pendingLanguage;
    if(token==null){publishCapabilities();return true;}
    boolean granted=grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED;
    if(!granted){clearPendingPermission();emitRecognition(token,"error","","permission-denied");}
    else if(foreground){clearPendingPermission();listenOnMain(token,language);}
    publishCapabilities();return true;
  }

  private boolean hasMicrophone(){return activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;}
  private void refreshRecognition(){
    recognitionAvailable=false;onDevice=false;
    try{recognitionAvailable=SpeechRecognizer.isRecognitionAvailable(activity);}catch(RuntimeException ignored){}
    if(Build.VERSION.SDK_INT>=31)try{onDevice=SpeechRecognizer.isOnDeviceRecognitionAvailable(activity);}catch(RuntimeException ignored){}
    recognitionAvailable=recognitionAvailable||onDevice;
  }
  private void publishCapabilities(){
    try{
      JSONArray list=new JSONArray();
      for(Voice voice:voices){
        JSONObject item=new JSONObject();String label=voice.getLocale().getDisplayName(Locale.ENGLISH)+(voice.isNetworkConnectionRequired()?" · online":" · on device");
        item.put("id",voice.getName()).put("name",voice.getName()).put("label",label).put("locale",voice.getLocale().toLanguageTag()).put("quality",voice.getQuality()).put("network",voice.isNetworkConnectionRequired());list.put(item);
      }
      boolean permission=hasMicrophone();
      capabilities=new JSONObject().put("ttsAvailable",ttsReady).put("initializing",initializing).put("recognitionAvailable",recognitionAvailable).put("recognitionOnDevice",onDevice).put("recognitionMayUseNetwork",!onDevice).put("microphonePermission",permission).put("permissionState",permission?"granted":permissionInFlight?"requesting":"notGranted").put("foreground",foreground).put("selectedVoiceId",bestVoice==null?"":bestVoice.getName()).put("engine",ttsReady&&tts!=null?tts.getDefaultEngine():"").put("voices",list).toString();
    }catch(RuntimeException|JSONException ignored){/* Keep the last bounded capability snapshot. */}
  }
  private void ensureTts(){
    if(destroyed||ttsReady||initializing||!foreground||System.currentTimeMillis()-lastInitFailure<5000)return;
    initializing=true;publishCapabilities();
    try{tts=new TextToSpeech(activity,status->handler.post(()->engineReady(status)));}
    catch(RuntimeException ignored){engineReady(TextToSpeech.ERROR);}
  }
  private void engineReady(int status){
    if(destroyed){if(tts!=null){try{tts.shutdown();}catch(RuntimeException ignored){}}return;}
    initializing=false;
    if(status!=TextToSpeech.SUCCESS||tts==null){failEngine("voice-unavailable");return;}
    try{
      voices.clear();bestVoice=null;Set<Voice> available=tts.getVoices();
      if(available!=null)for(Voice voice:available){
        if(voice==null||voice.getLocale()==null||!"en".equals(voice.getLocale().getLanguage())||voice.getName()==null||!HostVoiceRules.validVoice(voice.getName())||voice.getName().isEmpty())continue;
        if(voice.getFeatures()!=null&&voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))continue;
        voices.add(voice);
        if(bestVoice==null||HostVoiceRules.prefer(voice.getQuality(),voice.isNetworkConnectionRequired(),voice.getLatency(),voice.getName(),bestVoice.getQuality(),bestVoice.isNetworkConnectionRequired(),bestVoice.getLatency(),bestVoice.getName()))bestVoice=voice;
      }
      Collections.sort(voices,Comparator.comparing((Voice voice)->voice.getLocale().toLanguageTag()).thenComparing(Voice::getName));
      if(voices.size()>100){List<Voice> bounded=new ArrayList<>(voices.subList(0,100));if(bestVoice!=null&&!bounded.contains(bestVoice))bounded.set(99,bestVoice);voices=bounded;}
      if(bestVoice!=null){if(tts.setVoice(bestVoice)!=TextToSpeech.SUCCESS){failEngine("voice-unavailable");return;}}
      else{int language=tts.setLanguage(Locale.ENGLISH);if(language==TextToSpeech.LANG_MISSING_DATA||language==TextToSpeech.LANG_NOT_SUPPORTED){failEngine("language-unavailable");return;}}
      tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
      tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
        @Override public void onStart(String id){handler.post(()->utteranceStarted(id));}
        @Override public void onDone(String id){handler.post(()->utteranceDone(id));}
        @Override public void onError(String id){handler.post(()->utteranceError(id,"speech-error"));}
        @Override public void onError(String id,int code){handler.post(()->utteranceError(id,speechError(code)));}
      });
      ttsReady=true;publishCapabilities();
      Speech queued=pendingSpeech;pendingSpeech=null;if(queued!=null)speakOnMain(queued);
    }catch(RuntimeException ignored){failEngine("voice-unavailable");}
  }
  private void failEngine(String code){
    ttsReady=false;initializing=false;lastInitFailure=System.currentTimeMillis();voices.clear();bestVoice=null;
    if(tts!=null){try{tts.shutdown();}catch(RuntimeException ignored){}tts=null;}
    Speech queued=pendingSpeech;clearSpeech();if(queued!=null)events.speech(queued.token,"error",code);publishCapabilities();
  }
  private String firstUtterance,lastUtterance;private boolean speechStarted=false;
  private void speakOnMain(Speech request){
    if(destroyed||!foreground){events.speech(request.token,"error","background");return;}
    events.beforeHostAudio();cancelRecognition("cancelled",true,true);cancelSpeech("cancelled",true);
    if(!ttsReady){pendingSpeech=request;ensureTts();
      speechTimeout=()->{if(pendingSpeech==request){pendingSpeech=null;events.speech(request.token,"error","voice-unavailable");}};handler.postDelayed(speechTimeout,15000);return;
    }
    Voice selected=bestVoice;
    if(request.voice!=null&&!request.voice.isEmpty()){
      selected=null;for(Voice voice:voices)if(request.voice.equals(voice.getName())){selected=voice;break;}
      if(selected==null){events.speech(request.token,"error","voice-unavailable");return;}
    }
    try{
      if(selected!=null&&tts.setVoice(selected)!=TextToSpeech.SUCCESS){events.speech(request.token,"error","voice-unavailable");return;}
      if(!claimAudioFocus()){events.speech(request.token,"error","audio-busy");return;}
      tts.setSpeechRate(request.rate);speechToken=request.token;long generation=++speechGeneration;speechStarted=false;
      List<String> chunks=HostVoiceRules.chunks(request.text,Math.min(TextToSpeech.getMaxSpeechInputLength(),3500));
      firstUtterance="lwhost:"+generation+":0";lastUtterance="lwhost:"+generation+":"+(chunks.size()-1);
      for(int index=0;index<chunks.size();index++){
        int result=tts.speak(chunks.get(index),index==0?TextToSpeech.QUEUE_FLUSH:TextToSpeech.QUEUE_ADD,null,"lwhost:"+generation+":"+index);
        if(result!=TextToSpeech.SUCCESS){cancelSpeech("speech-error",true);return;}
      }
      long maximum=Math.min(300000,Math.max(30000,(long)(request.text.length()*85/request.rate)+15000));
      speechTimeout=()->{if(request.token.equals(speechToken)&&generation==speechGeneration)cancelSpeech("timeout",true);};handler.postDelayed(speechTimeout,maximum);
    }catch(RuntimeException ignored){if(speechToken==null){releaseAudioFocus();events.speech(request.token,"error","speech-error");}else cancelSpeech("speech-error",true);}
  }
  private boolean currentUtterance(String id){return id!=null&&speechToken!=null&&id.startsWith("lwhost:"+speechGeneration+":");}
  private void utteranceStarted(String id){if(currentUtterance(id)&&!speechStarted){speechStarted=true;events.speech(speechToken,"start",null);}}
  private void utteranceDone(String id){if(currentUtterance(id)&&id.equals(lastUtterance)){String token=speechToken;clearSpeech();events.speech(token,"end",null);}}
  private void utteranceError(String id,String code){if(currentUtterance(id))cancelSpeech(code,true);}
  private void clearSpeech(){speechToken=null;pendingSpeech=null;speechStarted=false;firstUtterance=null;lastUtterance=null;speechGeneration++;if(speechTimeout!=null){handler.removeCallbacks(speechTimeout);speechTimeout=null;}releaseAudioFocus();}
  private void cancelSpeech(String code,boolean notify){
    String token=speechToken!=null?speechToken:pendingSpeech==null?null:pendingSpeech.token;clearSpeech();
    if(tts!=null)try{tts.stop();}catch(RuntimeException ignored){}
    if(notify&&token!=null)events.speech(token,"error",code);
  }

  private void listenOnMain(String token,String language){
    if(destroyed||!foreground){emitRecognition(token,"error","","background");return;}
    events.beforeHostAudio();cancelSpeech("cancelled",true);cancelRecognition("cancelled",true,true);refreshRecognition();
    if(!recognitionAvailable){publishCapabilities();emitRecognition(token,"error","","recognition-unavailable");return;}
    if(!hasMicrophone()){
      pendingPermissionToken=token;pendingLanguage=language;
      permissionTimeout=()->{if(token.equals(pendingPermissionToken)){clearPendingPermission();emitRecognition(token,"error","","permission-denied");}};handler.postDelayed(permissionTimeout,60000);
      if(permissionInFlight){publishCapabilities();return;}
      try{permissionInFlight=true;activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MICROPHONE_REQUEST);publishCapabilities();}
      catch(RuntimeException ignored){permissionInFlight=false;clearPendingPermission();emitRecognition(token,"error","","permission-denied");}
      return;
    }
    recognitionToken=token;long generation=++recognitionGeneration;
    // Leave a short gap after TTS has stopped, so its final audio is not captured.
    beginListening=()->{
      beginListening=null;if(!activeRecognition(token,generation))return;
      try{
        if(!claimAudioFocus()){cancelRecognition("cancelled",false,false);emitRecognition(token,"error","","audio-busy");return;}
        recognizer=onDevice&&Build.VERSION.SDK_INT>=31?SpeechRecognizer.createOnDeviceSpeechRecognizer(activity):SpeechRecognizer.createSpeechRecognizer(activity);
        recognizer.setRecognitionListener(new RecognitionListener(){
          @Override public void onReadyForSpeech(Bundle params){}
          @Override public void onBeginningOfSpeech(){}
          @Override public void onRmsChanged(float rmsdB){}
          @Override public void onBufferReceived(byte[] buffer){/* Audio is never retained. */}
          @Override public void onEndOfSpeech(){}
          @Override public void onError(int error){if(activeRecognition(token,generation)){cancelRecognition("cancelled",false,false);emitRecognition(token,"error","",recognitionError(error));}}
          @Override public void onResults(Bundle results){
            if(!activeRecognition(token,generation))return;String text=firstTranscript(results);cancelRecognition("cancelled",false,false);
            emitRecognition(token,text.isEmpty()?"error":"result",text,text.isEmpty()?"no-speech":null);
          }
          @Override public void onPartialResults(Bundle results){if(activeRecognition(token,generation)){String text=firstTranscript(results);if(!text.isEmpty())emitRecognition(token,"partial",text,null);}}
          @Override public void onEvent(int type,Bundle params){}
        });
        Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_LANGUAGE,language).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true).putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,3).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true);
        recognizer.startListening(intent);
        recognitionTimeout=()->{if(activeRecognition(token,generation)){cancelRecognition("cancelled",false,false);emitRecognition(token,"error","","timeout");}};handler.postDelayed(recognitionTimeout,25000);
      }catch(SecurityException ignored){cancelRecognition("cancelled",false,false);emitRecognition(token,"error","","permission-denied");}
      catch(RuntimeException ignored){cancelRecognition("cancelled",false,false);emitRecognition(token,"error","","recognition-unavailable");}
    };handler.postDelayed(beginListening,250);publishCapabilities();
  }
  private boolean activeRecognition(String token,long generation){return !destroyed&&foreground&&token.equals(recognitionToken)&&generation==recognitionGeneration;}
  private static String firstTranscript(Bundle results){
    if(results==null)return "";ArrayList<String> values=results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
    if(values!=null)for(String value:values){String text=HostVoiceRules.transcript(value);if(!text.isEmpty())return text;}return "";
  }
  private static String recognitionError(int error){
    if(error==SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS)return "permission-denied";
    if(error==SpeechRecognizer.ERROR_NO_MATCH||error==SpeechRecognizer.ERROR_SPEECH_TIMEOUT)return "no-speech";
    if(error==SpeechRecognizer.ERROR_NETWORK||error==SpeechRecognizer.ERROR_NETWORK_TIMEOUT)return "network";
    if(error==SpeechRecognizer.ERROR_AUDIO)return "audio-capture";
    if(error==SpeechRecognizer.ERROR_RECOGNIZER_BUSY)return "busy";
    if(error==SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED||error==SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)return "language-unavailable";
    return "recognition-error";
  }
  private static String speechError(int error){
    if(error==TextToSpeech.ERROR_NETWORK||error==TextToSpeech.ERROR_NETWORK_TIMEOUT)return "network";
    if(error==TextToSpeech.ERROR_NOT_INSTALLED_YET)return "voice-not-installed";
    if(error==TextToSpeech.ERROR_SERVICE)return "voice-unavailable";
    return "speech-error";
  }
  private void clearPendingPermission(){pendingPermissionToken=null;pendingLanguage=null;if(permissionTimeout!=null){handler.removeCallbacks(permissionTimeout);permissionTimeout=null;}}
  private void cancelRecognition(String code,boolean notify,boolean clearPermission){
    String token=recognitionToken;
    if(clearPermission&&pendingPermissionToken!=null)token=pendingPermissionToken;
    recognitionToken=null;recognitionGeneration++;
    if(beginListening!=null){handler.removeCallbacks(beginListening);beginListening=null;}
    if(recognitionTimeout!=null){handler.removeCallbacks(recognitionTimeout);recognitionTimeout=null;}
    SpeechRecognizer old=recognizer;recognizer=null;
    if(old!=null){try{old.cancel();}catch(RuntimeException ignored){}try{old.destroy();}catch(RuntimeException ignored){}}
    if(clearPermission)clearPendingPermission();
    releaseAudioFocus();
    if(notify&&token!=null)emitRecognition(token,"cancelled","",code);
  }
  private void emitRecognition(String token,String status,String text,String code){events.recognition(token,status,text,code);}
}
