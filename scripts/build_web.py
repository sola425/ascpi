"""Package the same reviewed runtime files as the APK for static HTTPS hosting."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from build_apk import ROOT, WEB_ASSETS, DATA_ASSETS, check_figures, check_quiz_registry

OUTPUT = ROOT / '.web-build' / 'ascpi'
WEB_ONLY = ['sw.js', 'web-test.html', 'web-test.js', 'web-test.css']


def build(output):
    output = output.resolve()
    if output != OUTPUT.resolve():
        raise SystemExit('Build output must be the dedicated .web-build/ascpi directory.')
    catalog = json.loads((ROOT / 'data/catalog.json').read_text())
    version = json.loads((ROOT / 'package.json').read_text())['version']
    if catalog['version'] != version:
        raise SystemExit('Run npm run check:content to refresh the catalog version.')
    bank = json.loads((ROOT / 'data/study-bank.json').read_text())
    teaching = json.loads((ROOT / 'data/teaching.json').read_text())
    coverage = json.loads((ROOT / 'data/teaching-coverage.json').read_text())
    if (not coverage['complete'] or coverage['completeTeachingNotes'] != len(bank)
            or set(teaching) != {q['id'] for q in bank}
            or coverage['optionExplanations'] != sum(len(q['options']) for q in bank)):
        raise SystemExit('Reviewed teaching coverage must be complete before deployment.')
    check_quiz_registry(ROOT / 'data/study-bank.json', ROOT / 'data/quiz-meta.json')
    pictures = check_figures(ROOT, ROOT / 'data/figures.json', catalog)
    files = sorted(set(WEB_ASSETS + WEB_ONLY + ['data/' + name for name in DATA_ASSETS]
                       + [doc['path'] for doc in catalog['documents']] + pictures))
    worker = (ROOT / 'sw.js').read_text()
    match = re.search(r'const ASSETS=(\[[^;]+\]);', worker)
    if not match:
        raise SystemExit('The service-worker asset list could not be checked.')
    for asset in json.loads(match[1]):
        if asset != './' and asset.removeprefix('./') not in files:
            raise SystemExit('Service worker references an unpackaged file: ' + asset)
    shutil.rmtree(output, ignore_errors=True)
    output.mkdir(parents=True)
    for name in files:
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
        if target.read_bytes() != (ROOT / name).read_bytes():
            raise SystemExit('Packaged file differs from source: ' + name)
    (output / '.nojekyll').write_text('')
    metadata = {'version': version, 'questions': len(bank), 'optionExplanations': coverage['optionExplanations'],
                'pictureFiles': len(pictures), 'pdfFiles': len(catalog['documents']),
                'contentDigest': hashlib.sha256((ROOT / 'data/study-bank.json').read_bytes()).hexdigest(),
                'files': len(files), 'bytes': sum((output / name).stat().st_size for name in files)}
    (output / 'web-build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))
    print('WEB_READY ' + str(output))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    build(parser.parse_args().output)
