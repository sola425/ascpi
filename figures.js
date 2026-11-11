// Original PDF visuals only. Mapping keys prevent custom-bank ID collisions.
const SOURCES = Object.freeze({textbook: 'docs/textbook.pdf', boc1: 'docs/boc-1.pdf', boc2: 'docs/boc-2.pdf'});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let documents = Object.create(null), figures = Object.create(null), tables = Object.create(null), questions = Object.create(null), summary = null;

export function figureQuestionKey(q) {
  if (!object(q) || typeof q.question !== 'string' || !Array.isArray(q.options)) return '';
  const text = JSON.stringify([q.question, q.options, q.documentId || '', q.page || 0, q.contextDocumentId || '', q.contextPage || 0]);
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return (value >>> 0).toString(16).padStart(8, '0');
}

export function configureFigures(manifest) {
  const nextDocuments = Object.create(null), nextFigures = Object.create(null), nextTables = Object.create(null), nextQuestions = Object.create(null);
  if (!object(manifest) || manifest.version !== 1 || !object(manifest.documents) || !object(manifest.figures) || !object(manifest.questions)) throw Error('The source visual manifest is invalid.');
  for (const [id, doc] of Object.entries(manifest.documents)) {
    if (!own(SOURCES, id) || !object(doc) || doc.path !== SOURCES[id] || !Number.isInteger(doc.pages) || doc.pages < 1 || doc.pages > 20000 || typeof doc.label !== 'string' || doc.label.length > 100) throw Error('A source visual document is invalid.');
    nextDocuments[id] = {path: doc.path, pages: doc.pages, label: doc.label};
  }
  if (Object.keys(manifest.figures).length > 20000 || Object.keys(manifest.questions).length > 20000) throw Error('The source visual manifest is too large.');
  for (const [id, value] of Object.entries(manifest.figures)) {
    if (!/^fig-[a-f0-9]{18}$/.test(id) || !object(value) || value.id !== id || value.kind !== 'figure' || !['question', 'answer'].includes(value.reveal)
      || !own(nextDocuments, value.documentId) || !Number.isInteger(value.page) || value.page < 1 || value.page > nextDocuments[value.documentId].pages
      || typeof value.path !== 'string' || !/^assets\/figures\/[a-f0-9]{24}\.webp$/.test(value.path)
      || !Number.isInteger(value.width) || value.width < 1 || value.width > 5000 || !Number.isInteger(value.height) || value.height < 1 || value.height > 10000
      || typeof value.caption !== 'string' || value.caption.length > 200 || typeof value.alt !== 'string' || value.alt.length > 500
      || !Array.isArray(value.questionIds) || value.questionIds.some(qid => !safeId(qid))) throw Error('A source visual is invalid.');
    let quality;
    if (own(value, 'quality')) {
      const q = value.quality;
      if (!object(q) || q.version !== 1 || !Number.isInteger(q.sourceWidth) || q.sourceWidth < 1 || q.sourceWidth > 5000
        || !Number.isInteger(q.sourceHeight) || q.sourceHeight < 1 || q.sourceHeight > 10000
        || !Number.isInteger(q.sourceRasterWidth) || q.sourceRasterWidth < 16 || q.sourceRasterWidth > 100000
        || !Number.isInteger(q.sourceRasterHeight) || q.sourceRasterHeight < 16 || q.sourceRasterHeight > 100000
        || !Number.isFinite(q.sourceDpi) || q.sourceDpi <= 0 || q.sourceDpi > 9600
        || !Number.isFinite(q.exportDpi) || q.exportDpi <= 0 || q.exportDpi > q.sourceDpi + .02
        || typeof q.sourceLimited !== 'boolean' || q.addedUpscaling !== false || q.export !== 'lossless-page-render'
        || (q.sourceLimited ? !['low-resolution-pdf', 'small-source-picture'].includes(q.reason) : q.reason !== null)) throw Error('A source visual quality record is invalid.');
      quality = Object.freeze({version: q.version, sourceWidth: q.sourceWidth, sourceHeight: q.sourceHeight,
        sourceRasterWidth: q.sourceRasterWidth, sourceRasterHeight: q.sourceRasterHeight, sourceDpi: q.sourceDpi, exportDpi: q.exportDpi,
        sourceLimited: q.sourceLimited, reason: q.reason, export: q.export, addedUpscaling: false});
    }
    nextFigures[id] = Object.freeze({id, kind: value.kind, reveal: value.reveal, path: value.path, documentId: value.documentId,
      page: value.page, width: value.width, height: value.height, caption: value.caption, alt: value.alt,
      ...(quality ? {quality} : {}),
      questionIds: Object.freeze([...new Set(value.questionIds)])});
  }
  if (own(manifest, 'tables') && (!object(manifest.tables) || Object.keys(manifest.tables).length > 20000)) throw Error('The source table inventory is invalid.');
  const text = (value, maximum = 500) => typeof value === 'string' && value.length <= maximum;
  for (const [id, value] of Object.entries(manifest.tables || {})) {
    if (!/^tbl-[a-f0-9]{18}$/.test(id) || !object(value) || value.id !== id || value.kind !== 'table'
      || !['question', 'answer'].includes(value.reveal) || !own(nextDocuments, value.documentId)
      || !Number.isInteger(value.page) || value.page < 1 || value.page > nextDocuments[value.documentId].pages
      || !text(value.caption, 200) || !Array.isArray(value.headers) || value.headers.length < 1 || value.headers.length > 32
      || value.headers.some(cell => !text(cell)) || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 256
      || value.rows.some(row => !Array.isArray(row) || row.length !== value.headers.length || row.some(cell => !text(cell)))
      || !Array.isArray(value.notes) || value.notes.length > 30 || value.notes.some(note => !text(note, 1000))
      || !Array.isArray(value.questionIds) || !value.questionIds.length || value.questionIds.some(qid => !safeId(qid))
      || value.sourceFigureId !== null && (typeof value.sourceFigureId !== 'string' || !own(nextFigures, value.sourceFigureId))
      || own(value, 'rowHeaders') && typeof value.rowHeaders !== 'boolean') throw Error('A source table is invalid.');
    if (value.sourceFigureId !== null) {
      const original = nextFigures[value.sourceFigureId];
      if (original.documentId !== value.documentId || original.page !== value.page || original.reveal !== value.reveal
        || value.questionIds.some(qid => !original.questionIds.includes(qid))) throw Error('A source table points to the wrong original.');
    }
    const groups = value.headerGroups || [];
    if (!Array.isArray(groups) || groups.length > value.headers.length || groups.some(group => !object(group) || !text(group.label, 200) || !Number.isInteger(group.span) || group.span < 1)
      || groups.length && groups.reduce((total, group) => total + group.span, 0) !== value.headers.length) throw Error('A table column group is invalid.');
    nextTables[id] = Object.freeze({id, kind: 'table', reveal: value.reveal, documentId: value.documentId, page: value.page,
      caption: value.caption, headers: Object.freeze([...value.headers]), rows: Object.freeze(value.rows.map(row => Object.freeze([...row]))),
      notes: Object.freeze([...value.notes]), rowHeaders: value.rowHeaders === true, sourceFigureId: value.sourceFigureId,
      headerGroups: Object.freeze(groups.map(group => Object.freeze({label: group.label, span: group.span}))),
      questionIds: Object.freeze([...new Set(value.questionIds)])});
  }
  for (const [id, value] of Object.entries(manifest.questions)) {
    if (!safeId(id) || !object(value) || typeof value.key !== 'string' || !/^[a-f0-9]{8}$/.test(value.key)
      || !Array.isArray(value.figureIds) || !Array.isArray(value.notes)
      || own(value, 'layoutIds') && (!Array.isArray(value.layoutIds) || value.layoutIds.length > 0)
      || value.notes.some(note => typeof note !== 'string' || note.length > 500)) throw Error('A source visual mapping is invalid.');
    for (const fid of value.figureIds) if (!own(nextFigures, fid) || !nextFigures[fid].questionIds.includes(id)) throw Error('A source visual mapping is inconsistent.');
    if (own(value, 'tableIds') && !Array.isArray(value.tableIds)) throw Error('A source table mapping is invalid.');
    if (own(value, 'displayQuestion') && (typeof value.displayQuestion !== 'string' || value.displayQuestion.trim().length < 15 || value.displayQuestion.length > 24000 || !value.tableIds?.length)) throw Error('A source question display is invalid.');
    for (const tid of value.tableIds || []) if (!own(nextTables, tid) || !nextTables[tid].questionIds.includes(id)) throw Error('A source table mapping is inconsistent.');
    nextQuestions[id] = Object.freeze({key: value.key, figureIds: Object.freeze([...new Set(value.figureIds)]), tableIds: Object.freeze([...new Set(value.tableIds || [])]), notes: Object.freeze([...value.notes]), displayQuestion: value.displayQuestion || null});
  }
  documents = nextDocuments; figures = nextFigures; tables = nextTables; questions = nextQuestions;
  summary = object(manifest.coverage) ? {...manifest.coverage} : null;
  return figureManifestSummary();
}

export function figureManifestSummary() { return summary === null ? null : JSON.parse(JSON.stringify(summary)); }

export function getFigure(id) {
  if (!safeId(id) || !own(figures, id)) return null;
  const {questionIds, ...figure} = figures[id];
  return {...figure};
}

export function getTable(id) {
  if (!safeId(id) || !own(tables, id)) return null;
  const {questionIds, ...table} = tables[id];
  return {...table};
}

export function questionText(q) {
  if (!object(q) || typeof q.question !== 'string') return '';
  const mapping = own(questions, q.id) ? questions[q.id] : null;
  return mapping && mapping.key === figureQuestionKey(q) && mapping.displayQuestion ? mapping.displayQuestion : q.question;
}

/** True only for a verified question picture belonging to this exact item. */
export function hasQuestionFigure(q) {
  if (!object(q) || typeof q.id !== 'string' || !own(questions, q.id)) return false;
  const mapping = questions[q.id];
  return mapping.key === figureQuestionKey(q) && (mapping.figureIds.some(id => figures[id].reveal === 'question') || mapping.tableIds.some(id => tables[id].reveal === 'question'));
}

function sourceLink(documentId, page, text = 'Open original PDF') {
  const doc = documents[documentId];
  if (!doc || !Number.isInteger(page) || page < 1 || page > doc.pages) return '';
  return `<a class="source-link" href="./${doc.path}#page=${page}" data-document="${esc(documentId)}" data-page="${page}" target="_blank" rel="noopener">${esc(text)} · ${esc(doc.label)} p.${page}</a>`;
}

/** Text cells retain the original values, units, blanks and grouping. */
export function renderTable(id, {expanded = false} = {}) {
  const table = getTable(id);
  if (!table) return '';
  const cell = value => esc(value).replace(/\n/g, '<br>');
  const headings = table.headers.map((value, index) => `<th scope="col"${value ? '' : ` aria-label="Unlabelled column ${index + 1}"`}>${cell(value)}</th>`).join('');
  const groups = table.headerGroups.length ? `<tr class="source-table-groups">${table.headerGroups.map(group => `<th scope="colgroup" colspan="${group.span}">${cell(group.label)}</th>`).join('')}</tr>` : '';
  const columnGroups = table.headerGroups.map(group => `<colgroup span="${group.span}"></colgroup>`).join('');
  const rows = table.rows.map(row => `<tr>${row.map((value, index) => table.rowHeaders && index === 0 ? `<th scope="row">${cell(value)}</th>` : `<td>${cell(value)}</td>`).join('')}</tr>`).join('');
  const compare = table.sourceFigureId ? `<button type="button" class="btn" data-figure-id="${table.sourceFigureId}">Compare original table</button>${sourceLink(table.documentId, table.page)}` : sourceLink(table.documentId, table.page, 'Compare original table');
  return `<section class="source-table${expanded ? ' source-table-expanded' : ''}" data-source-table="${table.id}"><div class="source-table-scroll" tabindex="0" role="region" aria-label="${esc(table.caption)}. Scroll sideways to see all columns."><table${groups ? ' class="has-column-groups"' : ''}><caption>${esc(table.caption)}</caption>${columnGroups}<thead>${groups}<tr class="source-table-columns">${headings}</tr></thead><tbody>${rows}</tbody></table></div>${table.notes.length ? `<div class="source-table-notes">${table.notes.map(note => `<p>${cell(note)}</p>`).join('')}</div>` : ''}<div class="source-table-actions">${expanded ? '' : `<button type="button" class="btn" data-table-id="${table.id}">Read table larger</button>`}${compare}</div><p class="source-table-credit">Table transcribed from the supplied PDF. Check the original for source typography.</p></section>`;
}

function figureHTML(figure) {
  const clarity = figure.quality?.sourceLimited ? '<span class="source-figure-quality">Original PDF scan · limited detail. A clearer source is needed for finer features.</span>' : '';
  return `<figure class="source-figure source-figure-${figure.kind}"><button type="button" class="source-figure-open" data-figure-id="${figure.id}" aria-label="Enlarge ${esc(figure.caption)}"><img src="./${figure.path}" width="${figure.width}" height="${figure.height}" loading="lazy" decoding="async" alt="${esc(figure.alt)}"><span class="source-figure-enlarge" aria-hidden="true">Enlarge picture</span></button><figcaption><strong>${esc(figure.caption)}</strong>${sourceLink(figure.documentId, figure.page)}${clarity}</figcaption></figure>`;
}

/** The app controls answer reveal; an exam question never shows rationale figures. */
export function renderFigures(q, {revealed = false, exam = false} = {}) {
  if (!object(q) || typeof q.id !== 'string') return '';
  const mapping = own(questions, q.id) ? questions[q.id] : null;
  if (mapping && mapping.key !== figureQuestionKey(q)) return '';
  if (!mapping) {
    if (!q.needsSource) return '';
    const link = sourceLink(q.contextDocumentId || q.documentId, q.contextPage || q.page, 'View source visual');
    return link ? `<aside class="source-figure-fallback">${link}</aside>` : '';
  }
  const available = id => figures[id].reveal === 'question' || revealed === true && exam !== true;
  const inlineTables = mapping.tableIds.filter(id => tables[id].reveal === 'question' || revealed === true && exam !== true);
  const tableOriginals = new Set(inlineTables.map(id => tables[id].sourceFigureId));
  const inline = mapping.figureIds.filter(id => available(id) && !tableOriginals.has(id)).map(id => figures[id]);
  if (!inline.length && !inlineTables.length) {
    const link = sourceLink(q.contextDocumentId || q.documentId, q.contextPage || q.page, 'View source visual');
    return q.needsSource && link ? `<aside class="source-figure-fallback">${link}</aside>` : '';
  }
  const notes = mapping.notes.map(note => `<p class="source-figure-note">${esc(note)}</p>`).join('');
  const label = inlineTables.length ? inline.length ? 'Question visuals and data' : 'Question data table' : 'Source picture';
  return `<section class="question-figures" aria-label="Original source visuals"><div class="source-figure-heading"><strong>${label}</strong><span>${inlineTables.length ? 'From the original question · scroll wide tables' : 'Original PDF figure · tap to enlarge'}</span></div>${inline.length ? `<div class="source-figure-grid">${inline.map(figureHTML).join('')}</div>` : ''}${inlineTables.map(id => renderTable(id)).join('')}${notes}</section>`;
}
