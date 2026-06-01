## Goal
Add feature flags to gate each download option independently, alongside the existing `direct_pdf_preview` flag.

## New feature flags (in `feature_flags` table)
Migration inserts three rows, all defaulting to **enabled = true**:
- `download_file` — full-file Download button (single resource / media / fallback download in `PdfInlinePreview` and `MediaPreview`).
- `download_per_page` — "Page N only" download for split PDFs (`PdfInlinePreview` paged viewer).
- `download_batch` — "Download all" merge-all-pages action for split PDFs.

## Where each flag is consumed
- **`src/components/PdfInlinePreview.tsx`**
  - Read all three flags via `useFeatureFlag`.
  - Single (non-paged) viewer: hide the Download button when `download_file` is off.
  - Paged viewer (`PdfSplitViewer`): hide "Page N only" button when `download_per_page` is off; hide "Download all" button when `download_batch` is off.
- **`src/components/MediaPreview.tsx`** and **`src/components/MediaPreviewDialog.tsx`**: hide their per-file download buttons when `download_file` is off.

## Admin toggle UI
`src/pages/Moderation.tsx` already renders all flags from `useFeatureFlags()`, so the three new rows show up automatically with toggle + description. No UI change needed.

## Behavior notes
- Flags default to **on** — no behavior change until an admin disables them.
- When a flag is off the corresponding button is simply not rendered (no disabled state, no tooltip).
- Loading state: while flags are loading, treat as enabled (same pattern used for `direct_pdf_preview`) so the UI doesn't flicker.
- No edge-function or RLS changes; existing `feature_flags` policies already cover this.

## Files to change
1. New migration: `supabase/migrations/<ts>_download_feature_flags.sql` — inserts the three flags.
2. `src/components/PdfInlinePreview.tsx` — gate the three download buttons.
3. `src/components/MediaPreview.tsx` — gate the per-file download button.
4. `src/components/MediaPreviewDialog.tsx` — gate the per-file download button (if it renders one separately).

## Out of scope
- No changes to watermarking, fetch logic, or preview itself.
- No per-role overrides (admins still subject to the flag, matching existing pattern).
