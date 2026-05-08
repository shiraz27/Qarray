## Problem

Today the Statistics page has **one global "OCR mode" dropdown** at the top of the OCR card, and each row only has a single generic "Process OCR" play button (plus a force-retry button) that uses whatever mode is selected globally. You expected **three distinct actions per resource/question row** — Text only, Image only, Mixed — visible directly in the row.

## Proposed change

Replace the single play button per row with **three small icon buttons**, one per mode, in both the Resources and Questions tables. Bulk actions get the same treatment.

### Per-row (Resources tab + Questions tab)

Replace the current single `Play` button with a compact group of 3:

| Button | Icon | Tooltip | Calls |
|---|---|---|---|
| Text | `FileText` | "Run OCR — Text only (fast, digital PDFs)" | `processResourceOCR(id, …, 'text')` |
| Image | `Image` | "Run OCR — Image only (scans/photos)" | `processResourceOCR(id, …, 'image')` |
| Mixed | `Layers` | "Run OCR — Mixed (most thorough)" | `processResourceOCR(id, …, 'mixed')` |

Same trio for questions via `processQuestionOCR`.

The existing `RefreshCw` "force retry" button stays, but it gains the same 3-mode split via a small dropdown menu (`DropdownMenu` with 3 items: Force retry — Text / Image / Mixed). This avoids cluttering the row with 6 buttons.

While any of the three is running for that row, all three (and the retry menu) show a spinner / are disabled — driven by the existing `processingId === resource.id` check.

### Bulk actions

The current single "Run Bulk OCR" / "Retry selected" buttons are replaced by a **split button**: the main label runs Mixed (current default), and a chevron opens a menu with "Run as Text only" and "Run as Image only". Same pattern for the Questions tab. This keeps the toolbar compact while exposing all three modes.

### Global selector

The big "OCR mode" Select at the top of the card is **removed** — it's now redundant, and removing it makes it obvious that the choice is per-action. The `ocrMode` state and `OcrMode` import in `Statistics.tsx` go away; mode is passed inline at each call site.

### Files touched

- `src/pages/Statistics.tsx` — UI only:
  - Delete the global `OcrMode` Select panel (lines ~1115–1132).
  - In Resources table row (~1450–1480): swap single play button for 3 mode buttons + retry dropdown.
  - In Questions table row (~1773–1800): same swap.
  - Bulk toolbar in both tabs: split-button with mode menu.
  - Update `handleProcessSingle`, bulk handlers, retry handlers to take an explicit `mode: OcrMode` argument instead of reading `ocrMode` state.

No changes to `pdfOcrHelpers.ts`, `clientOcrProcessor.ts`, `clientQuestionOcrProcessor.ts`, or any backend — they already accept `mode`.

### Memory

Update `mem://ocr/ocr-mode-selector` to reflect that mode is chosen per-action (per-row + per-bulk split button), not from a global selector.

## Out of scope

- Changing OCR pipelines, processors, or speed.
- Persisting a "preferred default" per admin (can be added later via localStorage if needed).
- Showing which mode was used historically in the row (already prepended to `ocr_text`).
