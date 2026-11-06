# Labwise implementation plan

## Product goal

Help an MLS learner recall answers, understand the reasoning in accessible language, revisit weak concepts, and find the original evidence in their uploaded textbook. The app should feel calm, work on a phone, retain progress locally, and function offline after caching.

## Planned workflow and delivered scope

1. **Inspect and research — complete.** Read the existing prototype and available cloud skills; inspect the new 434-page PDF. Read AnkiDroid and FSRS public documentation for study-workflow ideas.
2. **Preserve and structure source content — complete with extraction limits.** Bundle the complete PDF, extract every page's text, map 12 subject sections, and pair explicit question/answer numbers. Recover OCR-missed and shared-choice items using a fresh OCR pass and source checks, restoring all 1,484 numbered questions; retain repair and coverage records.
3. **Create understandable learning layers — complete for all numbered questions.** Keep original book rationales separate. All 1,484 questions have a plain-language restatement, answer explanation, ordered notes for every choice (5,942 total), memory hook and recall check. Added 159 glossary definitions, structural release gates and 80 independent sample reviews; known source issues are explicitly noted.
4. **Build the core study loop — complete.** Choose a subject or short session → recall an answer → see feedback and reasoning → save or revisit → track effort. Add deferred-feedback exam practice and session recovery.
5. **Make review and progress useful — complete.** Add deterministic spaced review, due queues, latest-mistake practice, daily goals, activity history, subject accuracy, and backup/restore. Be explicit that the scheduler is not FSRS.
6. **Support mobile and offline learning — complete for tested desktop Chromium/mobile viewports.** Add responsive layouts, dark mode, focus styles, reduced-motion support, install icons, cached data, and optional PDF caching with byte ranges. A signed Android APK with an offline asset host, native PDF reader, and native document pickers is now built. Physical-device installation remains unverified; this machine cannot run the hardware-accelerated emulator.
7. **Validate and refine — complete for implemented software flows.** Run data/scheduler tests and browser journeys, inspect screenshots, address issues, rerun affected checks. This verifies software behavior, not medical accuracy of every extracted question.

## Decisions

- Keep a static, dependency-free frontend. This project does not need an account system, database server, secret keys, paid API, or bundler to support its current personal-study workflow.
- Bundle the user's PDF so content is available immediately instead of requesting another upload.
- Keep source page numbers visible, with PDF links for questions and rationales.
- Use real recorded interactions for progress; do not invent streaks, scores, or completion.
- Keep custom question banks and progress separate. Validate before replacing stored data.
- Load the large PDF viewer only when requested. Cache the PDF only after an explicit offline-download action.
- Keep local development bound to loopback. No deployment or public publication was performed.

## Remaining editorial and platform work

- A clinician/editor can further review the medical accuracy and currency of the complete authored teaching. Structural coverage and sampled reviews do not replace that professional review.
- Crop/caption source illustrations and reconstruct complex tables if inline illustrated questions are desired; currently those are accessible through the original PDF.
- Test the signed APK on physical Android devices; the offline Android packaging task is complete.
