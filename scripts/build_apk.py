"""Build and sign the offline Android APK using verified Android SDK tools.
Signing secrets are generated outside the repository and never printed.
"""
import argparse,hashlib,json,os,secrets,shutil,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TOOLS=Path(os.environ.get('LABWISE_ANDROID_TOOLS','/workspace/android-tools'))
BUILD=ROOT/'android/build'
SIGNING=Path(os.environ.get('LABWISE_SIGNING_DIR','/workspace/.labwise-signing'))
OUT=ROOT/'releases'
def run(*args):
 print('Running '+str(args[0]).rsplit('/',1)[-1],flush=True)
 subprocess.run([str(a) for a in args],check=True)
def main():
 bt=TOOLS/'build-tools/android-15';platform=TOOLS/'platform/android-35/android.jar'
 if not platform.is_file() or not (bt/'aapt2').is_file():raise SystemExit('Install verified tools with scripts/install_android_tools.py first.')
 run('python3',ROOT/'scripts/assemble_sources.py')
 run('python3',ROOT/'scripts/assemble_teaching.py')
 BUILD.mkdir(parents=True,exist_ok=True);OUT.mkdir(exist_ok=True)
 assets=BUILD/'assets';shutil.rmtree(assets,ignore_errors=True);assets.mkdir()
 for name in ['index.html','app.js','learning.js','questions.js','teaching.js','storage.js','sources.js','icons.js','style.css','game.css','game.js','game-ui.js','voice.js','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest']:
  shutil.copy2(ROOT/name,assets/name)
 (assets/'data').mkdir()
 for name in ['catalog.json','study-bank.json','study-pages.json','teaching.json','teaching-coverage.json','glossary.json','boc-inventory.json']:
  shutil.copy2(ROOT/'data'/name,assets/'data'/name)
 (assets/'docs').mkdir()
 catalog=json.loads((ROOT/'data/catalog.json').read_text())
 for doc in catalog['documents']:shutil.copy2(ROOT/doc['path'],assets/doc['path'])
 # No service worker is used: all Android assets are bundled locally.
 run(bt/'aapt2','compile','--dir',ROOT/'android/res','-o',BUILD/'resources.zip')
 run(bt/'aapt2','link','-o',BUILD/'resources.apk','-I',platform,'--manifest',ROOT/'android/AndroidManifest.xml','--min-sdk-version','26','--target-sdk-version','35','-A',assets,'-R',BUILD/'resources.zip','--auto-add-overlay')
 classes=BUILD/'classes';shutil.rmtree(classes,ignore_errors=True);classes.mkdir()
 sources=sorted((ROOT/'android/src').rglob('*.java'))
 run('java','com.sun.tools.javac.Main','-source','8','-target','8','-bootclasspath',str(platform)+os.pathsep+str(bt/'core-lambda-stubs.jar'),'-encoding','UTF-8','-d',classes,*sources)
 dex=BUILD/'dex';shutil.rmtree(dex,ignore_errors=True);dex.mkdir()
 run('java','-cp',bt/'lib/d8.jar','com.android.tools.r8.D8','--release','--lib',platform,'--min-api','26','--output',dex,*sorted(classes.rglob('*.class')))
 unsigned=BUILD/'unsigned.apk';shutil.copy2(BUILD/'resources.apk',unsigned)
 with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED) as z:
  for f in dex.glob('*.dex'):z.write(f,f.name)
 run(bt/'zipalign','-P','16','-f','4',unsigned,BUILD/'aligned.apk')
 SIGNING.mkdir(mode=0o700,parents=True,exist_ok=True);SIGNING.chmod(0o700)
 key=SIGNING/'labwise-release.p12';password=SIGNING/'password.txt'
 if not key.exists():
  if any(OUT.glob('Labwise-*.apk')):raise SystemExit('Retained release signing key is missing. Refusing to create an incompatible update.')
  if password.exists():raise SystemExit('Signing password exists without key: investigate before regenerating.')
  password.write_text(secrets.token_urlsafe(36));password.chmod(0o600)
  run('keytool','-genkeypair','-keystore',key,'-storetype','PKCS12','-storepass:file',password,'-keypass:file',password,'-alias','labwise-release','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Labwise Local Release','-noprompt')
  key.chmod(0o600)
 if not password.exists():raise SystemExit('Retained signing password file is missing.')
 apk=OUT/'Labwise-5.0.0.apk'
 run('java','-jar',bt/'lib/apksigner.jar','sign','--ks',key,'--ks-key-alias','labwise-release','--ks-pass','file:'+str(password),'--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',apk,BUILD/'aligned.apk')
 run('java','-jar',bt/'lib/apksigner.jar','verify','--verbose','--print-certs',apk)
 run(bt/'zipalign','-c','-P','16','4',apk)
 run(bt/'aapt','dump','badging',apk)
 checksum=hashlib.sha256(apk.read_bytes()).hexdigest()
 (OUT/'Labwise-5.0.0.apk.sha256').write_text(checksum+'  '+apk.name+'\n')
 with zipfile.ZipFile(apk) as z:
  assert z.testzip() is None
  for doc in catalog['documents']:assert z.read('assets/'+doc['path'])==(ROOT/doc['path']).read_bytes()
  assert len(json.loads(z.read('assets/data/study-pages.json')))==sum(d['pages']for d in catalog['documents'])
  assert len(json.loads(z.read('assets/data/study-bank.json')))==catalog['availableQuestions']
  coverage=json.loads(z.read('assets/data/teaching-coverage.json'));assert coverage['complete'] and coverage['completeTeachingNotes']==catalog['availableQuestions']
  assert len(json.loads(z.read('assets/data/teaching.json')))==catalog['availableQuestions']
 shutil.copy2(apk,OUT/'Labwise-latest.apk')
 (OUT/'Labwise-latest.apk.sha256').write_text(checksum+'  Labwise-latest.apk\n')
 print('APK_READY '+str(apk)+' ('+str(apk.stat().st_size)+' bytes)',flush=True)
 print('SHA256 '+checksum,flush=True)
if __name__=='__main__':main()
