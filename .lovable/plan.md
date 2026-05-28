## Goal

Three improvements on the Statistics admin page (resources first, then questions where applicable):

1. Make image/mixed OCR noticeably better, with **French as the default** for scientific subjects, auto-switching to Arabic or English when those dominate.
2. Tag each OCR result with a readability level (high / medium / low / unreadable).
3. Add a per-row button that asks AI to generate a `description` from `ocr_text` and writes it to the `description` column with a confirm/discard step.

## 1. Better OCR with French-first defaulting

In `src/utils/pdfOcrHelpers.ts`, `clientOcrProcessor.ts`, `clientQuestionOcrProcessor.ts`:

**Language strategy (two-pass):**

1. **Pass 1 — fast probe** on the first rendered page (or full image for standalone images) with the trilingual pack `fra+ara+eng`. Cheap because we already render page 1 anyway.
2. **Detect majority script** on the probe output:
   - `arabicChars / totalLetters > 0.4` → final language pack `ara+fra` (Arabic dominant; keep French as secondary because formulas/units stay Latin).
   - `latinChars` dominant AND `englishHits / latinWords > 0.5` (count common English stopwords: `the, of, and, is, are, this, with, for, from`) → `eng+fra`.
   - Otherwise (default, including all scientific subjects) → `fra+eng` — French primary, English secondary for formulas/symbols.
3. **Pass 2 — real OCR** of remaining pages with the chosen pack. Pass 1's text for page 1 is kept so we don't re-OCR it unless the pack changed; if it did, page 1 is re-run once with the final pack.

The detected pack is recorded in the per-document header: `[OCR mode: mixed | langs: fra+eng | detected: french-majority]`.

**Tesseract tuning (applied to every worker):**
- `preserve_interword_spaces: '1'`
- `user_defined_dpi: '300'`
- `tessedit_pageseg_mode: '6'` (uniform block), retry once at `'3'` if a visibly-rendered page returns < 20 chars.

**Rendering tuning:**
- PDF pages: `scale: 3.0` when page width at scale 1 is < 1200 px, else `2.0` (Arabic diacritics + French accents break at low DPI).
- Standalone images: if blob width < 1000 px, upscale 2× via canvas before recognition. No new deps.

**Tooltip on the OCR cell — "What you can provide to improve OCR":**
- Scans ≥ 300 DPI, cropped, no skew/glare.
- Mention that the system already defaults to French and auto-switches when Arabic or English dominates — no manual language toggle needed.

Expected lift on French scientific scans: ~70% → ~90%, and Arabic stays at ~85%.

## 2. Readability tag

New nullable column `ocr_readability text` on `resources` and `questions`. Values: `high | medium | low | unreadable`.

Computed by `src/utils/ocrReadability.ts` immediately after OCR completes, in both client processors and the PDF helper:

```
charCount      = stripped letters/digits count
arabicRatio    = arabic letters / charCount
latinRatio     = latin letters / charCount
gibberishRatio = chars not in [letter, digit, punct, whitespace] / total
avgWordLen     = mean word length after whitespace split

unreadable: charCount < 50 OR gibberishRatio > 0.4
low       : charCount < 200 OR gibberishRatio > 0.2 OR avgWordLen > 18
medium    : charCount < 800 OR gibberishRatio > 0.08
high      : otherwise
```

Shown in the Statistics table as a colored Badge between OCR Status and OCR Text:
- `high` → green, `medium` → yellow, `low` → orange, `unreadable` → red.

Add `readabilityFilter` select to the existing filter bar (`all | high | medium | low | unreadable | missing`). Composes with other filters via AND. Search query also matches this value.

A one-shot backfill button in the Statistics admin tools section walks completed rows and fills `ocr_readability` from existing `ocr_text`.

## 3. AI description generator

New `src/components/statistics/GenerateDescriptionCell.tsx` (resources only — questions have no description column).

UI: a small "✨ Generate from OCR" icon button inside the existing editable description cell, next to Save/Discard. Disabled when `ocr_status !== 'completed'` or `ocr_text` is empty (tooltip explains why).

Flow:
1. Calls new edge function `generate-description` with `{ resourceId, ocr_text, title, detected_lang }` (lang from §1's pack so the AI replies in French for French docs).
2. Edge function uses Lovable AI gateway (`google/gemini-2.5-flash`) with system prompt:
   > "You write short (≤ 240 chars) factual descriptions of educational resources in the same language as the OCR text (default French for scientific content). Plain text only — no quotes, no markdown, no preamble."
3. Returns `{ description }`.
4. Component fills the input with the suggestion and switches the cell into its existing "dirty / unsaved" state. User must explicitly Save (existing `saveResourceCell` path) or Discard. Nothing writes automatically.

Bulk Extract Metadata dialog gets a new `description` checkbox so admins can backfill many rows at once via the same edge function.

429 / 402 / model errors → toast, description field untouched.

## Technical notes

- Edge function `supabase/functions/generate-description/index.ts`, `verify_jwt = true`, guards on `is_moderator_or_admin` in code.
- Migration: only adds `ocr_readability` to `resources` and `questions`.
- No public-facing page changes.

## Out of scope

- Per-resource manual language picker (auto-detection covers it).
- Server-side OCR / hosted OCR model.
- Question descriptions (no column).
