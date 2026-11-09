// Host-JVM rules and source contracts; this does not run Android audio hardware.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=readFileSync(join(root,'android/src/com/labwise/study/HostVoice.java'),'utf8');
const main=readFileSync(join(root,'android/src/com/labwise/study/MainActivity.java'),'utf8');
const manifest=readFileSync(join(root,'android/AndroidManifest.xml'),'utf8');

test('native voice host exposes a bounded device bridge with foreground cleanup and no transcript persistence',()=>{
 for(const method of ['hostVoiceCapabilities','speakHost','stopHostSpeech','startHostListening','stopHostListening'])assert.match(main,new RegExp(`@JavascriptInterface public [^\\n]+ ${method}\\(`));
 assert.match(main,/hostVoiceEvent\("labwiseNativeHostSpeech"/);assert.match(main,/hostVoiceEvent\("labwiseNativeHostResult"/);
 assert.match(source,/activity\.requestPermissions\(new String\[\]\{Manifest\.permission\.RECORD_AUDIO\}/);
 const listen=source.slice(source.indexOf('private void listenOnMain'),source.indexOf('private boolean activeRecognition'));
 assert.ok(listen.indexOf('!foreground')<listen.indexOf('requestPermissions'),'background requests must fail before a permission prompt or mic start');
 assert.ok(listen.indexOf('!hasMicrophone()')<listen.indexOf('recognizer.startListening(intent)'),'mic access requires a granted permission');
 assert.match(source,/token\.equals\(recognitionToken\)&&generation==recognitionGeneration/);
 assert.match(source,/recognitionToken=null;recognitionGeneration\+\+/);
 assert.match(source,/old\.cancel\(\)/);assert.match(source,/old\.destroy\(\)/);
 assert.match(main,/onPause\(\)\{if\(hostVoice!=null\)hostVoice\.pause\(\)/);
 assert.match(main,/hostVoice\.destroy\(\);hostVoice=null/);
 assert.match(source,/tts\.shutdown\(\)/);
 assert.match(source,/void onBufferReceived\(byte\[\] buffer\)\{\/\* Audio is never retained/);
 assert.doesNotMatch(source,/FileOutputStream|MediaRecorder|AudioRecord|SharedPreferences|Log\.|System\.out|exportJSON/);
 assert.match(manifest,/android:required="false"/);assert.match(manifest,/android\.speech\.RecognitionService/);assert.match(manifest,/android\.intent\.action\.TTS_SERVICE/);
});

test('production native voice rules bound tokens, chunk text, preserve Unicode and rank installed voices',t=>{
 const workspace=mkdtempSync(join(tmpdir(),'labwise-native-host-'));t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 const harness=join(workspace,'NativeHostRulesHarness.java');
 writeFileSync(harness,`package com.labwise.study;
import java.util.Arrays;
import java.util.List;
public final class NativeHostRulesHarness {
 static int checks=0;
 static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
 static String repeated(char value,int count){char[] values=new char[count];Arrays.fill(values,value);return new String(values);}
 public static void main(String[] args){
  check(HostVoiceRules.validToken("lwhost_abc_1"),"normal token");
  check(HostVoiceRules.validToken("host:1.question-2"),"safe token punctuation");
  for(String value:new String[]{null,"","unsafe\\\";alert(1)","unsafe token","line\\nfeed",repeated('a',129)})check(!HostVoiceRules.validToken(value),"reject unsafe token");
  check(HostVoiceRules.validToken(repeated('a',128)),"maximum token");
  check(HostVoiceRules.validVoice(null)&&HostVoiceRules.validVoice(""),"system voice choice");
  check(HostVoiceRules.validVoice("en-us-x-local"),"installed voice name");
  check(!HostVoiceRules.validVoice("control\\nvoice")&&!HostVoiceRules.validVoice(repeated('v',257)),"bounded voice id");
  check("en-NG".equals(HostVoiceRules.language("en-NG")),"selected regional language");
  check("en-US".equals(HostVoiceRules.language("en;private=question")),"language fallback");
  check(HostVoiceRules.rate(Double.NaN)==1f&&HostVoiceRules.rate(Double.POSITIVE_INFINITY)==1f,"invalid rate fallback");
  check(HostVoiceRules.rate(.1)==.7f&&HostVoiceRules.rate(8)==1.3f,"comfortable speech-rate bounds");
  check("option B".equals(HostVoiceRules.transcript("  option\\u0000 B  ")),"control bytes removed");
  check("".equals(HostVoiceRules.transcript(null)),"absent transcript");
  check(HostVoiceRules.transcript(repeated('a',12001)).length()==12000,"bounded transcript");
  String unicode=repeated('a',11999)+"\\ud83d\\ude00";
  check(HostVoiceRules.transcript(unicode).length()==11999,"transcript never ends with half a surrogate pair");
  String speech=repeated('a',3499)+"\\ud83d\\ude00 "+repeated('b',5000)+" sentence boundary "+repeated('c',8000);
  List<String> chunks=HostVoiceRules.chunks(speech,3500);StringBuilder joined=new StringBuilder();
  for(String chunk:chunks){check(chunk.length()<=3500,"provider input limit");check(!Character.isHighSurrogate(chunk.charAt(chunk.length()-1)),"no broken Unicode chunk");joined.append(chunk);}
  check(speech.equals(joined.toString()),"all question and explanation text retained in order");
  check(HostVoiceRules.chunks("One short question.",3500).size()==1,"short speech stays together");
  check(!HostVoiceRules.validText(repeated('x',24001)),"bounded total speech");
  boolean rejected=false;try{HostVoiceRules.chunks("  ",3500);}catch(IllegalArgumentException expected){rejected=true;}check(rejected,"empty speech rejected");
  check(HostVoiceRules.prefer(500,true,200,"natural",400,false,100,"local"),"higher-quality installed voice wins");
  check(HostVoiceRules.prefer(400,false,200,"local",400,true,100,"online"),"offline wins equal-quality tie");
  check(HostVoiceRules.prefer(400,false,100,"quick",400,false,300,"slow"),"latency tie break");
  check(HostVoiceRules.prefer(400,false,100,"a",400,false,100,"b"),"stable final voice ordering");
  check(!HostVoiceRules.prefer(300,false,100,"lower",400,false,100,"higher"),"lower quality is not preferred");
  System.out.println("PASS: "+checks+" production native voice input, Unicode, chunking and ranking checks; actual audio requires Android.");
 }
}`);
 const options={cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000};
 execFileSync('java',['com.sun.tools.javac.Main','-source','8','-target','8','-Xlint:-options','-encoding','UTF-8','-d',workspace,'android/src/com/labwise/study/HostVoiceRules.java',harness],options);
 const output=execFileSync('java',['-cp',workspace,'com.labwise.study.NativeHostRulesHarness'],options);assert.match(output,/PASS: \d+ production native voice input/);t.diagnostic(output.trim());
});
