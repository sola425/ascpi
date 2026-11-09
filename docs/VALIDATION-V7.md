# Labwise 7.0.0 validation

Checked on 9 November 2026. The familiar question, answer-choice and rationale layout remains. Attached visuals are original photographs, diagrams and charts; question-text screenshots are excluded. Quiz Show is an additional, optional voice mode.

## Sign-in repair

The previous code could fail before making an Auth request on WebViews lacking `Object.hasOwn` or `Array.prototype.at`. A classic compatibility script now runs before module startup. A browser regression removes both methods, loads the actual app, signs in through mocked HTTP, writes progress and reaches the successful sync state. This establishes a reproducible compatibility fix; the original physical-tablet error was not captured.

Auth failures distinguish credentials, unconfirmed email, invalid public key, missing backend setup/permissions, network failure and rate limits. Connection checking reads public Auth settings and, when signed in, progress; public connectivity alone never claims a successful sync. Email entry is preserved and passwords have a visibility toggle. Fresh-session expiry uses the supplied duration to avoid tablet/server clock skew. Native assets use `LOAD_NO_CACHE` and `Cache-Control: no-store` without clearing learning/authentication storage. A classic startup guard supplies safe update/reload guidance if the app module cannot load, while preserving healthy boot and handled loading errors.

## Voice learning

Quiz Show has up to fifteen questions, three hearts, 50/50, a plain-language clue and a skip. A spoken choice is read back and requires separate confirmation before grading. Explanations are untimed; Next is explicit. Wrong answers and selected correct-answer turns lead to an authored recall prompt, model answer and explicit learner rating. Arbitrary speech is not presented as AI-graded understanding.

The actual app/controller/engine browser test passes twelve check groups and ten layouts: reading, spoken choices, confirmation, feedback, recall comparison, self-rating, lifelines, background cancellation, stale callbacks, silent resume, focus and transcript privacy. Speech is simulated. Engine, dialogue and IO tests cover limits, validation, privacy, idempotence, interruptions, disposal, bounded retries, chunking and cleanup. A mixed-action check exercised 7,584 actions across 600 rounds.

Android uses installed TTS voices and foreground recognition; microphone permission is requested only by a listening action. Online device voices may send the text being read to their provider, and recognition may use a network service. Labwise saves no audio or transcript history. Premium online AI voices are not configured. Real Android audio still requires physical-device acceptance.

## Original pictures

Verified pictures link to the matching question and source page. Fingerprints prevent a custom bank reusing an ID from inheriting another question's picture. Answer-only graphics remain hidden before reveal, including in exam practice. Zoom supports fit and natural size without recoloring images. The build rejects question-layout records, unsafe paths, stale PDF hashes, inactive mappings and image/inventory mismatches; it verifies every packaged image byte. The final set contains 155 picture files (2,445,088 bytes): before-answer pictures for 73 BOC and 57 Success question IDs, and rationale pictures for 35 BOC question IDs. Nine source-visual checks, 24 component displays and 37 full-app picture checks pass. Mapping limits are in [FIGURES.md](FIGURES.md).

All 27 unit test files pass, including 28 dialogue cases.

## Existing workflows and package checks

All seven legacy browser suites pass: main study (52 checks), Sprint (seven scenarios), teaching, Android bridge with backup versions 1–4, real service-worker offline use/PDF byte ranges, and both UX suites (481 checks, zero reported issues). The mocked two-profile account/Duel suite passes nine checks; the callback suite passes seven scenarios. No tests create live accounts or send email.

SW v11 normalizes navigation fragments, caches approved static/PDF/figure URLs, excludes Auth/audio and preserves core installation when picture caching reaches quota. Android bundles assets directly. Content remains 3,760 active questions, 15,046 option explanations and three unchanged PDFs totaling 1,100 pages. Database migrations and the shared-question registry digest are unchanged from v6.

SDK35 compilation and native policy/crypto tests pass, including 237 network/session checks. Packaged-asset verification runs the signed APK's files under the Android origin/CSP alongside source-byte, image and PDF checks. These tests do not execute the real Android microphone, TTS service or Keystore.

## Live verification boundary

The Cloud workspace denies the Supabase hostname at its outbound proxy. An exact-host proposal for `ncfovahpjofwrygxnbst.supabase.co` is saved for environment-settings review/save/publication; it has not been applied. This describes development access, not the tablet failure's cause. Live Supabase Auth/PostgREST and two physical phones remain unverified here.

The owner previously reported successful SQL setup and a confirmed account. The build remains a confirmed-account pilot: public signup/reset controls stay hidden until HTTPS callback hosting and email delivery are configured. See [Supabase setup](SUPABASE-SETUP.md). Signed APK/checksum files are in [releases](../releases/); install over the existing app to retain progress.

## Signed artifact

Final APK: **71,432,655 bytes**, SHA-256 `1161c39ae90c2e1115cb80f4b2e7a4d814814d7f64c22b049e7795d15bc54c4b`. APK signature schemes v2/v3 verify; signer certificate SHA-256 remains `bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158`. The versioned and stable copies have identical bytes. Packaged verification includes Quiz Show confirmation and decoding/zooming an original BOC picture under the Android origin/CSP.
