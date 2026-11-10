import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {configureFigures, renderFigures, getFigure, hasQuestionFigure, figureQuestionKey, figureManifestSummary} from '../figures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'data/figures.json')));
const bank = JSON.parse(readFileSync(resolve(root, 'data/study-bank.json')));
const byId = new Map(bank.map(q => [q.id, q]));
const copy = value => JSON.parse(JSON.stringify(value));

test('every generated mapping belongs to an active question and matches its actual source data', () => {
  configureFigures(manifest);
  for (const [id, entry] of Object.entries(manifest.questions)) {
    const q = byId.get(id);
    assert.ok(q, `Unknown or excluded question: ${id}`);
    assert.equal(entry.key, figureQuestionKey(q), `Python/JavaScript mapping fingerprint differs: ${id}`);
    assert.equal(Object.hasOwn(entry, 'layoutIds'), false, 'Question-layout screenshots must not be part of the manifest.');
    for (const fid of entry.figureIds) assert.ok(manifest.figures[fid].questionIds.includes(id));
  }
  assert.equal(manifest.coverage.activeQuestions, bank.length);
  assert.equal(manifest.coverage.sourceDependentQuestions, bank.filter(q => q.needsSource).length);
  const summary = figureManifestSummary(); summary.activeQuestions = -1;
  assert.equal(figureManifestSummary().activeQuestions, bank.length);
});

test('all local WebP files are present, content addressed, bounded and sourced to an exact PDF page', () => {
  const unique = new Map();
  for (const value of Object.values(manifest.figures)) {
    assert.equal(value.kind, 'figure', 'Only actual source pictures, diagrams and charts are included.');
    assert.match(value.path, /^assets\/figures\/[a-f0-9]{24}\.webp$/);
    const file = resolve(root, value.path); assert.ok(existsSync(file));
    const bytes = readFileSync(file);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 24), value.path.match(/([a-f0-9]{24})\.webp$/)[1]);
    assert.equal(bytes.length, value.bytes); unique.set(value.path, bytes.length);
    assert.ok(value.page >= 1 && value.page <= manifest.documents[value.documentId].pages);
    assert.ok(value.rect[0] >= 0 && value.rect[1] >= 0 && value.rect[2] > value.rect[0] && value.rect[3] > value.rect[1]);
    for (const qid of value.questionIds) assert.ok(byId.has(qid));
  }
  assert.equal(unique.size, manifest.coverage.uniqueImageFiles);
  assert.equal([...unique.values()].reduce((n, size) => n + size, 0), manifest.coverage.imageBytes);
  assert.equal(manifest.coverage.questionsWithOriginalLayouts, 0);
});

test('every export preserves native source pixels with lossless encoding and measured quality metadata', () => {
  configureFigures(manifest);
  for (const f of Object.values(manifest.figures)) {
    const q = f.quality;
    assert.equal(q.version, 1); assert.equal(q.export, 'lossless-page-render'); assert.equal(q.addedUpscaling, false);
    assert.ok(q.sourceWidth > 0 && q.sourceHeight > 0 && q.sourceRasterWidth >= 16 && q.sourceRasterHeight >= 16);
    assert.ok(q.exportDpi <= q.sourceDpi + .02, 'Do not add interpolation pixels to a scanned photo.');
    assert.ok(Math.abs(f.width - q.sourceWidth) <= 2 && Math.abs(f.height - q.sourceHeight) <= 2, 'Only edge rounding may add a pixel.');
    assert.deepEqual(getFigure(f.id).quality, q);
    assert.ok(Object.isFrozen(getFigure(f.id).quality));
    if (q.sourceLimited) assert.match(renderFigures(byId.get(f.questionIds[0]), {revealed: true}), /Original PDF scan · limited detail/);
  }
  assert.equal(manifest.coverage.sourceLimitedFigures, Object.values(manifest.figures).filter(f => f.quality.sourceLimited).length);
  assert.equal(manifest.coverage.losslessFigures, Object.keys(manifest.figures).length);
  const result = spawnSync('python3', ['-c', String.raw`
import io,json,fitz
from pathlib import Path
from PIL import Image
from scripts.prepare_figures import source_quality
m=json.loads(Path('data/figures.json').read_text())
docs={k:fitz.open(v['path']) for k,v in m['documents'].items()}
for f in m['figures'].values():
 p=docs[f['documentId']][f['page']-1];r=fitz.Rect(f['rect']);q=source_quality(p,r)
 assert q==f['quality'],('Source density must come from real raster dimensions and its page transform',f['id'])
 scale=q['exportDpi']/72
 pix=p.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=r,alpha=False)
 expected=Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
 actual=Image.open(f['path']).convert('RGB')
 assert actual.size==expected.size==(f['width'],f['height']),(f['id'],actual.size,expected.size)
 assert actual.tobytes()==expected.tobytes(),('Added image compression must not alter source features or colors',f['id'])
 assert Path(f['path']).read_bytes()[12:16]==b'VP8L',('WebP must use lossless encoding',f['id'])
print('All source crops decode to the exact RGB pixels of the native-density PDF composite.')
`], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('cross-page context figures are available before answering without rationale paragraphs', () => {
  configureFigures(manifest);
  for (const id of ['boc-4-2', 'boc-4-226', 'boc-4-273', 'boc-6-309', 'boc-6-319', 'boc-8-68', 'boc-8-73']) {
    const q = byId.get(id); assert.ok(q);
    const html = renderFigures(q, {revealed: false, exam: true});
    assert.match(html, /Shared question diagram/);
    const context = manifest.questions[id].figureIds.map(fid => manifest.figures[fid]).find(f => f.method === 'reviewed-context-crop-without-answer-text');
    assert.equal(context.documentId, q.contextDocumentId); assert.equal(context.page, q.contextPage); assert.equal(context.reveal, 'question');
    assert.equal(manifest.questions[id].figureIds.filter(fid => manifest.figures[fid].reveal === 'question').length, 1, 'Use the complete shared diagram instead of a duplicate cropped center.');
  }
  const result = spawnSync('python3', ['-c', String.raw`
import json,re,fitz
from pathlib import Path
m=json.loads(Path('data/figures.json').read_text())
docs={k:fitz.open(v['path']) for k,v in m['documents'].items()}
checked=0
for f in m['figures'].values():
 if f['method']!='reviewed-context-crop-without-answer-text':continue
 p=docs[f['documentId']][f['page']-1];r=fitz.Rect(f['rect'])
 for b in p.get_text('dict')['blocks']:
  for l in b.get('lines',[]):
   t=''.join(s['text'] for s in l['spans']).strip()
   if re.match(r'^\d{1,3}[.,]\s+[a-d][.,]?\s',t) and (fitz.Rect(l['bbox']) & r).get_area()>0:
    raise AssertionError('A reviewed context crop includes a numbered answer paragraph: '+f['id'])
 checked+=1
assert checked>=8
print('Reviewed cross-page figure crops contain no numbered answer paragraphs.')
`], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('rationale-only figures stay hidden in unanswered questions and exam mode', () => {
  configureFigures(manifest);
  const figure = Object.values(manifest.figures).find(f => f.reveal === 'answer');
  assert.ok(figure, 'The fixture must include an actual rationale figure');
  const q = byId.get(figure.questionIds[0]);
  assert.ok(!renderFigures(q).includes(`data-figure-id="${figure.id}"`));
  assert.ok(!renderFigures(q, {revealed: true, exam: true}).includes(`data-figure-id="${figure.id}"`));
  assert.ok(renderFigures(q, {revealed: true}).includes(`data-figure-id="${figure.id}"`));
  const result = spawnSync('python3', ['-c', String.raw`
import json,re,fitz
from pathlib import Path
m=json.loads(Path('data/figures.json').read_text());bank={q['id']:q for q in json.loads(Path('data/study-bank.json').read_text())}
docs={k:fitz.open(v['path']) for k,v in m['documents'].items()}
checked=0
for f in m['figures'].values():
 if f['reveal']!='answer':continue
 assert f['method']=='picture-before-printed-rationale-number'
 p=docs[f['documentId']][f['page']-1]
 for qid in f['questionIds']:
  q=bank[qid];assert q.get('answerDocumentId',q['documentId'])==f['documentId'];assert q['answerPage']==f['page']
  markers=[]
  for b in p.get_text('dict')['blocks']:
   for l in b.get('lines',[]):
    t=''.join(s['text'] for s in l['spans']).strip()
    if re.match(r'^'+str(q['number'])+r'[.,](?:\s|$)',t) and l['bbox'][0]<150:markers.append(l['bbox'][1])
  assert len(markers)==1,(qid,markers)
  assert f['rect'][3]<markers[0],('Rationale picture must precede its own printed answer',qid)
 checked+=1
assert checked>20
`], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('picture-only chart crops retain necessary labels without question stems or option rows', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import json,re,fitz
from pathlib import Path
m=json.loads(Path('data/figures.json').read_text());bank={q['id']:q for q in json.loads(Path('data/study-bank.json').read_text())}
docs={k:fitz.open(v['path']) for k,v in m['documents'].items()}
norm=lambda value:re.sub(r'[^a-z0-9]+',' ',value.lower()).strip()
checked=0
for f in m['figures'].values():
 if f['reveal']!='question':continue
 p=docs[f['documentId']][f['page']-1];r=fitz.Rect(f['rect']);text=norm(p.get_textbox(r))
 for qid in f['questionIds']:
  q=bank[qid];opening=norm(q['question']).split()[:7]
  if len(opening)==7 and ' '.join(opening) in text:raise AssertionError('Question stem inside picture '+f['id'])
  for b in p.get_text('dict')['blocks']:
   for line in b.get('lines',[]):
    if not (fitz.Rect(line['bbox'])&r).get_area():continue
    t=norm(''.join(s['text'] for s in line['spans']))
    for index,option in enumerate(q['options']):
     opt=norm(option)
     if len(opt.split())>=2 and t.startswith(chr(97+index)+' '+opt):raise AssertionError('Option row inside picture '+f['id'])
 checked+=1
labels={'boc-2-141':'Minutes','boc-2-323':'Months','boc-5-120':'patient A','boc-7-2':'Old method','boc-7-13':'Day'}
for qid,label in labels.items():
 f=next(m['figures'][id] for id in m['questions'][qid]['figureIds'] if m['figures'][id]['reveal']=='question')
 assert f['method']=='reviewed-chart-with-axis-labels'
 text=docs[f['documentId']][f['page']-1].get_textbox(fitz.Rect(f['rect']))
 assert label in text,(qid,label)
assert checked>100
print('Picture-only crops retain chart labels without question or option text.')
`], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('printed plate digit corrections point to the visually verified original image', () => {
  configureFigures(manifest);
  for (const [id, plate] of [['book-1-44', 2], ['book-1-78', 7], ['book-351-43', 51]]) {
    const entry = manifest.questions[id]; assert.ok(entry);
    assert.ok(entry.figureIds.some(fid => manifest.figures[fid].caption === `Color Plate ${plate}`));
    assert.ok(entry.notes.some(note => note.includes(`Plate ${plate}`)));
    assert.match(renderFigures(byId.get(id)), /printed question references/);
  }
  const multiple = renderFigures(byId.get('book-289-1'));
  assert.match(multiple, /Color Plate 30/); assert.match(multiple, /Color Plate 31/);
});

test('a custom bank cannot inherit a bundled figure by reusing an existing ID', () => {
  configureFigures(manifest);
  const q = byId.get('book-1-44');
  assert.match(renderFigures(q), /data-figure-id/);
  assert.equal(renderFigures({...q, question: 'A different original question.'}), '');
  assert.equal(renderFigures({...q, options: ['First', 'Second']}), '');
  assert.equal(renderFigures({...q, page: q.page + 1}), '');
  assert.equal(hasQuestionFigure(q), true);
  assert.equal(hasQuestionFigure({...q, question: 'A different original question.'}), false);
  const answerOnly = bank.find(q => manifest.questions[q.id]?.figureIds.some(id => manifest.figures[id].reveal === 'answer')
    && !manifest.questions[q.id].figureIds.some(id => manifest.figures[id].reveal === 'question'));
  assert.ok(answerOnly); assert.equal(hasQuestionFigure(answerOnly), false);
  const flagOnly = bank.find(q => q.needsSource && !manifest.questions[q.id]);
  assert.ok(flagOnly); assert.equal(hasQuestionFigure(flagOnly), false);
  assert.equal(hasQuestionFigure(null), false);
  assert.equal(getFigure('__proto__'), null);
});

test('invalid manifest paths and source mappings fail atomically without replacing valid visuals', () => {
  configureFigures(manifest);
  const q = byId.get('book-1-44'), expected = renderFigures(q);
  const id = Object.keys(manifest.figures)[0];
  for (const path of ['https://example.com/picture.webp', '../private.webp', 'assets/figures/../../private.webp', 'data:image/svg+xml,<svg/>']) {
    const bad = copy(manifest); bad.figures[id].path = path;
    assert.throws(() => configureFigures(bad)); assert.equal(renderFigures(q), expected);
  }
  const bad = copy(manifest); bad.questions[q.id].figureIds = ['fig-000000000000000000'];
  assert.throws(() => configureFigures(bad)); assert.equal(renderFigures(q), expected);
});

test('invalid quality metadata fails atomically without replacing valid visuals', () => {
  configureFigures(manifest);
  const q = byId.get('book-1-44'), expected = renderFigures(q), id = manifest.questions[q.id].figureIds[0];
  for (const patch of [{sourceWidth: -1}, {sourceDpi: 0}, {exportDpi: 9600}, {addedUpscaling: true}, {sourceLimited: 'yes'}, {reason: '<script>bad()</script>'}, {export: 'invented-detail'}]) {
    const bad = copy(manifest); Object.assign(bad.figures[id].quality, patch);
    assert.throws(() => configureFigures(bad)); assert.equal(renderFigures(q), expected);
  }
});

test('captions and notes are escaped, images have dimensions and enlarged-source controls', () => {
  const data = copy(manifest), q = byId.get('book-1-44');
  const id = data.questions[q.id].figureIds[0]; data.figures[id].caption = '<img src=x onerror=alert(1)>';
  data.questions[q.id].notes = ['<script>bad()</script>']; configureFigures(data);
  const html = renderFigures(q);
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /width="\d+" height="\d+"/); assert.match(html, /loading="lazy"/);
  assert.match(html, /data-figure-id="fig-[a-f0-9]{18}"/); assert.match(html, /data-document="textbook"/);
  configureFigures(manifest);
});
