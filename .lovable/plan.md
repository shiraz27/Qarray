# Always-complete PDF OCR

## Problem

Today `processPdfWithFallback` is all-or-nothing on the whole PDF:

- If the document's combined text layer has >50 chars of letters, it returns that and **never runs Tesseract**.
- If not, it OCRs the whole document and returns only the OCR.

Consequences for `ocr_text`:

- A mixed PDF (typed cover page + scanned exam pages) loses every scanned page.
- A PDF where text-layer covers some content but images on the same page contain different content (formulas, tables) loses the image content.

You want `ocr_text` to be the **union** of every readable signal in the PDF, every time.

## Fix: per-page, capture-everything

Replace the document-level branch with a per-page loop that always emits content for each page:

For each page in the PDF:

1. Read the page's text layer.
2. Render the page to a canvas and run Tesseract on it.
3. Combine both into the page's output (deduped if identical).

Then concat all pages with a `--- Page N ---` header.

This guarantees:

- Text-layer pages: text-layer text is in `ocr_text`.
- Scanned pages: Tesseract output is in `ocr_text`.
- Mixed pages (typed paragraph + scanned figure with text): both are in `ocr_text`.
- Empty pages: a `[no text]` marker so page numbering stays consistent.

## Per-page combine rule

```text
if textLayer is "real" AND ocrText is "real":
    if normalized(ocrText) ⊇ normalized(textLayer): keep ocrText
    elif normalized(textLayer) ⊇ normalized(ocrText): keep textLayer
    else: emit both, labeled [text layer] / [ocr]
elif textLayer is "real": keep textLayer
elif ocrText is "real": keep ocrText
else: "[no text]"
```

"real" = trimmed length ≥ 10 and contains a letter or Arabic char. Normalization for the dedupe check = lowercased, whitespace-collapsed.

This avoids duplicating the same paragraph twice while still capturing extra OCR content when the text layer is partial.

## Performance

- Open the PDF once, reuse the pdfjs document.
- Lazily create **one** Tesseract worker on the first page, reuse it for every page, terminate at the end. This is critical for 30+ page PDFs.
- Render scale stays at 2.0 (current value).
- Per-page progress is reported so the existing 0–90% progress slice in `ocrAndExtract.ts` still updates smoothly.

## Where to change

The same broken logic is duplicated in three files. Consolidate into one helper to fix it once and avoid drift:

New file:

- `src/utils/pdfOcrHelpers.ts` exporting `extractPdfTextAndOcr(blob, opts?)`:
  - `opts.onPageProgress?(pageIndex, totalPages, subRatio)` — for granular progress
  - `opts.signal?` — for the upload flow's abort handling
  - Returns the combined per-page string described above

Update callers to use the helper and delete their local `extractPdfText`, `ocrPdfPages`, `processPdfWithFallback` copies:

- `src/utils/clientOcrProcessor.ts` (admin OCR for resources, Statistics page)
- `src/utils/clientQuestionOcrProcessor.ts` (admin OCR for questions)
- `src/utils/ocrAndExtract.ts` (user upload AI fill — keeps its progress wiring intact)

## Output format example

```text
--- Page 1 ---
[text layer]
Devoir de contrôle n°1 - Mathématiques - 4ème SE

--- Page 2 ---
[ocr]
Exercice 1 (5 points)
Soit f la fonction définie sur R par ...

--- Page 3 ---
[text layer]
Question 1: ...

[ocr]
(handwritten formula transcription)
```

The `[text layer]` / `[ocr]` labels are only added when both signals exist on the same page; pages with a single source emit just the text. The existing `search_pdf_content` ILIKE search keeps working unchanged.

## What does NOT change

- Media-type detection (`mediaTypeUtils.ts`).
- Image-only OCR path (`extractImageText`) — single-image inputs already get full Tesseract.
- Status logic (`completed` / `failed` / `not_applicable`) and proxy-fetch behavior.
- AI metadata extraction and the description-merge block added previously.
- No DB migration needed. After deploy, admins re-run OCR from Statistics to refresh affected resources; `ocr_text` is overwritten with the complete per-page output.

## Edge cases

- Pure text-layer PDF: Tesseract still runs per page (cost: significant for big PDFs). Mitigation: skip Tesseract on a page when its text-layer content is "very rich" (≥ 200 chars with letters AND no embedded images detected via `page.getOperatorList()` image ops). Fallback if detection is uncertain: still OCR.
- Pure scanned PDF: text layer empty for every page, Tesseract runs every page (same cost as today's stage-2 path).
- Tesseract error on one page: capture `[ocr failed: <msg>]` for that page, continue.
- Render error on one page: capture `[render failed: <msg>]` for that page, continue.
- Abort signal (upload flow only): checked between pages; worker terminated.
- Overall status remains `completed` if any page produced any text; `failed` only if every page errored.
