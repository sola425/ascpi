package com.labwise.study;

import java.util.ArrayList;
import java.util.List;

/** Bounded input and utterance rules shared by the device voice host. */
final class HostVoiceRules {
  private HostVoiceRules(){}
  static final int MAX_TEXT=24000;
  static final int MAX_TRANSCRIPT=12000;
  static boolean validToken(String value){return value!=null&&value.matches("[A-Za-z0-9._:-]{1,128}");}
  static boolean validVoice(String value){return value==null||value.length()<=256&&!value.matches("(?s).*[\\x00-\\x1f\\x7f].*");}
  static boolean validText(String value){return value!=null&&!value.trim().isEmpty()&&value.length()<=MAX_TEXT;}
  static String language(String value){return value!=null&&value.length()<=63&&value.matches("[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8}){0,6}")?value:"en-US";}
  static float rate(double value){return Double.isNaN(value)||Double.isInfinite(value)?1f:(float)Math.max(.7,Math.min(1.3,value));}
  static String transcript(String value){
    if(value==null)return "";
    String clean=value.replaceAll("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]","").trim();
    if(clean.length()>MAX_TRANSCRIPT){int end=MAX_TRANSCRIPT;if(Character.isHighSurrogate(clean.charAt(end-1)))end--;clean=clean.substring(0,end);}
    return clean;
  }
  static List<String> chunks(String value,int maximum){
    if(!validText(value)||maximum<32)throw new IllegalArgumentException("Invalid voice text");
    List<String> result=new ArrayList<>();int start=0;
    while(start<value.length()){
      int end=Math.min(value.length(),start+maximum);
      if(end<value.length()){
        if(Character.isHighSurrogate(value.charAt(end-1)))end--;
        int boundary=end;
        while(boundary>start+maximum/2&&!Character.isWhitespace(value.charAt(boundary-1)))boundary--;
        if(boundary>start+maximum/2)end=boundary;
      }
      result.add(value.substring(start,end));start=end;
    }
    return result;
  }
  static boolean prefer(int quality,boolean network,int latency,String id,int oldQuality,boolean oldNetwork,int oldLatency,String oldId){
    if(oldId==null)return true;
    if(quality!=oldQuality)return quality>oldQuality;
    if(network!=oldNetwork)return !network;
    if(latency!=oldLatency)return latency<oldLatency;
    return id.compareTo(oldId)<0;
  }
}
