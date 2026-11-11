# Original visuals beside their PDF questions

**Labwise 7.3.0** incorporates the 11 November 2026 page-by-page audit, originally prepared in a local 7.2.0 draft. See [audit evidence](VISUAL-AUDIT.md) and [7.3.0 validation](VALIDATION-V7.3.md).

The app keeps the existing question, choices and rationale layout. Original question photographs, diagrams, charts and data tables appear while answering the questions they accompany. Their links are checked against the question text, choices and source location.

## Verified coverage

| Collection | Questions with pictures/charts/diagrams | Questions with readable tables | Questions with either |
| --- | ---: | ---: | ---: |
| Success, 4th edition | 71 | 62 | 131 |
| BOC, 7th edition, both supplied parts | 92 | 169 | 255 |
| **Total** | **163** | **231** | **386** |

There are **215 distinct readable tables** and **142 question-picture records**. Shared visuals may serve several questions; a question may use multiple tables or pictures. These counts should not be added as if each represented a different question.

The image directory contains **379 lossless WebP files, 6,645,446 bytes**: 142 question pictures, 201 original-table comparison crops and 36 pre-existing rationale figures. The latter still serve 35 questions and keep their existing reveal behavior. This audit added question inputs.

## Readable tables

Tables use selectable text, semantic row/column headers and preserved source values, units, blanks, signs and notes. Large red-cell panels keep their printed column groups. Wide tables scroll within the question card, with fixed row labels and column headings; single-column tables do not hide their values behind a fixed column. **Read table larger** opens the expanded table. **Compare original table** opens the exact source crop or the corresponding PDF page. Fourteen tables use a PDF comparison because a clean separate crop would include question or option text.

When the extracted question contains an exact copy of its table text, a display overlay removes that repeated block and shows the readable table separately. Seventy-five overlays use exact complete-token elision; one additional source-reviewed overlay separates the two tables in `book-1-65`. Canonical exported questions remain available. Question/source fingerprints guard both overlays and visuals against custom-bank ID collisions.

## Source mapping and clarity

Every one of the **1,100 supplied pages** has a review record. Candidate tables and new figure crops received closer inspection against their original pages. Audited mappings record the PDF, local page, crop coordinates, question IDs and review notes. The sealed manifest records hashes of the reviewed PDFs, ledgers and additions, plus question fingerprints. See [the audit manifest](../data/visual-audit/manifest.json).

Pictures preserve source colors and useful labels. Where an existing mask selected an incomplete fragment, the reviewed full chart or diagram replaces that fragment. Shared color plates and cross-page diagrams attach to their explicitly referenced questions. Question text and ordinary option rows remain text.

All current picture and table-comparison crops are **source limited**, with about 72 genuine raster pixels per inch. Larger display size cannot recover detail missing from the PDFs. The exporter composites the PDF layers at their measured raster density, uses lossless encoding and does not sharpen, recolor or invent features. Inline pictures fit without automatic stretching; zoom supports explicit enlargement. Readable table transcription improves text legibility independently of the original scan's resolution. Original PDF links remain available.

The active bank's 556 `needsSource` flags are broad extraction hints. They can refer to a case, formula or inline data and do not prove that a separate image exists. The remaining flagged items were checked against the supplied source pages; they are not counted as missing photographs. Supplied Part 1 still omits printed pages 225–240. Excluded questions remain excluded.

## Renderer API

- `configureFigures(manifest)` validates local paths, source locations, picture quality, table cells/groups and question mappings atomically.
- `renderFigures(q, {revealed = false, exam = false})` renders verified question pictures and tables. Existing rationale figures retain their reveal rules.
- `hasQuestionFigure(q)` checks whether this exact question has a verified question picture **or table**. A flag alone does not qualify.
- `questionText(q)` returns its verified table-separated display stem, or the canonical stem when no matching overlay exists.
- `getFigure(id)` returns validated picture metadata for zoom. Its frozen `quality` record includes measured source/export density, source dimensions, `sourceLimited`, `export: "lossless-page-render"` and `addedUpscaling: false`.
- `getTable(id)` returns validated table metadata; `renderTable(id, {expanded = false})` renders its cells and source-comparison controls.
- `figureManifestSummary()` returns a copy of the coverage metadata.

Study, exam and flashcard screens use the shared renderer. The Practice voice tutor keeps these original question visuals in view and pauses when opening a visual or source. Games receive the same visual HTML where a question is eligible. Audio-only Quiz Show queues exclude verified visual questions; selecting picture questions keeps the screen part of that activity.

## Rebuild and check

After reviewing source changes, regenerate the content and registry as described in the README. If reviewed audit records changed, refresh their seal before generating visuals:

```sh
python3 scripts/seal_visual_audit.py
python3 scripts/prepare_figures.py
npm test
node tests/tables-browser.cjs
node tests/figures-browser.cjs
python3 scripts/build_apk.py --draft
```

Sealing records the review inputs; it does not perform the review. The figure generator refuses changed reviewed files or stale question fingerprints. It cleans only unused generated files in `assets/figures/`. Package the renderer, styles, manifest and generated assets together. `--draft` creates a separately named APK and leaves the stable download untouched.

Automated checks cover source hashes, all reviewed table cells/groups and mappings, exact source-pixel equality, image integrity, crop boundaries, source references, safe rendering, custom-bank isolation, phone/tablet layouts, enlargement, original comparison and extracted APK behavior. They do not establish physical-device legibility or recover missing image detail.
