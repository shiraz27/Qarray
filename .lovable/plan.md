## Problem

On `/resource/91`, the attachment is a split-PDF manifest URL (`…/pages/manifest.json`). The header "Attachments (1)" renders, but no preview appears below it.

Root cause: `src/pages/ResourceDetail.tsx` has its own inline `isPdf` check (lines 649–656) that only matches `.pdf` / `-pdf` patterns. Manifest URLs end in `.json`, so the check returns `false`, falls through to `<MediaPreview>`, and renders nothing.

The shared utility `isPdfUrl()` in `src/utils/mediaTypeUtils.ts` already handles manifest URLs correctly. `QuestionDetail` is unaffected because it uses `MediaList` → `extractMediaFromText`, which already routes manifests to `PdfInlinePreview`.

(Side note: the proxy 404s seen earlier in network logs were Archive.org eventual consistency. Direct curl + the proxy now return the manifest JSON correctly, so no edge-function changes needed.)

## Change

**`src/pages/ResourceDetail.tsx`**
- Import `isPdfUrl` from `@/utils/mediaTypeUtils`.
- Replace the inline `isPdf` IIFE in the attachments map with `isPdfUrl(url)` so manifest URLs route to `<PdfInlinePreview>`, which already knows how to fetch the manifest and render the page-dropdown gallery.

No other changes. No DB migration. No edge function changes. Backwards compatible with regular `.pdf` / `-pdf` URLs.
