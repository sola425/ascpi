# Building a reliable image question bank

The goal is to identify and explain real visual findings while keeping Labwise's familiar question, choices and rationale layout. This is an editorial plan, not a claim that an external image collection has been licensed or imported.

## Three learning uses

| Use | Before answering | After answering |
| --- | --- | --- |
| Image identification | A correctly matched, neutral photograph or diagram, with the original question and choices | The answer, visual clues, why each alternative fits or fails, and the book rationale |
| Image-first original question | A licensed photograph with a new question written specifically for that photograph | A reviewed explanation of the visible finding and a memory check |
| Visual explanation | The existing question; an illustration only if it does not disclose the answer | A separately labelled concept illustration or annotated copy explaining the answer |

An explanatory image is not evidence for a book's image-identification question. A photograph of a similar cell, for example, must not silently replace the original photograph: it may change the correct answer. Annotations that identify a finding belong after answer reveal. Keep the original available beside the annotated copy.

## Why the supplied photographs look soft

The supplied PDFs contain rasterized pages at roughly 72 DPI. An example BOC photograph contains only about 208 × 151 original pixels. Rendering it at a larger size does not recover finer structure. Version 7.1 removes added export upscaling and lossy WebP recompression, uses source-density lossless crops, fits pictures without stretching and offers explicit native-size/2× viewing. It preserves existing source mappings and colors.

Sharper microscopy requires the exact higher-resolution source or a different licensed photograph with its own reviewed question. AI sharpening or a generated cell picture is not a substitute for missing diagnostic detail.

## Candidate image sources

These are places to investigate. Their current pages and image-specific licenses could not be checked from this workspace, so none is represented as cleared for redistribution.

| Source | Useful material | What to establish before including it |
| --- | --- | --- |
| [ASH Image Bank](https://imagebank.hematology.org/) | Hematology photographs and cases | Explicit permission or a license covering the particular image and commercial app use |
| [CDC DPDx](https://www.cdc.gov/dpdx/) | Diagnostic parasitology images and identification references | The particular image's credit and reuse terms; third-party credited images can have separate rights |
| [Wikimedia Commons](https://commons.wikimedia.org/) | Microscopy, diagrams and laboratory illustrations | Each file's actual license, attribution and modification requirements; exclude noncommercial-only material from a paid app |
| [Mendeley peripheral blood cell dataset](https://data.mendeley.com/datasets/snkd93bnjr/1) | Labelled peripheral blood cell photographs | Dataset version, commercial reuse terms, attribution, image provenance and label quality |
| A laboratory or university contributor | Consistent, high-resolution teaching photographs | Written redistribution/commercial permission, de-identification and qualified clinical review |

For LabCE, request a content partnership or an authorized export/license. A learner subscription generally does not authorize copying its questions or images into another app. An import can be built for an authorized export; do not scrape behind a subscription or copy its bank without permission. Commercial use of the uploaded textbooks also needs the relevant rights. Writing original questions against licensed photographs creates an independent collection.

## A focused first collection

Begin with a small reviewed pilot across the existing subjects: blood-cell morphology, urinalysis sediment, diagnostic microscopy, blood-bank reaction patterns and laboratory graphs. Use real microscopy for morphology; original vector drawings are suitable for explanatory processes and graphs. Do not infer visual details missing from a photograph.

For each item, write an original stem, plausible options, the keyed answer, an explanation of the visible evidence, a simple explanation of every option, a memory cue and an explain-back prompt. Use plain language without changing technical meaning. Keep neutral accessibility descriptions before the answer; identifying alt text must not reveal the answer. Image-dependent questions remain screen-based and stay out of audio-only rounds.

## Intake and release checks

1. Record the image URL/file, creator, rights holder, exact license/version, commercial permission evidence, attribution, original dimensions, original file hash, subject and review status. Remove patient identifiers.
2. Preserve the original file and enough detail to see the feature being assessed. Crop without cutting off useful scale bars, graph axes or labels; do not invent color or structure.
3. Have a qualified reviewer confirm the image identity, question association, answer and rationale. Tag whether the image is needed before answering or is explanatory material shown after reveal. Keyword similarity alone does not establish a match.
4. Review at 320/375-pixel phone widths and tablet widths. Check native size, fit, enlargement/panning, contrast, loading failures and offline decoding. Reject an identification question if its crucial feature is not distinguishable.
5. Check hidden-answer behavior in Practice, Exams and games, and confirm picture questions never enter an audio-only pool. Preserve stable IDs and content fingerprints.
6. After an approved content release, regenerate the quiz registry and matching backend setup, run the existing content/browser/APK checks, and package the licensed assets and attribution with the APK. Exporting progress must not export credentials or copyrighted question content.

The current release changes image handling and the voice learning loop. It does not add LabCE material or a new external question/image bank. The saved environment-network draft includes the candidate hosts that were denied during research; it still needs the environment owner's review and publication before those pages can be verified here.
