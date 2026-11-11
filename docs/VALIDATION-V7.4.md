# Labwise 7.4.0 validation

Checked on 11 November 2026. This release adds Exam Challenge while retaining 7.3.0's Practice voice tutor, audited question visuals and compatible Friend Duel collection. Public web hosting remains cancelled.

## Behavior

Exam Challenge creates exactly 50 or 100 different questions from the selected source and subjects. Long questions and verified question visuals can be included. The round is untimed. Correct answers advance a virtual prize ladder to $1,000,000; each ten correct answers secures a checkpoint. A wrong answer ends the run at its secured payout, while the explanation remains open until Next. The once-per-round lifelines retain the correct choice in 50/50, show the plain-language clue, or swap in an unused reserve question. Stop-and-bank requires confirmation.

The final payout and separate 50/100 personal records are preserved locally, with bounded recent history. A lifetime best survives history pruning. Active rounds use question/source fingerprints; changed source questions invalidate the active round while retaining historical records. Individual answer events enter the existing game learning history once. Rounds and virtual-prize records are local to the device/profile and are not included in standard version 4 progress backups or cloud profile sync. They are personal records, not a global leaderboard. See [rules and future leaderboard design](EXAM-CHALLENGE.md).

The new interface preserves question visuals and the existing explanation tabs. A shared modal close control was raised to a 44-pixel minimum target, and secured-checkpoint text uses the theme's readable foreground color in dark mode. A seeded Fisher–Yates shuffle mixes the question order.

## Executed checks

- `npm test`: **34 test files passed**, including nine Exam Challenge engine groups and six new UI cases. These check 50/100 wins, exact uniqueness/source scope, checkpoints, voluntary banking, one-use lifelines, restore/stale questions, duplicate scoring, bounded history, retained best records, escaping, payouts and saved-data invariants. Existing source, native/JVM, voice, account and figure checks also pass.
- `tests/exam-challenge-browser.cjs`: **8 workflows / 4 layouts passed**. A full 50-question win, 100-question setup/checkpoint failure, lifelines, stop/bank, reload, saved best records, source tables and returning to Practice voice all work in the shared app. Phone/tablet layouts include dark mode and larger text; no horizontal overflow, undersized tested controls, page errors or external requests were found.
- Classic study: **52 checks passed** after integration. Practice voice: **10 workflows / 2 layouts passed** after integration. The tutor reads long cases in bounded chunks, requires separate spoken confirmation, retains original tables, provides explanation/teach-back and rejects stale callbacks. Microphone failure and exam deferred-feedback cases use simulated providers.
- Earlier release regression on the retained code passed 13 Quiz Show checks/10 layouts, 24 arcade checks, 24 figure component layouts/37 app checks, table coverage across 12 layouts, WebView compatibility and storage/sign-in timeout recovery. See [7.3.0 evidence](VALIDATION-V7.3.md) and [the visual audit](VISUAL-AUDIT.md).
- The signed **7.4.0 APK** was extracted and tested at Android's app asset origin and CSP with 4× simulated CPU slowdown. Every runtime asset matches source. The packaged test checks all 379 lossless image files, 215 source tables, all three PDFs, Practice voice confirmation/rationale/recall, games, backups and native PDF routes. It also starts a 50-question Exam Challenge, records an answer with its explanation, reloads the saved place, banks its prize and verifies the stored personal record. No page errors or external requests occurred.
- Android compilation, v2/v3 signature verification, alignment and package/version checks pass. The retained certificate allows an update over an existing installation.

These are local, JVM and browser simulation checks. Physical microphone quality, recognition, Bluetooth/audio interruptions, installation/upgrade, Keystore persistence and live two-device sign-in/sync still need physical-device acceptance. The original photographs remain limited by the supplied scan detail. No new account, email or database operation was performed.

## Artifact and compatibility

| Item | Verified value |
| --- | --- |
| APK | `releases/Labwise-7.4.0.apk` and identical `Labwise-latest.apk` |
| Package / version code | `com.labwise.study` / `70400` |
| Android requirement / target | API 26+ / API 35 |
| Bytes | 75,771,781 |
| APK SHA-256 | `51d1ccd5c9734725cd598c685a53d645afc3a8b1b23b3e309b5dc716917a4e33` |
| Signing certificate SHA-256 | `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158` |
| Exact bank digest | `e5ce86e0e2493e62fdbd1286f8a11c5ee3153c65b3b848fac1dc06fa2bb0089e` |
| Compatible hosted Duel digest | `d0bd982f87d392e8f28575c536b2644519c657fa94b7ed186b6c666fed47cf24` |
| Current solo / hosted Duel inventory | 2,967 / 2,993 |

The existing 7.3.0 versioned APK is preserved. All 3,760 active questions, 15,046 option positions, the three source PDFs, 193 exclusions and the missing-page accounting are unchanged from 7.3.0. The hash-pinned Duel compatibility proof remains valid. Both SQL seed/setup files are byte-for-byte unchanged, so this release requires no live SQL update. A shared cross-user leaderboard is future work and would need its own reviewed backend and privacy flow.
