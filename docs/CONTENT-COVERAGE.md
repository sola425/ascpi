# Content coverage — Labwise 4.0.0

All **3,760 active study questions** have individually authored teaching notes, including **15,046 ordered option explanations**. The original source rationales remain separate from the teaching.

| Collection | Numbered source inventory | Extracted | Excluded from study | Absent from supplied pages | Active / taught | Explained options |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Success, 4th edition | 1,484 | 1,484 | 0 | 0 | 1,484 / 1,484 | 5,942 |
| BOC Study Guide, 7th edition | 2,562 | 2,469 | 193 | 93 | 2,276 / 2,276 | 9,104 |
| **Total** | **4,046** | **3,953** | **193** | **93** | **3,760 / 3,760** | **15,046** |

The 193 BOC exclusions follow the user's request and are recorded in [collection-exclusions.json](../data/collection-exclusions.json); their source records and original PDFs are retained. The 93 absent items are chapter 3 questions 154–246: the supplied BOC Part 1 skips printed pages 225–240. Answer-only rationales are retained in the extraction inventory, but missing stems and choices have not been invented. Thus active teaching is complete while the supplied source collection has a documented gap.

## Original documents

| Document ID | Bundled file | PDF pages |
| --- | --- | ---: |
| `textbook` | [Success textbook](textbook.pdf) | 434 |
| `boc1` | [BOC Part 1](boc-1.pdf) | 333 |
| `boc2` | [BOC Part 2](boc-2.pdf) | 333 |
| **Total** | **Three unchanged original PDFs** | **1,100** |

Question, rationale, and shared-context links retain the correct document identity and local PDF page. Printed book pages can differ from PDF pages. Source figures and complex tables remain accessible through those links.

## Teaching and review

Each active note contains a plain-language question, answer reasoning, a separate explanation for every choice, a memory hook, and a recall question/answer. The app also includes 159 glossary definitions. Known ambiguous keys, historical guidance, and image dependencies are called out in relevant notes; the book's answer and rationale remain visible as source material.

Notes were authored individually and received sampled independent review. The earlier Success review covered 80 deterministic samples; [content-audits.json](content-audits.json) retains those records. Structural checks verify IDs, required fields, option order/count, and complete active coverage, and block incomplete APK builds. These checks and sampled reviews are not a full medical/editorial certification; use current course and professional references when assessing older source guidance.

The canonical release counts are in [catalog.json](../data/catalog.json) and [teaching-coverage.json](../data/teaching-coverage.json). Source inventories and repair records are maintained separately from the active runtime bank; [validation evidence](VALIDATION.md) records the release checks.
