"""Compile individually authored notes. Release checks require every book item, not a sample."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
FIELDS=['questionInPlainEnglish','explanation','memory']
def assemble(allow_partial=False):
 bank=json.loads((ROOT/'data/book-bank.json').read_text());lessons={};duplicates=[]
 for p in sorted((ROOT/'data/teaching').glob('*.json')):
  for id,value in json.loads(p.read_text()).items():
   if id in lessons:duplicates.append(id)
   lessons[id]=value
 if duplicates:raise ValueError('Duplicate authored notes: '+', '.join(duplicates))
 bank_ids={q['id']for q in bank};extra=set(lessons)-bank_ids
 if extra:raise ValueError('Unknown question IDs: '+', '.join(sorted(extra)))
 errors=[]
 for q in bank:
  t=lessons.get(q['id'])
  if not t:continue
  for key in FIELDS:
   if not isinstance(t.get(key),str)or not t[key].strip():errors.append(q['id']+' missing '+key)
  opts=t.get('optionExplanations',[])
  if not isinstance(opts,list)or len(opts)!=len(q['options'])or any(not isinstance(o,str)or len(o.strip())<30 for o in opts):errors.append(q['id']+' option explanations incomplete or too short')
  if len(t.get('explanation',''))<70:errors.append(q['id']+' main explanation too short')
  check=t.get('quickCheck',{})
  if not all(isinstance(check.get(k),str)and check[k].strip()for k in ['question','answer']):errors.append(q['id']+' recall check incomplete')
  if re.search(r'incorrect because (?:the )?correct answer is|not correct because (?:the )?answer is', ' '.join(opts),re.I):errors.append(q['id']+' generic option filler')
 missing=sorted(bank_ids-set(lessons))
 if errors:raise ValueError('\n'.join(errors))
 coverage={'questions':len(bank),'completeTeachingNotes':len(lessons),'optionExplanations':sum(len(t['optionExplanations'])for t in lessons.values()),'missing':missing,'complete':not missing,'note':'Structural completeness checks do not replace a medical/editorial review.'}
 (ROOT/'data/teaching-coverage.json').write_text(json.dumps(coverage,indent=2))
 if missing and not allow_partial:raise ValueError(f'{len(missing)} questions lack complete teaching. Release blocked.')
 (ROOT/'data/teaching.json').write_text(json.dumps(lessons,ensure_ascii=False))
 print(json.dumps({k:v for k,v in coverage.items()if k!='missing'},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--allow-partial',action='store_true');a=p.parse_args();assemble(a.allow_partial)
