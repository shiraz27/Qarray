# Persistent watermarking with per-page status + admin backfill

## Goal

Hybrid watermark system mirroring the OCR pattern:

1. Gradually re-stamp every existing PDF and image stored on Archive.org with the diagonal `Qarray.tn -Aqra Blech- Qarray.tn` watermark at ~15% opacity, replacing the original so all future previews/downloads are protected at the source.
2. Until an item is fully watermarked, keep the existing client-side stamp on download/preview so nothing leaks unprotected in the meantime.
3. Admins drive the backfill from the Statistics page using the same UI grammar as OCR: status pill, filters, per-row "Watermark now" action, and a bulk "Watermark all" batch runner with per-page progress for split PDFs.

## Database changes

Add watermark tracking to `resources` and `questions` (PDFs and images both live in `data text[]`):

- `watermark_status text default 'pending'` — values: `pending | in_progress | completed | failed | not_applicable | partial`
- `pages_watermarked integer default 0`
- `watermark_processed_at timestamptz null`
- `watermark_error text null`

`not_applicable` is used for videos/audio (same `isOcrableMediaUrl` helper) so the dashboard counters match OCR semantics. `partial` is set when some but not all split-PDF pages have been stamped; the existing `page_count` column is the denominator. Single-file PDFs and images jump straight from `pending` to `completed` with `pages_watermarked = page_count` (or `1` for images).

No RLS changes — only moderators/admins write these fields, and `resources` / `questions` SELECT policies are already public.

## Watermark engine

Reuse `src/utils/watermark.ts` (`watermarkPdfBytes`, `watermarkPdfBlob`, `watermarkImageBlob`) — the text and styling already match the user's spec. Add a thin `applyWatermarkToUrl(url)` helper that:

1. Fetches the original via the existing `fetch-media` proxy (handles Archive.org throttling/interstitials already).
2. Detects type by extension (PDF vs image — same dash-extension rule documented in the Archive.org memory).
3. Returns a watermarked `Blob` plus the page count used.

Skip and report `not_applicable` for non-image/non-PDF URLs.

## Backfill processor

New `src/utils/clientWatermarkProcessor.ts` modeled on `clientOcrProcessor.ts`:

- For a resource/question row, mark `in_progress`, then iterate every URL in `data[]`.
- For split-PDF manifests (`/pages/manifest.json`), watermark each page PDF individually, incrementing `pages_watermarked` after each successful upload so the Statistics row shows live progress (e.g. `7/12`). On partial failure the row stays `partial` and stores the last error in `watermark_error`.
- Re-upload via the existing `upload-to-archive` edge function, overwriting the same Archive.org keys. No DB URL changes — the public URLs stay identical.
- On success: `watermark_status='completed'`, `pages_watermarked = page_count`, `watermark_processed_at = now()`.
- On full failure: `watermark_status='failed'` + `watermark_error`.

The processor exposes the same shape as the OCR processor (`processResourceWatermark`, `processQuestionWatermark`) so the Statistics batch runner can reuse the OCR batching/cancel UX.

## Statistics page UI

In `src/pages/Statistics.tsx`, add a watermark column alongside OCR in both the Resources and Questions tables:

- New status pill component `WatermarkStatusEditor` (mirrors `OcrStatusEditor`) showing `completed`, `partial 7/12`, `pending`, `failed`, `not_applicable`.
- New filter dropdown `watermarkFilter` reusing the same filter UX as `ocrFilter`.
- Per-row "Watermark" button visible when status is `pending | failed | partial` (plus `not_applicable` only when `urlsHaveOcrable(data)` is true — same gating helper as OCR).
- New bulk action button "Watermark all eligible" next to the existing OCR batch button, using the shared batch runner with progress toast, abort, and rate-limit-friendly sequential processing (one resource at a time, with the same exponential-backoff retry helper OCR uses).
- Aggregate counters in the dashboard cards: `completed / pending / failed / not_applicable / partial` for both resources and questions, computed the same way OCR counters are.

## Preview/download fallback

In `src/components/PdfInlinePreview.tsx`, `src/components/MediaPreview.tsx`, and `src/components/MediaPreviewDialog.tsx`:

- Accept an optional `watermarkStatus` prop from the parent resource/question.
- When `watermarkStatus === 'completed'`, skip the existing client-side `watermarkPdfBlob` / `watermarkImageBlob` call on download — the stored file already carries it (saves CPU + memory for large PDFs).
- For anything else (`pending`, `partial`, `failed`, `not_applicable`, missing), keep today's behavior so users never get a clean copy by accident. The visible preview overlay div stays unchanged for all cases since the in-file watermark is faint and the overlay deters screenshots.

The parent components (`ResourceDetail`, question viewers) already select the row; threading `watermark_status` through is a one-field add.

## Out of scope

- No automatic watermarking on new uploads in this pass — admins trigger the backfill, exactly like OCR per the project memory. A follow-up can wire `upload-to-archive` to watermark in transit using the same engine once the backfill is proven.
- No watermark customization UI — the text is fixed in `getWatermarkText()`.
- No changes to `fetch-media` retry behavior (separate plan already open for 429/503 handling).

## Memory update

Append a memory entry: "Watermark backfill is admin-triggered from Statistics, mirrors OCR pattern, tracks per-page progress via `pages_watermarked / page_count`; preview/download fallback only stamps client-side when `watermark_status != 'completed'`."
