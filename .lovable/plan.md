# Finalize watermark idempotency + fix missing gallery on ResourceDetail

The watermark schema migration already ran. Two remaining code changes:

## 1. Resource detail page — use the gallery (fixes resource 124)

`src/pages/ResourceDetail.tsx` lines 715–732 still map `resource.data` directly into stacked `PdfInlinePreview` / `MediaPreview` blocks. That's why resource 124 (and every other resource) shows files stacked vertically with no left-side selector. `MediaList` was updated to use `MediaGallery`, but the resource page renders its attachments inline and bypasses `MediaList` entirely — that's the case the previous pass missed.

Fix: replace the inline `.map(...)` with a single `<MediaGallery items={resource.data.map((url) => ({ url, type: detectMediaType(url) }))} />`, matching how `MediaList` does it. Keep the existing "Attachments (N)" heading above it.

## 2. Watermark code — make stamping idempotent per URL

Per the approved plan:

- **`src/utils/watermark.ts`** — add a `WATERMARK_MARKER = 'qarray-watermarked-v1'` constant. In `watermarkPdfBytes`, after `PDFDocument.load`, read `pdfDoc.getKeywords()`; if the marker is present, return the bytes unchanged. After stamping, append the marker via `setKeywords([...existing, MARKER])`. Image watermarking stays unchanged (no reliable EXIF round-trip).
- **`src/utils/clientWatermarkProcessor.ts`** — also select `watermarked_urls` in the initial fetch, build a `Set<string>` of already-stamped URLs, skip those during the loop (counting them toward `done` so a successful retry reports `completed`), append each newly-stamped URL into the set and persist it inside the existing `tick` (piggyback on the `pages_watermarked` update — one DB write per page, same as today). Prune URLs that are no longer in the row's current media list.
- Final status logic (`completed` / `partial` / `failed`) stays the same; it now reads correctly because `done` includes previously-stamped URLs.

## Out of scope

- No UI changes to the stamp button.
- No backfill of the marker on historically stamped PDFs — they'll be marked the next time they're processed; pages already over-stamped from past retries stay as they are.
- No type regeneration steps (handled automatically by the migration that already ran).
