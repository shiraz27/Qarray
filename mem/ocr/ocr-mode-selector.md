---
name: OCR Mode Selector
description: OCR mode (text/image/mixed) is chosen per-action — three buttons on every row plus split-button menus on bulk actions in Statistics. No global selector.
type: feature
---
Statistics page has no global OCR mode selector. Instead:

- Each Resource and Question row in the OCR tables exposes 3 inline icon buttons:
  - FileText icon → `processResourceOCR(id, …, 'text')` / `processQuestionOCR(id, …, 'text')` — text-layer only, fastest, for digital PDFs.
  - ImageIcon icon → mode `'image'` — Tesseract only, for scans / photos.
  - Layers icon → mode `'mixed'` — both, most thorough.
- Force-retry button is a `DropdownMenu` with 3 items (Force retry — text/image/mixed). When current `ocr_status === 'completed'`, opens `forceRetryConfirm` alert which now carries `{ kind, id, mode }`.
- Bulk "Process All" and "Retry selected" buttons are split-button `DropdownMenu`s with the same 3 mode items.
- Handlers (`handleProcessSingle`, `handleProcessSingleQuestion`, `handleProcessAllPending`, `handleProcessAllPendingQuestions`, `runBulkResourceOcr`, `runBulkQuestionOcr`) all take `mode: OcrMode` (default `'mixed'`). The mode is shown in the toast label (`(text) Processing…`).
- `OcrMode` is imported from `@/utils/pdfOcrHelpers` and forwarded to `extractPdfTextAndOcr`. Standalone images skipped in `'text'` mode.

Why three modes:
- `text` is near-instant on 250-page born-digital PDFs (skips Tesseract entirely).
- `image` is the only useful pipeline for pure scans with junk/empty text layers.
- `mixed` is the previous default — keep for thorough runs.
