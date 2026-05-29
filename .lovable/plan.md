## Goal

Identify all resources/questions whose split-PDF per-page files fail to parse (the "Invalid PDF structure" case affecting IDs 163, 164) so you know the full scope. Read-only — no DB writes, no re-uploads.

## Scope

Frontend only. New audit tool added to the existing admin Statistics page. No backend, no migrations, no changes to upload/split logic. The current inline error + Download/Open fallback stays as-is.

## What it does

1. New button **"Validate split PDFs"** in `src/pages/Statistics.tsx` (admin-gated, like other admin tools there).
2. On click:
   - Fetch all resources and questions whose `data` references a `…/pages/manifest.json` URL.
   - For each row, fetch the manifest through `fetch-media` proxy (reuses `fetchSplitPdfManifest`).
   - For each page URL in the manifest, fetch via `fetchPdfViaProxy` and try `pdfjsLib.getDocument(...).promise`. Mark page as `ok`, `unavailable` (proxy soft-miss), or `broken` (pdfjs throw — this is the "Invalid PDF structure" class).
   - Run with a small concurrency limit (e.g. 4) and a visible progress counter `{processed}/{total} rows · {brokenPages} broken pages found`.
3. Results panel inline:
   - Summary: total manifests scanned, total pages checked, broken-page count, unavailable-page count.
   - Table of rows with at least one broken page: kind (resource/question), id, title (resource) / chapter (question), manifest URL, list of broken page numbers, links to `/resource/:id` or `/question/:id`.
4. **Export CSV** button writes `pdf-health-report.csv` to the browser download (columns: kind, id, title, manifest_url, total_pages, broken_pages, unavailable_pages).
5. Re-running clears previous results.

## Files

- `src/utils/pdfHealthAudit.ts` (new) — orchestration: enumerate rows, fetch manifests, per-page parse check, concurrency limit, returns structured report.
- `src/components/statistics/PdfHealthAuditPanel.tsx` (new) — button, progress, results table, CSV export.
- `src/pages/Statistics.tsx` — mount `<PdfHealthAuditPanel />` in the admin tools area (same gating as existing admin-only sections).

## Non-goals

- No automatic re-upload, re-split, or rasterization.
- No DB column for `pdf_health` — results are session-only.
- No change to `PdfInlinePreview` behavior (current degraded toolbar already covers user-facing UX).

## Result

You get a definitive list of every resource/question with corrupt split pages so you can decide case-by-case whether to ask for re-upload or hard-delete.
