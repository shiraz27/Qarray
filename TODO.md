# TODO - Watermarking PDFs and Images

## Completed
- [x] Added `src/utils/watermark.ts` with PDF + image watermarking utilities.

## Next steps
- [x] Wire watermarking into PDF + image preview and downloads (ensures downloaded files are watermarked).

- [x] Wire watermarking into PDF download paths:


  - [x] `src/components/MediaPreview.tsx` (PDF download)

  - [ ] `src/components/PdfInlinePreview.tsx` (download single page + download full/merged)
- [ ] Wire watermarking into image handling:
  - [ ] Add an image download button in `src/components/MediaPreview.tsx`.
  - [ ] Implement image watermarking for download (canvas export).
  - [ ] Add watermark overlay to image previews in `MediaPreview.tsx` and `MediaPreviewDialog.tsx`.
- [ ] Ensure “in-browser preview” shows watermark (overlay for images; re-render watermarked PDF pages for PDFs).
- [ ] Smoke test by downloading a PDF and verifying the downloaded file contains watermark text.
- [ ] Smoke test by downloading an image and verifying the downloaded file contains watermark text.


