# Validation evidence

Current-instance checks performed on 6 November 2026. Runtime: Node 24, Python 3, system Chromium driven by Playwright.

## Automated data and behavior checks

`npm test` passes 17 tests. It exercises the example-bank schema, rejected malformed data, explicit textbook answer indices, unique IDs, page metadata, subject coverage, all 434 page records, all 1,484 numbered question IDs, 5,942 option explanations, separate-source preservation, simple-note references, deterministic review intervals, due/mistake/new/simple queues, Lagos day boundaries and streaks, and progress backup validation. Reserved object-property IDs are rejected.

`npm run test:browser`, against the running local app, checks:

- Twelve subject cards and real dataset counts.
- Practice feedback, saving questions, session pause/resume and recovery after reload.
- Search, topic filters, question and rationale source links.
- Flashcard ratings and schedule persistence.
- A complete 20-question exam with feedback withheld until completion.
- Activity cells and subject progress.
- Full-text page search, PDF page selection, and last-page navigation.
- Rejected malformed imports, successful custom-bank imports, and HTML-like text rendered as text.
- Progress restoration and returning to the textbook bank.
- Explicit caching of the full PDF, offline application reload, and a cached PDF byte-range request returning `%PDF-` with HTTP 206.
- Dark theme persistence and no horizontal overflow in all six views at a 390-pixel viewport.
- No uncaught browser page errors during these journeys.

Desktop, mobile and dark screenshots were inspected/saved under `/tmp/labwise-v2-*.png`. Browser tests use isolated contexts and do not overwrite the user's browser data.

## Iteration

- Conservatively excluded ambiguous or duplicate OCR numbering rather than assigning guessed answers.
- Added source links and explicit labels to separate original rationales from simple explanations.
- Corrected the browser test to open the import panel before selecting a hidden control.
- Deferred loading the 26 MB PDF until the reader is opened.
- Reused a date formatter and counted activity days once to avoid repeated calculations across the 84-cell grid.
- Fixed hero-button contrast after inspecting dark-mode screenshots.
- Added standard PNG install icons and cached-PDF range support.

## Limits of evidence

No full medical/editorial audit, physical mobile-device test, public deployment, or fresh-cloud-instance restoration test has been performed. The Android APK was compiled and verified; device launch was blocked by unavailable hardware virtualization. Automated source pairing checks do not establish that OCR preserved every symbol or that every older textbook recommendation remains current. Offline storage is browser-managed and can be evicted.


## Android package checks

- Official Android platform 35, build tools 35.0.0 and platform tools were downloaded with TLS verification and checked against checksums in Google’s SDK repository metadata.
- Java sources compiled to DEX with Android’s D8 compiler.
- `apksigner verify --verbose --print-certs` passed APK signature schemes v2 and v3. The app is a release-signed package, not an unsigned ZIP or a debug APK.
- `zipalign -c -P 16 4` passed. The package has no native `.so` libraries.
- `aapt dump badging` confirmed `com.labwise.study`, version 3.1.0, minimum API 26 and target API 35. The manifest requests no Internet/shared-storage permissions.
- APK ZIP integrity passed; bundled PDF bytes match the uploaded PDF exactly; all 434 page records and 1,484 question records are present.
- `node tests/android-bridge.cjs` passed native-export call routing, native PDF opening and page jumps, search-to-native-reader routing, Android back navigation, and no service-worker dependency. This browser bridge harness does not execute the Java Activity code on Android.
- The installed Android emulator’s `-accel-check` returned `KVM requires a CPU that supports vmx or svm`. Its documented `-help-accel` says hardware acceleration is required and software emulation is unsupported. No emulator installation/launch or physical-device run is claimed.


## Complete teaching release (3.1.0)

`npm run check:content` passed: 1,484/1,484 questions and 5,942/5,942 options have complete separate teaching. The check fails on missing/duplicate IDs, absent fields, wrong option counts, empty quick checks, or empty-like explanations; the APK build runs it before compiling. Tests verify every section has an uninterrupted numbered inventory.

`node tests/teaching-browser.cjs` passed plain-question display, separate book rationale, all option notes, memory hooks, recall disclosure, five-choice matching, restored case context, glossary rendering and mobile/dark layouts. Existing full browser and Android-bridge suites also passed with the expanded bank.

Independent content agents reviewed 80 deterministic samples across subjects. Fifteen reported conceptual/wording/context findings were addressed; review records are in `docs/content-audits.json`. These are content-review checks, not medical certification. Additional checks look for repetitive filler and letter-only recall answers.

The final APK is signed with the retained certificate from3.0.0, with version code30100. Its package assets are checked against current source and full coverage counts.


## Final package-asset check

`node tests/apk-assets.cjs` passed against files extracted from the actual signed3.1.0 APK. It booted those assets under the Android HTTPS asset origin and matching content-security policy, checked all module/data requests were local and present, and exercised teaching, source rationale, native-PDF routing and backup routing. This checks packaged frontend assets and bridge calls, not execution of Java Activities on an Android device. A full1484-question JSON export/import also passed in Chromium (about2.9MB before duplicated legacy summary fields).
