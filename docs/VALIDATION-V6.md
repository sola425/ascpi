# Labwise 6.0.0 validation

Checked on 7 November 2026. This release adds optional account sync, private Friend Duels, Solo Frenzy, multiple-subject game selection and self-paced onboarding. It preserves the 3,760 active questions, 15,046 choice explanations and three original PDFs.

## Automated checks

- `npm test`: all 19 test files pass. Coverage includes backup versions 1–4, question/source contracts, game state, Frenzy deadlines and hearts, game/progress merges, account ownership, Auth refresh and storage failures, and native network/session policy. The coordinator includes failed-import rollback and retrying credential deletion.
- PostgreSQL 17: the complete one-paste setup applies twice with 2,993 release question metadata rows. Actual database tests cover grants, RLS, owner isolation, document limits, compare-and-swap conflicts, concurrent first saves, deletion cascade, registered grading, deadline and three-heart endings, draws, expiry, request limits, and concurrent invitation/answer/timeout races. Tests use a disposable local database and an `auth.uid()` fixture.
- All seven existing browser regression suites pass: 52 main workflow checks, seven game scenarios, teaching, actual service-worker offline reload and PDF byte ranges, Android bridge simulation, and both UX suites. The UX suites record 481 checks with zero reported issues.
- The account layout review covers 60 screen combinations at 320×568, 568×320 and 768×1024, light/dark themes, larger text, hosted email configuration and the confirmed-account pilot. Its 432 checks report no overflow, undersized controls, browser errors or inaccessible focus targets.
- The Frenzy integration suite passes five scenarios / 24 checks and exercises multiple subjects, the exact 30-second boundary, one penalty after extended background time, reload/resume, three-heart endings, untimed final explanations and every-choice/source tabs, confirmed voice transcripts, reduced motion and phone/tablet layouts. Solo use makes no Auth requests. Regression checks also enforce source-book filtering and preserve a Practice voice draft when an unrelated Frenzy deadline expires.
- The callback browser tests cover seven mocked confirmation/recovery/error scenarios. They verify URL-fragment removal, credential privacy, token validation, matching passwords and ending the recovery session. No email is sent.

The account/Friend Duel integration suite passes nine checks using two isolated browser profiles and strict mocked Auth, progress and challenge responses. It exercises the actual app, sync coordinator and HTTP clients; these simulations complement the actual PostgreSQL authorization and concurrency checks. It checks preview timing, shared question order, server feedback, second-phone history, account isolation and backup privacy. Delayed account attachment repaints an open question, and a failed invitation start shows its connection error.

## Android package checks

The build checks every included web/data asset against the source bytes and verifies all three bundled PDFs. It rejects a stale quiz-registry digest before packaging. `tests/apk-assets.cjs` additionally extracts the signed APK and runs its assets under the Android origin and production CSP, exercising first-use dismissal, original study flows, Sprint/Frenzy explanations, pilot sign-in and Friend Duel entry, v4 exports and the explicit update action.

The package is `com.labwise.study`, version `6.0.0`, version code `60000`, minimum Android API 26 and target API 35. It retains the existing signing identity for installation over earlier releases. Internet access is limited in the WebView to the configured HTTPS Supabase project and the approved Auth/RPC paths. There is no microphone permission; optional speech still uses the device provider. Authentication sessions use the Android Keystore bridge and stay separate from progress exports.

Final signed APK: **68,897,990 bytes**, SHA-256 `1b4831c4d305e44fdb9c145d2028862b56446603053f783ea257ce7bf3183119`. APK Signature Schemes v2 and v3 verify. The signer certificate SHA-256 remains `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`.

Release files and SHA-256 checksums are in [releases](../releases/). The versioned and stable APK copies must contain identical bytes. The published download is checked against that checksum after upload.

## Limits of this verification

Browser viewports and a JVM policy/crypto harness do not establish actual Android device behavior. This environment has no usable hardware-accelerated Android emulator; real-device installation, Keystore persistence and speech-provider operation still require device acceptance.

The owner reported that the complete Supabase setup ran successfully and created a confirmed pilot account. This cloud environment's outbound policy denied the project's hostname, so live Supabase Auth/PostgREST connectivity and two physical phones have not been verified here. The local database and mocked HTTP tests do not replace that check.

The bundled configuration is a confirmed-account pilot. Public signup and password-reset controls remain hidden while `redirectUrl` is empty. Callback files are prepared, but HTTPS callback hosting and production SMTP are not configured or verified. Follow [Supabase setup](SUPABASE-SETUP.md) before enabling those flows for general users. Two different confirmed accounts can use Friend Duels; two phones using the same account share one player's progress.

The game design references are documented in [GAME-INSPIRATION.md](GAME-INSPIRATION.md) and [ONBOARDING-INSPIRATION.md](ONBOARDING-INSPIRATION.md). The checks establish the behaviors above; they do not establish exam performance or guaranteed retention.
