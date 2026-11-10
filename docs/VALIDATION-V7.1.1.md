# Labwise 7.1.1 APK validation

Checked on 10 November 2026. Public web hosting is cancelled. This is an Android maintenance release; the existing question, choices, rationale, picture and voice-learning presentation is retained.

## Reproduced recovery gaps and fixes

Unresponsive IndexedDB open/transaction events previously had no deadline. Production operations now time out after eight seconds per stage, report failure and preserve stored data. Reads can recover legacy data or fall back to the bundled collection with a visible warning. Late connections close; timed-out pending transactions are aborted. Unit checks cover stalled opens, late success, stalled writes/deletes and preserved legacy data. An actual shared-screen test injects an IndexedDB provider that never responds, then verifies that startup finishes, saved progress remains and a question can still be answered.

Native reader cache names include the APK's update revision. Old copies previously accumulated across upgrades. After the new copy opens successfully, the reader now reclaims only other revision copies of the same document. A production-Java filesystem harness verifies that the current PDF, other documents, temporary files, unrelated files and matching directories remain. Missing/empty/outside replacement files cannot trigger pruning. This does not delete study progress or exported backups.

Sign-in connectivity failures no longer imply automatic sync before authentication. A hanging Auth request recovers with a fixed retry message, releases the form, retains the email, clears the password and leaves study available. A browser test exercises the actual request timeout with intercepted HTTP; a unit check verifies that unsigned users are not promised automatic sync. The exit dialog also avoids asserting that all changes were saved when storage warnings may exist.

## Executed checks

| Area | Result |
| --- | --- |
| Content assembly | Complete teaching for 3,760 active questions and 15,046 choices; source exclusions and missing-page accounting preserved. |
| Unit and native rules | All **28 test files pass**, including SDK compilation, native policy/crypto, storage timeouts, Auth diagnostics, games, speech orchestration, image mapping/pixels and native reader-cache ownership. |
| Study screens | **52 checks pass** for sessions, source scopes, search, exams, resume, teaching tabs, imports, backups and responsive navigation. |
| Sprint | **7 scenarios pass**. |
| Frenzy and arcade | **24 checks pass**. |
| Teaching and Android bridge | Pass, including version 1–4 progress restore behavior and native document/export routes. |
| Quiz Show | **13 full-app groups and 10 layouts pass**, covering confirmation, results/rationales, explain-back, manual fallbacks, interruption/stale callbacks, privacy, picture selection and recognition language. |
| Pictures | **24 component layouts and 37 full-app checks pass**; native-size fitting, 2× enlargement, source links and exam/answer reveal remain correct. |
| Phone/tablet UX | **481 checks pass**, with no reported issues across the two existing UX audits. |
| Compatibility and callbacks | Older helper-method/sign-in regression passes; **7 callback scenarios pass**. |
| Accounts and private Duels | **9 browser checks pass** across isolated simulated profiles. These use mocked HTTP, not live accounts. |
| Database | Disposable PostgreSQL17 checks pass: permissions/RLS, isolation, size limits, concurrent first saves/updates, migration preservation, grading, deadlines, hearts, limits/draws, expiry/rate limits, invitation races and conflicting answer/timeout races. |
| Offline | Actual service-worker reload, all study/teaching data, three cached PDFs and byte ranges/416, offline feedback and storage-failure guidance pass. Android itself uses packaged assets rather than this worker. |
| Failure recovery | Stalled database startup and hanging sign-in browser checks pass without clearing progress or retaining passwords. |

The initial Quiz Show audit still expected its older stretched `width:100%` picture behavior. That obsolete test expectation was corrected to require decoded source-size bounds. The complete Quiz Show suite then passed; the existing native-size picture behavior was preserved.

## Signed-package and performance checks

`python3 scripts/build_apk.py` passes content guards, SDK35 Java/Dex compilation, retained-key signing, v2/v3 signature verification, alignment, package metadata, ZIP integrity and source-byte comparisons for every declared runtime asset, figure and PDF. The signed APK is then extracted and run at `https://appassets.androidplatform.net/assets/` under the Android CSP, with every request served from those extracted files.

The packaged check passes with **4× CPU slowdown** in Chromium: startup measured **2,201 ms** in this run. All packaged study/source routing, reading-position, Sprint, Frenzy, Quiz Show confirmation, picture/zoom, pilot-account/Duel entry, v4 backup and update-link checks pass, with no missing assets, external requests or page errors. This is a simulated renderer check, not a physical Android speed or memory benchmark.

Package `com.labwise.study`, version **7.1.1**, code **70101**, Android8+/API26 minimum, target API35. APK: **72,837,583 bytes**, SHA-256 `a170a4ca35e9a28d98192ef26037e954cb248069dbb77f591d82df82f37565bc`. Stable and versioned copies have identical bytes. Signer certificate SHA-256 remains `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`.

The bank digest remains `d0bd982f87d392e8f28575c536b2644519c657fa94b7ed186b6c666fed47cf24`. All three source PDFs, the 155 figures and their associations are unchanged. No SQL migration or quiz-registry update is required.

## Limits and wider-release gate

The current environment has no usable Android hardware acceleration: the emulator's accelerator check reports that KVM requires an unavailable `vmx`/`svm` CPU. The tests above do not run actual Android TTS/microphone services, Keystore persistence, installation/upgrade, native PDF rendering or Bluetooth/call interruptions.

The workspace's current outbound policy does not permit the live Supabase project host. Live sign-in, two physical devices syncing and a live two-account Duel are not established by these simulated-client and local-database results. The build remains a confirmed-account pilot; public signup/reset email delivery is not configured.

Source picture resolution is still limited by the supplied scans. Lossless packaging does not establish that every original photograph is sufficiently detailed, and structural content validation is not a full clinical review. Follow [APK-QUALITY.md](APK-QUALITY.md) for real-device acceptance and priorities before a broader rollout.
