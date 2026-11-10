# APK quality and rollout

Public web hosting is cancelled. Shared screen tests continue locally because the Android APK contains the same learning code. These tests are useful release checks; they do not substitute for running Android speech, installation and accounts on real devices.

## Maintenance fixes in 7.1.1

- **Recover from unresponsive question storage.** IndexedDB open and transaction operations each have an eight-second limit. Startup falls back to recoverable legacy data or the bundled collection with a visible warning. Existing stored data is not cleared. Late connections close, and timed-out pending transactions are aborted. This covers a formerly unbounded loading state.
- **Reclaim old PDF reader caches.** After a new bundled-document copy opens successfully, the native reader removes only older revision copies of that same document. Current copies, other documents, temporary files and unrelated files are retained. This avoids accumulating another source-PDF copy at every APK upgrade.
- **Useful sign-in failures.** A sign-in network failure or timeout asks for another attempt. It does not promise automatic account sync before authentication has succeeded. The account form recovers, keeps the email, clears the password and leaves local study available.
- **Accurate exit wording.** Closing no longer asserts that every change was saved when a storage warning could be present.

Question content, teaching, source PDFs, picture associations, cloud schema and quiz-registry digest are unchanged. The familiar question/options/rationale layout remains.

## Checks required for an APK release

1. Validate complete content/teaching, preserved source exclusions, source/PDF hashes, image associations and quiz-registry digest.
2. Run the unit/native checks and local study, teaching, backup, game, voice, picture, tablet-compatibility and failure-recovery screen checks.
3. Verify account/profile separation and private Duels using isolated simulated clients, then verify database constraints, grading/deadlines and concurrent updates against disposable local PostgreSQL.
4. Compile/sign with the retained release key, verify package/version/signatures/alignment, and compare every packaged runtime asset with source.
5. Test the extracted signed APK at its Android origin/CSP, including all three PDFs, a decoded picture, games, backups and account entry. Verify the published download hash against the tested artifact.

Executed evidence and limits for this release are in [VALIDATION-V7.1.1.md](VALIDATION-V7.1.1.md).

## Real-device acceptance before a wider launch

Use at least a phone and a tablet, including an older supported device. Keep a progress export before updating and install over the previous APK without uninstalling.

| Area | Practical check |
| --- | --- |
| Update and persistence | Confirm saved questions, reading pages, settings and unfinished rounds survive updating and a complete app restart. |
| Offline study | Start in airplane mode. Answer questions, review flashcards, view pictures, read all three PDFs and play solo games. |
| Interrupted sessions | Background and reopen Practice, Cards, Frenzy and Quiz Show. A running Frenzy question keeps its deadline; voice stays paused until explicitly resumed. |
| Microphone and voice | Test permission grant and denial, missing voice data, offline/local voices, headphones/Bluetooth, misheard choices, silence, Pause and a phone-call interruption. Manual answers must remain usable. |
| Accounts | Test wrong credentials, lost connectivity, successful confirmed-account sign-in and sign-out. Check that errors clear after a successful retry. |
| Two devices | Sign into one account on both devices. Study on each, disconnect/reconnect one, and verify that changes merge without losing saved questions or history. |
| Friend Duels | Use two separate accounts. Create/join a code, check matching questions, timers, three hearts, reconnect, final scores and a draw. |
| Export and restore | Save a backup through the Android document picker, cancel one save, and restore with the preview. Verify progress; export custom banks separately. |
| Display and content | Use large text, dark mode, portrait and landscape. Check controls, picture zoom and source links. Review whether each original picture contains enough detail for its question. |

The current package is still a confirmed-account pilot. A successful public Auth-health request alone is not a successful sign-in, two-device sync or Duel test.

## Improvements with the most practical value

1. **Finish public account recovery before opening sales.** Configure and verify account creation, email confirmation and password reset, then complete the live two-device checks. Hidden pilot-only signup controls are not a public onboarding flow.
2. **Run a small, staged Android beta.** Start with a small group across different Android versions, screen sizes and device speeds. Record failures by app version and device; fix repeat problems before expanding distribution. Automated passes cannot guarantee zero complaints.
3. **Add an opt-in in-app problem report.** Include app/device version, a help code and an optional question ID, with a preview before sharing. Exclude passwords, tokens, recordings and full question content. The owner can then reproduce a report instead of relying on a remembered error.
4. **Prioritize clear, verified visuals.** Obtain sharper matching originals where the supplied scans are inadequate. Add reviewed image/question pairs and post-answer visual explanations; do not silently substitute a similar-looking photograph that changes the answer.
5. **Strengthen recovery and comfort.** Offer gentle backup reminders, short optional sessions and an easy route back to an unfinished lesson. Measure cold startup, search and page/voice response on a slower real tablet before changing the UI for performance.

Account recovery, data retention and reliable core interactions should be established before adding more game complexity or public leaderboards.
