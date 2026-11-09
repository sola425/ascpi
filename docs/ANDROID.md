# Android installation and build — 7.0.0

## Install or update

1. If Labwise is already installed, open **Progress → Export progress** and save a backup. Export any custom question bank separately.
2. [Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk). The fixed v7 release is [Labwise-7.0.0.apk](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-7.0.0.apk).
3. Open the APK from Downloads. If Android asks, allow that browser or file manager to install the downloaded app.
4. Choose **Install** or **Update**, then open Labwise. Install over the existing app, keeping its on-device data.

Requires **Android 8.0 (API 26) or newer** and an up-to-date Android System WebView. The package remains `com.labwise.study`, version name `7.0.0`, version code **70000**, target API **35**. It retains the signing identity used by earlier releases. Physical-device installation and upgrade behavior have not been exercised here.

The APK bundles **3,760 active questions**, **15,046 individual option explanations**, all three original PDFs (**434 + 333 + 333 pages**), and the mapped original figures. Library and source links open the native PDF reader with page jumps, previous/next, zoom buttons and pinch zoom. Successful reader page changes return to saved per-document positions. Local study and solo games do not require an account.

**Settings → Get latest APK** opens the separate system browser at the stable download URL. Android still asks you to install that downloaded update. Clearing app data or uninstalling removes local progress, so keep a backup even when account sync is enabled.

## Voice-hosted Quiz Show

Open **Play → Quiz Show**, choose one or several subjects and up to **5, 10 or 15 questions**, then choose **Start voice host**. The host reads the question and choices, listens to your answer and asks for an explicit spoken or tapped confirmation before scoring it. A round starts with **three hearts**, awards **100 points per correct answer**, and offers three once-per-round lifelines: **50/50**, **a clue**, and **one skip**. A wrong answer costs a heart; a skip keeps your hearts and opens the explanation. There is no question or explanation countdown.

After explaining an answer, the host may ask you to explain the idea in your own words. It reads the supplied model answer for comparison, then asks you to rate your recall. The prompts come from the teaching notes; there is no generative AI assessment of what you said. Say “repeat”, “next”, “why”, “explain choices”, “book rationale” or “pause” while listening. The **Pause voice** button works while the host speaks. Typed commands and manual answer controls remain available.

Quiz Show uses the best available installed device text-to-speech voice and a foreground in-app `SpeechRecognizer`. Voice and speed can be chosen in Voice settings. Microphone permission is requested only when listening starts. The initial start can then continue through speaking, answering and confirmation turns without repeated taps. Going into the background stops speech/listening; resuming voice is an explicit action. Commands are recognized during listening turns, with the pause button available at other times.

Some device voices use a network service and may send the text being read to their provider. Recognition may also need a connection or installed language data. Labwise saves no audio or transcript history. Voice quality depends on the installed engine and voice data. No paid premium voice provider is configured. See [voice-host details](VOICE-HOST.md).

Active Quiz Show rounds and their local summaries stay on that device, like unfinished Practice sessions. Answer and self-rated recall events enter normal study history and can sync. Picture questions are optional in Quiz Show and require looking at the screen; audio-only rounds omit figure-dependent items.

## Original PDF figures

The existing question, answer-choice and rationale layout is preserved. Verified original photographs, diagrams and charts from Success and BOC attach to the relevant question, cropped to the visual and its useful labels. Question text stays in the app's normal layout. Pictures retain their white paper background, show document/page references and can be enlarged. Figures marked rationale-only stay hidden until reveal, including in exam practice. Current verified coverage is recorded in [FIGURES.md](FIGURES.md).

Mappings check both the question ID and its source/content key, avoiding mismatched images when a custom bank reuses an ID. Original scans limit the available detail. The original PDFs remain available for reading and verification. See [figure coverage and extraction rules](FIGURES.md).

## Other games and orientation

- **Lab Sprint:** five short questions, explanations, memory checks and up to two recovery questions. First-attempt scores stay separate from recovery. XP, cosmetic upgrades and daily quests remain available.
- **Solo Frenzy:** up to 10 or 20 questions, **30 seconds per question**, **three hearts**, and 100 points per correct answer. Wrong answers and timeouts cost a heart. Feedback is untimed; leaving or reopening an unanswered question preserves its deadline. The final explanation remains available.
- **Friend Duels:** two signed-in accounts share a private invitation and the same ordered 10- or 20-question set. The server selects and grades questions and preserves each opened question's thirty-second deadline. Players advance independently; explanations are untimed and Next starts the next question. Three misses or the question limit end a player's round; equal final scores are a draw. Duels need a connection and the matching backend registry.

All modes offer subject selection within the selected source collection. Sprint, Frenzy and Duels use short self-contained questions. Longer cases remain in Practice. A six-step first-use tour supports Back, Next and Skip; reopen it from **Study settings → Getting started**. Brief arrival effects respect reduced motion.

## Account sync, tablet compatibility and diagnostics

Open **Study settings → Account sync → Open account** to sign in. Saved questions, review counts/history, preferences, reading pages, XP and content-free completed-game summaries merge with the account. Active local sessions stay on their device. Offline changes wait until synchronization can resume; signing out retains a local copy.

Version 7 fixes a reproduced compatibility failure: missing `Object.hasOwn` or `Array.at` in an older compatible WebView could stop account initialization before any sign-in request. A classic compatibility script now loads first. Relative session expiry is preferred when the service supplies it, avoiding refresh loops caused by a device-clock offset. This does not replace updating an obsolete Android System WebView.

Account errors now distinguish credentials, unconfirmed email, project configuration, connection failures, secure storage and backend setup. **Check connection** performs a read-only public Auth settings check and, when signed in, checks progress access. It does not create an account, send email or change the database.

The bundle remains a **closed pilot with confirmed accounts**. Public signup and password-reset controls stay hidden while the email redirect is empty. Callback files are prepared but not deployed or verified. Live Supabase testing is blocked by this development environment's outbound policy; a proposal allowing only the project's hostname awaits environment review/save/publication. The user's specific tablet failure remains unconfirmed on physical hardware. See [Supabase setup and owner acceptance](SUPABASE-SETUP.md) and [version 7 validation](VALIDATION-V7.md).

Android account sessions use **Android Keystore-backed encryption** in private storage. Session tokens are separate from progress and never included in sync documents or backups. The bundle contains only the public project URL/key. No service-role key or password belongs in app configuration.

## Backups and local session boundaries

**Progress → Export progress / Restore progress** uses Android's document picker. Version **4** exports include study history, saved questions, schedules, preferences, reading pages and Sprint/Frenzy state, including their active rounds; restores accept versions **1–4**. Restores show a preview. Signed-out restores replace local progress and offer Undo. Signed-in restores merge into the account and sync that merge, without replacement Undo. Export a separate copy first if needed.

The Quiz Show queue and local summaries are stored separately, like unfinished Practice and Flashcard sessions. Its recorded answer and recall events are included in normal progress. Complete custom banks, PDFs, authentication sessions and private Duel data are not part of a progress export. Browser and Android local storage are separate; exports can transfer study progress between them.

## Permissions and network access

The app declares **Internet** permission for optional account sync and Duels and **microphone** permission for foreground Quiz Show listening. The microphone is optional for installation and manual study. Permission is requested at listening time; it is not requested just by launching or reading the app. The older input-only voice controls retain their external `RecognizerIntent` provider flow.

The WebView permits only the configured HTTPS Supabase project and approved Auth/progress/challenge routes, including read-only account diagnostics. Other remote requests, remote navigation and external scripts remain blocked. The fixed update action opens a separate browser. Device TTS and recognition services handle their own provider connections. Study assets, figures and PDFs load from the package. No shared-storage permission is required.

## Rebuild

With Python 3, Node.js and Java 21 including `jdk.compiler`:

```sh
python3 scripts/install_android_tools.py
python3 scripts/build_apk.py
```

The installer uses official Android platform 35 and build tools 35.0.0, checking recorded metadata and checksums. No Gradle, npm packages or frontend SDK is required. Existing SDK tools can be selected with `LABWISE_ANDROID_TOOLS` (default `/workspace/android-tools`). Local study needs no server; account features need the owner-configured service.

The build requires complete teaching for all **3,760 active questions and 15,046 options**, verifies the declared figure assets and PDFs, and rejects quiz metadata whose digest differs from the exact assembled bank. Version 7 keeps the current registry digest and requires no SQL change. Future content changes require regenerated metadata and an owner-applied server seed:

```sh
node scripts/prepare_quiz_registry.mjs
node supabase/build-setup.mjs supabase/quiz-seed.sql
```

Figure regeneration is separate:

```sh
python3 scripts/prepare_figures.py
```

Follow [FIGURES.md](FIGURES.md) after changing PDFs or question/source metadata. Packaging does not apply SQL or change a remote project.

The build verifies signing, alignment, package metadata, ZIP integrity, declared asset/source bytes, embedded PDFs and the packaged bank digest. Outputs are:

- `releases/Labwise-7.0.0.apk` and `.apk.sha256`.
- `releases/Labwise-latest.apk` and `.apk.sha256`, copied from the same verified build.

Build intermediates in `android/build/` are ignored. Final compilation, signing and packaged-asset results are in [version 7 validation](VALIDATION-V7.md).

## Retained signing key and verification limits

The release key is retained outside the repository in `/workspace/.labwise-signing`, with owner-only permissions. Preserve it for future updates, or set `LABWISE_SIGNING_DIR` to its retained location. Do not regenerate it for an update. The build refuses a replacement when existing release APKs are present. Keys and passwords are excluded from repository downloads.

The public signing-certificate SHA-256 fingerprint is unchanged:

```text
bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158
```

This is a directly installed release outside Google Play App Signing. The app serves bundled JavaScript from an intercepted HTTPS origin, retains disabled file/universal file access, and opens only the three bundled source IDs in its native PDF reader.

SDK compilation, JVM policy/crypto checks and mocked browser speech tests establish their stated contracts. They do not establish actual device voice quality, microphone recognition, Keystore persistence, live Supabase access or two physical phones. This environment has no usable hardware-accelerated Android emulator. See [VALIDATION-V7.md](VALIDATION-V7.md) for executed checks and remaining owner/device acceptance.
