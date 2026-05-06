## Problem

Resource #35's `ocr_text` contains only text-layer content (23KB, no `[ocr]` markers). The per-page hybrid extractor skipped Tesseract on every page because of an optimization in `extractPdfTextAndOcr`:

```ts
if (isVeryRichText(textLayer)) {
  const hasImg = await pageHasImages(page);
  if (!hasImg) skipOcr = true;
}
```

`pageHasImages` only checks a small set of pdf.js OPS (`paintImageXObject`, `paintInlineImageXObject`, `paintImageMaskXObject`, `paintJpegXObject`). Many PDFs embed images via form XObjects, scanned-overlay constructs, or other ops not in that list, so it returns `false` even when raster content is present — and OCR is skipped.

This contradicts the explicit requirement: **ocr_text must always include OCR output, regardless of how rich the text layer is**.

## Fix

In `src/utils/pdfOcrHelpers.ts`:

1. **Always run Tesseract on every page.** Remove the `isVeryRichText` + `pageHasImages` skip path. Drop the now-unused `isVeryRichText` and `pageHasImages` helpers.
2. Keep the existing per-page combine logic (`combinePageOutput`) — it already concatenates text-layer and OCR with `[text layer]` / `[ocr]` markers when neither contains the other, and dedupes when one is a subset.
3. Keep all other behavior (worker reuse, progress reporting, abort signal, error handling).

## Re-OCR resource 35

After the code change, the user can use the existing **Force Retry** action on the Statistics page to re-process resource 35 and verify the new `ocr_text` contains `[ocr]` blocks with text from the embedded images.

## Files

- `src/utils/pdfOcrHelpers.ts` — remove skip-OCR branch; always OCR every page.
