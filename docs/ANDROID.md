# Android installation and build — 4.0.0

## Install or update

1. If Labwise is already installed, open **Progress → Export progress** and save a backup. Export any custom question bank separately.
2. [Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) on your phone. The fixed release is [Labwise-4.0.0.apk](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-4.0.0.apk), with a [SHA-256 checksum](../releases/Labwise-4.0.0.apk.sha256).
3. Open the APK from Downloads. If Android asks, allow the browser or file manager to install this downloaded app.
4. Choose **Install** or **Update**, then open Labwise. **Install over the existing app without uninstalling** to retain its on-device data.

Requires Android 8.0 (API 26) or newer and an up-to-date Android System WebView. The package is `com.labwise.study`, version name `4.0.0`, version code `40000`, target API `35`. It retains the 3.1.0 signing identity and uses a higher version code for an in-place update.

The APK bundles 3,760 active questions with complete teaching and all three original PDFs (434 + 333 + 333 pages). **Library** and source-question/rationale links open the appropriate native PDF reader, with page jumps, previous/next, zoom buttons, and pinch zoom. Selected reading pages are stored per document. No login, network connection, or shared-storage permission is required for study.

**Progress → Export progress / Restore progress** uses Android's document picker. Restores show a preview before replacing progress and provide Undo afterward. Browser and Android data are separate; export from one and restore in the other to move progress. Uninstalling or clearing app data removes local progress. **Settings → Get latest APK** launches the system browser at the stable download URL; Android still asks you to install the downloaded update.

## Rebuild

With Python 3 and Java 21, including `jdk.compiler`:

```sh
python3 scripts/install_android_tools.py
python3 scripts/build_apk.py
```

The installer fetches official Android platform 35 and build tools 35.0.0, checking their recorded metadata and checksums. No Gradle, npm dependencies, API keys, or server-side service is required. Existing tools can be selected with `LABWISE_ANDROID_TOOLS` (default `/workspace/android-tools`).

The build assembles the source registry, then requires complete teaching for **all 3,760 active questions and 15,046 options**. It verifies signing, alignment, package metadata, ZIP integrity, all three embedded PDF files against their source bytes, and packaged dataset/page counts. Outputs are:

- `releases/Labwise-4.0.0.apk` and `.apk.sha256`.
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

A native Activity serves the shared JavaScript interface from packaged assets at an intercepted HTTPS origin. Internet permission, file URLs, and universal file access are disabled. Source links accept only the three bundled document IDs and open a `PdfRenderer` Activity. The native bridge exposes app version, bundled-document opening, the fixed update-download URL, and size-limited JSON exports through the document picker. The update button opens a separate system browser.

[Validation evidence](VALIDATION.md) records compilation, signing, asset, browser, and bridge checks. Installation, upgrade, and native execution on an Android device or emulator remain unverified: this cloud machine has no usable KVM/hardware virtualization for the official emulator.
