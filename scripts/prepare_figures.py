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
    figures, question_map, source_metadata = {}, {}, {}
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
        return question_map.setdefault(q['id'], {'key': question_key(q), 'figureIds': [], 'notes': []})

    def add(document_id, page_number, rectangle, qids, reveal='question', label=None, method='embedded-source-graphic'):
        qids = sorted(set(qid for qid in qids if qid in by_id))
        if not qids:
            return
        rect = fitz.Rect(rectangle) & documents[document_id][page_number - 1].rect
        if rect.width < 10 or rect.height < 10:
            return
        geometry = [round(v, 2) for v in rect]
        identity = json.dumps([document_id, page_number, geometry, 'figure', reveal], separators=(',', ':'))
        fid = 'fig-' + hashlib.sha256(identity.encode()).hexdigest()[:18]
        if fid not in figures:
            cached = previous.get('figures', {}).get(fid)
            source_unchanged = previous.get('documents', {}).get(document_id, {}).get('sha256') == source_metadata[document_id]['sha256']
            if cached and source_unchanged and re.fullmatch(r'assets/figures/[0-9a-f]{24}\.webp', cached.get('path', '')) and (root / cached['path']).is_file():
                filename = Path(cached['path']).name
                width, height, size = cached['width'], cached['height'], cached['bytes']
            else:
                scale = min(2.3, 1150 / max(rect.width, 1))
                pix = documents[document_id][page_number - 1].get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
                im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
                data = io.BytesIO()
                im.save(data, 'WEBP', quality=87, method=6)
                content = data.getvalue()
                filename = hashlib.sha256(content).hexdigest()[:24] + '.webp'
                (target / filename).write_bytes(content)
                width, height, size = im.width, im.height, len(content)
            used_files.add(filename)
            caption = label or 'Original source figure'
            figures[fid] = {'id': fid, 'kind': 'figure', 'reveal': reveal, 'documentId': document_id,
                            'page': page_number, 'rect': geometry, 'path': 'assets/figures/' + filename,
                            'width': width, 'height': height, 'bytes': size,
                            'caption': caption, 'alt': f'{caption} from {DOCUMENTS[document_id][1]}, PDF page {page_number}.',
                            'method': method, 'questionIds': []}
        else:
            used_files.add(Path(figures[fid]['path']).name)
        figure = figures[fid]
        figure['questionIds'] = sorted(set(figure['questionIds'] + qids))
        for qid in qids:
            entry = mapping(by_id[qid])
            if fid not in entry['figureIds']:
                entry['figureIds'].append(fid)

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

    # Deterministic cleanup affects only generated image files in this directory.
    for old in target.glob('*.webp'):
        if old.name not in used_files:
            old.unlink()
    byte_count = sum((target / filename).stat().st_size for filename in used_files)
    standalone = [f for f in figures.values() if f['reveal'] == 'question']
    source_dependent = [q for q in bank if q.get('needsSource')]
    with_input = {qid for f in standalone for qid in f['questionIds']}
    coverage = {
        'activeQuestions': len(bank), 'sourceDependentQuestions': sum(bool(q.get('needsSource')) for q in bank),
        'questionsWithInlineFigures': len(with_input),
        'questionsWithOriginalLayouts': 0,
        'questionsWithRationaleFigures': len({qid for f in figures.values() if f['reveal'] == 'answer' for qid in f['questionIds']}),
        'sourceDependentWithoutInlineFigure': sorted(q['id'] for q in source_dependent if q['id'] not in with_input),
        'figureRecords': len(figures), 'uniqueImageFiles': len(used_files), 'imageBytes': byte_count,
        'reviewedReferenceCorrections': sorted(REFERENCE_REPAIRS),
        'byBook': {book: {
            'questionsWithInlineFigures': len({qid for qid in with_input if by_id[qid].get('bookId') == book}),
            'questionsWithRationaleFigures': len({qid for f in figures.values() if f['reveal'] == 'answer' for qid in f['questionIds'] if by_id[qid].get('bookId') == book}),
            'questionFigureRecords': len([f for f in standalone if any(by_id[qid].get('bookId') == book for qid in f['questionIds'])]),
            'rationaleFigureRecords': len([f for f in figures.values() if f['reveal'] == 'answer' and any(by_id[qid].get('bookId') == book for qid in f['questionIds'])]),
        } for book in ['success4', 'boc7']},
    }
    manifest = {'version': 1, 'documents': source_metadata, 'figures': dict(sorted(figures.items())),
                'questions': dict(sorted(question_map.items())), 'coverage': coverage, 'pdfAudit': audit}
    (root / 'data/figures.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(coverage, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT)
    build(parser.parse_args().root.resolve())
