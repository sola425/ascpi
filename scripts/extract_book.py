"""Extract supplied PDF text conservatively. No document text is executed."""
import argparse, json, re, shutil
from collections import Counter
from pathlib import Path
import fitz
SECTIONS=[('Hematology',1,36,85),('Hemostasis',86,99,109),('Immunology',110,122,134),('Blood bank',135,166,202),('Bacteriology',203,242,288),('Mycology',289,295,301),('Parasitology',302,310,317),('Virology',318,324,330),('Molecular diagnostics',331,338,350),('Urinalysis',351,361,372),('Laboratory mathematics',373,381,398),('Lab essentials',399,410,422)]
def clean(s):
 s=re.sub(r'(\w)-\n(?=[a-z])',r'\1',s)
 return re.sub(r'\s+',' ',s).strip()
def columns(page):
 cols=[[],[]]
 for block in page.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   x,y,_,_=line['bbox']
   if y<58 or y>674: continue
   text=''.join(s['text'] for s in line['spans']).strip()
   if text:cols[int(x>=273)].append((y,x,text))
 return '\n'.join(t for col in cols for y,x,t in sorted(col))
def extract(src,root):
 (root/'data').mkdir(parents=True,exist_ok=True);(root/'docs').mkdir(parents=True,exist_ok=True)
 doc=fitz.open(src);pages=[];bank=[];report=[]
 for i,page in enumerate(doc):
  topic=next((t for t,start,ans,end in SECTIONS if start<=i+1<=end),'Color plates')
  pages.append({'page':i+1,'topic':topic,'text':page.get_text(sort=True)})
 for topic,start,ans,end in SECTIONS:
  qtext='';rtext=''
  for i in range(start-1,ans-1):qtext+=f'\n@@PAGE:{i+1}@@\n'+columns(doc[i])+'\n'
  for i in range(ans-1,end):rtext+=f'\n@@PAGE:{i+1}@@\n'+columns(doc[i])+'\n'
  # Only explicit numbered rationales with an explicit answer letter are paired.
  rm=list(re.finditer(r'(?m)^(\d{1,3})\.\s*\n([A-D])\.\s+',rtext))
  rationales={}
  for n,m in enumerate(rm):
   page=int(re.findall(r'@@PAGE:(\d+)@@',rtext[:m.start()])[-1])
   body=re.sub(r'@@PAGE:\d+@@','',rtext[m.end():rm[n+1].start() if n+1<len(rm) else len(rtext)])
   body=re.split(r'\nREFERENCES\b|\n[A-D]\.\s+',body)[0]
   rationales[int(m[1])]={'letter':m[2],'text':clean(body),'page':page}
  rc=Counter(int(m[1]) for m in rm)
  rationales={k:v for k,v in rationales.items() if rc[k]==1}
  qm=list(re.finditer(r'(?m)^(\d{1,3})\.\s+(?=\S)',qtext));accepted=0;omitted=[]
  qc=Counter(int(m[1]) for m in qm)
  for n,m in enumerate(qm):
   number=int(m[1]);page=int(re.findall(r'@@PAGE:(\d+)@@',qtext[:m.start()])[-1]);body=qtext[m.end():qm[n+1].start() if n+1<len(qm) else len(qtext)]
   body=re.sub(r'@@PAGE:\d+@@','',body)
   opts=list(re.finditer(r'(?m)^([A-D])\.\s*',body))
   if qc[number]!=1 or [o[1] for o in opts]!=list('ABCD') or number not in rationales:
    omitted.append({'number':number,'page':page,'reason':'Incomplete options or missing explicit numbered rationale'});continue
   question=clean(body[:opts[0].start()]);options=[clean(body[o.end():opts[k+1].start() if k<3 else len(body)]) for k,o in enumerate(opts)]
   if not question or any(not o or len(o)>650 for o in options) or len(rationales[number]['text'])>3500:
    omitted.append({'number':number,'page':page,'reason':'Empty or unusually long extracted text; inspect source'});continue
   r=rationales[number]
   bank.append({'id':f'book-{start}-{number}','topic':topic,'number':number,'question':question,'options':options,'answer':ord(r['letter'])-65,'explanation':r['text'],'whyOthers':'','memory':'','source':f'Uploaded MLS PDF · {topic} · Question {number} · PDF page {page}','page':page,'answerPage':r['page'],'explanationKind':'book','needsSource':bool(re.search(r'plate|shown|following (?:data|information|results)|chart|table|below|above|figure',body,re.I))})
   accepted+=1
  report.append({'topic':topic,'questionPages':[start,ans-1],'answerPages':[ans,end],'detectedQuestions':len(qm),'practiceQuestions':accepted,'omitted':omitted})
 (root/'data/book-pages.json').write_text(json.dumps(pages,ensure_ascii=False))
 (root/'data/book-bank.json').write_text(json.dumps(bank,ensure_ascii=False))
 (root/'data/extraction-report.json').write_text(json.dumps({'pdfPages':len(doc),'practiceQuestions':len(bank),'sections':report,'note':'OCR-derived text; explicit numbering only, not medically reviewed. Omitted questions remain available in the complete PDF. Color plates are in the PDF.'},indent=2))
 shutil.copyfile(src,root/'docs/textbook.pdf')
 print(json.dumps({'pages':len(doc),'bank':len(bank),'sections':[{k:v for k,v in r.items() if k!='omitted'} for r in report]},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('pdf');p.add_argument('--output-dir',default='/tmp/labwise-extraction');args=p.parse_args();target=Path(args.output_dir).resolve()
 if target==Path(__file__).resolve().parent.parent:raise SystemExit('Write fresh extraction to a separate directory; preserve the reviewed release bank.')
 extract(args.pdf,target)
