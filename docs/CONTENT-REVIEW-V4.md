# V4 content review

Reviewed on 2026-11-07. The active collection has **3,760 questions**, **3,760 teaching records**, and **15,046 option explanations**. The source registry separately records **193 excluded extracted questions** and **93 questions whose stems are absent from the supplied PDF pages**. Complete teaching coverage describes the active collection, not complete supplied books.

The applied repair record, `data/v4-source-repairs.json`, covers **72 IDs**: **64 source-field patches** and **19 teaching patches**, with overlap. **No answer indices changed.** Each ID has changed source fields at top level, optional `teachingPatch`, and `_verification` provenance. The latter two containers are excluded when applying source fields.

## Scope and checks

Metadata structure was checked across all 3,760 active records. There were no duplicate IDs, orphan teaching records, missing teaching fields, invalid answer indices, missing source/answer document-page references, or option/option-explanation count mismatches. Final read-only validation of the applied repair records passed, including field lengths, recall checks, and the existing generic-filler rule.

The substantive comparison subset contains **2,997 non-microbiology records** across 14 source/topic groups. Bacteriology, mycology, parasitology, virology, microbiology, and molecular-diagnostics chapters were outside the content review. Biological procedures and culture methods were not substantively reviewed. Source-boundary checks restored printed choice text and removed page artifacts.

Every teaching field was read for **67 selected questions**, with at least three per group. Checks compared the plain-language task, original option order/key, main explanation, each option explanation, memory aid, recall check, and source caveat. Fourteen selected source ambiguities or conflicts were compared with their extracted original rationales. Direct patch verification used **63 distinct local PDF pages**, mainly for exact choice boundaries. The LAP table, variance formula, and Rh genotype glyph received visual PDF checks.

| Source | Topic | Active | Teaching items checked |
| --- | --- | ---: | ---: |
| Success | Hematology | 300 | 4 |
| Success | Hemostasis | 75 | 3 |
| Success | Immunology | 100 | 3 |
| Success | Blood bank | 228 | 3 |
| Success | Urinalysis | 67 | 3 |
| Success | Laboratory mathematics | 60 | 4 |
| Success | Lab essentials | 84 | 3 |
| BOC | Blood bank | 438 | 8 |
| BOC | Chemistry | 376 | 5 |
| BOC | Urinalysis | 163 | 6 |
| BOC | Hematology | 320 | 5 |
| BOC | Hemostasis | 194 | 3 |
| BOC | Lab essentials | 323 | 10 |
| BOC | Immunology | 269 | 7 |
| **Total** | | **2,997** | **67** |

Similarity checks found no exact duplicate main explanations or complete teaching records in this subset. No main-explanation pair reached four-word-shingle Jaccard similarity 0.60. There were 21 identical-stem groups; shared cases, different figures, and cross-chapter repetitions mean an identical stem alone does not establish a duplicate item. This screen does not establish individual explanation quality.

## Findings and applied repairs

- **Eight option-boundary failures:** `boc-1-40`, `boc-1-338`, `boc-1-420`, `boc-3-134`, `boc-7-27`, `boc-7-174`, `boc-7-230`, and `boc-8-91` had D appended to C and a section heading occupying D. The original four choices were restored. Two failures made a section heading the keyed answer. All eight option and teaching arrays were checked together; notes describing accidental headings were aligned with the actual choices.
- **Forty-nine appended page headings:** retained choice text matched its own PDF question block before trimming. Two additional rule/MLS-label artifacts were removed from `boc-2-62` and `boc-5-149`.
- **One corrupted genotype:** visual inspection of BOC Part 1 PDF page 32 established that C in `boc-1-83` is `R0r`, rather than `Ro(`. Its option note was aligned.
- **Two unusable calculation displays:** `book-1-236` now supplies the original LAP grade/count pairs, yielding 200. `book-399-36` now supplies the visible sum-of-squared-deviations formula divided by `n − 1`, with no square root. Keys are preserved.
- **Seven pre-answer hints:** restatements for `book-1-296`, `boc-3-86`, `boc-3-125`, `boc-3-134`, `boc-5-183`, `boc-8-49`, and `boc-8-193` no longer name the keyed answer or narrow the task to its answer-specific feature.
- **Two absent figure notices:** `boc-4-235` and `boc-4-238` now flag that their original scattergrams are required.
- **Two stale missing-stem claims:** `boc-1-14` and `boc-8-15` have readable stems in the local PDFs. Their notes were corrected; the latter now directly explains B-cell antibody production and humoral immunity.

The prior `boc-2-363` repair was also checked: all four choices and teaching explanations agree in the original order, excluding the following Toxicology heading.

Numeric checks included platelet recovery, chamber-count arithmetic, daily urine protein, serial dilution, CV, recovery percentage, blood pH, and absolute-cell counts. Checked examples include CV 7.9%, recovery 90%, dilution approximately `1:2.097 × 10¹³`, and pH 7.10. The inconsistent MCHC in `boc-4-245` and denominator conflict in `boc-1-65` remain explicitly described in source notes.

Known source problems retain candid notes and unchanged keys. Examples include the missing negative in `boc-2-354`, quantitative/qualitative conflict in `boc-5-105`, precision-key conflict in `boc-7-59`, immature-B-cell claim in `boc-8-49`, and ANA key/rationale disagreement in `boc-8-187`. Agreement with those book keys does not establish a contemporary clinical answer.

## Practical limits

This provides full structural coverage and a bounded substantive sample. It does not establish medical correctness for all questions, validate an 11-year-old reading age, or verify every illustration. Sampled explanations generally give concrete reasons and useful recall prompts; specialist terms and historical source wording still require care. Image-dependent questions require their linked PDF for independent visual identification. The repair record preserves keys and restores verified text; remaining missing pages and other possible OCR errors remain outside these fixes.

## Teaching sample IDs

- Success Hematology: `book-1-44`, `book-1-236`, `book-1-240`, `book-1-296`.
- Success Hemostasis: `book-86-16`, `book-86-44`, `book-86-72`.
- Success Immunology: `book-110-1`, `book-110-22`, `book-110-55`.
- Success Blood bank: `book-135-18`, `book-135-200`, `book-135-220`.
- Success Urinalysis: `book-351-15`, `book-351-40`, `book-351-60`.
- Success Laboratory mathematics: `book-373-6`, `book-373-11`, `book-373-18`, `book-373-56`.
- Success Lab essentials: `book-399-17`, `book-399-31`, `book-399-36`.
- BOC Blood bank: `boc-1-14`, `boc-1-40`, `boc-1-60`, `boc-1-65`, `boc-1-83`, `boc-1-211`, `boc-1-338`, `boc-1-420`.
- BOC Chemistry: `boc-2-165`, `boc-2-207`, `boc-2-255`, `boc-2-354`, `boc-2-363`.
- BOC Urinalysis: `boc-3-75`, `boc-3-86`, `boc-3-111`, `boc-3-120`, `boc-3-125`, `boc-3-134`.
- BOC Hematology: `boc-4-79`, `boc-4-211`, `boc-4-235`, `boc-4-238`, `boc-4-245`.
- BOC Hemostasis: `boc-5-67`, `boc-5-105`, `boc-5-183`.
- BOC Lab essentials: `boc-7-27`, `boc-7-59`, `boc-7-122`, `boc-7-124`, `boc-7-140`, `boc-7-142`, `boc-7-144`, `boc-7-174`, `boc-7-199`, `boc-7-230`.
- BOC Immunology: `boc-8-15`, `boc-8-49`, `boc-8-78`, `boc-8-91`, `boc-8-185`, `boc-8-187`, `boc-8-193`.
