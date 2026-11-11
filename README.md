# Labwise

An offline clinical laboratory science study app for Android and the browser. **Labwise 7.3.0** adds a voice tutor throughout ordinary Practice, including long questions and shared cases. It reads the question and choices, confirms a spoken answer, explains the result and guides self-rated recall. The release also includes the page-by-page visual audit: **215 readable tables** and **386 questions with verified question visuals**, drawn from all **1,100 supplied PDF pages**. Study coverage stays at **3,760 active questions**, **15,046 individual option explanations**, and three original source PDFs. Local study and solo games work without an account or remote AI service; speech availability and network requirements depend on installed device services.

See [7.3.0 validation](docs/VALIDATION-V7.3.md), [voice study](docs/VOICE-HOST.md) and [the source-visual audit](docs/VISUAL-AUDIT.md). The audit was first prepared as a local 7.2.0 draft; its reviewed visuals are incorporated in 7.3.0.

## Download and install

[**Download the latest Android APK**](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 7.3.0](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-7.3.0.apk)

Requires **Android 8.0+** and an up-to-date Android System WebView. Open the downloaded APK from Downloads, allow that browser or file manager to install it if Android asks, then choose Install.

**Updating an existing installation:** first use **Progress → Export progress**, then install the new APK over the existing app **without uninstalling**. Version 7.3.0 keeps the same app ID and retained signing certificate, with version code **70300**. Settings → **Get latest APK** opens the stable download link; Android still asks you to install the downloaded file. See [Android installation and build details](docs/ANDROID.md).

## APK quality checks

Public web hosting is cancelled at the owner's request. Local automated screen tests remain useful because the APK bundles the same learning code. The release checks run the signed APK's extracted files at the Android app origin and verify study flows, pictures, games, backups and account entry. SDK/JVM checks cover native compilation and rules. Real Android speech, microphone permission, installation/upgrade and live two-device sync still need physical-device acceptance.

See the [APK quality and rollout checklist](docs/APK-QUALITY.md) for release gates, practical device checks and prioritized improvements.

## Study and read

- Choose **All sources**, **Success**, or **BOC 7e**, then filter by subject, search text, or study status.
- Start practice, exam, or flashcard sessions of **5, 10, 20, 50, or 100** items. An unfinished session stays saved until you resume it or explicitly replace it. Exam feedback appears at the end.
- Explore **Understand**, **Every choice**, and **Book rationale** tabs. Each active question has a plain-language restatement, answer reasoning, ordered explanations of every option, a memory hook, and a recall check; glossary definitions appear where relevant.
- Recall before revealing a flashcard, then rate Again / Hard / Good / Easy. Recall ratings and MCQ accuracy are tracked separately. Review due cards, forgotten cards, missed practice answers, or saved questions.
- Open question, rationale, and shared-context links in the correct source PDF. Search text across **1,100 PDF pages** and keep a reading position for each document. Android's native reader has page jumps, previous/next, zoom buttons and pinch zoom; pages reached in the reader return to saved progress.
- See the associated original photograph, diagram or chart beside relevant questions from Success and BOC, then enlarge it. The existing question, answer-choice and rationale layout stays in place; visuals are cropped to the picture and its useful labels. Figures marked rationale-only appear after reveal. Figure links check the question's source/content key so a custom bank cannot accidentally inherit a different question's picture. See [verified figure coverage and source mapping](docs/FIGURES.md).
- Pictures are lossless crops at the supplied PDF's raster density and fit without stretching. Actual size and explicit 2× enlargement are available. The roughly 72-DPI source scans cannot provide detail absent from the original; clearer microscopy needs higher-resolution originals or licensed photographs with reviewed questions. See the [image-content sourcing and review plan](docs/IMAGE-CONTENT-PLAN.md).
- Follow daily effort, activity history, and subject progress. Use dark mode, larger reading text and responsive navigation.
- Preview progress restores and custom-bank imports before applying them. Custom banks use IndexedDB where available and preserve progress for matching IDs.

The **six-step tour** advances only when you choose Next, supports Back and Skip, and can be reopened from **Study settings → Getting started**. Short 140 ms arrival effects respect the device's reduced-motion preference.

## Voice study throughout Practice

Open **Practice**, choose any question or start a session, then choose **Start voice tutor** near the top of the question or in its tutor panel. This uses the current Practice question without Quiz Show's short-question eligibility limit. The tutor reads the full displayed question, shared case and every choice. Long readings and explanations are split into provider-sized chunks of at most 2,400 characters; listening begins after the final chunk.

Say an answer or option letter, then confirm with “yes” or change it with “no”. Confirmation records a normal Practice answer. The tutor explains the selected answer, the correct answer when needed, the original rationale and the separate simplified teaching. It then asks you to explain what you learned, reads a supplied answer for comparison and lets you rate your recall. Say “next” when ready. Free explanations are self-rated, with no automatic assessment of their meaning.

Original question images and tables stay on screen. Pause is always available; opening a source or visual, leaving the screen or putting the app in the background pauses voice. Voice does not restart automatically after reload. Exam practice keeps deferred feedback and does not show this tutor. The older answer-only recognizer remains under **Use answer-only voice input** in ordinary Practice.

## Voice-hosted Quiz Show

Open **Play → Quiz Show**, choose subjects and up to **5, 10 or 15 questions**, then choose **Start voice host**. The device voice reads the question and options, listens to your choice, and asks for an explicit spoken or tapped confirmation before scoring it. Each round starts with **three hearts** and three once-per-round lifelines: **50/50**, **a clue**, and **one skip**. A correct answer earns 100 points; an incorrect answer costs a heart. Skipping keeps your hearts and opens the explanation. Questions and explanations have no countdown.

After every answer, the host states whether it matches the book key, explains the selected choice and the correct choice when needed, and reads the original rationale separately from the simpler teaching. It then asks you to explain what you learned in your own words. Compare your response with the supplied model answer and rate your own recall. These are guided prompts from the teaching notes; free explanations are self-rated. Say “repeat”, “next”, “why”, “explain choices”, “book rationale” or “pause” while listening; the Pause button also works while the host speaks. Tapping and typing remain available.

Choose an installed device voice and speaking speed. Android uses foreground text-to-speech and in-app speech recognition; microphone permission is requested when listening starts. Voice pauses when the app goes into the background. Some device voices may send the text being read to their provider, and recognition may need a connection. Labwise saves no audio or transcript history. A paid premium voice provider is not included in this release. See [voice-host behavior, commands and privacy](docs/VOICE-HOST.md).

Active Quiz Show rounds and their local summaries stay on the device, like an unfinished Practice session. Answer and self-rated recall events still enter the normal study history and can sync with an account. Selecting picture questions keeps the screen part of the activity; audio-only rounds exclude figure-dependent items.

## Other games: Sprint, Frenzy and Friend Duels

Open **Play** from the header. Each mode lets you choose one or several subjects within the selected source collection; the setup shows how many eligible short questions are available. Sprint and Frenzy use the current collection of short self-contained questions. Duels use the verified published question collection and show mapped question visuals where present. Longer cases are available with voice study in Practice; Quiz Show can optionally include eligible picture questions.

- **Lab Sprint:** five questions, with explanations, memory checks and up to two recovery questions. First-attempt scores stay separate from recovery results. Saved rounds, predictable capped XP, cosmetic upgrades and daily quests remain available.
- **Solo Frenzy:** choose up to 10 or 20 questions and start with **three hearts**. Each question has **30 seconds**; a correct answer earns 100 points, and a wrong answer or timeout costs a heart. The round ends at its question limit or when all hearts are used. Feedback is untimed, and the final explanation stays available. Leaving an unanswered question does not pause its saved deadline.
- **Friend Duels:** two signed-in accounts share a private invitation code and the **same ordered set of 10 or 20 questions**. The server selects the questions and grades each answer. Players proceed independently, together or later within the invitation's lifetime. Each opened question has a persistent **30-second server deadline** and three-heart rules; explanations are untimed, and explicit Next starts the next question. Reopening a question does not reset its clock. Equal final scores produce a draw.

Duels show private scores for the two members, with no public player search or leaderboard. They need a connection and the matching backend registry. The original question text and teaching stay in the app. Server grading does not make a Duel a secure exam: the offline app already contains answers.

Game activity contributes to daily effort and review scheduling while keeping game results separate from practice accuracy. Active solo rounds stay on their current device during account sync; completed summaries and game progress can sync.

## Optional account sync

Open **Study settings → Account sync → Open account**. Sign in to merge your local progress with the account and keep saved questions, review counts and history, preferences, reading positions, XP and content-free completed-game summaries across devices. Study remains available while offline; pending progress retries when a connection returns. Signing out keeps a local progress copy. Question text, choices, explanations, PDFs, imported banks, audio and transcripts are excluded from cloud progress.

The current public configuration is enabled for a **closed pilot with confirmed accounts**. The owner reports successful SQL setup and a confirmed pilot account. Its email redirect is empty, so public signup and password-reset controls stay hidden. The callback files are prepared but have not been deployed or verified. See [Supabase setup and owner acceptance](docs/SUPABASE-SETUP.md) before enabling hosted email flows or inviting general users. Live sign-in, email delivery, two-device sync and a live two-account Duel have not been verified here.

Version 7 fixes a reproduced failure on older compatible WebViews: missing `Object.hasOwn` or `Array.at` could stop account initialization before a sign-in request. A classic compatibility script now loads before the app. New sessions use the service's relative expiry duration when available, avoiding a refresh loop caused by a device clock offset. Account errors distinguish credentials, confirmation, project configuration, connection, storage and backend setup; **Check connection** tests the public Auth settings and, when signed in, progress access. These fixes address verified code paths; the exact cause on the reported physical tablet is still unconfirmed. Live sign-in and physical two-device sync still require owner/device acceptance.

Android stores account sessions separately using Android Keystore-backed encryption. Authentication tokens and passwords are never included in progress sync or exported backups. The app bundles only the public project configuration; no privileged Supabase key or remote JavaScript SDK is required.

## Voice answers in other study modes

Android opens an external speech-recognition provider; supported browsers use `SpeechRecognition`. First use explains the provider, then recognized text can be edited and any matched option must be explicitly confirmed. Speech never submits an answer automatically. Free recall is self-rated after revealing the answer; tapping choices and typing remain available.

This input-only flow still uses the external Android provider and does not read question text aloud. The Practice tutor and Quiz Show use the in-app foreground recognizer and request microphone permission only when listening starts. Device voices and recognition can require a connection or installed language data. Actual voice quality, recognition accuracy and Android provider behavior have not been tested on a physical device here.

## Source accounting

| Collection | Active questions / teaching notes | Explained options | Original PDFs |
| --- | ---: | ---: | ---: |
| Success in Clinical Laboratory Science, 4th edition | 1,484 | 5,942 | 434 pages |
| BOC Study Guide, 7th edition | 2,276 | 9,104 | 333 + 333 pages |
| **Total** | **3,760** | **15,046** | **1,100 pages** |

Every active question has complete teaching. The original PDF bytes and answer positions are retained. The visual audit records reviewed source flags, plate-reference OCR repairs and two option-text repairs that remove captured table tails; see its [repair accounting](docs/VISUAL-AUDIT.md). The source inventory contains 3,953 extracted questions: 193 BOC questions remain excluded at the user's request. Another 93 BOC questions are absent because supplied Part 1 skips printed pages 225–240 (chapter 3, questions 154–246); their stems and choices have not been invented. See [content coverage and editorial review](docs/CONTENT-COVERAGE.md).

## Run and check locally

From the repository directory, with Python 3 and Node.js installed:

```sh
npm start
```

Open <http://127.0.0.1:3000> on the same machine. The server binds to loopback only. The frontend needs no package installation or bundler.

```sh
npm test
npm run check:content
npm run test:browser
npm run test:game
npm run test:arcade
npm run test:account
npm run test:callback
npm run test:android-bridge
npm run test:db
```

Browser checks require Playwright and Chromium; use `CHROMIUM_PATH` or `APP_URL` where supported for another browser binary or local port. Voice-host, compatibility and figure checks are in `tests/`; figure rebuild instructions are in [FIGURES.md](docs/FIGURES.md). Account/callback checks use mocked service responses, and database tests use disposable local PostgreSQL with no published ports. They do not create remote users or send email. See [version 7.3.0 validation evidence](docs/VALIDATION-V7.3.md) for final results and limits. Android device/emulator execution remains unverified because this cloud environment lacks usable hardware virtualization.

## Offline use and backups

The Android APK bundles all study data and all three PDFs. Study, solo Play and local progress work offline. Account sync and Friend Duels use the configured Supabase project when signed in; optional speech depends on its provider. The WebView allows only the configured project and approved account/progress/challenge routes. No shared-storage permission is required. **Get latest APK** opens the separate system browser.

In a browser, the app shell and study data are cached after the first successful load. In **Library**, choose **Keep this PDF offline** for each source you need; cached PDFs support byte-range requests. Service workers require HTTPS away from localhost. Browser storage can be cleared or evicted; account sync is optional, so keep exports as well.

A **version 4 progress backup** contains study history, saved questions, review dates, preferences, reading pages, and Sprint/Frenzy state including their active rounds. The Quiz Show queue and local summaries are stored separately on the device, like unfinished Practice and Flashcard sessions; its recorded answer and recall events are part of normal progress. Restores accept **versions 1–4**. While signed out, a restore previews a local replacement and offers **Undo**. While signed in, a restore previews a **merge into the account's progress** and syncs that merge; it does not offer replacement Undo. Export a separate copy first if needed. Authentication sessions and private Duel data are not part of a progress export. Export custom question banks separately; progress backups do not contain a complete question bank or PDFs. Saved active Sprint/Frenzy rounds retain their local question snapshots.

Export before clearing app data, uninstalling or changing devices, even when account sync is enabled. Browser-to-Android transfers can use a progress export and restore.

## Custom banks and maintained data

Import a JSON array or `{ "questions": [...] }`, up to 20,000 questions and under 25 MB. Each item needs a unique nonempty `id`, text `topic`, `question`, `source`, and `explanation`, two to six text `options`, and a zero-based `answer`. Optional `teaching` follows [teaching.js](teaching.js); source metadata supports `bookId`, `documentId`, `answerDocumentId`, `page`, `answerPage`, and shared context. See [questions.js](questions.js). Imports stay on the device and are previewed before replacing the active bank. Use distinct, stable IDs for distinct questions.

[data/catalog.json](data/catalog.json) defines the two collections and three documents; [data/teaching-coverage.json](data/teaching-coverage.json) records active coverage. Individually authored notes live in `data/teaching/` and `data/boc-teaching/`. Run `npm run check:content` after source or teaching changes. Raw extraction is candidate material: preserve reviewed repairs, shared context and stable IDs.

The build verifies the exact `data/study-bank.json` bytes using `quiz-meta.json.contentDigest`. Friend Duels separately use `duelContentDigest`, which identifies the existing hosted collection. The pinned [compatibility inventory](data/duel-registry-compat.json) proves that all 2,993 registered question stems, choices, grading fields and shared context are unchanged. The current solo-question eligibility count is 2,967; it is distinct from the hosted Duel count. Regenerate and verify metadata with:

```sh
node scripts/prepare_quiz_registry.mjs
node supabase/build-setup.mjs supabase/quiz-seed.sql
```

For 7.3.0, these commands preserve the published seed/setup bytes and require **no live SQL change**. The generator and APK build reject a changed registered question or altered compatibility proof. A future change to the registered content needs a deliberate backend migration rather than reusing the old hosted digest. Packaging never applies SQL. See [Supabase setup](docs/SUPABASE-SETUP.md).

## Build and design

`python3 scripts/build_apk.py` builds the signed APK and stable download copy after validating teaching, matching quiz metadata, packaged figures/assets and PDFs. See [Android build instructions](docs/ANDROID.md) for SDK setup and the retained signing key. The exact bank digest and hosted Duel digest are verified separately; the published Duel seed remains unchanged, so this release needs no SQL change. `--draft` builds a separate review APK without replacing the stable download.

The review scheduler uses explicit deterministic intervals: Again is 10 minutes, Hard is one day, and Good/Easy advance through one, three, seven and fourteen days. It does not implement FSRS or predict exam performance. [Project inspiration](docs/INSPIRATION.md), [game-design sources](docs/GAME-INSPIRATION.md), [onboarding inspiration](docs/ONBOARDING-INSPIRATION.md), [implementation decisions](docs/PLAN.md), and [release notes](releases/RELEASE-NOTES.md) describe the design and delivery. The public repository is [sola425/ascpi](https://github.com/sola425/ascpi), on `main`.
