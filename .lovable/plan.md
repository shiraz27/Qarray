## Issue 1: PDFs marked `not_applicable` (Archive.org propagation)

**Root cause confirmed.** When a PDF is freshly uploaded to Archive.org, the derivatives URL often returns 404 for several minutes. The proxy retries 5x with backoff, then `fetchFileViaProxy` throws `"File not available yet"`. In `clientOcrProcessor.ts`, that exception is caught per-file and pushed into `extractedTexts` with `[Error: ...]`. Then:

- `ocrableFileCount` stays 0 (we never reached the OCR step)
- `processableFileCount` stays 0 too, **because** the increment line `if (fileType !== 'unknown') processableFileCount++;` runs only inside the catch — but the earlier line `processableFileCount++;` (line 150) runs only on success. The fall-through path can land in the `unknown`/`not_applicable` branch.
- Net result: `ocr_status = 'not_applicable'` instead of `failed` → user can't see it should be retried.

There is also a subtler bug: `processableFileCount` is incremented **after** the fetch succeeds (line 150), so a fetch failure on a known PDF/image URL only bumps the catch-side counter. The status logic (lines 180-198) then can route to `not_applicable` if any non-OCR-able files were also present.

### Fix

1. In `src/utils/clientOcrProcessor.ts`:
   - Increment `processableFileCount` **before** the fetch when `fileType` is `pdf` or `image` (known OCR-able from URL).
   - In the catch block, distinguish "unavailable / network" errors (message includes `"not available"`, `"Failed to fetch"`, `"timeout"`) and force `ocr_status = 'failed'` for the whole resource if any such error occurred — never `not_applicable`.
   - Track a `hadFetchFailure` boolean and use it in the final status decision: if true, status is always `failed`.
2. Same fix in `src/utils/clientQuestionOcrProcessor.ts`.
3. Update the proxy error message in `fetch-media/index.ts` so the front-end can recognize it: include `"upstream not ready"` in the JSON error string when `upstreamStatus === 404`.

## Issue 2: Statistics page — better OCR visibility & batch retry

### A. New columns in the resources table

Add to the resources table on `Statistics.tsx`:
- **OCR Text** column — truncated preview (~80 chars) with a popover/tooltip showing the full text on hover, plus a "Copy" button.
- **OCR Status** already exists as a badge — also display the **raw DB value** in muted small text underneath the badge (e.g. `not_applicable`, `pending`, …).

Same for the questions table (OCR Text + raw status string).

### B. "Force retry" action (regardless of status)

Per-row: add a second action button **Force Retry** (refresh icon, distinct from the existing Retry/Process button) that calls `processResourceOCR(id)` even when status is `completed`. Confirm with `AlertDialog` for completed rows so users don't overwrite good text by accident.

### C. Multi-select + bulk retry

- Add a checkbox column to both resource and question tables (header checkbox toggles all on the current page).
- New state: `selectedResourceIds: Set<number>`, `selectedQuestionIds: Set<number>`.
- New toolbar above each table when selection > 0:
  - Counter ("3 selected")
  - **Retry selected** button — runs `processResourceOCR` sequentially for every selected id with a single progress toast (`[i/N]`), regardless of current status.
  - **Clear selection** button.
- After completion, refresh stats + tables and clear the selection.

### D. Minor

- Filter dropdown already has all status options; verify `not_applicable` shows correctly and add `"failed"` quick-filter chip.

## Files to modify

- `src/utils/clientOcrProcessor.ts` — fix status routing for fetch failures
- `src/utils/clientQuestionOcrProcessor.ts` — same fix
- `supabase/functions/fetch-media/index.ts` — clearer error message
- `src/pages/Statistics.tsx` — new columns, force-retry action, multi-select toolbar, bulk retry handler

No DB schema changes. No new dependencies.