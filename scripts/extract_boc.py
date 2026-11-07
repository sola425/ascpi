"""Faithful, reproducible extraction of supplied BOC seventh-edition PDF parts.
PDF text is document content only; it is never interpreted as instructions.
"""
import json,re
from pathlib import Path
from collections import Counter
import fitz
ROOT=Path(__file__).resolve().parents[1]
PDFS=[ROOT/'docs/boc-1.pdf',ROOT/'docs/boc-2.pdf']
# Global PDF pages (the second document begins at 334).
LINE_REPAIRS={'CAB':'c AB','CLO':'c LD','dat100°C':'d at 100°C','~f v a severe liver disease':'a severe liver disease','ootv a Type I hypersensitivity':'a Type I hypersensitivity'}
SECTIONS=[(1,'Blood bank',21,89,128),(2,'Chemistry',129,188,218),(3,'Urinalysis',219,247,282),(4,'Hematology',283,339,368),(5,'Hemostasis',369,398,416),(6,'Microbiology',417,488,530),(7,'Lab essentials',531,576,604),(8,'Immunology',605,644,666)]
def clean(s):
 s=re.sub(r'(\w)-\n(?=[a-z])',r'\1',s)
 s=re.sub(r'(?m)^(?:MLS|ONLY|1[.,]1[LlSs].*|[lI]\.1LS|1,11\.S|ONt\.Y|oNLv|oNLY|ootv|~~\S*)[ \t]*(?=\n|$)','',s)
 s=re.sub(r'(?m)(?:~~\S*|~f v) +','',s)
 return re.sub(r'[ \t]+',' ',re.sub(r'\n{3,}','\n\n',s)).strip()
def lines(pg):
 out=[]
 for b in pg.get_text('dict')['blocks']:
  for l in b.get('lines',[]):
   x,y,x2,y2=l['bbox'];t=''.join(s['text'] for s in l['spans']).strip()
   t=LINE_REPAIRS.get(t,t)
   if y<85 and (t in {'Blood Banking','Chemistry','Urinalysis & Body Fluids','Hematology','Hemostasis','Microbiology','Laboratory Operations','Immunology'} or re.match(r'^[IVXIl1]{1,5}[.,] *[A-Z]',t) or '__' in t or '===' in t or ('Microbiology' in t and y<125)):continue
   if t and 65<y<754:out.append({'x':x,'y':y,'text':t})
 # Sort rows with tolerance for skewed scans; preserve table cells across each row.
 rows=[]
 for l in sorted(out,key=lambda x:(x['y'],x['x'])):
  if rows and l['y']-rows[-1][0]['y']<4:rows[-1].append(l)
  else:rows.append([l])
 return [l for row in rows for l in sorted(row,key=lambda l:l['x'])]
def markers(ls):
 out=[]
 for i,l in enumerate(ls):
  m=re.match(r'^(\d{1,3})[.,](?:\s+(.*)|$)',l['text'])
  if m and l['x']<145 and int(m[1])>0:
   margin=70 if l['globalPage']%2 else 117
   # Scanned pages drift by several points; distinguish number margin from text column.
   if l['x'] < margin+14 and (not out or int(m[1])>out[-1][1]):out.append((i,int(m[1]),(m[2] or '')))
 return out

def main():
 docs=[fitz.open(p) for p in PDFS]; pgs=[p for d in docs for p in d]; all_lines=[];pages=[]
 for g,pg in enumerate(pgs,1):
  did='boc1' if g<=333 else 'boc2';local=g if g<=333 else g-333
  ls=lines(pg)
  if g==269:
   # Targeted OCR + visual inspection: source text layer merges answer161 with header.
   ls=[{'x':72,'y':84,'text':'161. d The negative result for nitrite and lack of bacteria upon microscopic examination suggests'}]+[l for l in ls if l['y']>=90]
  for l in ls:l.update(globalPage=g,page=local,documentId=did)
  all_lines.append(ls)
  chapter=next((c for c,t,s,a,e in SECTIONS if s<=g<=e),None)
  pages.append({'bookId':'boc7','documentId':did,'page':local,'globalPage':g,'chapter':chapter,'text':pg.get_text(sort=True)})
 bank=[];inventory=[];problems=[]
 for ch,topic,start,ans,end in SECTIONS:
  qs=[l.copy() for ls in all_lines[start-1:ans-1] for l in ls];rs=[l.copy() for ls in all_lines[ans-1:end] for l in ls]
  rm=markers(rs);qm=markers(qs);rmap={};qmap={}
  for k,(ix,num,tail) in enumerate(rm):
   body=[tail]+[l['text'] for l in rs[ix+1:rm[k+1][0] if k+1<len(rm) else len(rs)]]
   txt='\n'.join(body).strip();m=re.match(r'^([a-dA-D])[.,]?\s+(.*)',txt,re.S)
   if m:rmap[num]={'answer':ord(m[1].lower())-97,'explanation':clean(m[2]),'answerPage':rs[ix]['page'],'answerDocumentId':rs[ix]['documentId']}
   else:problems.append({'chapter':ch,'number':num,'type':'unparsedRationale','text':txt[:150]})
  shared=[]
  for rn,rr in rmap.items():
   if 'Please consult' in rr['explanation']:
    base,context=rr['explanation'].split('Please consult',1)
    rr['explanation']='\n'.join(l for l in base.splitlines() if l.count('_')<4).strip()
    shared.append((rn,'Please consult'+context))
  for k,(ix,num,tail) in enumerate(qm):
   ls=qs[ix+1:qm[k+1][0] if k+1<len(qm) else len(qs)];body=[{'text':tail,'x':qs[ix]['x']+21}]+ls
   # Option labels occur in the question's text column; table labels elsewhere are ignored.
   textcol=qs[ix]['x']+21
   opts=[]
   for j,l in enumerate(body):
    if j==0:continue
    m=re.match(r'^([a-dA-D3t])[.,]?(?:\s+(.*)|$)',l['text'])
    if not m:
     m=re.search(r'(?:[oO][nN][lLt][yYvV]|MLS|~~\S*)\s+([a-dA-D])\s+(.*)',l['text'])
    if m and textcol-30<l['x']<textcol+12:opts.append((j,{'3':'a','t':'c'}.get(m[1],m[1].lower()),(m[2] or '')))
   # Sequential a,b,c,d picks avoid clinical data lines which start with a single letter.
   seq=[]
   for o in reversed(opts):
    if o[1]=='dcba'[len(seq)]:seq.append(o)
    if len(seq)==4:break
   seq=list(reversed(seq))
   loc=qs[ix];r=rmap.get(num)
   if len(seq)!=4 or not r:
    problems.append({'chapter':ch,'number':num,'type':'incompleteOptions' if len(seq)!=4 else 'missingRationale','page':loc['page'],'documentId':loc['documentId'],'labels':[o[1] for o in opts]});continue
   question=clean('\n'.join(l['text'] for l in body[:seq[0][0]]))
   options=[]
   for oi,(j,label,txt) in enumerate(seq):
    stop=seq[oi+1][0] if oi<3 else len(body)
    extra=[]
    for l in body[j+1:stop]:
     if oi==3 and (re.match(r'^(?:[IVXIl]{1,5}|[A-H])[.,] *[A-Z]',l['text']) or re.match(r'^[A-Z]\. ',l['text'])):break
     extra.append(l['text'])
    options.append(clean('\n'.join([txt]+extra)))
   q={'id':f'boc-{ch}-{num}','bookId':'boc7','chapter':ch,'topic':topic,'number':num,'question':question,'options':options,**r,'whyOthers':'','memory':'','documentId':loc['documentId'],'page':loc['page'],'globalPage':loc['globalPage'],'printedPage':loc['globalPage']-(20 if loc['globalPage']<=244 else 4),'source':f'BOC Study Guide 7e (2022) · Chapter {ch} · Question {num} · {loc["documentId"]} PDF page {loc["page"]}','explanationKind':'book','needsSource':bool(re.search(r'figure|graph|photomicro|table|shown|following (?:data|information|results)|panel|below|above|curve|illustrat|image|diagram|pictured',question,re.I))}
   for previous,context in shared:
    ranges={(4,1):[2,3,4],(4,225):[226,230],(4,272):[273,274],(6,308):[309,310,311,312],(6,318):[319,320],(8,67):list(range(68,73)),(8,72):list(range(73,78))}
    if num in ranges.get((ch,previous),[]):q.update(sharedContext=context,contextDocumentId='boc2',contextPage={(4,1):6,(4,225):23,(4,272):31,(6,308):185,(6,318):187,(8,67):315,(8,72):316}[(ch,previous)],needsSource=True)
   if q['id']=='boc-2-363':q['options']=['pumped up the column','more polar than the stationary phase','always nonpolar','less polar than the stationary phase']
   qmap[num]=q;bank.append(q)
  expected=max(rmap.keys()|{n for _,n,_ in qm})
  missing=[n for n in range(1,expected+1) if n not in qmap]
  inventory.append({'chapter':ch,'topic':topic,'questionGlobalPages':[start,ans-1],'answerGlobalPages':[ans,end],'expectedQuestions':expected,'detectedQuestions':len(qm),'detectedRationales':len(rmap),'extractedQuestions':len(qmap),'missingNumbers':missing,'complete':not missing,'answerOnlyRecords':[{'number':n,**r} for n,r in rmap.items() if n not in qmap]})
 out=ROOT/'data'
 (out/'boc-repairs.json').write_text(json.dumps({'lineRepairs':LINE_REPAIRS,'pageRepairs':[{'documentId':'boc1','page':269,'question':161,'reason':'Merged header and rationale opening; repaired with targeted OCR and visual inspection.'}],'optionLabelRepairs':{'3':'a','t':'c'},'verifiedOptionRepairs':{'boc-2-363':{'documentId':'boc1','page':186,'reason':'Visual inspection separated c/d choices and excluded following Toxicology heading.'}},'note':'Targeted OCR label and spacing repairs; no absent questions reconstructed.'},ensure_ascii=False,indent=2))
 (out/'boc-bank.json').write_text(json.dumps(bank,ensure_ascii=False))
 (out/'boc-pages.json').write_text(json.dumps(pages,ensure_ascii=False))
 inv={'bookId':'boc7','sourcePdfPages':666,'bookStatedQuestionCount':2556,'numberedChapterQuestionCount':2562,'countDiscrepancy':'The preface states 2556 questions; chapter numbering ends at 438,376,256,320,194,386,323,269 (2562 total).','practiceQuestions':len(bank),'complete':all(i['complete'] for i in inventory),'sourceDefects':[{'documentId':'boc1','afterPage':244,'beforePage':245,'missingPrintedPages':[225,240],'missingQuestionNumbers':list(range(154,247)),'description':'Supplied PDF jumps from printed page 224 to 241; sixteen question pages are absent.'}],'chapters':inventory,'problems':problems}
 (out/'boc-inventory.json').write_text(json.dumps(inv,ensure_ascii=False,indent=2));print(json.dumps(inv,indent=2))
if __name__=='__main__':main()
