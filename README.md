# Labwise

An offline clinical laboratory science study app for Android and the browser. Labwise 5.0.0 adds **Lab Sprints, a subject lab map, and optional voice answers** to the same **3,760 active questions**, **15,046 individual option explanations**, and three original source PDFs. Core study uses plain JavaScript, CSS, and static JSON; no accounts, analytics, API keys, or remote AI services are required. Optional speech uses a device or browser provider that may need Internet access.

## Download and install

[**Download the latest Android APK**](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 5.0.0](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-5.0.0.apk) · [SHA-256 checksum](releases/Labwise-5.0.0.apk.sha256)

Requires **Android 8.0+** and an up-to-date Android System WebView. Open the downloaded APK from Downloads, allow that browser or file manager to install it if Android asks, then choose Install.

**Updating from 4.0.0 or 3.1.0:** first use **Progress → Export progress**, then download and install the new APK over the existing app **without uninstalling**. Version 5.0.0 keeps the same app ID and signing certificate. Settings → **Get latest APK** opens the stable download link for future updates; Android still asks you to install the downloaded file. See [Android installation and build details](docs/ANDROID.md).

## Study and read

- Choose **All sources**, **Success**, or **BOC 7e**, then filter by subject, search text, or study status.
- Start practice, exam, or flashcard sessions of **5, 10, 20, 50, or 100** items. An unfinished session stays saved until you resume it or explicitly replace it. Exam feedback appears at the end.
- Explore **Understand**, **Every choice**, and **Book rationale** tabs. Each active question has a plain-language restatement, answer reasoning, ordered explanations of every option, a memory hook, and a recall check; glossary definitions appear where relevant.
- Recall before revealing a flashcard, then rate Again / Hard / Good / Easy. Card queues keep their place; recall ratings and MCQ accuracy are tracked separately. Review due cards, forgotten cards, missed practice answers, or saved questions.
- Open question, rationale, and shared-context links in the correct source PDF. Search text across **1,100 PDF pages** and retain a selected reading page for each document. Android has a native reader with page jumps, zoom buttons, and pinch zoom.
- Follow daily effort, activity history, and subject progress. Use dark mode, larger reading text, five navigation destinations on phones, and a compact navigation rail on tablets.
- Preview progress restores and custom-bank imports before applying them. A progress restore offers Undo; custom banks use IndexedDB where available and preserve progress for matching IDs.

## Play and voice

- Open **Play** from the header on every screen. The existing seven desktop navigation destinations and five phone destinations remain available.
- Explore a **14-room subject lab map** using the selected source scope. Start a **five-question Lab Sprint** from eligible short questions; longer and figure-dependent items remain available in Practice.
- Review short feedback, explanations of each choice, the book rationale, and memory checks. Up to **two recovery questions** revisit missed answers; first-attempt scores stay separate from recovery results.
- Earn predictable, capped XP, cosmetic lab and room upgrades, and **three daily quests**. An optional answer clock pauses during feedback so explanation reading is untimed. Cosmetics and XP do not predict exam performance or establish subject mastery.
- Resume a saved active round. Game answers schedule due reviews and contribute to daily effort and activity history while keeping their scores separate from the MCQ correct counter.

Voice is optional. Android opens an external speech-recognition provider; supported browsers use `SpeechRecognition`. First use explains the provider, then recognized text can be edited and any matched option must be explicitly confirmed. Speech never submits an answer automatically. Free recall is self-rated after revealing the answer; tapping choices and typing remain available.

A speech provider may need Internet access or an offline language pack. Labwise never records or stores audio and does not send question text to the provider. The Android app adds no microphone or Internet permission; the external provider handles audio. Actual recognition accuracy and behavior on an Android device or emulator have not been tested here.

## Source accounting

| Collection | Active questions / teaching notes | Explained options | Original PDFs |
| --- | ---: | ---: | ---: |
| Success in Clinical Laboratory Science, 4th edition | 1,484 | 5,942 | 434 pages |
| BOC Study Guide, 7th edition | 2,276 | 9,104 | 333 + 333 pages |
| **Total** | **3,760** | **15,046** | **1,100 pages** |

Every active question has complete teaching. Version 5.0.0 changes no question content or source PDFs. The source inventory contains 3,953 extracted questions: 193 BOC questions were excluded from study at the user's request. Another 93 BOC questions are absent because the supplied Part 1 skips printed pages 225–240 (chapter 3, questions 154–246); their stems and choices have not been invented. See [content coverage and editorial review](docs/CONTENT-COVERAGE.md) for the full accounting and known source limits.

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
npm run test:android-bridge
```

The unit suite includes game and mocked voice/controller tests. Browser checks require Playwright and Chromium; use `CHROMIUM_PATH` or `APP_URL` for another browser binary or local port. [Version 5 validation evidence](docs/VALIDATION-V5.md) records actual check results and limits. Android device/emulator execution remains unverified because this cloud environment lacks usable hardware virtualization.

## Offline use and backups

The Android APK bundles all app data and all three PDFs. Study, Play, and saved progress work offline and need no Internet or shared-storage permission. Optional speech depends on its provider. **Get latest APK** opens the system browser to download an update.

In a browser, the app shell and study data are cached after the first successful load. In **Library**, choose **Keep this PDF offline** for each source you need; cached PDFs support byte-range requests. Service workers require HTTPS away from localhost. Browser storage can be cleared or evicted and does not synchronize across devices.

Export progress before clearing app data, uninstalling, or moving to another device. A version 3 backup contains study history, saved questions, review dates, preferences, selected reading pages, and the complete game state, including any active round, saved together with progress. Restores accept version 1, 2, and 3 progress exports. Export custom question banks separately; progress backups contain neither bank contents nor PDFs. To move from browser to Android, export in the browser and restore in Android.

## Custom banks and maintained data

Import a JSON array or `{ "questions": [...] }`, up to 20,000 questions and under 25 MB. Each item needs a unique nonempty `id`, text `topic`, `question`, `source`, and `explanation`, two to six text `options`, and a zero-based `answer`. Optional `teaching` follows [teaching.js](teaching.js); source metadata supports `bookId`, `documentId`, `answerDocumentId`, `page`, `answerPage`, and shared context. See [questions.js](questions.js) for validation. Imports stay on the device and are previewed before replacing the active bank. Use distinct, stable IDs for distinct questions.

[data/catalog.json](data/catalog.json) defines the two collections and three documents; [data/teaching-coverage.json](data/teaching-coverage.json) records active coverage. Individually authored notes live in `data/teaching/` and `data/boc-teaching/`. Run `python3 scripts/assemble_sources.py` after changing source inventory or exclusions, then `npm run check:content` to assemble and validate teaching. Raw extraction is candidate material: preserve the reviewed repairs, shared context, and stable IDs when regenerating data.

## Build and design

`python3 scripts/build_apk.py` builds the signed APK and stable download copy after checking all active teaching and packaged PDF bytes. See [Android build instructions](docs/ANDROID.md) for SDK setup and the retained signing key.

The review scheduler uses explicit deterministic intervals: Again is 10 minutes, Hard is one day, and Good/Easy advance through one, three, seven, and fourteen days. It does not implement FSRS or predict exam performance. [Project inspiration](docs/INSPIRATION.md), [game-design sources](docs/GAME-INSPIRATION.md), [implementation decisions](docs/PLAN.md), and [release notes](releases/RELEASE-NOTES.md) describe the design and delivery. The public repository is [sola425/ascpi](https://github.com/sola425/ascpi), on `main`.
