# Labwise

A responsive, offline-capable clinical laboratory science study app with a signed Android APK built around the user's uploaded **Final success in mls .pdf**. Plain JavaScript, CSS, and static JSON; no runtime package installation, accounts, credentials, analytics, or remote AI calls.

## Download to your Android phone

[**Download Labwise 3.1.0 APK**](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-3.1.0.apk) · [APK file and download button](https://github.com/sola425/ascpi/blob/main/releases/Labwise-3.1.0.apk)

Open this link on an Android phone, open the downloaded APK from Downloads, and choose Install. If Android asks, allow the browser or file manager to install this downloaded app. Requires Android8.0+ and an up-to-date Android System WebView; APKs do not install on iPhone.

The signed APK is included directly in the repository. Version3.1.0 contains all1,484 questions and5,942 separate option explanations, with original book rationales, the complete434-page PDF and an offline reader. See [content coverage](docs/CONTENT-COVERAGE.md), [release notes](releases/RELEASE-NOTES.md), and the [SHA-256 checksum](releases/Labwise-3.1.0.apk.sha256). Android device launch remains unverified; local browser, packaged-asset, signature and content checks passed.

## Run locally

From `/workspace/ascpi`:

```sh
npm start
```

This uses Python 3 to serve the app **on loopback port 3000 only**. Open the app in a browser on the same machine. `npm test` runs 17 Node tests, including checks of every teaching note and every option. `npm run check:content` requires complete release coverage. `npm run test:browser` runs the browser suite if Playwright and Chromium are available; set `CHROMIUM_PATH` for another Chromium installation and `APP_URL` for another local port. The current managed environment supplies both tools. No bundler/build step is required.

## What is included

- The complete **434-page uploaded PDF**, including its color plates, at `docs/textbook.pdf`.
- Searchable extracted text for all pages, with subject filters and page navigation.
- **1,484 numbered questions** across all 12 question sections in the uploaded PDF, including restored matching exercises and tables.
- **1,484 separately authored teaching notes** and **5,942 individual option explanations**. Every item has a plain-language question, answer reasoning, a memory hook and a recall check. A 159-entry glossary explains common technical words.
- Ten-question mixed sessions, filtered/full-selection practice, 20-question exam mode with feedback at completion, saved questions, latest-mistake practice, and session pause/resume.
- Flashcards with Again / Hard / Good / Easy review scheduling; due-date practice.
- Daily goals, a 12-week activity grid, subject progress, and latest-answer accuracy.
- Progress backup/restore, question-bank import/export, light/dark themes, mobile layout, and install metadata.

## Content coverage and limitations

The PDF is included in full. Every one of its 1,484 numbered questions now has a complete, separate teaching note. Each option is explained in order, including the fifth choice in six restored matching exercises. `npm run check:content` checks every ID and every option and blocks an APK build if teaching is missing. The book rationale remains separate from the teaching; it is not relabelled as a simple explanation.

A new OCR pass, grouped-key recovery and manual table transcription restored 204 questions omitted by the original conservative extraction. `data/source-repairs.json` records source repairs. Known older guidance, disputed keys, ambiguous choices and image dependencies are noted in the teaching. Original printed page numbers differ from PDF page numbers.

Source text has not received a full medical/editorial audit. Tables, shared cases, and color-plate questions link back to the PDF; images are not reconstructed from OCR. Older book guidance can differ from current practice. Simple explanations explicitly note selected historical issues (such as donor deferrals and the smallpox eradication year). Treat the book answer and the teaching note as separate layers. Use current course references for clinical decisions.

**Android APK:** `releases/Labwise-3.1.0.apk` is a signed, offline Android package for Android 8.0 and newer with an up-to-date Android System WebView. It contains the complete textbook, a native PDF reader with zoom/page navigation, and Android document pickers for progress exports and imports. It requests no Internet or shared-storage permissions. The web version also remains available; browser install behavior varies and service workers require HTTPS away from localhost.

## Offline and storage

The app shell, question data, and page text are cached after first use. In My textbook, choose **Keep PDF offline** to cache the original PDF separately (about 26 MB). The service worker supports PDF byte-range requests from that cached copy. Browser storage may be cleared/evicted and does not synchronize across devices. Export progress backups and keep the original PDF. A cache version change is needed when deployed assets change.

Progress backups contain review dates, question IDs, saved questions, goals, and history. Restoring replaces current progress. Question-bank imports replace the active bank while retaining progress for matching IDs; use stable, distinct IDs for distinct questions. Backups do not contain the PDF or custom question-bank contents: export the bank separately.

## Question-bank format

A JSON array, or `{ "questions": [...] }`, containing:

- `id`: unique nonempty string, excluding reserved object property names.
- `topic`, `question`, `source`, `explanation`: nonempty strings.
- `options`: two to six nonempty text choices.
- `answer`: zero-based correct option index.
- Optional `simple`, `memory`, `whyOthers`: legacy teaching text.
- Optional `teaching`: the complete schema in `teaching.js`: `questionInPlainEnglish`, `explanation`, ordered `optionExplanations`, `memory`, `quickCheck: {question, answer}`, and optional `sourceNote`.
- Optional `context`: shared case data or matching-exercise instructions.
- Optional `page`, `answerPage`, `number`: source metadata; source page links target the bundled PDF.
- Optional `explanationKind`: `book` for source rationales, `example` for original examples.

Inputs are validated before changing the selected bank. Text is escaped when rendered. Imports are local and not sent to a server.

## Reproducing extraction

The generated data is already checked in as project files; ordinary development does not need PDF tools. To regenerate, use Python with PyMuPDF installed:

```sh
python3 scripts/extract_book.py '/path/to/Final success in mls .pdf' --output-dir /tmp/labwise-extraction
```

The initial extractor writes **candidate output to a separate directory**. It does not reproduce the later reviewed full inventory by itself. Do not replace the release bank with raw parser output: the complete snapshot, shared-choice repairs, source context and teaching notes are already included. Compare fresh extraction against the release data before applying changes. PyMuPDF was available here; it is not a frontend dependency.

Teaching source files live in `data/teaching/`. `scripts/assemble_teaching.py` checks and assembles them into `data/teaching.json` and writes the coverage report. `data/simple-explanations.json` is the archived initial 54-note prototype and is not used by the current app.

## Design and study approach

See [the plan and implementation notes](docs/PLAN.md), [public-project inspiration](docs/INSPIRATION.md), and [validation evidence](docs/VALIDATION.md). This task used the cloud runtime skill for environment/network checks. No other relevant frontend or PDF skill was available in the skill catalog; the local PDF and browser tools provided the needed capabilities.

The review scheduler is a small, deterministic interval system, **not FSRS**. Again: 10 minutes; Hard: 1 day; Good/Easy: progress through intervals of 1, 3, 7 and 14 days. It is not optimized for individual memory or an exam-score predictor.

Each managed cloud task is isolated. Use the existing `/workspace/ascpi` checkout; do not create a worktree unless explicitly requested. Live servers must be restarted in new tasks. Do not expose the uploaded book on a public host without the user's authorization.


## Android release

See [Android build and installation](docs/ANDROID.md) and [release notes](releases/RELEASE-NOTES.md). `python3 scripts/build_apk.py` rebuilds the APK using the verified tools in `/workspace/android-tools`. Signing uses a generated, retained local release key in `/workspace/.labwise-signing`, outside this repository. The same signing key is needed for in-place updates; do not regenerate it for an update. Keys/passwords are excluded from the project download.

The Android emulator could not run here: the official acceleration check reports no usable virtualization support, and the installed emulator requires hardware acceleration. The APK was compiled, signed, and verified, and the shared interface plus native bridge calls were tested locally. Physical-device installation/launch is still unverified.


## Content review

Parallel content writers were explicitly authorized by the user. Notes were authored question by question. Independent agents then reviewed 80 deterministic samples, with conceptual, wording and shared-context findings corrected before release. See `docs/content-audits.json`. This is educational writing and source review, not a full clinician certification of every textbook statement. The runtime coverage tests check structural completeness, not whether every medical statement is current.
