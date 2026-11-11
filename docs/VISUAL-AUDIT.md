# Question-visual audit — incorporated in 7.3.0

Reviewed **11 November 2026**, first prepared in a local 7.2.0 draft and incorporated in 7.3.0. The audit represents the original PDF visuals attached to the questions: **215 readable tables**, plus question photographs, diagrams and charts. **386 questions** have a verified question visual, compared with 130 before this audit. The existing question, choices and rationale layout is retained.

The original review artifact was `releases/Labwise-7.2.0-draft.apk`. The 7.3.0 release adds Practice voice study to the audited visuals; its release validation is recorded in [VALIDATION-V7.3.md](VALIDATION-V7.3.md). The audit itself did not apply SQL or change a hosted environment. The draft artifact and checks below are retained as historical evidence.

## Page-by-page evidence

| Supplied PDF | Pages reviewed | Reviewed addition records | Structured table records before shared-table deduplication |
| --- | ---: | ---: | ---: |
| Success, 4th edition | 434 | 50 | 43 |
| BOC Part 1 | 333 | 155 | 135 |
| BOC Part 2 | 333 | 44 | 38 |
| **Total** | **1,100** | **249** | **216** |

One duplicate shared table merges into a single runtime table, giving **215** distinct tables. The addition records link 270 question IDs; existing picture mappings and shared references bring the final combined coverage to 386 questions. There are 231 questions with tables and 163 with question pictures, with eight questions in both groups.

All supplied pages were visually inspected in page contact sheets, with individual full-page and crop inspection for candidates and unclear references. The ledgers identify each reviewed page and its dispositions:

- [Success page ledger](../data/visual-audit/textbook-pages.json) and [reviewed additions](../data/visual-audit/textbook-additions.json).
- [BOC Part 1 page ledger](../data/visual-audit/boc1-pages.json) and [reviewed additions](../data/visual-audit/boc1-additions.json).
- [BOC Part 2 page ledger](../data/visual-audit/boc2-pages.json) and [reviewed additions](../data/visual-audit/boc2-additions.json).
- [Sealed source/review hashes and question keys](../data/visual-audit/manifest.json).

BOC Part 2's 44 addition records, including all 38 tables, also received an [independent full-page/crop verification](../data/visual-audit/boc2-independent-check.json). Its reviewed snapshot hash matches the final additions file.

A second gap review checked all 178 initially flagged questions without a mapped question visual: 122 Success, 32 BOC Part 1 and 24 BOC Part 2. It recovered four Success color-plate associations serving ten questions, including shared case questions. The remaining flags refer to text cases, inline values, formulas or other non-image source context. Their individual dispositions are recorded in the three `*-gap-review.json` files. This review distinguishes a broad extraction hint from an actual missing visual.

## Changes in the app

- Transcribed tables retain the printed values, units, blanks and grouping. They scroll within the question, have an expanded view and link to the original table crop or PDF. Fourteen option/inline matrices use only the readable table plus the PDF comparison.
- Complete question diagrams and charts replace eight fragment assets across seven replacement proposals. Shared color plates attach to every explicitly associated case question. The same original image may be reused without duplicating its file.
- Seventy-five exact table-text overlays and one individually reviewed stem overlay remove repeated table clutter from the displayed question. Canonical question matching and exports remain available.
- Verified source requirements keep new visual questions out of games that require self-contained text. Audio-only Quiz Show additionally excludes any verified picture or table, including four legacy picture questions that lacked the broad source flag.

Final image inventory: **379 lossless files / 6,645,446 bytes**, comprising 142 question-picture records, 201 original-table comparison crops and 36 pre-existing rationale figures. Only question-input visuals were added in this audit.

## Source repairs and retained content

The [repair log](../data/visual-audit/source-repairs.json) records 90 field changes. Eighty-one mark verified source requirements. Two question stems repair OCR in printed Color Plate 1/17 references; five shared-case contexts repair the OCR plate reference 41 to the printed 4. Success question 65's apparent “4B” is Plate 4 followed by the source's reference icon, so it is not changed to Plate 48.

Two printed option repairs remove captured table tails: `book-135-95` option D is “Anti-K, anti-Jsᵃ, and anti-Leᵃ”; `book-135-96` option D is “2, 3, 4, 6, 9”. These were checked against Success local PDF page 147. Answer positions and option counts remain unchanged.

Comparison with the published source confirms **all 3,760 active IDs, every answer position and all 15,046 option positions remain intact**. Teaching files are unchanged. All three original PDFs retain their original hashes. The 193 excluded questions stay excluded, and the 93 stems absent from the supplied missing printed pages are not invented.

Gap-review notes also identify unrelated text cleanup and a Success case-context follow-up (`book-135-172` referencing question 171). Those are recorded for separate content work and were not silently expanded into this visual audit. Source numerical/unit inconsistencies found during transcription are preserved with source notes rather than guessed corrections.

## Original 7.2.0 draft validation

- `npm test`: **30 test files passed**, including all reviewed table values/units/grouping, complete page coverage and review hashes, source question keys, custom-bank isolation, exact decoded source-pixel equality and crop boundaries.
- `tests/tables-browser.cjs`: **all 215 tables across 12 layouts**, with six actual question/table workflows. Includes 320/768/1024 widths, both themes, larger text, wide panels, fixed row labels, original comparison, two-table questions, single-column data and flashcards.
- Classic study regression: **52 checks**, plus teaching layout and WebView compatibility/sign-in simulations using mocked HTTP.
- Games: **7 Sprint scenarios, 24 arcade scenarios, 13 integrated Quiz Show checks and 10 host layouts**. The host checks use simulated speech.
- Figure regression: **24 component layouts and 37 full-app checks** covering pictures, zoom, Practice, exams, Cards, source routing and custom-bank IDs. Android bridge simulation covers PDF routing, reading positions and backup versions 1–4.
- Draft APK compiled and verified with the retained signing certificate, v2/v3 signatures and alignment checks. Every packaged renderer, table, image, data file and PDF was compared with the current source.
- Extracted draft APK tested at Android's app origin under its CSP, with 4× simulated CPU slowdown. Startup, decoded images, table scrolling/enlargement/native PDF comparison, source routing, games, audio-only visual exclusion, backups and account/Duel entry passed without external requests or page errors.

These are local and simulated checks. No physical Android installation, real microphone/speech service or live two-device account test was performed in this audit. All original images remain limited by the supplied scans' roughly 72-DPI detail; readable tables improve text presentation but cannot restore fine photographic features.

## Historical draft artifact and current release compatibility

| Item | Value |
| --- | --- |
| Draft APK | `releases/Labwise-7.2.0-draft.apk` |
| Package / version code | `com.labwise.study` / `70200` |
| Bytes | 75,755,183 |
| APK SHA-256 | `27a59abd06ad2b0cae644b9ea1b5495f071a79bb1d2ee84540e6b595c75f6e33` |
| Signing certificate SHA-256 | `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158` |
| Stable 7.1.1 APK SHA-256, unchanged | `a170a4ca35e9a28d98192ef26037e954cb248069dbb77f591d82df82f37565bc` |
| Draft bank artifact digest | `e5ce86e0e2493e62fdbd1286f8a11c5ee3153c65b3b848fac1dc06fa2bb0089e` |
| Current solo eligibility | 2,967 questions |

The original draft regenerated a candidate seed for its changed bank hash, but that seed was not applied to Supabase. For 7.3.0, release review instead verified that all 2,993 published Duel questions retain their stems, choices, grading fields and shared context. The exact bank artifact hash (`contentDigest`, `e5ce…`) is now separate from the compatible hosted Duel hash (`duelContentDigest`, `d0bd…`), backed by [the pinned compatibility inventory](../data/duel-registry-compat.json). The seed and combined setup SQL were restored to their published bytes. **No live SQL update is required for 7.3.0**, and older clients keep their existing registry. Live two-account Duel acceptance remains a separate device/service check.
