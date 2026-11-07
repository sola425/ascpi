# Labwise implementation plan — 4.0.0

## Product goal

Help an MLS learner recall an answer, understand every choice in accessible language, revisit difficult ideas, and find the original evidence across their source books. Keep the experience calm, usable on a phone, and available offline with private on-device progress.

## Delivered scope

| Area | Version 4.0.0 implementation |
| --- | --- |
| Source collections | One catalog for Success and BOC 7e, three unchanged PDFs, 1,100 searchable PDF pages, document-aware question/rationale/context links, and a selected reading page per document |
| Teaching | Individually authored notes for all 3,760 active questions and 15,046 options; plain-language explanations, memory hooks, recall checks, glossary matches, and separate source rationales |
| Study loop | Source/subject/status setup, 5–100-item session choices, practice feedback, end-of-exam feedback, saved questions, and teaching tabs |
| Continuity | Protected unfinished sessions, independent practice/card state, stable flashcard queues, and resume after pausing or reopening |
| Review and progress | Explicit review intervals, due/forgotten/missed-answer filters, separate recall ratings and MCQ accuracy, goals, activity history, and subject progress |
| Storage | Local progress, IndexedDB custom banks where available, import/restore previews, restore Undo, exportable backups, and recoverable-data notices |
| Responsive interface | Five phone navigation destinations, tablet rail, wide-screen question/teaching panes, dark mode, larger reading text, focus states, and reduced motion |
| Android release | Version 4.0.0 / code 40000, retained package and signing identity, all PDFs bundled, native PDF zoom/page navigation, document pickers, and a stable APK update link |

The full source/exclusion accounting and editorial review scope are documented in [content coverage](CONTENT-COVERAGE.md). Software checks and their actual results belong in [validation evidence](VALIDATION.md).

## Implementation decisions

- Use a static frontend with no runtime package installation, account, server database, API key, or remote AI service.
- Keep immutable source records and original PDFs separate from the active study collection and authored teaching.
- Preserve stable question IDs so existing progress survives the larger collection and in-place app updates.
- Record real interactions; keep self-rated recall separate from scored practice answers.
- Validate and preview imports before applying them. Preserve the prior progress copy when restoring and offer Undo.
- Bundle every PDF in Android; let browser users cache each PDF explicitly. Keep local development bound to loopback.
- Retain the release signing key outside the repository and distribute both a fixed versioned APK and `Labwise-latest.apk` from public `main`.

## Follow-up work

Test installation, in-place upgrades, document pickers, and native PDF gestures on physical Android devices. This cloud environment cannot run the official hardware-accelerated emulator because usable KVM is unavailable. Further editorial review and optional inline illustration/table work can build on the preserved source links and review records.
