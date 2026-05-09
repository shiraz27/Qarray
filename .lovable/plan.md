## Goal

On the resource details page, show PDFs inline (no popup, no Google Viewer, no archive.org top-level navigation) and add a clear **Download** button. Bypasses ad-blockers blocking `*.archive.org` because the file is fetched through our same-origin `fetch-media` edge function.

## Implementation

### 1. New component: `src/components/PdfInlinePreview.tsx`

Reusable inline PDF viewer rendered directly in the page (not a dialog).

- Props: `url: string`, `className?: string`.
- On mount: `supabase.functions.invoke('fetch-media', { body: { url } })` → returns blob/ArrayBuffer.
- Renders pages with `pdfjs-dist` (already installed; reuse worker setup from `src/utils/clientOcrProcessor.ts`).
- Vertical scroll list of `<canvas>` pages, lazy-rendered with `IntersectionObserver` (only render canvases when visible to keep memory low for big PDFs).
- Toolbar (sticky top of preview): page indicator (`3 / 42`), zoom – / + buttons, **Download** button, **Open original** link (escape hatch).
- Download button: builds an object URL from the already-fetched ArrayBuffer (`new Blob([buf], { type: 'application/pdf' })`) and triggers an `<a download="filename.pdf">` click. Filename derived from URL's last path segment, with the dash-extension convention reversed (`-pdf` → `.pdf`).
- States: loading spinner, "file unavailable" error (when proxy returns `unavailable: true`), generic error with retry.
- Cleanup on unmount: destroy pdf doc, revoke object URLs.

### 2. Wire it into `src/pages/ResourceDetail.tsx`

- For each media URL in the resource that is a PDF (same detection as `MediaPreview`), render `<PdfInlinePreview url={url} />` instead of (or in addition to) the existing `<MediaPreview>` card.
- Non-PDF media keeps using the existing `MediaPreview` component.

### 3. Update `src/components/MediaPreview.tsx` PDF branch

- Keep the small card preview for places where inline rendering is too heavy (lists, etc.) but replace the failing direct-link behavior:
  - Primary action: **Download** (same blob-from-proxy approach, no preview).
  - Secondary text link: "Open original" pointing to the raw archive.org URL for users without blockers.
- Remove the broken Google Viewer link.

## Technical notes

- `fetch-media` already streams the blob with proper CORS and retries — no edge function changes.
- pdfjs worker: import the worker URL the same way `clientOcrProcessor.ts` does to avoid CSP / version mismatch issues.
- For very large PDFs (>50 MB), the proxy fetch can take a while; show progress text "Loading PDF…" and a cancel button that aborts the invocation.
- No DB changes, no upload-pipeline changes, no auth changes.

## Files

- New: `src/components/PdfInlinePreview.tsx`
- Edit: `src/pages/ResourceDetail.tsx` (use new component for PDFs)
- Edit: `src/components/MediaPreview.tsx` (replace broken link with Download + Open original)

## Out of scope

- Inline preview for question detail pages (can be added later by reusing the same component).
- Text search inside PDF, thumbnails sidebar, annotations.
