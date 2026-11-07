# Labwise 5.0.0 — Lab Sprints and optional voice

[Download the latest APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-latest.apk) · [Version 5.0.0 APK](https://github.com/sola425/ascpi/raw/refs/heads/main/releases/Labwise-5.0.0.apk) · [SHA-256](Labwise-5.0.0.apk.sha256)

- **Play from every screen:** the header opens a source-scoped map of **14 subject rooms**. The existing seven desktop and five phone navigation destinations remain available.
- **Five-question Lab Sprints:** short eligible questions retain feedback, explanations of each choice, book rationales and memory checks. Longer and figure-dependent items remain in Practice. Up to **two recovery questions** revisit errors while keeping first-attempt scores separate.
- **Predictable rewards:** capped XP, cosmetic lab and room upgrades, and **three daily quests**. The optional answer clock pauses during feedback; reading explanations is untimed. Rewards do not establish subject mastery or predict exam performance.
- **Saved rounds and review:** game state and the active round save atomically with study progress. Game answers schedule due reviews and contribute to global daily effort and history without changing the MCQ correct counter.
- **Optional voice answers:** Android uses an external `RecognizerIntent` provider; supported browsers use `SpeechRecognition`. First-use information, an editable transcript, conservative option matching and explicit confirmation keep the learner in control. Speech does not auto-submit. Free recall is self-rated after reveal, and tapping or typing remains available.
- **Portable progress:** version 3 exports include study and game progress together. Restore previews and Undo remain available; version 1, 2 and 3 exports are accepted. Export custom banks separately.

## Unchanged study coverage

**3,760 active questions and teaching notes; 15,046 individually explained choices.** Success contributes 1,484 questions / 5,942 options; BOC 7e contributes 2,276 / 9,104. All three original PDFs remain bundled unchanged: **434 + 333 + 333 = 1,100 pages**, with document-aware links, searchable page text and selected reading pages per document. Version 5.0.0 changes no question content.

The inventory preserves 3,953 extracted questions; 193 BOC questions remain excluded at the user's request. The supplied BOC Part 1 lacks printed pages 225–240, so chapter 3 questions 154–246 (93 stems) remain absent. See [content coverage](../docs/CONTENT-COVERAGE.md) for source accounting and the existing editorial-review scope.

## Install and offline use

Requires Android 8.0+ and an up-to-date Android System WebView. Package `com.labwise.study`, version code **50000**, target API **35**, signed with the same retained certificate as 3.1.0 and 4.0.0. **Export progress first, then install over the existing app without uninstalling.** The stable latest-APK link is unchanged. See [installation instructions](../docs/ANDROID.md).

Study, Play, PDFs and saved progress work offline. Optional speech depends on a device or browser provider that may need Internet access or an offline language pack. Labwise never records or stores audio and does not send question text to the provider. The Android app adds no microphone or Internet permission; the external provider handles audio. Update downloads open the system browser.

## Validation

The game engine's **16 automated tests** and **18 mocked voice/controller tests** passed, and native Java compilation succeeded. [Version 5 validation evidence](../docs/VALIDATION-V5.md) records release check results and their scope. Speech tests use mocked providers; actual recognition accuracy, Android installation, upgrades and native behavior on a device or emulator remain unverified because usable hardware virtualization is unavailable here.

[Game-design sources](../docs/GAME-INSPIRATION.md) document the ideas behind bounded activities, feedback, recall and cosmetic progress. No external game code, artwork or question content was copied.

Previous notes: [4.0.0](4.0.0-RELEASE-NOTES.md) · [3.1.0](3.1.0-RELEASE-NOTES.md) · [3.0.0](3.0.0-RELEASE-NOTES.md).
