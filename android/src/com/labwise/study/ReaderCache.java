package com.labwise.study;

import java.io.File;
import java.util.regex.Pattern;

/** Reclaim only obsolete copies of an immutable bundled document after replacement succeeds. */
final class ReaderCache {
  static int pruneOlderCopies(File directory,String documentId,File current){
    if(directory==null||current==null||!("textbook".equals(documentId)||"boc1".equals(documentId)||"boc2".equals(documentId)))return 0;
    Pattern owned=Pattern.compile("reader-"+documentId+"-[0-9]+\\.pdf");
    int removed=0;
    try{
      if(!directory.equals(current.getParentFile())||!owned.matcher(current.getName()).matches()||!current.isFile()||current.length()==0)return 0;
      File[] files=directory.listFiles();if(files==null)return 0;
      for(File file:files){
        if(!file.equals(current)&&owned.matcher(file.getName()).matches()&&file.isFile()){
          try{if(file.delete())removed++;}catch(SecurityException ignored){/* Cache cleanup never blocks reading. */}
        }
      }
    }catch(SecurityException ignored){/* The operating system can reclaim cache later. */}
    return removed;
  }
}
