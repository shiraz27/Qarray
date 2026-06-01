## Goal

When a resource/question has multiple attached PDFs, stop stacking them vertically. Instead show a left-hand sidebar that lists every attached PDF (thumbnail of page 1, filename, page count), and render only the selected PDF in a larger preview pane on the right.

## Scope

- Affects: `src/components/MediaList.tsx` (consumer) and a new `PdfAttachmentsViewer` component.
- `PdfInlinePreview` itself is reused unchanged for the right-side rendering.
- Non-PDF media (images/video/audio) keep their current stacked layout, rendered below the PDF viewer block.

## New component: `src/components/PdfAttachmentsViewer.tsx`

Props: `{ pdfs: { url: string }[]; className?: string }`.

Layout:
```
┌──────────────────────────────────────────────┐
│  Sidebar (w-56 / w-64)  │   Active PDF       │
│  ───────────────────    │   <PdfInlinePreview│
│  [thumb] file1.pdf      │     url={selected} │
│          12 pages       │   />               │
│  [thumb] file2.pdf  ◀── │                    │
│          3 pages        │                    │
└──────────────────────────────────────────────┘
```

- Sidebar items: small page-1 thumbnail (rendered once via pdfjs at ~80px wide), filename (from `getFilenameFromUrl` helper, extracted to a shared util), page count, loading skeleton while metadata loads. Active item highlighted with `bg-accent`.
- Right pane: keyed `<PdfInlinePreview url={selected} />` so internal state resets on switch.
- Default selection: first PDF.
- Single PDF case: skip the sidebar entirely, render `PdfInlinePreview` full width (no regression).
- Mobile (`<md`): sidebar becomes a horizontal scrollable strip above the preview (thumb + filename chip), same selection behavior.

## Changes to `MediaList.tsx`

- Split `media` into `pdfs` and `others`.
- If `pdfs.length >= 1`, render `<PdfAttachmentsViewer pdfs={pdfs} />` once.
- Render `others` with the existing `MediaPreview` loop below.
- Keep the existing "Attachments (N)" heading using the total count.

## Shared helper

Move `getFilenameFromUrl` from `PdfInlinePreview.tsx` to `src/utils/pdfMediaFetch.ts` (or a new `pdfFilename.ts`) and import it from both places.

## i18n

Add to `src/i18n/locales/{en,fr,ar}/media.json` (or `common.json` if media ns doesn't exist yet):
- `pdfViewer.pagesCount` ("{{count}} pages")
- `pdfViewer.loading` ("Loading…")
- `pdfViewer.selectPdf` ("Select a PDF")

## Out of scope

- No change to download/preview feature flags, watermarking, or `PdfInlinePreview` internals.
- No change to non-PDF rendering, MediaPreviewDialog, or MediaUploader.
