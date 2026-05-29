## Goal

When a multi-page (split) PDF fails to load its manifest, the current UI replaces the entire preview card with a full-bleed error ("Couldn't load multi-page PDF"). The user wants the surrounding actions to stay available so the failure doesn't "cloud" the rest of the media UI.

## Scope

Only `src/components/PdfInlinePreview.tsx` — purely presentational. No changes to manifest fetching, proxy, upload pipeline, DB, or any other media types.

## Changes

In `SplitPdfPreview`:

1. Always render the standard `SinglePdfView` shell (toolbar with Download / Open in tab / Zoom, etc.) so those controls remain visible even on manifest failure.
2. When `error || !manifest`:
   - Mount `SinglePdfView` with `url={url}` (the manifest URL). The inner preview will naturally show its own "Couldn't load preview" inline message in the body area (which already includes a Retry button) instead of replacing the whole card.
   - Override `filenameOverride` with a best-effort name derived from the manifest URL path so the toolbar shows something meaningful.
   - Pass a small `rightSlot` chip "Multi-page index unavailable" and a Retry button that re-runs `load()` to re-attempt manifest fetch.
   - Hide page-dropdown and "Full PDF (Np)" merge button (they require the manifest).
3. Keep the existing success path unchanged (dropdown + per-page view + "Full PDF" merge).
4. Loading state stays the same compact spinner.

## Result

- The page never loses its top toolbar — Download (per current page when available), Open in tab, Zoom, and any external actions on `ResourceDetail` / `MediaList` remain visible and clickable.
- Manifest failure shows as a small inline notice + Retry inside the preview body, not a full-card replacement.
- No behavior change to single-PDF previews, images, audio, or to the actual fetch/proxy logic.
