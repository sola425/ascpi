# Labwise 5.0.0 validation

Checks below were run on 7 November 2026 from `/workspace/ascpi`. Browser workflows use the server at `http://127.0.0.1:3000`, isolated Chromium contexts, and the existing Playwright installation. Chromium initially failed inside the restricted sandbox (`setsockopt: Operation not permitted`); the same commands ran successfully with the approved sandbox exception.

## Legacy workflows and responsive layout

| Command actually run | Result and scope |
| --- | --- |
| `npm run test:browser` | Pass: 52 recorded checks and eight screenshots. Bounded practice, all teaching tabs, pause/reload, saved questions, source filters/search, exam results deferred until completion, stable flashcard queues and separate recall ratings, three readers and per-document positions, v1/v2/v3 restore preview/cancel/confirm/undo, safe custom-bank imports and IndexedDB persistence, and bundled-bank recovery. Seven destinations, including Play, are checked at six widths in dark mode with the largest reading size. |
| `npm run test:ux` | Pass: 283 recorded checks, 90 screenshots, zero recorded issues and zero page errors. Touch-emulated viewports: 320×568, 390×844, 568×320, 768×1024, 820×1180 and 1024×768. Includes Play header hit-testing, five phone navigation items/seven desktop items, overflow, dialogs, Next and recall-rating controls at several scroll positions, keyboard teaching tabs, source-file availability, persisted settings/sessions and reader positions. |
| `npm run test:android-bridge` | Pass in a browser simulation. A v1 install exports v3 progress without losing records, saved IDs or history; all three backup versions restore and export correctly, including the v3 game-history kind and game state. Three native PDF IDs are routed at both page boundaries and across source/rationale documents. Newly consumed native reader events persist in backups and cannot overwrite positions restored later. Updates require a click; Android back handling, zero external requests and zero service-worker registrations pass. |

Browser evidence: `/tmp/labwise-browser-v5/report.json` and `/tmp/labwise-ux-audit-v5/report.json`, with screenshots in the same directories. The 320×568 practice footer and 820×1180 Library screenshots were also visually inspected.

The checks enforce release 5.0.0 and unchanged source coverage: 3,760 active questions with complete teaching notes, 15,046 choices with ordered explanations, 193 excluded questions, 93 missing source questions, and the `textbook`, `boc1` and `boc2` documents. Restoring historical backups supplies an empty game state; ordinary practice and flashcards do not create game XP.

## Adventure, voice and accompanying checks

The following checks also completed during this session. Their results were reported by the agents running them; the two new browser reports were checked directly for the final counts and zero errors.

| Check | Result and scope |
| --- | --- |
| `npm test` | Pass: all ten unit-test files. Covers game eligibility, bounded/recoverable rounds, XP limits and progress validation; voice choice matching, native/browser mocks, cancellation, stale results and timeouts; learning queues, storage failures, source identities/repairs and teaching coverage. |
| `npm run test:game` | Pass: seven scenarios. Play/source/subject navigation, replacement and interrupted rounds; five first tries plus at most two recoveries; teaching, recall, quests and separate practice accuracy; active v3 backup restore/undo/reload; daily XP caps; editable mocked speech with explicit confirmation, cancellation and stale results; classic practice/exam scoring and manual fallback. |
| `node tests/ux-game-v5.cjs` | Pass: 198 checks, 42 screenshots, zero recorded issues and zero page errors at the same six responsive sizes. Covers dark/largest text, keyboard room entry and transcript confirmation, teaching tabs, reveal-before-self-rating, required Next controls at several scroll positions, minimum 44×44 touch targets, overflow, results and reload. |
| `npm run test:offline` | Pass: actual service-worker offline reload with active questions/teaching, three cached PDFs returning byte-range HTTP 206 responses, invalid ranges returning HTTP 416, offline feedback, and persistent export prompts after simulated storage failures. |
| `npm run test:teaching-ui` | Pass: five-choice matching retains its shared context, simplified question, all ordered option explanations, separate book rationale, memory/recall and mobile dark/largest-text layout. |

New-flow evidence: `/tmp/labwise-game-v5/browser-report.json` and `/tmp/labwise-game-v5/ux-report.json`. The game audit exposed short-landscape focus and small touch targets; the final 198-check rerun passes after their fixes. Native speech in these functional scenarios is simulated: no microphone or system speech provider is used.

## Packaged assets

`npm run test:apk-assets` passes against assets extracted from the final signed release at `/tmp/labwise-final-apk/assets`. SHA-256 checks require the packaged runtime modules, HTML, CSS and web manifest to match the current source. All game/voice modules and `game.css` load under the Android asset origin and CSP. The test opens Play, starts five questions, answers one, reaches game feedback, and exports v3 progress with earned XP, active feedback and a game-history entry. The three local PDFs, 1,100 source-page records, complete teaching coverage, cross-document links, native reader-position callbacks, original teaching tabs and explicit updates also pass, with zero external requests and zero page errors. Native bridge calls are simulated.

The release build passes Java compilation, D8, ZIP validation, alignment and signature verification. Package identity is `com.labwise.study`, version 5.0.0/code 50000, minimum API 26 and target API 35. It adds no Internet, microphone or shared-storage permission. The signing certificate matches the previous release: `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`.

The final APK is 68,823,062 bytes. Running `sha256sum releases/Labwise-5.0.0.apk releases/Labwise-latest.apk` confirms both have SHA-256 `36e8b555c10e2f268c0e541e0a139b5412d5b0c4e01a1d6f08d81547a873813e`.

## Evidence limits

Browser and packaged-asset runs do not execute Android Java, a native PDF Activity, a system speech provider, microphone capture or physical-device gestures. The host has no usable KVM Android emulator. Native installation, real voice accuracy, system permission/document-picker behavior, device performance and an actual in-place upgrade remain unverified. Matching package/certificate and a higher version code establish upgrade packaging, not an executed device upgrade. System speech providers may require a connection even when offline recognition is requested.

Source coverage and structural checks do not certify every medical statement. The existing [content review](CONTENT-REVIEW-V4.md) remains the review evidence for the unchanged book material; this validation did not repeat a full clinical content review.
