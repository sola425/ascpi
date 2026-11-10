# Labwise 7.1.0 validation

Checked on 10 November 2026. This release changes source-picture export/display and completes the requested voice learning loop. The familiar question, options and rationale layout stays in place. It adds no external question bank or substitute clinical photographs.

## Pictures

All **155** exported pictures match the native-density PDF render's RGB pixels exactly and use lossless WebP. The audit confirms unchanged figure identities, crop mappings, question fingerprints and original-PDF hashes. The set still provides before-answer pictures for **73 BOC** and **57 Success** question IDs, plus rationale pictures for **35 BOC** question IDs. These counts overlap and do not represent 165 separate questions.

Source raster density is roughly **72 DPI** for all current crops. Median exported dimensions changed from 468×351 interpolated pixels to 204×153 source-density pixels; lossless picture bytes changed from 2,445,088 to **3,842,734**. This avoids additional degradation but does not recover missing source detail or establish that every source photograph is sufficiently detailed to answer its question. No sharpening, recoloring or generated clinical detail is used.

**11 figure tests** pass, including source-pixel equality across all 155 exports. Browser checks pass **24 component displays** and **37 full-app checks** covering phone/tablet layouts, both themes, larger text, picture/source routing, Practice, exam reveal, flashcards, no automatic enlargement, native size, explicit 2× enlargement and Fit restoration. They report no page errors, external requests, overflow or broken images. Source-only question text remains text; question-page screenshots are excluded. See [FIGURES.md](FIGURES.md).

## Voice learning loop

Every confirmed answer receives an explicit result against the book key, the selected-option explanation, the correct-option explanation when needed, the separately labelled original rationale and simpler teaching, and an invitation to explain back the learning. Skips remain ungraded. Confirmation, explicit Next, interruption handling and transcript privacy remain intact. Free explanations are compared with the supplied model answer and self-rated; they are not semantically graded by an AI service.

**31 dialogue cases**, **13 full-app browser check groups** and **10 layouts** pass. The browser exercises the actual app/controller/engine with mocked device speech and reports no page errors or external requests. It checks correct and wrong answers, teach-back after every answer, no pre-answer teaching disclosure, separate confirmation, lifelines, cancellation, stale callbacks, focus and privacy. Actual Android voice naturalness, microphone recognition and provider availability still need physical-device testing. See [VOICE-HOST.md](VOICE-HOST.md).

## Regression and package checks

- `npm test`: **27 unit test files pass**, including native SDK/JVM checks and the source/voice tests above.
- `node tests/browser.cjs`: **52 main study checks pass**, including source scopes, every-choice/book-rationale tabs, exams, resumes, backups, imports and six viewports.
- `node tests/offline-v4.cjs`: actual service-worker offline reload, offline study/feedback, all three cached PDFs, byte ranges/416 and quota handling pass. The web cache is **v12**; Android bundles its assets directly.
- `python3 scripts/build_apk.py`: SDK35 compilation, retained-key signing, v2/v3 signature verification, alignment, content checks and byte-for-byte packaged-asset comparisons pass.
- `APK_ASSETS=/tmp/labwise-final-apk-v71/assets node tests/apk-assets.cjs`: the signed APK's extracted files boot under the Android origin/CSP. All 155 images use lossless encoding and match source bytes; the test decodes a BOC photograph and checks native fit/2× viewing. It also covers the three PDFs, cross-PDF source links, reading positions, Sprint, Frenzy, Quiz Show confirmation, account/Duel entry, v4 backup and explicit update action, with no external requests or page errors.
- `git diff --check`: passes.

Content remains **3,760 questions**, **15,046 option explanations** and **1,100 original PDF pages**. The bank SHA-256 remains `d0bd982f87d392e8f28575c536b2644519c657fa94b7ed186b6c666fed47cf24`; no backend migration or shared-question seed change is needed. Source exclusions and missing-source accounting are preserved.

## Signed artifact and limits

Package `com.labwise.study`, version **7.1.0**, version code **70100**, Android8+/API26 minimum, target API35. APK: **72,833,487 bytes**, SHA-256 `8a4ad4006d8ce30f356b2ef16da90af34445d4d25476a30b429df0f9739a10d8`. The stable and versioned APKs have identical bytes. Signer certificate SHA-256 remains `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`.

These checks do not execute a physical Android device's microphone, TTS service, installation/upgrade or Keystore. Live Supabase and two-phone sync remain outside the executed checks; account configuration remains the existing confirmed-account pilot. See [version 7 validation](VALIDATION-V7.md) for the earlier compatibility repair and live-access boundary. Candidate external image sources have not been imported or licensed; the sourcing/review workflow is in [IMAGE-CONTENT-PLAN.md](IMAGE-CONTENT-PLAN.md).
