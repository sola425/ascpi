"""Render source visuals without changing question text or inventing imagery.

The PDFs are mostly page scans. Only isolated source graphics and reviewed
color-plate/context rectangles become images; question text is never rendered
as an image. Only active-bank IDs receive mappings.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = {
    'textbook': ('docs/textbook.pdf', 'Success textbook'),
    'boc1': ('docs/boc-1.pdf', 'BOC · Part 1'),
    'boc2': ('docs/boc-2.pdf', 'BOC · Part 2'),
}
QUALITY_VERSION = 1


def source_quality(page, rect, rotation=0):
    """Measure real raster detail, not PDF metadata's nominal 96 DPI.

    These books contain low-resolution page scans, often with additional
    1-pixel mask objects. The masks describe picture boundaries but contain no
    picture detail. Success also has two full-page layers, so a single xref
    cannot safely replace a composited page crop. Render all layers and chart
    strokes at the best overlapping raster's actual pixel density.
    """
    candidates = []
    for item in page.get_image_info(xrefs=True):
        bounds = fitz.Rect(item['bbox'])
        if item['width'] < 16 or item['height'] < 16 or bounds.is_empty:
            continue
        if (bounds & rect).get_area() < rect.get_area() * .5:
            continue
        a, b, c, d, _, _ = item['transform']
        points_x, points_y = math.hypot(a, b), math.hypot(c, d)
        if not points_x or not points_y:
            continue
        density_x, density_y = item['width'] / points_x, item['height'] / points_y
        candidates.append((min(density_x, density_y), density_x, density_y, item))
    if not candidates:
        raise ValueError(f'No genuine raster source for picture crop on PDF page {page.number + 1}. Review this new source before exporting it.')
    scale, density_x, density_y, source = max(candidates, key=lambda value: value[0])
    # Round only after measuring the actual transform; exportDpi is also the
    # reproducible rendering scale. No 2.3x interpolation or lossy re-encoding.
    export_dpi = round(scale * 72, 6)
    source_width = max(1, round(rect.width * density_x))
    source_height = max(1, round(rect.height * density_y))
    if rotation in (90, 270):
        source_width, source_height = source_height, source_width
    limited = scale * 72 < 150 or min(source_width, source_height) < 180
    return {
        'version': QUALITY_VERSION,
        'sourceWidth': source_width, 'sourceHeight': source_height,
        'sourceDpi': round(scale * 72, 2), 'exportDpi': export_dpi,
        'sourceRasterWidth': source['width'], 'sourceRasterHeight': source['height'],
        'sourceLimited': limited,
        'reason': 'low-resolution-pdf' if scale * 72 < 150 else 'small-source-picture' if limited else None,
        'export': 'lossless-page-render', 'addedUpscaling': False,
    }

# Rectangles were reviewed against the original pages, including the caption
# and neighboring-question boundaries. They contain the picture, not a key.
PLATES = {}


def grid(page, left, right, first, second, third, left_x, right_x):
    for number, x, bounds in [
        (left[0], left_x, first), (left[1], left_x, second),
        (left[2], left_x, third), (right[0], right_x, first),
        (right[1], right_x, second), (right[2], right_x, third),
    ]:
        PLATES[number] = [(page, (x[0], bounds[0], x[1], bounds[1]))]


grid(423, (1, 2, 3), (4, 5, 6), (35, 244), (263, 455), (474, 664), (40, 287), (288, 540))
grid(424, (7, 8, 9), (10, 11, 12), (35, 242), (261, 451), (471, 661), (20, 269), (270, 540))
grid(425, (13, 14, 15), (16, 17, 18), (35, 243), (262, 453), (472, 662), (40, 289), (290, 540))
PLATES.update({
    19: [(426, (20, 35, 287, 242))], 20: [(426, (298, 35, 540, 241))],
    21: [(426, (20, 267, 287, 448))], 22: [(426, (298, 267, 540, 448))],
    23: [(426, (64, 481, 477, 639))],
    24: [(427, (40, 35, 187, 166))], 25: [(427, (190, 35, 535, 164))],
    26: [(427, (40, 185, 298, 336))], 27: [(427, (300, 185, 540, 336))],
    28: [(427, (40, 356, 298, 503))], 29: [(427, (300, 356, 540, 504))],
    30: [(427, (40, 523, 298, 669))], 31: [(427, (300, 523, 540, 668))],
})
grid(428, (32, 33, 34), (35, 36, 37), (35, 248), (269, 468), (488, 660), (20, 269), (270, 540))
grid(429, (38, 39, 40), (41, 42, 43), (35, 225), (247, 440), (462, 648), (40, 289), (290, 540))
grid(430, (44, 45, 46), (47, 48, 49), (35, 224), (246, 433), (455, 645), (20, 270), (271, 540))
grid(431, (50, 51, 52), (53, 54, 55), (20, 222), (243, 403), (424, 650), (40, 291), (292, 540))
PLATES.update({
    56: [(432, (20, 90, 269, 363))],
    # The two band panels are separate from the surrounding method text.
    57: [(432, (294, 138, 462, 316)), (432, (295, 438, 466, 607))],
    59: [(434, (20, 60, 270, 231))],
    60: [(434, (20, 270, 370, 430))],
})

# Three OCR digit errors were checked visually in the printed question.
REFERENCE_REPAIRS = {
    'book-1-44': (2, 'The printed question references Color Plate 2.'),
    'book-1-78': (7, 'The printed question references Color Plate 7.'),
    'book-351-43': (51, 'The printed question references Color Plate 51.'),
}

# Cross-page diagrams are printed amid rationales. These reviewed rectangles
# deliberately stop before the answer paragraphs below them.
CONTEXTS = [
    ('boc2', 6, (69, 248, 267, 400), ['boc-4-2', 'boc-4-3', 'boc-4-4']),
    ('boc2', 23, (116, 239, 237, 391), ['boc-4-226', 'boc-4-230']),
    ('boc2', 31, (117, 130, 313, 287), ['boc-4-273', 'boc-4-274']),
    ('boc2', 185, (117, 263, 311, 405), ['boc-6-309', 'boc-6-310']),
    ('boc2', 185, (311, 263, 505, 405), ['boc-6-311', 'boc-6-312']),
    ('boc2', 187, (117, 117, 313, 258), ['boc-6-319', 'boc-6-320']),
    ('boc2', 315, (116, 344, 319, 504), [f'boc-8-{n}' for n in range(68, 73)]),
    ('boc2', 316, (69, 215, 317, 280), [f'boc-8-{n}' for n in range(73, 78)]),
]

# Some scanned chart axes are outside the separately embedded color/curve
# object. These reviewed picture-only rectangles retain the axis labels while
# stopping before the question stem or options. They are not question crops.
CHARTS = {
    'boc-2-137': (140, 117, 307, 252),
    'boc-2-141': (111, 117, 255, 254),
    'boc-2-164': (93, 108, 240, 201),
    'boc-2-165': (92, 405, 245, 510),
    'boc-2-170': (94, 115, 242, 195),
    'boc-2-171': (91, 416, 246, 519),
    'boc-2-323': (99, 112, 254, 214),
    'boc-4-234': (87, 322, 245, 499),
    'boc-4-235': (141, 108, 344, 284),
    'boc-5-120': (136, 110, 491, 328),
    'boc-7-2': (91, 461, 267, 578),
    'boc-7-13': (89, 230, 296, 342),
    'boc-7-250': (89, 210, 260, 399),
    'boc-7-251': (82, 483, 239, 700),
    'boc-8-235': (88, 547, 370, 655),
}

RATIONALE_PICTURES = {
    'boc-4-234': (68, 184, 249, 409),
    'boc-4-235': (65, 488, 266, 661),
    'boc-4-256': (68, 86, 266, 235),
    'boc-4-257': (68, 322, 265, 472),
    'boc-6-332': (68, 373, 261, 519),
}


def question_key(q):
    fields = [q['question'], q['options'], q.get('documentId', ''), q.get('page', 0),
              q.get('contextDocumentId', ''), q.get('contextPage', 0)]
    text = json.dumps(fields, ensure_ascii=False, separators=(',', ':'))
    data = text.encode('utf-16-le')
    value = 2166136261
    for index in range(0, len(data), 2):
        value = ((value ^ (data[index] | data[index + 1] << 8)) * 16777619) & 0xffffffff
    return f'{value:08x}'


def lines(page):
    return [(fitz.Rect(line['bbox']), ''.join(s['text'] for s in line['spans']).strip())
            for block in page.get_text('dict')['blocks']
            for line in block.get('lines', [])]


def anchors(page, document_id, page_number, cache):
    key = (document_id, page_number)
    if key in cache:
        return cache[key]
    found = []
    for box, text in lines(page):
        match = re.match(r'^(\d{1,3})[.,](?:\s|$)', text)
        if not match or not 0 < int(match[1]) <= 600:
            continue
        if document_id == 'textbook':
            if not 58 < box.y0 < 672 or not (25 < box.x0 < 80 or 270 < box.x0 < 325):
                continue
            column = int(box.x0 >= 273)
        else:
            global_page = page_number + (333 if document_id == 'boc2' else 0)
            margin = 70 if global_page % 2 else 117
            if not 65 < box.y0 < 748 or not 50 < box.x0 < margin + 17:
                continue
            column = 0
        found.append({'number': int(match[1]), 'box': box, 'column': column, 'text': text})
    if document_id == 'textbook' and page_number == 87:
        # The printed 8. has a detached punctuation mark in the OCR layer.
        # Its number and first text line were checked against the source scan.
        found.append({'number': 8, 'box': fitz.Rect(55.68, 321.48, 241.27, 337.98),
                      'column': 0, 'text': '8'})
    found.sort(key=lambda a: (a['column'], a['box'].y0))
    cache[key] = found
    return found


def question_rectangle(q, page, document_id, page_number, cache):
    found = anchors(page, document_id, page_number, cache)
    matches = [a for a in found if a['number'] == q.get('number')]
    if len(matches) != 1:
        return None
    anchor = matches[0]
    next_y = min([a['box'].y0 for a in found if a['column'] == anchor['column']
                  and a['box'].y0 > anchor['box'].y0 + 2] + [672 if document_id == 'textbook' else 748])
    if document_id == 'textbook':
        left, right = (min(280, anchor['box'].x0 - 4), 535) if anchor['column'] else (max(20, min(38, anchor['box'].x0 - 4)), 276)
    else:
        # BOC has one question column. Figures may extend to the content margin
        # beyond the hanging-indent number, while retaining the same y bounds.
        left, right = 52, 555
    rect = fitz.Rect(left, anchor['box'].y0 - 2, right, next_y - 3) & page.rect
    return rect if rect.height >= 24 and rect.width >= 100 else None


def plate_numbers(q):
    if q['id'] in REFERENCE_REPAIRS:
        return [REFERENCE_REPAIRS[q['id']][0]]
    result = []
    for match in re.finditer(r'\bcolor\s+plate\s*([0-9Il]+)', q['question'], re.I):
        try:
            number = int(match[1].replace('I', '1').replace('l', '1').replace('i', '1'))
        except ValueError:
            continue
        if number in PLATES and number not in result:
            result.append(number)
    return result


def isolated_images(page):
    for image in page.get_image_info():
        rect = fitz.Rect(image['bbox']) & page.rect
        if rect.width < 48 or rect.height < 28 or rect.get_area() > page.rect.get_area() * .45:
            continue
        if rect.x0 < 52 or rect.x1 > 556 or rect.y0 < 65 or rect.y1 > 749:
            continue
        if not .15 < rect.width / rect.height < 10:
            continue
        yield rect


def picture_without_option_text(page, rectangle, q):
    """Remove neighboring option typography, including padding-only overlap."""
    rect = fitz.Rect(rectangle)
    normalized = lambda value: re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()
    for box, text in lines(page):
        if not (box & rect).get_area():
            continue
        value = normalized(text)
        is_option = any(len(normalized(option).split()) >= 2
                        and value.startswith(chr(97 + index) + ' ' + normalized(option))
                        for index, option in enumerate(q['options']))
        if not is_option:
            continue
        if box.y0 > rect.y0 + rect.height * .8:
            rect.y1 = min(rect.y1, box.y0 - 1)
        elif box.y1 < rect.y0 + rect.height * .2:
            rect.y0 = max(rect.y0, box.y1 + 1)
        else:
            return None
    return rect if rect.width > 10 and rect.height > 10 else None


def merge_picture_fragments(rectangles):
    merged = []
    for rectangle in rectangles:
        current = fitz.Rect(rectangle)
        while True:
            nearby = next((index for index, previous in enumerate(merged)
                           if (current + (-4, -4, 4, 4)).intersects(previous)), None)
            if nearby is None:
                break
            current |= merged.pop(nearby)
        merged.append(current)
    return merged


def load_page_audit(root, documents, by_id):
    """Accept reviewed question-input visuals only; never infer links by topic."""
    folder = root / 'data/visual-audit'
    files = [folder / f'{key}-additions.json' for key in DOCUMENTS]
    if not any(path.exists() for path in files):
        return [], {}
    if not all(path.exists() for path in files):
        raise ValueError('Finish all three page-audit addition files before rebuilding visuals.')
    audit_manifest = json.loads((folder / 'manifest.json').read_text())
    records, review = [], {}
    for document_id, doc in documents.items():
        checked = audit_manifest['documents'][document_id]
        for path, digest in [(root / DOCUMENTS[document_id][0], checked['sourceSha256']),
                             (folder / f'{document_id}-pages.json', checked['ledgerSha256']),
                             (folder / f'{document_id}-additions.json', checked['additionsSha256'])]:
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError('A reviewed source or audit file changed; review and refresh the audit manifest.')
        ledger = json.loads((folder / f'{document_id}-pages.json').read_text())
        if isinstance(ledger, dict):
            expected = ledger.get('sourceSha256')
            actual = hashlib.sha256((root / DOCUMENTS[document_id][0]).read_bytes()).hexdigest()
            if expected and expected != actual:
                raise ValueError('A page audit belongs to a different source PDF.')
            ledger = ledger['pages']
        if not isinstance(ledger, list) or len(ledger) != len(doc) or sorted(row['page'] for row in ledger) != list(range(1, len(doc) + 1)):
            raise ValueError(f'The {document_id} audit must cover every page exactly once.')
        review[document_id] = {'pagesReviewed': len(ledger), 'ledger': f'data/visual-audit/{document_id}-pages.json'}
        additions = json.loads((folder / f'{document_id}-additions.json').read_text())
        if isinstance(additions, dict):
            additions = additions.get('additions', additions.get('visuals', []))
        if not isinstance(additions, list):
            raise ValueError('Visual audit additions must be a list.')
        for index, item in enumerate(additions):
            if item.get('reviewStatus', item.get('status')) in ('unresolved', 'excluded', 'out-of-scope') or item.get('verified') is False:
                continue
            if item.get('reveal', 'question') != 'question':
                continue
            if item.get('documentId', document_id) != document_id or not isinstance(item.get('page'), int) or not 1 <= item['page'] <= len(doc):
                raise ValueError('A reviewed visual has an invalid source page.')
            qids = item.get('questionIds', [])
            if not isinstance(qids, list) or not qids or any(qid not in by_id for qid in qids):
                raise ValueError('A reviewed visual links to an absent or excluded question.')
            if any(audit_manifest['questionKeys'].get(qid) != question_key(by_id[qid]) for qid in qids):
                raise ValueError('A reviewed question changed after its visual was checked.')
            bounds = item.get('rect', item.get('sourceRect'))
            if not isinstance(bounds, list) or len(bounds) != 4 or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in bounds):
                raise ValueError('A reviewed visual needs explicit finite crop coordinates.')
            rect = fitz.Rect(bounds)
            if rect.is_empty or not doc[item['page'] - 1].rect.contains(rect):
                raise ValueError('A reviewed visual extends outside its original page.')
            records.append({**item, 'documentId': document_id, 'rect': list(rect),
                            'auditRef': item.get('id', item.get('auditId', f'{document_id}-{item["page"]}-{index + 1}'))})
    return records, review


def build(root=ROOT):
    bank = json.loads((root / 'data/study-bank.json').read_text())
    by_id = {q['id']: q for q in bank}
    documents = {key: fitz.open(root / path) for key, (path, _) in DOCUMENTS.items()}
    previous = {}
    try:
        previous = json.loads((root / 'data/figures.json').read_text())
    except (OSError, ValueError):
        pass
    target = root / 'assets/figures'
    target.mkdir(parents=True, exist_ok=True)
    figures, tables, question_map, source_metadata = {}, {}, {}, {}
    used_files = set()
    anchor_cache = {}
    audit = {}
    for key, doc in documents.items():
        path, name = DOCUMENTS[key]
        source_metadata[key] = {'path': path, 'label': name, 'pages': len(doc),
                                'sha256': hashlib.sha256((root / path).read_bytes()).hexdigest()}
        histogram = Counter()
        drawing_pages = 0
        for page in doc:
            histogram[len(page.get_image_info())] += 1
            drawing_pages += bool(page.get_drawings())
        audit[key] = {'pages': len(doc), 'pagesWithDrawings': drawing_pages,
                      'imageCountHistogram': {str(k): v for k, v in sorted(histogram.items())}}

    def mapping(q):
        return question_map.setdefault(q['id'], {'key': question_key(q), 'figureIds': [], 'tableIds': [], 'notes': []})

    def add(document_id, page_number, rectangle, qids, reveal='question', label=None, method='embedded-source-graphic', rotation=0, attach=True, visual_type=None):
        qids = sorted(set(qid for qid in qids if qid in by_id))
        if not qids:
            return
        rect = fitz.Rect(rectangle) & documents[document_id][page_number - 1].rect
        if rect.width < 10 or rect.height < 10:
            return
        geometry = [round(v, 2) for v in rect]
        if rotation not in (0, 90, 180, 270):
            raise ValueError('A source picture can only use a reviewed right-angle rotation.')
        parts = [document_id, page_number, geometry, 'figure', reveal]
        if rotation:
            parts.append(rotation)
        identity = json.dumps(parts, separators=(',', ':'))
        fid = 'fig-' + hashlib.sha256(identity.encode()).hexdigest()[:18]
        if fid not in figures:
            page = documents[document_id][page_number - 1]
            # Manifest coordinates are the reproducible, reviewed crop bounds.
            export_rect = fitz.Rect(geometry)
            quality = source_quality(page, export_rect, rotation)
            cached = previous.get('figures', {}).get(fid)
            source_unchanged = previous.get('documents', {}).get(document_id, {}).get('sha256') == source_metadata[document_id]['sha256']
            if cached and source_unchanged and cached.get('quality') == quality and re.fullmatch(r'assets/figures/[0-9a-f]{24}\.webp', cached.get('path', '')) and (root / cached['path']).is_file():
                filename = Path(cached['path']).name
                width, height, size = cached['width'], cached['height'], cached['bytes']
            else:
                scale = quality['exportDpi'] / 72
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=export_rect, alpha=False)
                im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
                if rotation:
                    im = im.rotate(-rotation, expand=True)
                data = io.BytesIO()
                im.save(data, 'WEBP', lossless=True, method=6, exact=True)
                content = data.getvalue()
                filename = hashlib.sha256(content).hexdigest()[:24] + '.webp'
                (target / filename).write_bytes(content)
                width, height, size = im.width, im.height, len(content)
            used_files.add(filename)
            caption = label or 'Original source figure'
            figures[fid] = {'id': fid, 'kind': 'figure', 'reveal': reveal, 'documentId': document_id,
                            'page': page_number, 'rect': geometry, 'path': 'assets/figures/' + filename,
                            'width': width, 'height': height, 'bytes': size,
                            'quality': quality,
                            'caption': caption, 'alt': f'{caption} from {DOCUMENTS[document_id][1]}, PDF page {page_number}.',
                            'method': method, 'questionIds': []}
            if rotation:
                figures[fid]['rotation'] = rotation
            if visual_type:
                figures[fid]['visualType'] = visual_type
        else:
            used_files.add(Path(figures[fid]['path']).name)
        figure = figures[fid]
        figure['questionIds'] = sorted(set(figure['questionIds'] + qids))
        for qid in qids:
            entry = mapping(by_id[qid])
            if attach and fid not in entry['figureIds']:
                entry['figureIds'].append(fid)
        return fid

    # Only isolated graphics inside a numbered question region are rendered.
    # The question itself, its options and its text tables stay normal app text.
    groups = defaultdict(list)
    answer_groups = defaultdict(list)
    reviewed_context_ids = {qid for _, _, _, qids in CONTEXTS for qid in qids}
    for q in bank:
        document_id = q.get('documentId', 'textbook' if q['id'].startswith('book-') else '')
        if document_id in documents and isinstance(q.get('page'), int):
            groups[(document_id, q['page'])].append(q)
        answer_id = q.get('answerDocumentId', document_id)
        if answer_id in documents and isinstance(q.get('answerPage'), int):
            answer_groups[(answer_id, q['answerPage'])].append(q)

    for (document_id, page_number), questions in sorted(groups.items()):
        page = documents[document_id][page_number - 1]
        candidates = list(isolated_images(page))
        for q in questions:
            rect = question_rectangle(q, page, document_id, page_number, anchor_cache)
            if rect and q['id'] not in reviewed_context_ids:
                for image_rect in candidates:
                    if rect.contains(image_rect):
                        crop = CHARTS.get(q['id'], image_rect + (-2, -2, 2, 2))
                        crop = picture_without_option_text(page, crop, q)
                        if crop:
                            add(document_id, page_number, crop, [q['id']], method='reviewed-chart-with-axis-labels' if q['id'] in CHARTS else 'embedded-image-inside-question')

    # BOC rationale pictures precede the numbered explanation they illustrate.
    # Numbering follows the picture, unlike the question-page layout.
    for (document_id, page_number), questions in sorted(answer_groups.items()):
        if document_id == 'textbook':
            continue  # This scanned source has no independently embedded photos.
        page = documents[document_id][page_number - 1]
        candidates = list(isolated_images(page))
        printed = anchors(page, document_id, page_number, anchor_cache)
        active_numbers = {q.get('number'): q for q in questions}
        by_question = defaultdict(list)
        shared = [fitz.Rect(bounds) for did, pn, bounds, _ in CONTEXTS if did == document_id and pn == page_number]
        for image_rect in candidates:
            if any((bounds & image_rect).get_area() > image_rect.get_area() * .5 for bounds in shared):
                continue
            following = [a for a in printed if a['box'].y0 >= image_rect.y1 - 2]
            if not following:
                continue
            anchor = min(following, key=lambda a: a['box'].y0)
            q = active_numbers.get(anchor['number'])
            if not q or anchor['box'].y0 - image_rect.y1 > 80:
                continue
            crop = image_rect + (-2, -2, 2, 2)
            crop.y1 = min(crop.y1, anchor['box'].y0 - 2)
            by_question[q['id']].append(crop)
        for qid, rectangles in by_question.items():
            q = by_id[qid]
            for rectangle in merge_picture_fragments(rectangles):
                crop = RATIONALE_PICTURES.get(qid, rectangle)
                add(document_id, page_number, crop, [qid], reveal='answer', label='Original rationale figure',
                    method='picture-before-printed-rationale-number')

    for q in bank:
        numbers = plate_numbers(q)
        if not numbers:
            continue
        for number in numbers:
            for index, (page_number, rect) in enumerate(PLATES[number]):
                panel = f' · panel {index + 1}' if len(PLATES[number]) > 1 else ''
                add('textbook', page_number, rect, [q['id']], label=f'Color Plate {number}{panel}', method='reviewed-color-plate-crop')
        if q['id'] in REFERENCE_REPAIRS:
            mapping(q)['notes'].append(REFERENCE_REPAIRS[q['id']][1])

    for document_id, page_number, rect, qids in CONTEXTS:
        add(document_id, page_number, rect, qids, label='Shared question diagram', method='reviewed-context-crop-without-answer-text')

    reviewed, page_review = load_page_audit(root, documents, by_id)
    for item in reviewed:
        document_id, page_number, qids = item['documentId'], item['page'], sorted(set(item['questionIds']))
        for old_id in item.get('replacesFigureIds', item.get('supersedesFigureIds', [])):
            old = figures.get(old_id)
            if not old:
                raise ValueError('A reviewed crop replacement refers to an unknown old figure.')
            if old['reveal'] != 'question' or old['documentId'] != document_id or old['page'] != page_number:
                raise ValueError('A reviewed crop replacement points to another source page.')
            old['questionIds'] = [qid for qid in old['questionIds'] if qid not in qids]
            for qid in qids:
                entry = mapping(by_id[qid])
                entry['figureIds'] = [fid for fid in entry['figureIds'] if fid != old_id]
            if not old['questionIds']:
                del figures[old_id]
        data = item.get('table')
        caption = item.get('caption') or ('Question data table' if data else 'Original question visual')
        rotation = item.get('rotation', 0)
        if data:
            headers, rows = data.get('headers'), data.get('rows')
            notes = list(dict.fromkeys(data.get('notes', []) + ['Display note: ' + note for note in item.get('notes', [])]))
            header_groups = data.get('headerGroups', [])
            if (not isinstance(headers, list) or not 1 <= len(headers) <= 32 or not all(isinstance(value, str) for value in headers)
                    or not isinstance(rows, list) or not rows or len(rows) > 256
                    or any(not isinstance(row, list) or len(row) != len(headers) or any(not isinstance(cell, str) for cell in row) for row in rows)
                    or not isinstance(notes, list) or any(not isinstance(note, str) for note in notes)):
                raise ValueError('A reviewed table has inconsistent headers/cells: ' + str(item['auditRef']))
            if (not isinstance(header_groups, list) or any(not isinstance(group, dict) or not isinstance(group.get('label'), str)
                    or not isinstance(group.get('span'), int) or group['span'] < 1 for group in header_groups)
                    or header_groups and sum(group['span'] for group in header_groups) != len(headers)):
                raise ValueError('A reviewed table has inconsistent column groups.')
            original = None
            if item.get('useSourceCrop', item.get('includeSourceCrop', True)) and not item.get('sourceContainsOptions', False):
                original = add(document_id, page_number, item['rect'], qids, label=caption,
                               method='reviewed-question-table-original', rotation=rotation, attach=False, visual_type='table')
            identity = json.dumps([document_id, page_number, item['rect'], headers, rows, header_groups], ensure_ascii=False, separators=(',', ':'))
            tid = 'tbl-' + hashlib.sha256(identity.encode()).hexdigest()[:18]
            existing = tables.get(tid, {})
            if existing and (existing.get('sourceFigureId') is None) != (original is None):
                raise ValueError('Duplicate table records disagree about their original crop.')
            qids = sorted(set(qids + existing.get('questionIds', [])))
            notes = list(dict.fromkeys(existing.get('notes', []) + notes))
            tables[tid] = {'id': tid, 'kind': 'table', 'reveal': 'question', 'documentId': document_id,
                           'page': page_number, 'rect': item['rect'], 'caption': caption, 'headers': headers, 'rows': rows,
                           'notes': notes, 'rowHeaders': data.get('rowHeaders', len(headers) > 1), 'sourceFigureId': original,
                           'headerGroups': header_groups,
                           'questionIds': qids, 'method': 'visually-reviewed-transcription', 'auditRef': item['auditRef']}
            if original:
                figures[original]['tableOriginal'] = tid
            for qid in qids:
                if tid not in mapping(by_id[qid])['tableIds']:
                    mapping(by_id[qid])['tableIds'].append(tid)
        else:
            if item.get('sourceContainsOptions') or item.get('useSourceCrop', item.get('includeSourceCrop')) is False:
                raise ValueError('An option matrix needs a verified structured table, not a screenshot.')
            fid = add(document_id, page_number, item['rect'], qids, label=caption,
                      method='reviewed-question-page-audit', rotation=rotation, visual_type=item.get('visualType', 'diagram'))
            figures[fid]['auditRef'] = item['auditRef']

    # Suppress only exact OCR table fragments already represented as readable
    # cells. The canonical question remains intact for export and matching.
    normalize = lambda text: re.sub(r'\s+', ' ', text).strip()
    for qid, entry in question_map.items():
        original = normalize(by_id[qid]['question'])
        displayed = original
        for tid in entry['tableIds']:
            table = tables[tid]
            if table['sourceFigureId'] is None:
                continue
            page = documents[table['documentId']][table['page'] - 1]
            fragment = normalize(page.get_textbox(fitz.Rect(table['rect'])))
            if len(fragment) >= 15 and len(fragment.split()) >= 4:
                displayed = normalize(re.sub(r'(?<!\S)' + re.escape(fragment) + r'(?!\S)', ' ', displayed, count=1))
        if displayed != original and len(displayed) >= 15:
            entry['displayQuestion'] = displayed
            entry['displayQuestionMethod'] = 'exact-source-table-text-elision'
    for item in reviewed:
        for qid, text in item.get('displayQuestionById', {}).items():
            if qid not in item['questionIds'] or not isinstance(text, str) or len(text.strip()) < 15 or len(text) > 24000:
                raise ValueError('A reviewed display stem has an invalid source association.')
            entry = mapping(by_id[qid])
            if not entry['tableIds']:
                raise ValueError('A separate-table display stem needs its source data tables.')
            entry['displayQuestion'] = text
            entry['displayQuestionMethod'] = 'visually-reviewed-stem-with-separate-tables'

    # Deterministic cleanup affects only generated image files in this directory.
    used_files = {Path(figure['path']).name for figure in figures.values()}
    for old in target.glob('*.webp'):
        if old.name not in used_files:
            old.unlink()
    byte_count = sum((target / filename).stat().st_size for filename in used_files)
    standalone = [f for f in figures.values() if f['reveal'] == 'question' and not f.get('tableOriginal')]
    source_dependent = [q for q in bank if q.get('needsSource')]
    with_input = {qid for f in standalone for qid in f['questionIds']}
    with_tables = {qid for table in tables.values() for qid in table['questionIds']}
    coverage = {
        'activeQuestions': len(bank), 'sourceDependentQuestions': sum(bool(q.get('needsSource')) for q in bank),
        'questionsWithInlineFigures': len(with_input),
        'questionsWithInlineTables': len(with_tables), 'tableRecords': len(tables),
        'questionsWithQuestionVisuals': len(with_input | with_tables),
        'sourceDependentWithoutQuestionVisual': sorted(q['id'] for q in source_dependent if q['id'] not in with_input | with_tables),
        'pagesVisuallyReviewed': sum(value['pagesReviewed'] for value in page_review.values()),
        'questionsWithOriginalLayouts': 0,
        'questionsWithRationaleFigures': len({qid for f in figures.values() if f['reveal'] == 'answer' for qid in f['questionIds']}),
        'sourceDependentWithoutInlineFigure': sorted(q['id'] for q in source_dependent if q['id'] not in with_input),
        'figureRecords': len(figures), 'uniqueImageFiles': len(used_files), 'imageBytes': byte_count,
        'sourceLimitedFigures': sum(f['quality']['sourceLimited'] for f in figures.values()),
        'losslessFigures': sum(f['quality']['export'] == 'lossless-page-render' for f in figures.values()),
        'reviewedReferenceCorrections': sorted(REFERENCE_REPAIRS),
        'byBook': {book: {
            'questionsWithInlineFigures': len({qid for qid in with_input if by_id[qid].get('bookId') == book}),
            'questionsWithInlineTables': len({qid for qid in with_tables if by_id[qid].get('bookId') == book}),
            'questionsWithRationaleFigures': len({qid for f in figures.values() if f['reveal'] == 'answer' for qid in f['questionIds'] if by_id[qid].get('bookId') == book}),
            'questionFigureRecords': len([f for f in standalone if any(by_id[qid].get('bookId') == book for qid in f['questionIds'])]),
            'rationaleFigureRecords': len([f for f in figures.values() if f['reveal'] == 'answer' and any(by_id[qid].get('bookId') == book for qid in f['questionIds'])]),
        } for book in ['success4', 'boc7']},
    }
    manifest = {'version': 1, 'documents': source_metadata, 'figures': dict(sorted(figures.items())), 'tables': dict(sorted(tables.items())),
                'questions': dict(sorted(question_map.items())), 'coverage': coverage, 'pdfAudit': audit, 'pageReview': page_review}
    (root / 'data/figures.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(coverage, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    build(parser.parse_args().root.resolve())
