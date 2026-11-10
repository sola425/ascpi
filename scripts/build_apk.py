"""Build and sign the Android APK with bundled assets using verified SDK tools.
Signing secrets are generated outside the repository and never printed.
"""
import argparse,hashlib,json,os,re,secrets,shutil,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TOOLS=Path(os.environ.get('LABWISE_ANDROID_TOOLS','/workspace/android-tools'))
BUILD=ROOT/'android/build'
SIGNING=Path(os.environ.get('LABWISE_SIGNING_DIR','/workspace/.labwise-signing'))
OUT=ROOT/'releases'
WEB_ASSETS=[
 'index.html','app.js','learning.js','questions.js','teaching.js','storage.js','sources.js','icons.js',
 'style.css','game.css','game.js','game-ui.js','voice.js','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest',
 'sync-config.json','sync-config.js','sync-model.js','sync.js','supabase-client.js','duel-client.js',
 'game-sync.js','frenzy.js','arcade-ui.js','arcade.css','onboarding.js','onboarding.css','account-ui.js','account.css',
 'auth-callback.html','auth-callback.js','auth-callback.css',
 'compatibility.js','host-voice.js','host-dialogue.js','host-game.js','host-ui.js','host.css','figures.js','figures.css',
]
DATA_ASSETS=['catalog.json','study-bank.json','study-pages.json','teaching.json','teaching-coverage.json','glossary.json','boc-inventory.json','quiz-meta.json','figures.json']
def run(*args):
 print('Running '+str(args[0]).rsplit('/',1)[-1],flush=True)
 subprocess.run([str(a) for a in args],check=True)
def check_quiz_registry(bank_path,meta_path):
 instructions=('Regenerate with node scripts/prepare_quiz_registry.mjs, then '
  'node supabase/build-setup.mjs supabase/quiz-seed.sql. Before releasing changed '
  'content, the project owner must apply the updated registry seed/setup to Supabase.')
 try:meta=json.loads(meta_path.read_text())
 except (OSError,ValueError):raise SystemExit('Quiz registry metadata is missing or invalid. '+instructions)
 if not isinstance(meta,dict) or meta.get('contentDigest')!=hashlib.sha256(bank_path.read_bytes()).hexdigest():
  raise SystemExit('Quiz registry contentDigest does not match the exact data/study-bank.json bytes. '+instructions)
 return meta
def check_figures(root,manifest_path,catalog):
 instructions=' Regenerate the source visuals with python3 scripts/prepare_figures.py before building.'
 def invalid(message):raise SystemExit('Source visual packaging: '+message+instructions)
 try:manifest=json.loads(manifest_path.read_text())
 except (OSError,ValueError):invalid('the visual manifest is missing or invalid.')
 if not isinstance(manifest,dict) or manifest.get('version')!=1 or not isinstance(manifest.get('figures'),dict) or not isinstance(manifest.get('questions'),dict) or not isinstance(manifest.get('documents'),dict):invalid('the manifest structure is invalid.')
 bank_ids={q['id'] for q in json.loads((root/'data/study-bank.json').read_text())}
 documents={doc['id']:doc for doc in catalog['documents']}
 if set(manifest['documents'])!=set(documents):invalid('the source document inventory does not match the app.')
 for doc_id,doc in documents.items():
  visual_doc=manifest['documents'][doc_id]
  if visual_doc.get('path')!=doc['path'] or visual_doc.get('pages')!=doc['pages'] or visual_doc.get('sha256')!=hashlib.sha256((root/doc['path']).read_bytes()).hexdigest():invalid('a source PDF changed without updating its visual mapping.')
 paths=set()
 for figure_id,figure in manifest['figures'].items():
  if not isinstance(figure,dict) or figure.get('id')!=figure_id or not re.fullmatch(r'fig-[0-9a-f]{18}',figure_id):invalid('a visual record has an invalid ID.')
  if figure.get('kind')!='figure':invalid('only attached pictures, diagrams and charts may be bundled; question-text screenshots are not used.')
  path=figure.get('path','')
  if not isinstance(path,str) or not re.fullmatch(r'assets/figures/[0-9a-f]{24}\.webp',path):invalid('a visual path is unsafe.')
  if figure.get('documentId') not in documents or not isinstance(figure.get('page'),int) or not 1<=figure['page']<=documents[figure['documentId']]['pages']:invalid('a visual points outside its source PDF.')
  if not isinstance(figure.get('questionIds'),list) or not set(figure['questionIds']).issubset(bank_ids):invalid('a visual refers to an unavailable question.')
  try:content=(root/path).read_bytes()
  except OSError:invalid('a referenced visual file is missing.')
  if len(content)!=figure.get('bytes') or len(content)<12 or content[:4]!=b'RIFF' or content[8:12]!=b'WEBP' or hashlib.sha256(content).hexdigest()[:24]!=Path(path).stem:invalid('a visual file does not match its manifest or content hash.')
  paths.add(path)
 for qid,mapping in manifest['questions'].items():
  if qid not in bank_ids or not isinstance(mapping,dict):invalid('a question mapping is invalid.')
  for fid in mapping.get('figureIds',[])+mapping.get('layoutIds',[]):
   if fid not in manifest['figures'] or qid not in manifest['figures'][fid]['questionIds']:invalid('a question mapping points to the wrong visual.')
 actual={path.relative_to(root).as_posix() for path in (root/'assets/figures').glob('*.webp')}
 if paths!=actual:invalid('visual files and manifest references differ.')
 coverage=manifest.get('coverage',{})
 if coverage.get('activeQuestions')!=catalog['availableQuestions'] or coverage.get('uniqueImageFiles')!=len(paths) or coverage.get('figureRecords')!=len(manifest['figures']) or coverage.get('imageBytes')!=sum((root/path).stat().st_size for path in paths):invalid('visual coverage totals are inconsistent.')
 return sorted(paths)
def main():
 bt=TOOLS/'build-tools/android-15';platform=TOOLS/'platform/android-35/android.jar'
 if not platform.is_file() or not (bt/'aapt2').is_file():raise SystemExit('Install verified tools with scripts/install_android_tools.py first.')
 run('python3',ROOT/'scripts/assemble_sources.py')
 run('python3',ROOT/'scripts/assemble_teaching.py')
 quiz_meta=check_quiz_registry(ROOT/'data/study-bank.json',ROOT/'data/quiz-meta.json')
 catalog=json.loads((ROOT/'data/catalog.json').read_text())
 figure_paths=check_figures(ROOT,ROOT/'data/figures.json',catalog)
 BUILD.mkdir(parents=True,exist_ok=True);OUT.mkdir(exist_ok=True)
 assets=BUILD/'assets';shutil.rmtree(assets,ignore_errors=True);assets.mkdir()
 for name in WEB_ASSETS:
  shutil.copy2(ROOT/name,assets/name)
 (assets/'data').mkdir()
 for name in DATA_ASSETS:
  shutil.copy2(ROOT/'data'/name,assets/'data'/name)
 (assets/'docs').mkdir()
 for doc in catalog['documents']:shutil.copy2(ROOT/doc['path'],assets/doc['path'])
 for name in figure_paths:
  target=assets/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/name,target)
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
 apk=OUT/'Labwise-7.1.1.apk'
 run('java','-jar',bt/'lib/apksigner.jar','sign','--ks',key,'--ks-key-alias','labwise-release','--ks-pass','file:'+str(password),'--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',apk,BUILD/'aligned.apk')
 run('java','-jar',bt/'lib/apksigner.jar','verify','--verbose','--print-certs',apk)
 run(bt/'zipalign','-c','-P','16','4',apk)
 run(bt/'aapt','dump','badging',apk)
 checksum=hashlib.sha256(apk.read_bytes()).hexdigest()
 (OUT/'Labwise-7.1.1.apk.sha256').write_text(checksum+'  '+apk.name+'\n')
 with zipfile.ZipFile(apk) as z:
  assert z.testzip() is None
  for name in WEB_ASSETS:assert z.read('assets/'+name)==(ROOT/name).read_bytes()
  for name in DATA_ASSETS:assert z.read('assets/data/'+name)==(ROOT/'data'/name).read_bytes()
  for doc in catalog['documents']:assert z.read('assets/'+doc['path'])==(ROOT/doc['path']).read_bytes()
  for name in figure_paths:assert z.read('assets/'+name)==(ROOT/name).read_bytes()
  assert {name for name in z.namelist() if name.startswith('assets/assets/figures/') and name.endswith('.webp')}=={'assets/'+name for name in figure_paths}
  assert len(json.loads(z.read('assets/data/study-pages.json')))==sum(d['pages']for d in catalog['documents'])
  assert len(json.loads(z.read('assets/data/study-bank.json')))==catalog['availableQuestions']
  assert hashlib.sha256(z.read('assets/data/study-bank.json')).hexdigest()==quiz_meta['contentDigest']
  coverage=json.loads(z.read('assets/data/teaching-coverage.json'));assert coverage['complete'] and coverage['completeTeachingNotes']==catalog['availableQuestions']
  assert len(json.loads(z.read('assets/data/teaching.json')))==catalog['availableQuestions']
 shutil.copy2(apk,OUT/'Labwise-latest.apk')
 (OUT/'Labwise-latest.apk.sha256').write_text(checksum+'  Labwise-latest.apk\n')
 print('APK_READY '+str(apk)+' ('+str(apk.stat().st_size)+' bytes)',flush=True)
 print('SHA256 '+checksum,flush=True)
if __name__=='__main__':main()
