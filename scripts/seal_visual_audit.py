"""Record reviewed audit/source hashes and current question fingerprints.

This does not review content, change questions, apply SQL or publish an APK.
Run after reviewing the page ledgers and their question-input additions.
"""
import hashlib
import json
from pathlib import Path

try:
    from .prepare_figures import DOCUMENTS, question_key
except ImportError:
    from prepare_figures import DOCUMENTS, question_key

ROOT = Path(__file__).resolve().parents[1]


def seal():
    folder = ROOT / 'data/visual-audit'
    bank = {q['id']: q for q in json.loads((ROOT / 'data/study-bank.json').read_text())}
    documents, keys = {}, {}
    for doc_id, (path, _) in DOCUMENTS.items():
        ledger_file = folder / f'{doc_id}-pages.json'
        additions_file = folder / f'{doc_id}-additions.json'
        ledger = json.loads(ledger_file.read_text())
        ledger = ledger['pages'] if isinstance(ledger, dict) else ledger
        expected = {'textbook': 434, 'boc1': 333, 'boc2': 333}[doc_id]
        if len(ledger) != expected or sorted(row['page'] for row in ledger) != list(range(1, expected + 1)):
            raise ValueError('Each supplied PDF page must have one audit record.')
        additions = json.loads(additions_file.read_text())
        additions = additions.get('additions', additions.get('visuals', [])) if isinstance(additions, dict) else additions
        for entry in additions:
            if entry.get('reviewStatus', entry.get('status')) in ('unresolved', 'excluded', 'out-of-scope') or entry.get('verified') is False:
                continue
            if entry.get('reveal', 'question') != 'question':
                raise ValueError('This audit adds question-input visuals only.')
            for qid in entry['questionIds']:
                if qid not in bank:
                    raise ValueError('An audit entry refers to an absent or excluded question.')
                keys[qid] = question_key(bank[qid])
        digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
        documents[doc_id] = {'pagesReviewed': len(ledger), 'sourceSha256': digest(ROOT / path),
                             'ledgerSha256': digest(ledger_file), 'additionsSha256': digest(additions_file)}
    data = {'version': 1, 'reviewedOn': '2026-11-11', 'scope': 'Visual inputs belonging to active questions',
            'pagesReviewed': sum(doc['pagesReviewed'] for doc in documents.values()),
            'documents': documents, 'questionKeys': dict(sorted(keys.items()))}
    (folder / 'manifest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('Audit sealed:', data['pagesReviewed'], 'pages;', len(keys), 'question mappings. Publication unchanged.')


if __name__ == '__main__':
    seal()
