# Labwise browser app and device testing

The browser app shares the APK's reviewed data and learning code. Its separate device-test page helps a learner try those features on an actual phone, tablet or computer. There is no subscription or external AI service needed for local study.

## HTTPS hosting

The prepared GitHub Pages addresses are:

- App: `https://sola425.github.io/ascpi/`
- Device checks: `https://sola425.github.io/ascpi/web-test.html`

The repository owner must enable Pages before these can be treated as live links:

1. Open [repository Settings → Pages](https://github.com/sola425/ascpi/settings/pages).
2. Under Build and deployment, select **Source → GitHub Actions**.
3. Open [Publish Labwise web app](https://github.com/sola425/ascpi/actions/workflows/web-app.yml), choose **Run workflow** on main, and wait for build/deploy to finish.
4. Open the HTTPS app and device-check links. Future relevant pushes to main build and deploy automatically. If GitHub asks an owner to approve the `github-pages` environment, its deployment page explains that repository-specific requirement.

The workflow uses GitHub's standard Pages actions and its repository-scoped token. It does not require a new hosting password or paid account. The default workflow token cannot turn Pages on for a repository that has never enabled it; the one-time setting is an owner action. HTTPS is needed for service workers and microphone access away from localhost.

The build copies only the runtime app files, reviewed data, mapped pictures, the three source PDFs and the device-test page. It excludes APK archives, signing material, Git history, extraction files and backend setup SQL. Source books and their reuse rights remain the owner's responsibility, as with the existing APK/repository content.

## Local build and test

```sh
npm run build:web
python3 -m http.server 3001 --bind 127.0.0.1 --directory .web-build
```

Open `http://127.0.0.1:3001/ascpi/` or `http://127.0.0.1:3001/ascpi/web-test.html` on that computer. In a second terminal, run `npm run test:web` for the packaged-site browser check. It requires Playwright and Chromium, like the existing browser tests; `CHROMIUM_PATH` selects another local Chromium executable. Loopback URLs on a computer are not remotely accessible phone links.

`scripts/build_web.py` reuses the Android build's runtime-file lists and image/quiz-registry guards. It verifies complete teaching coverage, source hashes, picture associations, every copied byte and the service worker's file references. Output is `.web-build/ascpi/` and is ignored by Git. The first packaged build contains 213 runtime files before build metadata and `.nojekyll`, about 82 MB including the PDFs. No new question content or backend migration is introduced.

## Device checks

The page checks HTTPS, a temporary local-storage write/read, active service-worker status, 45 essential cached study files, all mapped picture paths and individually cached PDFs. Preparing offline study installs the actual app service worker and retries missing files, reporting incomplete caches rather than claiming success. Saving the PDFs is a separate explicit download of about 66 MB.

The reading sample uses the existing browser speech adapter. The listening sample starts only after a user action. Stop, backgrounding and navigation cancel speech/listening. Sample words are temporary and excluded from progress and diagnostic exports. A speech API being present does not prove that sound was heard, that recognition is accurate or that it works offline. The exported report deliberately does not claim live-account or real-device speech acceptance.

The checklist guides the learner through the actual app: question/choice/rationale tabs, pictures and zoom, Quiz Show confirmation and explain-back, Sprint, Frenzy, offline reload, two-device sync, private Duels and backups. Checklist ticks are the learner's observations, not automated results.

## Offline and account behavior

After successful caching, questions, teaching, pictures, solo games and local progress work offline. PDFs must be saved first. Installed local voices may work offline; online voices and browser speech recognition often need a connection. Taps and typed answers remain available. The answer key and authored teaching provide feedback offline; a GPT model is not bundled.

Account sync and Duels require Internet. The same confirmed-account Supabase pilot configuration is included. Public signup and password-reset controls remain hidden while the configured email redirect is empty. Hosting the prepared callback files does not enable email delivery automatically. Browser and APK data are separate; use optional sync or export/restore to transfer progress. Do not uninstall the APK to try the browser app.

## Executed validation — 10 November 2026

- All **27 unit test files pass**, including shared voice, native contracts and updated service-worker tests.
- **11 packaged-web check groups pass** at `/ascpi/` using an actual browser/service worker: first cache installation, all 155 pictures, detection/repair of a removed picture and module, three saved PDFs, offline reload and PDF byte ranges, offline question/image/rationale/progress, offline Frenzy, browser speech-adapter samples and the complete Quiz Show voice/confirmation/rationale/teach-back/Next loop.
- The device-test page passes 320×568, 768×1024 and 1024×768 layouts and a dark phone layout, with no horizontal overflow or controls shorter than 44 pixels. No page errors or external requests were observed.
- Sample-transcript privacy and the content-free report are verified. Speech providers are mocked for these checks; no real microphone or voice quality is established.

The workspace's configured outbound policy denies `api.github.com`, `sola425.github.io` and the live Supabase host. The local results therefore do not establish a live Pages deployment, live sign-in or two physical devices. An exact-host access proposal is saved for environment-settings review/publication, preserving the prior draft. The owner can perform the one-time Pages step in their ordinary browser. Android installation, upgrades, actual speech and native PDF behavior still require physical-device acceptance.

The [first GitHub workflow run](https://github.com/sola425/ascpi/actions/runs/42905698802) confirms that the remote build and shared checks succeed and a Pages artifact is uploaded. Its deployment step fails with `Get Pages site failed` / `Not Found`: GitHub reports that Pages must be enabled and configured to build using GitHub Actions. The website is therefore **prepared but not live** until the owner completes the one-time hosting step above. No hosting password or private token is needed in chat.
