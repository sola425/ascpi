# Labwise

An offline clinical laboratory science study app for Android and the browser. **Labwise 6.0.0** adds **Solo Frenzy, private Friend Duels, optional account sync, and a six-step getting-started tour**. Study coverage stays at **3,760 active questions**, **15,046 individual option explanations**, and three original source PDFs. Local study, Lab Sprints, Frenzy and progress exports work without an account or remote AI service.

## Download and install

[**Download the latest Android APK**](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 6.0.0](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-6.0.0.apk)

Requires **Android 8.0+** and an up-to-date Android System WebView. Open the downloaded APK from Downloads, allow that browser or file manager to install it if Android asks, then choose Install.

**Updating an existing installation:** first use **Progress → Export progress**, then install the new APK over the existing app **without uninstalling**. Version 6.0.0 keeps the same app ID and retained signing certificate, with version code **60000**. Settings → **Get latest APK** opens the stable download link; Android still asks you to install the downloaded file. See [Android installation and build details](docs/ANDROID.md).

## Study and read

- Choose **All sources**, **Success**, or **BOC 7e**, then filter by subject, search text, or study status.
- Start practice, exam, or flashcard sessions of **5, 10, 20, 50, or 100** items. An unfinished session stays saved until you resume it or explicitly replace it. Exam feedback appears at the end.
- Explore **Understand**, **Every choice**, and **Book rationale** tabs. Each active question has a plain-language restatement, answer reasoning, ordered explanations of every option, a memory hook, and a recall check; glossary definitions appear where relevant.
- Recall before revealing a flashcard, then rate Again / Hard / Good / Easy. Recall ratings and MCQ accuracy are tracked separately. Review due cards, forgotten cards, missed practice answers, or saved questions.
- Open question, rationale, and shared-context links in the correct source PDF. Search text across **1,100 PDF pages** and keep a reading position for each document. Android's native reader has page jumps, previous/next, zoom buttons and pinch zoom; pages reached in the reader return to saved progress.
- Follow daily effort, activity history, and subject progress. Use dark mode, larger reading text and responsive navigation.
- Preview progress restores and custom-bank imports before applying them. Custom banks use IndexedDB where available and preserve progress for matching IDs.

The **six-step tour** advances only when you choose Next, supports Back and Skip, and can be reopened from **Study settings → Getting started**. Short 140 ms arrival effects respect the device's reduced-motion preference.

## Play: Sprint, Frenzy and Friend Duels

Open **Play** from the header. Each mode lets you choose one or several subjects within the selected source collection; the setup shows how many eligible short questions are available. Longer and figure-dependent items remain in Practice.

- **Lab Sprint:** five questions, with explanations, memory checks and up to two recovery questions. First-attempt scores stay separate from recovery results. Saved rounds, predictable capped XP, cosmetic upgrades and daily quests remain available.
- **Solo Frenzy:** choose up to 10 or 20 questions and start with **three hearts**. Each question has **30 seconds**; a correct answer earns 100 points, and a wrong answer or timeout costs a heart. The round ends at its question limit or when all hearts are used. Feedback is untimed, and the final explanation stays available. Leaving an unanswered question does not pause its saved deadline.
- **Friend Duels:** two signed-in accounts share a private invitation code and the **same ordered set of 10 or 20 questions**. The server selects the questions and grades each answer. Players proceed independently, together or later within the invitation's lifetime. Each opened question has a persistent **30-second server deadline** and three-heart rules; explanations are untimed, and explicit Next starts the next question. Reopening a question does not reset its clock. Equal final scores produce a draw.

Duels show private scores for the two members, with no public player search or leaderboard. They need a connection and the matching backend registry. The original question text and teaching stay in the app. Server grading does not make a Duel a secure exam: the offline app already contains answers.

Game activity contributes to daily effort and review scheduling while keeping game results separate from practice accuracy. Active solo rounds stay on their current device during account sync; completed summaries and game progress can sync.

## Optional account sync

Open **Study settings → Account sync → Open account**. Sign in to merge your local progress with the account and keep saved questions, review counts and history, preferences, reading positions, XP and content-free completed-game summaries across devices. Study remains available while offline; pending progress retries when a connection returns. Signing out keeps a local progress copy. Question text, choices, explanations, PDFs, imported banks, audio and transcripts are excluded from cloud progress.

The current public configuration is enabled for a **closed pilot with confirmed accounts**. The owner reports successful SQL setup and a confirmed pilot account. Its email redirect is empty, so public signup and password-reset controls stay hidden. The callback files are prepared but have not been deployed or verified. See [Supabase setup and owner acceptance](docs/SUPABASE-SETUP.md) before enabling hosted email flows or inviting general users. Live sign-in, email delivery, two-device sync and a live two-account Duel have not been verified here.

Android stores account sessions separately using Android Keystore-backed encryption. Authentication tokens and passwords are never included in progress sync or exported backups. The app bundles only the public project configuration; no privileged Supabase key or remote JavaScript SDK is required.

## Optional voice

Android opens an external speech-recognition provider; supported browsers use `SpeechRecognition`. First use explains the provider, then recognized text can be edited and any matched option must be explicitly confirmed. Speech never submits an answer automatically. Free recall is self-rated after revealing the answer; tapping choices and typing remain available.

The provider may need Internet access or an offline language pack. Labwise never records or stores audio and does not send question text to the provider. Labwise requests **no microphone permission**. Version 6 adds Android Internet permission for the configured account service; speech continues to use the external provider. Actual recognition accuracy and Android provider behavior have not been tested on a device or emulator here.

## Source accounting

| Collection | Active questions / teaching notes | Explained options | Original PDFs |
| --- | ---: | ---: | ---: |
| Success in Clinical Laboratory Science, 4th edition | 1,484 | 5,942 | 434 pages |
| BOC Study Guide, 7th edition | 2,276 | 9,104 | 333 + 333 pages |
| **Total** | **3,760** | **15,046** | **1,100 pages** |

Every active question has complete teaching. Version 6.0.0 changes no question content or source PDFs. The source inventory contains 3,953 extracted questions: 193 BOC questions remain excluded at the user's request. Another 93 BOC questions are absent because supplied Part 1 skips printed pages 225–240 (chapter 3, questions 154–246); their stems and choices have not been invented. See [content coverage and editorial review](docs/CONTENT-COVERAGE.md).

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

Browser checks require Playwright and Chromium; use `CHROMIUM_PATH` or `APP_URL` where supported for another browser binary or local port. Account and callback browser checks use mocked service responses, and the database suite uses a disposable local PostgreSQL container with no published ports. They do not create remote users or send email. See [version 6 validation evidence](docs/VALIDATION-V6.md) for check results and limits. Android device/emulator execution remains unverified because this cloud environment lacks usable hardware virtualization.

## Offline use and backups

The Android APK bundles all study data and all three PDFs. Study, solo Play and local progress work offline. Account sync and Friend Duels use the configured Supabase project when signed in; optional speech depends on its provider. The WebView allows only the configured project and approved account/progress/challenge routes. No shared-storage permission is required. **Get latest APK** opens the separate system browser.

In a browser, the app shell and study data are cached after the first successful load. In **Library**, choose **Keep this PDF offline** for each source you need; cached PDFs support byte-range requests. Service workers require HTTPS away from localhost. Browser storage can be cleared or evicted; account sync is optional, so keep exports as well.

A **version 4 progress backup** contains study history, saved questions, review dates, preferences, reading pages and local game state, including active solo rounds. Restores accept **versions 1–4**. While signed out, a restore previews a local replacement and offers **Undo**. While signed in, a restore previews a **merge into the account's progress** and syncs that merge; it does not offer replacement Undo. Export a separate copy first if needed. Authentication sessions and private Duel data are not part of a progress export. Export custom question banks separately; progress backups do not contain a complete question bank or PDFs. Active rounds retain their local question snapshots.

Export before clearing app data, uninstalling or changing devices, even when account sync is enabled. Browser-to-Android transfers can use a progress export and restore.

## Custom banks and maintained data

Import a JSON array or `{ "questions": [...] }`, up to 20,000 questions and under 25 MB. Each item needs a unique nonempty `id`, text `topic`, `question`, `source`, and `explanation`, two to six text `options`, and a zero-based `answer`. Optional `teaching` follows [teaching.js](teaching.js); source metadata supports `bookId`, `documentId`, `answerDocumentId`, `page`, `answerPage`, and shared context. See [questions.js](questions.js). Imports stay on the device and are previewed before replacing the active bank. Use distinct, stable IDs for distinct questions.

[data/catalog.json](data/catalog.json) defines the two collections and three documents; [data/teaching-coverage.json](data/teaching-coverage.json) records active coverage. Individually authored notes live in `data/teaching/` and `data/boc-teaching/`. Run `npm run check:content` after source or teaching changes. Raw extraction is candidate material: preserve reviewed repairs, shared context and stable IDs.

Friend Duels require metadata matching the exact `data/study-bank.json` bytes. After a content change, regenerate the registry and combined SQL:

```sh
node scripts/prepare_quiz_registry.mjs
node supabase/build-setup.mjs supabase/quiz-seed.sql
```

The project owner must apply the updated registry seed/setup before releasing the changed collection. The APK build stops if `data/quiz-meta.json.contentDigest` does not match the assembled bank. It does not publish SQL. See [Supabase setup](docs/SUPABASE-SETUP.md).

## Build and design

`python3 scripts/build_apk.py` builds the signed APK and stable download copy after validating teaching, matching quiz metadata, packaged assets and PDFs. See [Android build instructions](docs/ANDROID.md) for SDK setup and the retained signing key.

The review scheduler uses explicit deterministic intervals: Again is 10 minutes, Hard is one day, and Good/Easy advance through one, three, seven and fourteen days. It does not implement FSRS or predict exam performance. [Project inspiration](docs/INSPIRATION.md), [game-design sources](docs/GAME-INSPIRATION.md), [onboarding inspiration](docs/ONBOARDING-INSPIRATION.md), [implementation decisions](docs/PLAN.md), and [release notes](releases/RELEASE-NOTES.md) describe the design and delivery. The public repository is [sola425/ascpi](https://github.com/sola425/ascpi), on `main`.
