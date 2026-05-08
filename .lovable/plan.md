## Goal

Let the admin pick **how thoroughly** each OCR run should work, so they can trade speed against coverage on a per-document or per-batch basis.

Three modes:

| Mode | What runs per page | Speed | When to use |
|------|--------------------|-------|-------------|
| **Text only** | `pdfjsLib` text layer extraction. No Tesseract. | Near-instant (seconds for 250 pages). | Born-digital PDFs (cours, résumés typed in Word/LaTeX). |
| **Image only** | Render page → Tesseract `eng+ara`. No text layer. | Slow (current speed). | Pure scans where the text layer is missing or junk. |
| **Mixed** (current behavior) | Text layer + Tesseract, combined per page. | Slowest, most thorough. | Mixed documents (typed text with figure captions, handwritten notes, photos of book pages). |

For standalone images (PNG/JPG resources), only **Image only** and **Mixed** make sense — **Text only** is hidden / disabled there.

## UX

In `src/pages/Statistics.tsx`:

1. Add a small `OcrMode` selector (Radio group or `Select`: `text` / `image` / `mixed`) next to the existing **Run OCR** / **Run Bulk OCR** buttons. Default = `mixed` (preserves today's behavior).
2. The selector is shared across the Resources tab and Questions tab and lives in component state (`const [ocrMode, setOcrMode] = useState<OcrMode>('mixed')`).
3. Pass `ocrMode` into every call to `processResourceOCR`, `processQuestionOCR`, `runBulkResourceOcr`, `runBulkQuestionOcr`.
4. Show the mode briefly in the toast (`[3/12] Text-only OCR…`) so the admin sees which pipeline ran.

## Code changes

### `src/utils/pdfOcrHelpers.ts`

- Extend `ExtractPdfOptions` with `mode?: 'text' | 'image' | 'mixed'` (default `'mixed'`).
- Branch inside `extractPdfTextAndOcr`:
  - `mode === 'text'`: loop pages, call `getPageText(page)` only. Skip canvas render and Tesseract entirely. Don't spin up a worker. Concatenate per-page output. If nothing extracted, throw `No readable text layer` so caller marks `failed`.
  - `mode === 'image'`: skip `getPageText`. Render every page to a canvas → Tesseract. Combine = OCR text only.
  - `mode === 'mixed'`: existing path.
- Keep the per-page progress callback semantics for all three modes.

### `src/utils/clientOcrProcessor.ts` and `src/utils/clientQuestionOcrProcessor.ts`

- Accept an `OcrMode` arg on `processResourceOCR(resourceId, mode, onProgress?)` (and the question equivalent).
- For PDFs, forward `mode` to `extractPdfTextAndOcr({ mode, onPageProgress })`.
- For images:
  - `mode === 'text'`: skip the file, push `[Image — text-only mode skipped]`. Don't increment `ocrableFileCount` (so a resource that's only images in text mode ends up `not_applicable` with a clear message, instead of `failed`).
  - `mode === 'image'` or `'mixed'`: run `extractImageText` (Tesseract) as today.
- Persist the mode in the success message stored in `ocr_text` header (e.g. prepend `[Mode: text]\n…`) so admins can later see how each row was processed.

### `src/pages/Statistics.tsx`

- New `OcrMode` UI control (default `'mixed'`).
- Wire the selected mode through every OCR call site already identified (single-row buttons, bulk buttons, retry buttons).
- Tooltip on the selector explaining the trade-off in one line each.

### Memory

Update `mem://ocr/client-side-two-stage-pdf-processing.md` (or add a sibling memory) to record the three modes and that `mixed` remains the default. Add a Core line if it deserves it ("OCR has three modes: text / image / mixed; default mixed").

## Out of scope

- Auto-detecting the best mode per file (could be a follow-up — render one page, sample text-layer richness, decide).
- Backend OCR (already discarded for the reasons we covered).
- Concurrency improvements — keep this PR focused on the mode selector. Concurrency can layer on top later without changing this API.

## Expected impact

- Admins running 250-page typed PDFs in **Text only** mode: ~20 minutes → **a few seconds**, with full text-layer fidelity.
- Pure scans in **Image only** mode: same speed as today, no wasted text-layer reads (small win).
- Default **Mixed** behavior: unchanged, so existing OCR runs and stored `ocr_text` rows stay valid.
