# Labwise 7.3.0 validation

Checked on 11 November 2026. This release adds a voice tutor to every ordinary Practice question, including long questions, shared cases and image/table questions. It also incorporates the reviewed visuals from the unpublished 7.2.0 draft. Public web hosting stays cancelled.

## Practice voice

A top-of-question **Start voice tutor** shortcut avoids scrolling through a long case to start speech. The tutor reads the full displayed stem, shared case and every option in sequential chunks of at most 2,400 characters. The microphone opens after the complete reading. A spoken choice requires separate confirmation before the usual Practice answer is recorded. Feedback reads selected-option reasoning, the original rationale, simplified teaching and a recall prompt. Recall compares with the supplied answer and is self-rated; no semantic AI grading is claimed.

Manual answers, Next, navigation, dialogs, source readers, account changes, bank changes and backgrounding cancel obsolete voice work. Switching between Quiz Show, the Practice tutor and answer-only input stops the previous speech owner. Conversation transcripts remain in memory and are excluded from progress and exports. Exam practice retains its existing input-only voice and deferred feedback.

## Executed checks

| Check | Result |
| --- | --- |
| Full unit/native suite | All **32 test files** pass; includes long-reading/cancellation/stale-confirmation tests and six Practice UI cases |
| Practice voice integration | **10 checks / 2 layouts**, including a question+case over 24,000 characters, confirmation, normal grading, teach-back, self-rating deduplication, completion, stale callbacks, microphone errors, reload/background/navigation, exams, source tables and transcript privacy |
| Classic study | **52 checks**, session limits, source scopes, exam feedback, Cards, reading positions, import and backups |
| Readable tables | All **215 tables / 12 layouts**, plus six actual workflows |
| Quiz Show | **13 integrated checks / 10 layouts**, original flow preserved |
| Sprint / arcade | **7 / 24 scenarios**, including the relocated answer-only recognizer |
| Figures | **24 component layouts / 37 full-app checks** |
| Account and Duels | **9 checks across two isolated simulated phones**, using different artifact and hosted-registry digests |
| Compatibility and recovery | Missing older-WebView APIs repaired; stalled storage and hanging sign-in recover without deleting progress or retaining passwords |
| Signed APK | Retained certificate, v2/v3 signatures, alignment, native compilation, package/version and every bundled runtime/image/data/PDF byte verified |
| Extracted APK | Boots at Android origin/CSP at **4× simulated CPU slowdown**; passes study, readers, games, images, expanded source-table/native-PDF comparison and confirmed Practice voice answer/rationale/teach-back with mocked native speech; no external requests or page errors |

Full page review: **1,100 pages**, **215 readable tables**, **386 questions with question visuals**, **379 lossless image files**. All 3,760 active question IDs, every answer position and all 15,046 option positions are preserved. Teaching and original PDF bytes are unchanged. The 193 exclusions and 93 absent source stems remain accounted for. Details are in [the visual audit](VISUAL-AUDIT.md).

## Publication compatibility

The artifact's bank digest is `e5ce86e0e2493e62fdbd1286f8a11c5ee3153c65b3b848fac1dc06fa2bb0089e`. The app explicitly uses the published Duel digest `d0bd982f87d392e8f28575c536b2644519c657fa94b7ed186b6c666fed47cf24`. All **2,993** hosted registered questions have unchanged stems, choices, answer positions, contexts, topics and source collection IDs, proved by a hash-pinned [compatibility inventory](../data/duel-registry-compat.json). Current solo eligibility is separately recorded as 2,967.

The JavaScript generator and independent Python packaging guard reject incompatible content or modified proofs. Tests change each protected content/grading field and confirm rejection. Both SQL seed and combined setup remain byte-for-byte equal to the published 7.1.1 versions. **No SQL update is required for 7.3.0**; the existing registry remains usable by older clients. No live database mutation was performed.

## Artifact

- Version **7.3.0**, code **70300**, package `com.labwise.study`, Android 8.0+ / target API 35.
- APK: `releases/Labwise-7.3.0.apk`, also copied to `Labwise-latest.apk`.
- Size: **75,755,183 bytes**.
- SHA-256: `61986a7eb6d436491721740fe5ee22421f575d20be4ef59e965985ae7b7d427c`.
- Retained signing certificate SHA-256: `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`.

Export progress and install over the current installation without uninstalling. The new version code advances beyond both 7.1.1 and the local 7.2.0 draft.

## Limits

Local speech mocks verify conversation and cancellation, not real microphone recognition, voice naturalness, Bluetooth behavior or installation/upgrade. These still need physical phone/tablet acceptance. Live two-device sign-in/sync and two-account Duels are not established by simulated clients. The account service remains a confirmed-account pilot. Original photographs still have the supplied scans' roughly 72-DPI limits. No generative voice service is configured.
