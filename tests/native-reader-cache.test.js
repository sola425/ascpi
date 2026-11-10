import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));

test('native reader removes only obsolete copies after the replacement has opened',t=>{
 const source=readFileSync(join(root,'android/src/com/labwise/study/PdfActivity.java'),'utf8');
 assert.ok(source.indexOf('ReaderCache.pruneOlderCopies')>source.indexOf('if(count<1)'),'An unusable replacement must never trigger cache cleanup.');
 const workspace=mkdtempSync(join(tmpdir(),'labwise-reader-cache-'));t.after(()=>rmSync(workspace,{recursive:true,force:true}));
 const harness=join(workspace,'ReaderCacheHarness.java');
 writeFileSync(harness,`package com.labwise.study;
import java.io.File;
import java.nio.file.Files;
public final class ReaderCacheHarness {
 static int checks=0;
 static void check(boolean v,String message){checks++;if(!v)throw new AssertionError(message);}
 static File put(File dir,String name)throws Exception{File f=new File(dir,name);Files.write(f.toPath(),new byte[]{1,2,3});return f;}
 public static void main(String[] args)throws Exception{
  File dir=new File(args[0],"cache");dir.mkdir();
  File current=put(dir,"reader-boc1-200.pdf"),old=put(dir,"reader-boc1-100.pdf");
  File other=put(dir,"reader-boc2-100.pdf"),textbook=put(dir,"reader-textbook-100.pdf");
  String[] protectedNames={"progress.json","labwise-release.p12","reader-boc1-note.pdf","reader-boc1-100.pdf.backup","reader-boc1--100.pdf","reader-boc1-100.tmp","reader-unknown-100.pdf"};
  for(String name:protectedNames)put(dir,name);
  File folder=new File(dir,"reader-boc1-90.pdf");folder.mkdir();
  check(ReaderCache.pruneOlderCopies(dir,"unknown",current)==0,"unknown document cannot prune");
  check(ReaderCache.pruneOlderCopies(dir,"../boc1",current)==0,"path-like ID cannot prune");
  check(ReaderCache.pruneOlderCopies(dir,"boc1",new File(dir,"reader-boc1-300.pdf"))==0,"missing replacement keeps old copy");
  File empty=new File(dir,"reader-boc1-300.pdf");empty.createNewFile();
  check(ReaderCache.pruneOlderCopies(dir,"boc1",empty)==0,"empty replacement keeps old copy");empty.delete();
  File outside=put(new File(args[0]),"reader-boc1-500.pdf");
  check(ReaderCache.pruneOlderCopies(dir,"boc1",outside)==0,"outside replacement cannot prune");
  check(old.exists(),"all failed checks preserve old copy");
  check(ReaderCache.pruneOlderCopies(dir,"boc1",current)==1,"exactly one obsolete copy removed");
  check(!old.exists()&&current.exists(),"old removed and current kept");
  check(other.exists()&&textbook.exists(),"other source copies remain");
  check(folder.isDirectory(),"matching directory is never deleted");
  for(String name:protectedNames)check(new File(dir,name).exists(),"unowned file remains");
  check(ReaderCache.pruneOlderCopies(dir,"boc1",current)==0,"cleanup is idempotent");
  check(ReaderCache.pruneOlderCopies(null,"boc1",current)==0,"missing directory is safe");
  System.out.println("PASS: "+checks+" native reader cache ownership and replacement checks.");
 }
}`);
 const options={cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000};
 execFileSync('java',['com.sun.tools.javac.Main','-source','8','-target','8','-Xlint:-options','-d',workspace,'android/src/com/labwise/study/ReaderCache.java',harness],options);
 const output=execFileSync('java',['-cp',workspace,'com.labwise.study.ReaderCacheHarness',workspace],options);
 assert.match(output,/PASS: \d+ native reader cache/);t.diagnostic(output.trim());
});
