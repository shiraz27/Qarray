## Finish persistent watermarking feature

Wrap up the remaining items from the previous implementation pass.

### 1. Questions table UI parity
In `src/pages/Statistics.tsx`, add a **Watermark** column to the Questions table (mirroring the Resources table):
- Render `<WatermarkStatusEditor>` per row showing status badge + `pages_watermarked / page_count`.
- Per-row **Stamp** button that calls the watermark processor for that single question (gated by `urlsHaveOcrable` on extracted question media URLs).
- Wire the existing `watermarkFilter` for questions to actually filter rows.

### 2. Dashboard counter cards
Add aggregate stat cards alongside the existing OCR counters:
- Total / pending / in_progress / completed / partial / failed / not_applicable, split by Resources vs Questions.
- Reuse the same card styling as the OCR aggregates.

### 3. Preview/download fallback optimization
When `watermark_status === 'completed'`, skip the redundant client-side watermarking step (saves CPU/memory on every view):
- `src/components/PdfInlinePreview.tsx`
- `src/components/MediaPreview.tsx`
- `src/components/MediaPreviewDialog.tsx`
- Any download helper that currently calls `watermarkPdfBlob` / `watermarkImageBlob`.

For any other status (`pending`, `in_progress`, `partial`, `failed`), keep the current on-the-fly watermarking so users never see a clean copy. Partial split-PDFs: skip per-page if that page index is already within `pages_watermarked` (only safe if pages are processed in order — otherwise always re-stamp on the fly for `partial`). Default to always re-stamping for `partial` to stay safe.

### 4. Plumb `watermark_status` + `pages_watermarked` through queries
Wherever the preview/download components fetch the resource or question row, include the new columns in the select so the fallback check above works without an extra round-trip.

### Out of scope
- No changes to upload flow (new uploads stay `pending` and are processed by admin trigger, same as OCR).
- No changes to `fetch-media` retry logic (handled separately).
- No watermark text/opacity customization UI.
