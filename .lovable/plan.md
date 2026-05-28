## Fix "Expected instance of PDFDict, but got instance of undefined" on per-page migrate

### Root cause
`splitPdfToPages` in `src/utils/pdfSplitUpload.ts` uses `pdf-lib`'s `copyPages(src, [i])` once per page. When the source PDF has a malformed page tree, a missing `/Resources` dict, or an indirect reference whose target object is missing, `copyPages` throws `Expected instance of PDFDict, but got instance of undefined` and the whole migration aborts mid-way.

This is a known pdf-lib limitation — it cannot repair every malformed PDF.

### Fix strategy (two layers)

**Layer 1 — Faster + more reliable copy path (pdf-lib).**
- Load source once with `{ ignoreEncryption: true, throwOnInvalidObject: false }` (the second flag is pdf-lib default but make it explicit).
- Call `copyPages` **once** with all indices, then build per-page docs from that pre-copied array. This avoids re-parsing the source page tree N times and sidesteps a class of "missing dict" errors that only surface on the 2nd+ call.

**Layer 2 — Per-page fallback via pdfjs-dist rasterization.**
When the pdf-lib copy of a specific page still throws, fall back to:
1. Render that page with `pdfjs-dist` to a canvas at ~150 DPI.
2. Convert canvas → PNG bytes.
3. Create a fresh `PDFDocument`, embed the PNG, add a page matching the original dimensions, draw the image.
4. Save as the per-page PDF file.

This guarantees every page produces an output file even if the source is partially corrupt. Rasterized pages lose selectable text but the user can still view/OCR them — better than the whole migration failing.

### Error handling
- Wrap each page in try/catch. Collect failures.
- If all pages succeed: success toast (current behavior).
- If some pages fell back to raster: warning toast `"Migrated N/N pages, K were rasterized due to malformed source."`
- If a page fails both paths: skip it, continue, and report `"Migrated N/M pages, K skipped (unrecoverable)."` instead of aborting the whole migration.

### Files
- `src/utils/pdfSplitUpload.ts` — rewrite `splitPdfToPages` with the two-layer strategy. Return `{ files: File[]; rasterizedIndices: number[]; failedIndices: number[] }` (callers updated to read `files`).
- `src/components/statistics/PdfSplitCell.tsx` — surface the warning/partial-success toast variants.

### Out of scope
- No DB schema change.
- No change to upload-to-archive or manifest format.
- No change to the watermark feature.
