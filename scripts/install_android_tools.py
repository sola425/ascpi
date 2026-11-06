"""Install pinned official Android SDK archives, verified against Google's SDK metadata."""
import hashlib,json,os,urllib.request,zipfile,shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(os.environ.get('LABWISE_ANDROID_TOOLS','/workspace/android-tools'))
PACKAGES=[
 ('platform','platform-35_r02.zip','0bb560a90a7a2cbd0dd8348224d518b638fe7949'),
 ('build-tools','build-tools_r35_linux.zip','2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc'),
 ('platform-tools','platform-tools_r37.0.2-linux.zip','736a08af10515674e40d8b754fe87390d698da2b')]
def install(item):
 name,filename,expected=item
 archive=ROOT/'downloads'/filename;archive.parent.mkdir(parents=True,exist_ok=True)
 if not archive.exists():
  with urllib.request.urlopen('https://dl.google.com/android/repository/'+filename,timeout=120) as r,archive.open('wb') as out:shutil.copyfileobj(r,out)
 actual=hashlib.sha1(archive.read_bytes()).hexdigest()
 if actual!=expected:raise RuntimeError('Official archive checksum mismatch: '+filename)
 dest=ROOT/name;dest.mkdir(exist_ok=True)
 with zipfile.ZipFile(archive) as z:
  for entry in z.infolist():
   target=(dest/entry.filename).resolve()
   if not target.is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive path')
   z.extract(entry,dest)
   if entry.external_attr>>16:target.chmod(entry.external_attr>>16)
 print(name+': downloaded, checksum verified and extracted',flush=True)
ROOT.mkdir(parents=True,exist_ok=True)
with ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(install,PACKAGES))
(ROOT/'provenance.json').write_text(json.dumps({'metadata':'https://dl.google.com/android/repository/repository2-1.xml','packages':[{'name':n,'url':'https://dl.google.com/android/repository/'+f,'sha1':h}for n,f,h in PACKAGES]},indent=2))
