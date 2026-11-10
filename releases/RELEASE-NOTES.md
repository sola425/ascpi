# Labwise 7.1.0 — Source-detail pictures and the complete voice learning loop

[Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 7.1.0 APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-7.1.0.apk)

- **Every answer gets a complete voice turn:** hear the question and choices, speak an answer and confirm it, then hear an explicit correct/incorrect result, the selected-option explanation and the correct-option explanation when needed. The original book rationale and simpler teaching are read with separate labels. Every question ends with an invitation to explain back what was learned; compare with the supplied model answer and self-rate recall. Next stays under the learner's control.
- **Preserve source detail:** all 155 existing picture files are exported losslessly at the source raster density. Inline and fitted pictures no longer stretch small originals. Native size and explicit 2× enlargement are available. Original colors, source links, question mappings and hidden-until-reveal rationale images are preserved.
- **Honest source limits:** the supplied PDFs contain roughly 72-DPI raster pages; some clinical photographs have only a few hundred pixels. Lossless export avoids additional degradation but cannot restore missing detail. The app identifies limited-detail source scans. No generated clinical detail, substitute look-alike photograph or question-text screenshot was added.
- **A route to more image questions:** [the image-content plan](../docs/IMAGE-CONTENT-PLAN.md) distinguishes identification questions from post-answer illustrations and sets out source licensing, attribution and clinical review. It lists candidate image sources for investigation. No LabCE bank or new external photographs have been imported.

Study coverage remains **3,760 questions**, **15,046 option explanations** and **1,100 original PDF pages**. Existing source exclusions and missing-source accounting remain. No backend migration or question-registry update is needed for this release. Account configuration and the confirmed-account pilot are unchanged.

Requires Android 8.0+ and an up-to-date Android System WebView. Package `com.labwise.study`, version code **70100**, target API **35**, signed with the retained release certificate. **Export progress, then install over the existing app without uninstalling.** The stable download link is unchanged.

[Version 7.1 validation](../docs/VALIDATION-V7.1.md) records executed checks. Speech is simulated in browser tests; physical-device voice quality, microphone accuracy, installation/upgrade and live two-phone sync are not established by those checks.

---

# Labwise 7.0.0 — Voice Quiz Show, original figures and tablet compatibility

[Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 7.0.0 APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-7.0.0.apk)

- **Learn out loud in Quiz Show:** choose one or several subjects and up to **5, 10 or 15 questions**. The host reads the question and options, listens to your answer, and asks for explicit spoken or tapped confirmation before scoring it. There is no countdown.
- **A knowledge climb with help:** start with **three hearts**, earn **100 points per correct answer**, and use three once-per-round lifelines: **50/50**, **a clue**, and **one skip**. Wrong answers cost a heart; skipping keeps your hearts and opens the explanation. Final explanations remain available.
- **Explain it back:** after explaining an answer, the host sometimes asks you to put the idea into your own words. It reads the supplied model answer for comparison and lets you rate your own recall. This is guided learning from the existing teaching notes, not generative AI grading. Voice commands cover repeat, confirm, next, pause, lifelines, explanations and recall; manual controls and typed commands remain available.
- **Device voices and foreground listening:** choose an installed voice and speed. Android Quiz Show uses text-to-speech and an in-app speech recognizer, requesting microphone permission only when listening starts. A started session can proceed through voice turns without repeated taps. Going into the background stops voice; it does not silently resume. A premium paid voice service is not configured. See [voice-host details](../docs/VOICE-HOST.md).
- **Relevant pictures in the familiar study layout:** the existing question, answer choices and rationale presentation stay in place. Verified original photographs, diagrams and charts from Success and BOC attach beside the relevant question, cropped to the visual and useful labels. Images can be enlarged, retain source references and white paper colors, and use a source/content key to avoid mismatches with custom banks. Figures marked rationale-only remain hidden until reveal. See [verified figure coverage](../docs/FIGURES.md).
- **Tablet sign-in compatibility and diagnostics:** a classic compatibility script loads first, fixing a reproduced initialization failure when a compatible older WebView lacks `Object.hasOwn` or `Array.at`. Relative session expiry avoids a refresh loop caused by a device-clock offset. Actionable account messages and a read-only **Check connection** distinguish Auth, configuration, storage, connection and backend-setup failures. The exact cause on the user's physical tablet remains unconfirmed.

## Accounts and saved state

The existing confirmed-account pilot continues. Public signup and password-reset controls remain hidden while the email redirect is empty; prepared callback files still need hosting and SMTP setup. Live Supabase access is blocked by this development environment's outbound policy. A proposal allowing only the project's hostname awaits environment review/save/publication. No live sign-in, physical two-phone sync or live two-account Duel is claimed from mocked tests. See [Supabase setup](../docs/SUPABASE-SETUP.md).

Quiz Show active rounds and local summaries stay on the device, like unfinished Practice sessions. Its recorded answers and self-rated recall events enter ordinary study progress and can sync. Version **4** progress backups continue to include study history and Sprint/Frenzy state and accept restores from versions **1–4**. The separate Quiz Show queue, private Duel data and Auth credentials are not progress-export fields. Signed-out restores offer local replacement and Undo; signed-in restores merge into the account.

Sprint, Frenzy, private Friend Duels, the six-step tour, source scopes, complete teaching and original PDF reading remain available. Version 7 changes no bank content or original PDF bytes. Study coverage stays at **3,760 active questions**, **15,046 option explanations**, and **1,100 PDF pages**. The existing exclusions and missing source-page accounting remain in [CONTENT-COVERAGE.md](../docs/CONTENT-COVERAGE.md). The quiz-registry digest is unchanged; this release requires **no SQL change**.

## Install, permissions and privacy

Requires Android 8.0+ and an up-to-date Android System WebView. Package `com.labwise.study`, version code **70000**, target API **35**, with the retained signing certificate. Export progress, then install over the existing app to retain on-device data. The stable latest-APK link is unchanged. See [Android installation and build](../docs/ANDROID.md).

Quiz Show adds foreground microphone permission, requested at listening time. Local study and manual play remain available without it. The older input-only voice controls retain their external provider flow. The WebView still limits account traffic to the configured HTTPS project and approved routes, including diagnostics; the update link opens a separate browser.

Labwise saves no audio or transcript history. Some device voices may send the **text being read** to their provider, and recognition may send audio to its provider or require installed offline language data. These provider connections differ from the earlier input-only voice feature. Cloud study progress and exports exclude audio, transcripts and authentication credentials. Android sessions remain in the separate Keystore-backed store.

## Validation

[Version 7 validation evidence](../docs/VALIDATION-V7.md) records final engine/dialogue/compatibility tests, browser and figure reviews, SDK/JVM checks, signing and packaged-asset results. Mocked speech and account tests do not establish real-device voice quality, recognition accuracy, Keystore persistence or live Supabase behavior. Physical device acceptance remains required; this environment has no usable hardware-accelerated Android emulator.

The Quiz Show visuals and interactions are original; no television branding, artwork or sound assets are bundled. Earlier design references remain in [game-design sources](../docs/GAME-INSPIRATION.md) and [onboarding inspiration](../docs/ONBOARDING-INSPIRATION.md).

---

The following notes describe earlier releases; their permission and backup behavior are historical.

# Labwise 6.0.0 — Frenzy, private Duels and optional account sync

[Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 6.0.0 APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-6.0.0.apk)

- **Three ways to Play:** choose one or several subjects for a five-question **Lab Sprint**, **Solo Frenzy**, or a private **Friend Duel**. Source scopes and question-availability counts apply to each setup. Sprint feedback, recovery questions, XP, cosmetic upgrades and daily quests remain available.
- **Solo Frenzy:** up to 10 or 20 questions, **30 seconds each**, **three hearts** and 100 points per correct answer. Wrong answers and timeouts cost a heart. Explanations are untimed; the question deadline continues when leaving the app, and the last explanation remains available at the end.
- **Private Friend Duels:** two signed-in accounts share an invitation and the **same ordered 10- or 20-question set**. The server selects questions and grades answers. Players proceed independently, with persistent thirty-second question deadlines, three hearts, untimed feedback and explicit Next. Reopening does not reset the clock. Only the two members see their scores; equal final scores are a draw.
- **Optional account sync:** merge saved questions, review counts/history, preferences, reading pages, XP and content-free completed-game summaries across devices. Offline changes wait for a connection. Active local sessions and solo rounds stay on their current device during sync. Signing out keeps a local progress copy.
- **Version 4 backups:** exports retain study and local game state, including active solo rounds; restores accept versions **1–4**. Signed-out restore previews a local replacement with Undo. Signed-in restore previews a merge into the account, which syncs without replacement Undo. Auth sessions and private Duel data never enter progress backups.
- **Getting started at your pace:** a six-step tour with Back, Next and Skip, available again from Study settings. Subtle 140 ms arrival effects respect reduced-motion preferences.

## Closed-pilot account status

The bundle's public Supabase configuration is enabled for confirmed pilot accounts. The owner reports successful SQL setup and a confirmed account. Its email redirect remains empty, so public signup and password-reset controls are hidden. The callback files are prepared but **not deployed or verified**. Hosted email flows must be configured and accepted before general use; see [Supabase setup and owner acceptance](../docs/SUPABASE-SETUP.md).

Live sign-in, email delivery, two-device sync and a live two-account Duel have not been verified here. Local account/callback tests use mocked service responses, and database tests use disposable local PostgreSQL.

## Unchanged study coverage

**3,760 active questions and teaching notes; 15,046 individually explained choices.** Success contributes 1,484 questions / 5,942 options; BOC 7e contributes 2,276 / 9,104. All three original PDFs remain bundled unchanged: **434 + 333 + 333 = 1,100 pages**, with document-aware question/rationale links, searchable page text and per-document reading positions. Version 6.0.0 changes no question content or source PDFs.

The inventory preserves 3,953 extracted questions; 193 BOC questions remain excluded at the user's request. The supplied BOC Part 1 lacks printed pages 225–240, so chapter 3 questions 154–246 (93 stems) remain absent. See [content coverage](../docs/CONTENT-COVERAGE.md). Duels use the matching metadata registry for **2,993 eligible short questions**; the full active collection remains available in Practice. The APK build rejects a registry digest that differs from the exact assembled bank bytes. Content releases require regenerated metadata and an owner-applied matching server seed.

## Install, network access and privacy

Requires Android 8.0+ and an up-to-date Android System WebView. Package `com.labwise.study`, version code **60000**, target API **35**, using the same retained signing identity as earlier releases. **Export progress first, then install over the existing app without uninstalling.** The stable latest-APK link is unchanged. See [installation and build instructions](../docs/ANDROID.md).

Study, solo Play, PDFs and local progress work offline. Version 6 adds Android **Internet permission** for the configured Supabase project and allowlisted Auth/progress/challenge routes. External scripts and arbitrary WebView network requests remain blocked. Android account sessions use Keystore-backed encryption in private storage, separate from study progress and exports. Cloud progress excludes question text, choices, explanations, PDFs, imported banks, audio and transcripts.

Optional speech continues to use the external Android provider or supported browser recognition. Labwise requests **no microphone permission**, records no audio, sends no question text to the provider and requires explicit answer confirmation. The provider may need a connection or an offline language pack. Update downloads open the separate system browser.

## Validation

During integration, **19 unit-test files**, **seven existing browser/bridge checks**, and **three arcade scenarios with 19 checks** passed. [Version 6 validation evidence](../docs/VALIDATION-V6.md) records final release checks and limits. Native installation, upgrades, speech-provider behavior and Android device/emulator interaction remain unverified because usable hardware virtualization is unavailable here. Live owner acceptance remains separate from mocked account tests and local database checks.

Design references: [game-design sources](../docs/GAME-INSPIRATION.md) and [onboarding inspiration](../docs/ONBOARDING-INSPIRATION.md).

---

The following notes describe the previous release; its permission and backup behavior are historical.

# Labwise 5.0.0 — Lab Sprints and optional voice

[Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 5.0.0 APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-5.0.0.apk) · [SHA-256](Labwise-5.0.0.apk.sha256)

- **Play from every screen:** the header opens a source-scoped map of **14 subject rooms**. The existing seven desktop and five phone navigation destinations remain available.
- **Five-question Lab Sprints:** short eligible questions retain feedback, explanations of each choice, book rationales and memory checks. Longer and figure-dependent items remain in Practice. Up to **two recovery questions** revisit errors while keeping first-attempt scores separate.
- **Predictable rewards:** capped XP, cosmetic lab and room upgrades, and **three daily quests**. The optional answer clock pauses during feedback; reading explanations is untimed. Rewards do not establish subject mastery or predict exam performance.
- **Saved rounds and review:** game state and the active round save atomically with study progress. Game answers schedule due reviews and contribute to global daily effort and history without changing the MCQ correct counter.
- **Optional voice answers:** Android uses an external `RecognizerIntent` provider; supported browsers use `SpeechRecognition`. First-use information, an editable transcript, conservative option matching and explicit confirmation keep the learner in control. Speech does not auto-submit. Free recall is self-rated after reveal, and tapping or typing remains available.
- **Portable progress:** version 3 exports include study and game progress together. Restore previews and Undo remain available; version 1, 2 and 3 exports are accepted. Export custom banks separately.

## Unchanged study coverage

**3,760 active questions and teaching notes; 15,046 individually explained choices.** Success contributes 1,484 questions / 5,942 options; BOC 7e contributes 2,276 / 9,104. All three original PDFs remain bundled unchanged: **434 + 333 + 333 = 1,100 pages**, with document-aware links, searchable page text and selected reading pages per document. Version 5.0.0 changes no question content.

The inventory preserves 3,953 extracted questions; 193 BOC questions remain excluded at the user's request. The supplied BOC Part 1 lacks printed pages 225–240, so chapter 3 questions 154–246 (93 stems) remain absent. See [content coverage](../docs/CONTENT-COVERAGE.md) for source accounting and the existing editorial-review scope.

## Install and offline use

Requires Android 8.0+ and an up-to-date Android System WebView. Package `com.labwise.study`, version code **50000**, target API **35**, signed with the same retained certificate as 3.1.0 and 4.0.0. **Export progress first, then install over the existing app without uninstalling.** The stable latest-APK link is unchanged. See [installation instructions](../docs/ANDROID.md).

Study, Play, PDFs and saved progress work offline. Optional speech depends on a device or browser provider that may need Internet access or an offline language pack. Labwise never records or stores audio and does not send question text to the provider. The Android app adds no microphone or Internet permission; the external provider handles audio. Update downloads open the system browser.

## Validation

The game engine's **16 automated tests** and **18 mocked voice/controller tests** passed, and native Java compilation succeeded. [Version 5 validation evidence](../docs/VALIDATION-V5.md) records release check results and their scope. Speech tests use mocked providers; actual recognition accuracy, Android installation, upgrades and native behavior on a device or emulator remain unverified because usable hardware virtualization is unavailable here.

[Game-design sources](../docs/GAME-INSPIRATION.md) document the ideas behind bounded activities, feedback, recall and cosmetic progress. No external game code, artwork or question content was copied.

Previous notes: [4.0.0](4.0.0-RELEASE-NOTES.md) · [3.1.0](3.1.0-RELEASE-NOTES.md) · [3.0.0](3.0.0-RELEASE-NOTES.md).
