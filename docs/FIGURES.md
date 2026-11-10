# Original pictures beside the existing questions

Reviewed on 10 November 2026. The app keeps its normal question, options and rationale text. Inline images contain **actual source photographs, diagrams and charts**, with necessary labels. Question-text screenshots and repeated question-layout images are not included in the manifest, assets or renderer.

## Verified picture coverage

| Collection | Questions with a before-answer picture | Before-answer picture records | Questions with a rationale picture | Rationale picture records |
| --- | ---: | ---: | ---: | ---: |
| Success, 4th edition | 57 | 57 | 0 | 0 |
| BOC, 7th edition, both parts | 73 | 62 | 35 | 36 |
| **Total** | **130** | **119** | **35** | **36** |

There are **155 lossless WebP files, 3,842,734 bytes in total**. A picture can serve multiple questions, and a question can use multiple pictures. Counts therefore describe different things and should not be added as if they were separate questions. BOC before-answer pictures include 32 records from Part 1 and 30 from Part 2.

The active bank has 3,760 questions. Its 475 `needsSource` flags are broad text-extraction hints; they do not establish that 475 distinct pictures exist. Some items refer to text data or tables. Only verified pictures appear inline. Other source-dependent items retain the original PDF link; no replacement image or question screenshot is invented.

## Source mapping and review

All 1,100 original PDF pages were inspected for embedded-image and drawing metadata. Success is a full-page scan, so referenced color plates use reviewed picture-only rectangles. BOC pictures also derive from full-page raster scans. Many additional BOC image objects are 1×1-pixel masks that mark photograph or diagram boundaries; these objects contain no higher-resolution photographic detail. Full-page backgrounds and decorative sidebars are excluded from inline assets.

Question numbering defines the area in which a marked source-picture boundary can be associated with a question. The numbered question itself is never rendered as an image. Where a picture boundary omits chart axes or labels, reviewed chart rectangles preserve the complete chart and stop before the stem and option rows.

Shared BOC diagrams printed among rationales use reviewed picture-only crops. They are attached to the explicitly named questions. They are not attached to an unrelated answer paragraph merely because that paragraph precedes the picture. Rationale pictures are matched to the following printed answer number, because BOC places each picture before its explanation. Touching image fragments are joined into the complete picture. Rationale-only graphics appear after reveal and stay hidden in unanswered exam questions.

Pictures preserve their printed colors on a white paper background in both themes. Captions identify the original document/page; an enlarge control supports inspecting the scan. Alternative text remains neutral and does not identify the correct cell, organism or answer.

## Picture clarity and its limits

The native-image audit found that **all 155 current picture crops are source limited**. Their real raster density is about 72 pixels per inch, measured from embedded pixel dimensions divided by their placement on the PDF page. The image objects' nominal `xres`/`yres` values are not used as evidence of available detail. Typical BOC pages contain only about 612×792 genuine raster pixels; Success color-plate pages contain about 552×702. No independent higher-resolution original photograph was found underneath these crops.

The v7 exporter rendered these scans at 2.3× and added lossy WebP compression. The current exporter composites the original PDF layers and chart strokes at their actual raster density, then saves lossless WebP. Compositing matters: Success has two overlapping page layers, and some BOC diagrams include separate strokes or labels. Extracting only one image xref can omit that information. The reviewed crop bounds, original colors, picture/question associations and answer-reveal timing are unchanged.

| Export measure | v7 | Current |
| --- | ---: | ---: |
| Picture files | 155 | 155 |
| Median bitmap dimensions | 468×351 | 204×153 |
| Lossless files | 0 | 155 |
| Total image bytes | 2,445,088 | 3,842,734 |

The smaller pixel dimensions remove interpolated pixels; they do not discard hidden fine detail. For example, the BOC Part 1 page 285 photograph associated with `boc-4-8` contains only about 208×151 original picture pixels. Its v7 asset was 480×348, which enlarged the same source information. A larger rendering cannot recover structures missing from the source scan, and lossless encoding cannot undo compression already present in the PDF.

Inline pictures use their native bitmap width and fit down when space is limited. The app's zoom dialog also starts without enlargement; users may explicitly enlarge those same source pixels. Source-limited pictures carry a compact clarity note. No image enhancement, sharpening, recoloring or generated replacement is used.

Finer detail needs a clearer corresponding original image or a separately reviewed, licensed question/image pair. A similar-looking image cannot safely substitute for the specific image on which a book question and answer depend. Tests of layout and lossless export do not establish that the original scan is sufficient to answer every image question.

The manifest records original-PDF SHA-256 hashes and uses content-addressed image filenames. A source/question consistency key prevents a custom bank that reuses a bundled ID from inheriting the bundled item’s picture. It is not a cryptographic or exam-security guarantee.

## Printed plate-reference corrections

The question bank remains unchanged. These figure links were checked against the printed question:

| Question ID | Printed reference |
| --- | --- |
| `book-1-44` | Color Plate 2 |
| `book-1-78` | Color Plate 7 |
| `book-351-43` | Color Plate 51 |

Every verified referenced plate is retained when a question cites more than one. For example, `book-289-1` displays both plates 30 and 31. The two band panels of plate 57 retain their lane labels as separate pictures.

## Renderer API

- `configureFigures(manifest)` validates the manifest and local asset paths.
- `renderFigures(q, {revealed = false, exam = false})` renders verified pictures or a compact PDF fallback. It never renders a question-layout screenshot.
- `hasQuestionFigure(q)` is true only when this exact source/question key has a verified `reveal: "question"` picture. An answer-only picture or a `needsSource` flag alone does not qualify.
- `getFigure(id)` supplies the validated local path, encoded dimensions, caption, alternative text and source location for the app's zoom dialog. Its optional frozen `quality` record contains `version`, `sourceWidth`, `sourceHeight` (native crop pixel spans), `sourceDpi`, `exportDpi`, `sourceRasterWidth`, `sourceRasterHeight` (underlying original raster dimensions), `sourceLimited`, `reason`, `export` and `addedUpscaling`. All current assets use `export: "lossless-page-render"`, `addedUpscaling: false` and `reason: "low-resolution-pdf"`. Encoded dimensions can exceed the rounded native pixel spans by one or two boundary pixels.
- `figureManifestSummary()` returns a copy of the coverage metadata.

## Rebuild and check

With the existing PyMuPDF and Pillow environment:

```sh
python3 scripts/prepare_figures.py
node tests/figures.test.js
node tests/figures-browser.cjs
```

The generator reuses unchanged source pictures and removes unused generated WebP files only from `assets/figures/`. It does not change the question bank, teaching, PDFs or shared-quiz digest. Rebuild after source PDF or question/source metadata changes. Package `figures.js`, `figures.css`, `data/figures.json` and the current image directory together; regenerate the web cache list from the final manifest.

Eleven automated checks cover active-only mappings, source-key parity, actual asset integrity, measured source quality, lossless native-density RGB pixel equality, picture-only crop boundaries, retained chart labels, no question/option rows in pictures, rationale reveal gating, plate corrections, multiple references, custom-bank isolation and safe paths/captions. The browser suite checks picture display at phone/tablet sizes, both themes and larger text, plus the full Practice, exam, Cards, source-link and zoom workflows. It asserts that images are not enlarged by default, unverified visuals use a PDF fallback and no question-layout screenshot is shown.

These checks establish the source/rendering behaviors above. They do not claim that every possible book illustration has been mapped or establish physical-device legibility. Original PDF links remain available for source inspection.
