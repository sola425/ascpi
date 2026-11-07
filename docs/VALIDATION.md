# Labwise 4.0.0 validation

Checks performed on 7 November 2026 using local Node, Python, Chromium/Playwright and the verified Android SDK. Browser contexts are isolated; the server binds only to `127.0.0.1:3000`.

## Content and source integrity

`npm run check:content` passes: **3,760 active questions/teaching notes**, **15,046 option explanations**, no missing teaching. `npm test` passes seven test files covering schema rejection, scheduling, stable queues, session validation, legacy progress, storage failures, source identities/page bounds, exclusions, every active note and source-repair application.

The [independent content review](CONTENT-REVIEW-V4.md) checked 67 full teaching samples across 14 non-micro source/topic groups and directly inspected 63 PDF pages. All 72 recorded repair entries are applied: garbled choices/tables/formulas, heading artifacts, figure flags, stale notes and answer-revealing simplified prompts. Keys and choice order remain unchanged. [Coverage](CONTENT-COVERAGE.md) distinguishes the complete active teaching layer from 193 excluded questions and 93 stems absent from the supplied source.

## Browser workflows and screens

| Command | Result and scope |
| --- | --- |
| `npm run test:browser` | 44 recorded checks: bounded sessions, feedback/source tabs, save/resume/reload, source/search filters, deferred exams, stable cards, separate recall ratings, three readers, restore preview/undo, import preview/IndexedDB, safe text, six destinations at six widths |
| `npm run test:ux` | 271 recorded checks, 90 screenshots, zero recorded issues/errors; touch-emulated 320×568, 390×844, 568×320, 768×1024, 820×1180, 1024×768; dark/larger text, control hit-testing, dialogs, Next/ratings at several scroll positions, keyboard tabs, source files, persistence and CSS media validity |
| `npm run test:teaching-ui` | Five-choice matching retains shared context, all ordered option explanations, simplified question, separate rationale, memory/recall and mobile large-text/dark layout |
| `npm run test:offline` | Actual service-worker offline reload, all active data, three cached PDFs with HTTP 206 byte ranges, invalid-range HTTP 416, offline practice and persistent export prompts after storage quota failures |

Reports: [browser](validation-v4-browser.json), [UX](validation-v4-ux.json). Examples: [phone teaching](screenshots/v4-phone-teaching.png), [tablet library](screenshots/v4-tablet-library.png). The audit reproduces all screenshots under `/tmp/labwise-ux-audit-v4/`.

Testing exposed invalid combined media queries. Fixing their whitespace removed tablet overflow and increased the measured 568×320 reading window from 105 to 144 pixels. Cover labels were adjusted to remain inside their decorative covers.

## Android package and bridge

The build passes Java compilation/D8, ZIP integrity, `zipalign -c -P 16 4`, and `apksigner verify` schemes v2/v3. `aapt` confirms `com.labwise.study`, version 4.0.0/code 40000, minimum API 26, target API 35, and no Internet/shared-storage permissions. The certificate matches 3.1.0: `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`.

All three PDF byte streams, 1,100 page records and active question/teaching counts are verified. Versioned/latest APK files are identical; checksums are in `releases/`.

`npm run test:apk-assets` boots files extracted from the actual signed APK under the Android origin/CSP. All modules/data/PDFs are local and present; teaching, cross-half source/rationale links, v2 export and explicit updates work without external requests or page errors.

`npm run test:android-bridge` simulates legacy v1 progress retention, v2 backups, source boundaries, cross-half links, reading positions, updates, back handling and no service worker. Native successful renders now record the actual page reached; the interface consumes each new reader-position event once, preserving it in progress backups without reapplying stale events after restore.

## Evidence limits

Bridge and packaged-asset tests do **not** execute Java Activities on Android. This host lacks usable KVM virtualization and its emulator requires acceleration. Physical installation, native gestures, document pickers, real-device performance and an actual in-place upgrade remain unverified. Matching package/certificate and a higher code establish update packaging, not device execution.

OCR, structural checks and sampled review do not certify every medical statement. Images remain in the original PDFs. Browser storage may be evicted and does not synchronize across devices. No perfect-app or full medical-certification claim is made.
