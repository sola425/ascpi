# Android installation and build — 6.0.0

## Install or update

1. If Labwise is already installed, open **Progress → Export progress** and save a backup. Export any custom question bank separately.
2. [Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk). The fixed v6 release is [Labwise-6.0.0.apk](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-6.0.0.apk).
3. Open the APK from Downloads. If Android asks, allow the browser or file manager to install this downloaded app.
4. Choose **Install** or **Update**, then open Labwise. **Install over the existing app without uninstalling** to retain its on-device data.

Requires Android 8.0 (API 26) or newer and an up-to-date Android System WebView. The package remains `com.labwise.study`, version name `6.0.0`, version code `60000`, target API `35`. It retains the signing identity used by earlier releases and uses a higher version code for an in-place update. Device installation and upgrade behavior have not been exercised in this environment.

The APK bundles the unchanged **3,760 active questions**, **15,046 individual option explanations**, and all three original PDFs (**434 + 333 + 333 pages**). Library and question/rationale links open the appropriate native PDF reader, with page jumps, previous/next, zoom buttons and pinch zoom. Successful page changes in the reader return to the app's per-document reading positions. Local study, Lab Sprints and Frenzy work without an account or connection.

**Settings → Get latest APK** launches the system browser at the stable download URL. Android still asks you to install the downloaded update. Uninstalling or clearing app data removes local progress, so keep a backup even when account sync is enabled.

## Play and the getting-started tour

The header's **Play** button opens **Lab Sprint**, **Solo Frenzy** and **Friend Duels**. All three offer selection of one or several subjects within the selected source collection. Longer and figure-dependent questions remain in Practice.

- **Sprint:** five questions with explanations, memory checks, and up to two recovery questions. First-attempt scores stay separate from recovery. XP, cosmetic upgrades, daily quests and active rounds remain saved with progress.
- **Frenzy:** up to 10 or 20 questions, **30 seconds per question**, **three hearts**, and 100 points per correct answer. A wrong answer or timeout costs a heart. Feedback is untimed; leaving or reopening an unanswered question keeps its existing deadline. The final explanation stays available after a round ends.
- **Duels:** two signed-in accounts share a private invitation and the same ordered set of 10 or 20 questions. The server selects and grades the questions, stores each player's answers, and preserves each opened question's 30-second deadline. Players advance independently; explanations are untimed and Next starts the following question. Three misses or the question limit end a player's round, and equal final scores are a draw. Duels require a connection and the matching backend registry.

A six-step first-use tour supports Back, Next and Skip, with no automatic advance. Reopen it from **Study settings → Getting started**. Short 140 ms arrival effects are disabled by the reduced-motion preference.

## Optional account sync and progress backups

Open **Study settings → Account sync → Open account** to sign in. Saved questions, review counts/history, preferences, reading pages, XP and content-free completed-game summaries merge with the account. Active local study and solo-game rounds stay on their current device during sync. Offline changes remain local until synchronization can resume. Signing out retains a local progress copy.

The v6 bundle enables public configuration for a **closed pilot with confirmed accounts**. The owner reports successful SQL setup and a confirmed pilot account. The email redirect is empty, so signup and password-reset controls remain hidden. Callback HTML, JavaScript and CSS are prepared but have not been deployed or verified. See [Supabase setup and owner acceptance](SUPABASE-SETUP.md). Live sign-in, hosted email delivery, two-device synchronization and a live two-account Duel have not been verified here.

Android account sessions use **Android Keystore-backed encryption** in private app storage. Session tokens are separate from progress, never included in cloud progress or backups, and cleared on sign-out. The bundle contains only the public project URL/key. No service-role key or password belongs in app configuration.

**Progress → Export progress / Restore progress** uses Android's document picker. Version **4** exports include study progress and local game state, including active solo rounds; restores accept versions **1, 2, 3 and 4**. Restores show a preview. Signed-out restores replace local progress and offer **Undo**. Signed-in restores merge the backup into the account and sync that merge, without replacement Undo. Export a separate copy first if needed. Custom question-bank contents, PDFs, authentication sessions and private Duel data are not included. Browser and Android local storage are separate; exports can move progress between them.

## Network access and optional voice

Version 6 requests Android **Internet permission** for optional account sync and Duels. The WebView allows only the configured Supabase project and approved Auth/progress/challenge routes, using HTTPS. It blocks other remote requests, remote navigation and external scripts. The update button opens a separate system browser. Study assets and PDFs continue to load from the package; no shared-storage permission is requested.

Voice answers still launch an external provider through `RecognizerIntent`. Labwise explains this before first use, returns an editable transcript, uses conservative option matching and requires explicit confirmation. Speech does not submit an answer automatically. Free recall is self-rated after reveal, and tapping or typing remains available.

The provider handles microphone audio and may require Internet access or an offline language pack. Labwise requests **no microphone permission**, never records or stores audio, and does not send question text to the provider. Provider availability, recognition accuracy, cancellation and return behavior have not been tested on a real Android device or emulator here.

## Rebuild

With Python 3, Node.js and Java 21, including `jdk.compiler`:

```sh
python3 scripts/install_android_tools.py
python3 scripts/build_apk.py
```

The installer fetches official Android platform 35 and build tools 35.0.0, checking recorded metadata and checksums. No Gradle, npm packages or frontend SDK is required. Local study does not require a server; optional account features need the owner-configured service described in [Supabase setup](SUPABASE-SETUP.md). Existing SDK tools can be selected with `LABWISE_ANDROID_TOOLS` (default `/workspace/android-tools`).

The build assembles the source registry and requires complete teaching for all **3,760 active questions and 15,046 options**. Before copying assets, it compares `data/quiz-meta.json.contentDigest` with the SHA-256 of the exact assembled `data/study-bank.json` bytes. A mismatch stops the build. After a content change, regenerate metadata and combined SQL:

```sh
node scripts/prepare_quiz_registry.mjs
node supabase/build-setup.mjs supabase/quiz-seed.sql
```

The project owner must apply the updated registry seed/setup in Supabase **before releasing changed content**. Regeneration and APK packaging do not apply SQL or change a remote project. The current metadata covers **2,993 eligible short questions**; the rest of the study collection remains available in Practice.

The build verifies signing, alignment, package metadata, ZIP integrity, all declared web/data assets against their source bytes, all three embedded PDFs, dataset/page counts and the packaged bank digest. It retains the public sync configuration, local client modules, tour/account/arcade assets and prepared email-callback files. Outputs are:

- `releases/Labwise-6.0.0.apk` and `.apk.sha256`.
- `releases/Labwise-latest.apk` and `.apk.sha256`, copied from the same verified build.

Build intermediates in `android/build/` are ignored. Final release check results belong in [version 6 validation evidence](VALIDATION-V6.md).

## Retained signing key

The release key is retained outside the repository in `/workspace/.labwise-signing`, with owner-only permissions. Keep that directory securely for future updates, or set `LABWISE_SIGNING_DIR` to its retained location. **Do not regenerate the key for an update.** The build refuses to generate a replacement when existing release APKs are present. Keys and passwords are excluded from repository downloads.

Public signing-certificate SHA-256 fingerprint, unchanged from 3.1.0:

```text
bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158
```

This is a directly installed release, outside Google Play App Signing.

## Architecture and validation

A native Activity serves the shared JavaScript interface from packaged assets at an intercepted HTTPS origin. File URLs and universal file access remain disabled. Source links accept only the three bundled document IDs and open a `PdfRenderer` Activity. The native bridge provides app version, bundled-document opening, consumed reading-position updates, a fixed update URL, size-limited document-picker exports, external speech recognition and the separate encrypted account-session store. The project's public configuration determines the restricted network policy and CSP; JavaScript and styles are bundled locally.

The unit suite's **19 files**, **seven existing browser/bridge checks**, and the arcade suite's **three scenarios / 19 checks** passed during integration. Browser and callback account-service responses are mocked; database tests use disposable local PostgreSQL. These checks do not verify a live Supabase project, SMTP, two physical devices or Android speech accuracy. See [version 6 validation evidence](VALIDATION-V6.md) for final compilation, signing, packaged-asset and acceptance results and their limits.

Installation, upgrade and native interaction on an Android device or emulator remain unverified: this cloud machine has no usable KVM/hardware virtualization for the official emulator.
