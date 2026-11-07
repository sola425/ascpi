# Android installation and build — 5.0.0

## Install or update

1. If Labwise is already installed, open **Progress → Export progress** and save a backup. Export any custom question bank separately.
2. [Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) on your phone. The fixed release is [Labwise-5.0.0.apk](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-5.0.0.apk), with a [SHA-256 checksum](../releases/Labwise-5.0.0.apk.sha256).
3. Open the APK from Downloads. If Android asks, allow the browser or file manager to install this downloaded app.
4. Choose **Install** or **Update**, then open Labwise. **Install over the existing app without uninstalling** to retain its on-device data.

Requires Android 8.0 (API 26) or newer and an up-to-date Android System WebView. The package is `com.labwise.study`, version name `5.0.0`, version code `50000`, target API `35`. It retains the signing identity used by 3.1.0 and 4.0.0 and uses a higher version code for an in-place update.

The APK bundles the unchanged 3,760 active questions, 15,046 individual option explanations, and all three original PDFs (434 + 333 + 333 pages). **Library** and source-question/rationale links open the appropriate native PDF reader, with page jumps, previous/next, zoom buttons, and pinch zoom. Selected reading pages are stored per document. No login, network connection, or shared-storage permission is required for study or Play.

**Progress → Export progress / Restore progress** uses Android's document picker. Version 3 progress exports include the full game state and active round together with study progress; restores also accept version 1 and 2 exports. Restores show a preview before replacing progress and provide Undo afterward. Browser and Android data are separate; export from one and restore in the other to move progress. Uninstalling or clearing app data removes local progress. **Settings → Get latest APK** launches the system browser at the stable download URL; Android still asks you to install the downloaded update.

## Play and optional voice

The header's **Play** button opens a source-scoped map of 14 subject rooms from every screen. Five-question Sprints use eligible short items, with feedback, memory checks and up to two recovery questions. First-attempt results remain separate from recovery; XP, cosmetic upgrades, three daily quests and the active round are saved with progress. The optional clock pauses during feedback. Longer and figure-dependent questions remain in Practice. See [game-design sources](GAME-INSPIRATION.md).

Android voice answers launch an external provider through `RecognizerIntent`. Labwise explains this before first use, returns an editable transcript, uses conservative option matching and requires explicit confirmation. Free recall is self-rated after reveal. Tapping answers and typing remain available when speech is unavailable or unsuitable.

The external provider handles microphone audio and may require Internet access or an offline language pack. Labwise never records or stores audio and does not send question text to the provider. **No microphone or Internet permission is added to Labwise.** Provider availability, recognition accuracy, cancellation and return behavior have not been tested on a real Android device or emulator here.

## Rebuild

With Python 3 and Java 21, including `jdk.compiler`:

```sh
python3 scripts/install_android_tools.py
python3 scripts/build_apk.py
```

The installer fetches official Android platform 35 and build tools 35.0.0, checking their recorded metadata and checksums. No Gradle, npm dependencies, API keys, or server-side service is required. Existing tools can be selected with `LABWISE_ANDROID_TOOLS` (default `/workspace/android-tools`).

The build assembles the source registry, then requires complete teaching for **all 3,760 active questions and 15,046 options**. It verifies signing, alignment, package metadata, ZIP integrity, all three embedded PDF files against their source bytes, and packaged dataset/page counts. Outputs are:

- `releases/Labwise-5.0.0.apk` and `.apk.sha256`.
- `releases/Labwise-latest.apk` and `.apk.sha256`, copied from the same verified build.

Build intermediates in `android/build/` are ignored.

## Retained signing key

The release key is retained outside the repository in `/workspace/.labwise-signing`, with owner-only permissions. Keep that directory securely for future updates, or set `LABWISE_SIGNING_DIR` to its retained location. **Do not regenerate the key for an update.** The build refuses to generate a replacement when existing release APKs are present. Keys and passwords are excluded from repository downloads.

Public signing-certificate SHA-256 fingerprint, unchanged from 3.1.0:

```text
bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158
```

This is a directly installed release, outside Google Play App Signing.

## Architecture and validation

A native Activity serves the shared JavaScript interface from packaged assets at an intercepted HTTPS origin. Internet permission, file URLs, and universal file access are disabled. Source links accept only the three bundled document IDs and open a `PdfRenderer` Activity. The native bridge exposes app version, bundled-document opening, the fixed update-download URL, size-limited JSON exports through the document picker, and optional external speech recognition. Speech uses the provider's Activity rather than recording audio inside Labwise. The update button opens a separate system browser.

[Version 5 validation evidence](VALIDATION-V5.md) records actual compilation, signing, asset, browser, game and bridge checks. Automated speech/controller checks use mocked providers and do not measure real recognition accuracy. Installation, upgrade, speech and native execution on an Android device or emulator remain unverified: this cloud machine has no usable KVM/hardware virtualization for the official emulator.
