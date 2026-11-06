# Android build and installation

## Install the APK

1. Download `Labwise-3.1.0.apk` to your Android phone.
2. Open it from your Downloads app. If Android asks, allow that app to install this downloaded APK.
3. Choose Install, then open Labwise.

Requires Android 8.0 (API 26) or newer and an up-to-date Android System WebView. The complete textbook and all 1,484 separate teaching notes are bundled; no login, server, Internet connection, or storage permission is required. Open My textbook to use the native PDF reader; it supports page jumps, previous/next, zoom buttons, and pinch zoom. Search for page text in the study interface.

Progress is private to the app's storage. Use My progress → Export progress before uninstalling or clearing app data. The Android document picker saves and restores JSON files in a location you choose. Export custom question banks separately. A browser version's data is not automatically shared with the Android app; export from the browser, then restore in Android.

## Rebuild

The current environment has verified tools installed. To reproduce from scratch:

```sh
python3 scripts/install_android_tools.py
python3 scripts/build_apk.py
```

Java 21 (including the `jdk.compiler` module) and Python 3 are required. The build uses the official Android platform 35 and build tools 35.0.0. The install script records the official metadata source and expected checksums. No Gradle, npm dependencies, remote API keys, or server-side services are required.

Output: `releases/Labwise-3.1.0.apk` and `releases/Labwise-3.1.0.apk.sha256`. Build intermediates in `android/build/` are ignored. Build verification checks signatures, alignment, application metadata, ZIP integrity, embedded PDF bytes, and dataset counts. The build first requires complete teaching for all 1,484 questions and all 5,942 options.

## Signing and updates

A release key was generated for this project in `/workspace/.labwise-signing`, outside the repository, with owner-only filesystem permissions. Its password is not printed or embedded in code, APKs, documentation, or project archives. Retain that directory securely to sign future updates with the same identity. Do not replace an existing key when rebuilding. `LABWISE_SIGNING_DIR` and `LABWISE_ANDROID_TOOLS` can point to other retained locations.

Public signing-certificate SHA-256 fingerprint:

```
bca20db3b7816e0155660db761c4dbd1dd74e57e3f2ab6b6dbc1ace6027c4158
```

This is a locally signed release for direct installation. It has not been submitted to Google Play or signed by Google Play App Signing.

## Architecture

A native Android Activity hosts the shared interface at an intercepted HTTPS asset origin. Requests are served only from packaged assets; external navigation is blocked and the app has no Internet permission. File URLs and universal file access are disabled. Source links open a native `PdfRenderer` Activity backed by the bundled textbook. The JavaScript interface exposes only version information, opening the bundled PDF, and saving a size-limited JSON export through Android's document picker. It cannot execute commands or open arbitrary filesystem paths.

## Validation boundary

Compilation, signatures, alignment, asset inclusion, JavaScript study flows, and bridge call routing passed local checks. This cloud machine lacks the hardware virtualization required by the official emulator, so installation and execution on an Android device remain unverified. See `docs/VALIDATION.md` for evidence.

Version 3.1.0 uses the same app ID and signing certificate as 3.0.0, with a higher version code, so it is packaged as an in-place update rather than a separate app. Physical-device upgrade behavior remains unverified.
