
# Per-page PDF storage for large PDFs

When a user uploads a PDF with more than 3 pages, it gets split client-side into one PDF per page, all stored under one Archive.org folder, indexed by a manifest. The resource/question page shows a dropdown to pick the page to preview, with per-page and full-document download. Existing single-PDF uploads keep working unchanged.

## Storage layout

Per resource/question, all pages live in one Archive.org subfolder:

```text
<chapter>/<contentType>/<contentId>/<originalBase>/pages/1.pdf
<chapter>/<contentType>/<contentId>/<originalBase>/pages/2.pdf
...
<chapter>/<contentType>/<contentId>/<originalBase>/pages/manifest.json
```

`manifest.json` shape:

```json
{
  "version": 1,
  "kind": "split-pdf",
  "originalName": "MAGAZINE_S1.pdf",
  "totalPages": 13,
  "createdAt": "2026-05-14T...",
  "pages": [
    { "n": 1, "url": "https://archive.org/download/qarray-.../pages/1.pdf" },
    { "n": 2, "url": "https://archive.org/download/qarray-.../pages/2.pdf" }
  ]
}
```

Only the manifest URL is written into `resources.data[]` / question text — one entry per attachment, just like today.

## Upload flow

1. New helper `uploadPdfMaybeSplit(file, options)` called from `UploadManagerContext` whenever `fileType === 'pdf'`.
2. Helper opens the PDF with `pdf-lib`, reads `getPageCount()`.
   - `<= 3 pages`: fall through to existing `uploadFileToArchiveControlled` (no behavior change).
   - `> 3 pages`: split into N single-page PDFs, upload sequentially as `pages/1.pdf`...`pages/N.pdf`, then upload `manifest.json`. Returns the manifest URL.
3. Progress aggregates to an overall 0–100% in the existing `UploadItem.progress`. Filename shown in the UI stays the original (`MAGAZINE_S1.pdf`).
4. Failure of any page aborts the whole item with a clear error; partial files left in Archive.org are harmless (no manifest = orphan pages, ignored by app).

### Edge function change (`upload-to-archive`)

Add an optional `subPath` field on `single` and `initiate` actions. When present, it is appended to the computed folder path *in place of* the leaf `fileName`. Example: `subPath = "MAGAZINE_S1/pages/1.pdf"` produces `<class>/<subject>/<chapter>/<contentType>/<contentId>/MAGAZINE_S1/pages/1.pdf`. Existing callers omit it and behave exactly as today.

`originalBase` is derived client-side: `sanitize(file.name without .pdf) + "-" + shortHash` to avoid collisions between two files with the same name in the same content folder.

## Detection & preview (backwards compatible)

- `mediaTypeUtils.isPdfUrl` already matches `.json` if it contains `pdf`-ish — we add an explicit `isSplitPdfManifestUrl(url)` that matches `/pages/manifest.json`.
- `extractMediaFromText` / `MediaList` treat a manifest URL as `type: 'pdf'` with `displayName` from the manifest's `originalName`.
- `PdfInlinePreview`:
  - If URL is a regular PDF → unchanged behavior.
  - If URL ends with `/pages/manifest.json` → fetch via `fetch-media` proxy, parse JSON, show:
    - Header: filename, total page count, dropdown `Page 1 / 13 ▾`, Download (current page), "Download all" button.
    - Body: existing `PdfInlinePreview` rendering, but loading only the selected page's URL (component refactor: extract the current single-PDF render into an inner `<SinglePdfView url={...} />` reused for both modes).
    - "Download all" merges all page blobs with `pdf-lib` (sequential fetch via proxy) into one PDF and triggers a blob download.

## OCR compatibility

The OCR processors currently expect a single PDF URL per item. They will be updated to:
- Detect a manifest URL.
- Fetch manifest, then run the existing per-page OCR pipeline against each page URL in order, concatenating text (separator `\n\n--- page N ---\n\n`).
- Page count badge & `computePageCountFromUrls` short-circuit to `manifest.totalPages` for manifest URLs (no need to download every page).

## Files touched

- `package.json` — add `pdf-lib`.
- `src/utils/archiveMultipartUpload.ts` — accept optional `subPath` and forward to edge function.
- `src/utils/pdfSplitUpload.ts` *(new)* — `uploadPdfMaybeSplit()` orchestrator + manifest writer.
- `src/utils/mediaTypeUtils.ts` — `isSplitPdfManifestUrl()` helper.
- `src/utils/mediaHelpers.ts` — friendlier display name for manifest URLs.
- `src/utils/pageCountHelpers.ts` — short-circuit for manifest URLs.
- `src/contexts/UploadManagerContext.tsx` — call `uploadPdfMaybeSplit` for PDFs.
- `src/components/PdfInlinePreview.tsx` — split into `SinglePdfView` + outer wrapper that detects manifest, renders dropdown gallery, "Download all" merge.
- `src/utils/clientOcrProcessor.ts`, `src/utils/clientQuestionOcrProcessor.ts`, `src/utils/ocrAndExtract.ts` — manifest-aware iteration.
- `supabase/functions/upload-to-archive/index.ts` — accept and apply `subPath`.

## Out of scope (per your earlier answers)

- Existing single-PDF uploads stay as-is — no migration / re-split tool.
- Threshold fixed at `> 3 pages`. No admin override.
