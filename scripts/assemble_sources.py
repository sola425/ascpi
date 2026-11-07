"""Build the runtime multi-book registry without changing either source bank."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parent.parent
j=lambda p:json.loads((ROOT/p).read_text())
def dump(name,value):(ROOT/name).write_text(json.dumps(value,ensure_ascii=False))
def assemble():
 old=j('data/book-bank.json');boc=j('data/boc-bank.json');inventory=j('data/boc-inventory.json')
 excluded=set(j('data/collection-exclusions.json')['questionIds'])
 assert excluded<={q['id']for q in boc},'Exclusions contain unknown IDs'
 active_boc=[q for q in boc if q['id']not in excluded]
 bank=[]
 for q in old:
  bank.append({**q,'bookId':'success4','documentId':'textbook','answerDocumentId':'textbook'})
 for q in active_boc:
  bank.append({**q,**({'context':q.get('context')or q.get('sharedContext')}if q.get('context')or q.get('sharedContext')else{})})
 assert len(bank)==len({q['id']for q in bank}),'Duplicate IDs across books'
 repairs=j('data/v4-source-repairs.json')
 assert set(repairs)<={q['id']for q in bank},'Repair ID is outside the active collection'
 for q in bank:
  patch=repairs.get(q['id'],{})
  q.update({k:v for k,v in patch.items()if k in {'question','context','options','needsSource'}})
 old_pages=[{**p,'bookId':'success4','documentId':'textbook','globalPage':p['page']}for p in j('data/book-pages.json')]
 new_pages=j('data/boc-pages.json')
 for p in new_pages:
  p['topic']=next((q['topic']for q in boc if q['chapter']==p.get('chapter')),'Front matter')
 docs=[{'id':'textbook','bookId':'success4','title':'Success in Clinical Laboratory Science','shortTitle':'Success textbook','path':'docs/textbook.pdf','pages':434,'part':1},
 {'id':'boc1','bookId':'boc7','title':'BOC Study Guide 7e · Part 1','shortTitle':'BOC · Part 1','path':'docs/boc-1.pdf','pages':333,'part':1},
 {'id':'boc2','bookId':'boc7','title':'BOC Study Guide 7e · Part 2','shortTitle':'BOC · Part 2','path':'docs/boc-2.pdf','pages':333,'part':2}]
 books=[{'id':'success4','title':'Success in Clinical Laboratory Science','shortTitle':'Success','edition':'Fourth edition · original bank','questions':len(old),'expectedQuestions':len(old),'documents':['textbook'],'sourceComplete':True,'missingQuestions':0,'description':'Your original clinical laboratory science collection.'},
 {'id':'boc7','title':'BOC Study Guide','shortTitle':'BOC 7e','edition':'Seventh edition · 2022','questions':len(active_boc),'extractedQuestions':len(boc),'excludedQuestions':len(excluded),'expectedQuestions':inventory['numberedChapterQuestionCount'],'documents':['boc1','boc2'],'sourceComplete':inventory['complete'],'missingQuestions':sum(len(c['missingNumbers'])for c in inventory['chapters']),'description':'Blood banking, chemistry, hematology, microbiology and more.','sourceNote':'The supplied Part 1 skips printed pages 225–240, so chapter 3 questions 154–246 are not present. Their answer-only rationales are retained for reference; stems and choices have not been invented.'}]
 catalog={'version':'4.0.0','books':books,'documents':docs,'availableQuestions':len(bank),'extractedQuestions':len(old)+len(boc),'excludedQuestions':len(excluded),'expectedQuestions':sum(b['expectedQuestions']for b in books),'sourceComplete':all(b['sourceComplete']for b in books),'missingSourceQuestions':sum(b['missingQuestions']for b in books)}
 dump('data/study-bank.json',bank);dump('data/study-pages.json',old_pages+new_pages);dump('data/catalog.json',catalog)
 print('Runtime bank:',len(bank),'questions;',len(old_pages+new_pages),'source pages;',catalog['missingSourceQuestions'],'source questions pending missing pages.')
if __name__=='__main__':assemble()
