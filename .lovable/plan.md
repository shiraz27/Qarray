## Problem

`ocr_readability` is only written by the OCR pipelines (`clientOcrProcessor.ts`, `clientQuestionOcrProcessor.ts`). Saving a description (manual edit or "AI suggest"), or any other cell, never recomputes it. Rows that have `ocr_text` but `null` readability (legacy or non-OCR'd) stay stuck on the "missing" badge forever.

## Fix

### 1. Recompute on every save in Statistics

In `src/pages/Statistics.tsx`, extend `saveResourceCell` and `saveQuestionCell` so the `updates` payload always includes a fresh `ocr_readability` computed from `row.ocr_text` (using existing `computeReadability` from `@/utils/ocrReadability`). When `ocr_text` is empty/null, fall back to whatever long-form text the row has just been given (description for resources, data for questions) so a saved AI description still produces a meaningful score instead of "unreadable".

Then merge `ocr_readability` into the local `setResources` / `setQuestions` state so the badge updates immediately without a refetch.

This covers both:
- Manual cell saves (typing a description).
- "AI suggest" → "Save" flow (already routes through `saveResourceCell`/`saveQuestionCell`).

### 2. Lazy backfill on view

After `fetchResources` / `fetchQuestions` populate state, kick off a background pass:
- Filter rows where `ocr_readability` is null but either `ocr_text` or (description/data) is non-empty.
- For each, compute readability locally and `UPDATE` in a single `.in('id', ids)` batch per readability bucket (4 small updates max per fetch page).
- Patch local state.

No edge function needed — all computation is client-side and cheap.

### 3. Out of scope

- Changing how OCR pipelines compute readability.
- Schema changes (`ocr_readability` already exists on both tables).
- Backfilling rows that aren't currently loaded in the Statistics view (the lazy pass naturally covers everything as the admin pages through filters).

## Files

- `src/pages/Statistics.tsx` — extend `saveResourceCell`, `saveQuestionCell`, and add a `useEffect` that runs the lazy backfill after `resources` / `questions` change.

## Validation

- Edit a description on a row with "missing" readability → badge flips to a real tier on save.
- Click "AI suggest" on description, then save → badge updates.
- Load Statistics → existing rows with `ocr_text` but null readability get backfilled within a couple seconds.
