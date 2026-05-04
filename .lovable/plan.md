# Allow Retrying OCR on "Not Applicable" Items

## The problem

In Statistics, items end up with `ocr_status = 'not_applicable'` (the "N/A" badge) in several legitimate-but-recoverable cases:

- The file extension wasn't recognized (Archive.org sometimes sanitizes URLs like `…-pdf` / `…-png`, or a file is uploaded with no extension), so `detectFileType` returns `'unknown'` and the item is marked N/A.
- The fetch proxy returned "unavailable" (Archive.org eventual-consistency 404), so processing produced no OCR-able files and the item was marked N/A.
- A resource truly has only video/audio (correct N/A) — but the user later edits it to add a PDF/image and wants to re-OCR.

Today the per-row "Play" button is only shown when `ocr_status === 'pending' || 'failed'`. Once an item is N/A there is **no UI path** to re-run OCR on it, so the user is stuck. The "Process all pending" batch also skips N/A items.

## The fix

Treat `not_applicable` as a retryable state in the admin Statistics page (it stays purely a manual, admin-triggered action — consistent with the existing OCR policy).

### 1. Per-row retry button (resources + questions tables)

`src/pages/Statistics.tsx`

- Update `canProcess` on both the resources table (~line 1162) and questions table (~line 1432) to also include `'not_applicable'`:
  ```ts
  const canProcess =
    (resource.ocr_status === 'pending' ||
     resource.ocr_status === 'failed' ||
     resource.ocr_status === 'not_applicable') && isPdfOrImage;
  ```
  For questions, mirror the same condition with `hasPdfOrImage`.
- Change the button `title` to "Process OCR / Retry" so the intent is clear when re-running an N/A item.
- Note: `isPdfOrImage` / `hasPdfOrImage` already gate the button so we never show retry on items that genuinely have no OCR-able media.

### 2. Batch "Process all" includes N/A

`handleProcessAllPending` (resources, ~line 447) and the equivalent question batch handler:

- Extend the filter to also pick up `'not_applicable'` items that have at least one PDF/image in `data` (reuse the same `isPdfOrImage` check used in the table). This way the batch button can recover misclassified items in one click without re-processing legitimate audio/video N/As.
- Rename the button label to "Process pending & retry N/A" (or similar short copy).

### 3. Smarter N/A decision in the OCR processors

`src/utils/clientOcrProcessor.ts` and `src/utils/clientQuestionOcrProcessor.ts`

Currently `'unknown'` file types are bucketed with video/audio and cause the whole resource to be marked `not_applicable`. Two adjustments:

- Treat `'unknown'` separately from video/audio. If **all** files are unknown, mark the row `failed` (with a clear message like "Could not detect file type — please retry") instead of `not_applicable`. `failed` is already retryable, which prevents this exact stuck state from re-occurring.
- If `fetchFileViaProxy` throws "File not available" for **every** file in the resource, mark as `failed` (transient) instead of `not_applicable`. This handles the Archive.org eventual-consistency case shown in the console logs (`File not available: Not Found`).

Keep video/audio-only resources as `not_applicable` (correct behavior), but they will now still be retryable through the UI in case the user edits the resource later.

### 4. Small UX polish

- In the OCR filter dropdown, when "Not Applicable" is selected, show a subtle hint above the table: "These items can be retried if they have a PDF or image attached."
- Status badge tooltip on N/A: "OCR was skipped. Click the play button to retry."

## Technical notes

- No DB migration needed — we're just changing client-side conditions and one classification rule.
- No edge function changes needed.
- The existing `processResourceOCR` already overwrites `ocr_status`, `ocr_text`, and `ocr_processed_at` on every run, so retrying an N/A item naturally transitions it to `completed` / `failed` / `not_applicable` based on the new run.
- Stats counters in `fetchOcrStats` / `fetchQuestionOcrStats` will automatically reflect the new outcomes after a retry; no changes needed there.

## Files to edit

- `src/pages/Statistics.tsx` — extend `canProcess`, batch filter, button title, optional hint.
- `src/utils/clientOcrProcessor.ts` — separate `unknown` from video/audio; mark all-unavailable fetches as `failed`.
- `src/utils/clientQuestionOcrProcessor.ts` — same two changes.
