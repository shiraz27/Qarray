## Goal

1. Always split every uploaded PDF into per-page files + `manifest.json` (no more "small files stay as a single PDF").
2. In the existing Statistics admin table (resources and questions), add a **"Per-page"** column showing whether each row's PDF media is already split, plus an inline **Migrate** action that runs the split + re-upload + DB rewrite for that single row.

## Part 1 — Force split on every upload

`src/utils/pdfSplitUpload.ts`:
- Comment out (don't delete) the `if (pageCount <= SPLIT_PAGE_THRESHOLD) { … single-file path … }` early-return so every PDF goes through the split branch.
- Keep `SPLIT_PAGE_THRESHOLD` exported but unused, with a `// kept for easy revert` comment.
- Fallback unchanged: if `pdf-lib` fails to read page count (corrupt PDF), upload as a single file rather than fail outright.
- N=1 PDFs go through the split path → produce `pages/1.pdf` + manifest; manifest handling already supports any N ≥ 1.

## Part 2 — Refactor shared helpers

Export from `src/utils/pdfSplitUpload.ts` (no behavior change):
- `splitPdfToPages(file)`
- `sanitizeBase(name)`
- `shortHash()`
- `buildAndUploadManifest({ base, pageUrls, originalName, options })` — extracted from the inline manifest-write block.

## Part 3 — Inline migration UI in Statistics admin table

Reuses the existing admin-only Statistics page. No new tab.

### New component `src/components/statistics/PdfSplitCell.tsx`
Renders per-row in both the resources and questions tables.

Status pill, derived client-side from the row's media list:
- **Already split** — at least one media URL `isSplitPdfManifestUrl(...)` and no non-manifest PDF entries.
- **Not split** — has ≥1 PDF entry that is NOT a manifest URL.
- **No PDFs** — row has no PDF media (badge muted, no action).
- **Migrating…** — local in-progress state with per-page progress (current page / total).
- **Error** — failure message with Retry button.

Action button (shown only when status = "Not split"):
- **Migrate**: runs `migrateRowPdfs(table, row)` client-side using the helpers from Part 2.
  - For each non-manifest PDF URL in the row's media:
    1. `fetchPdfViaProxy(url)` → Blob → File (filename derived from URL leaf).
    2. `splitPdfToPages` → page files.
    3. Upload each page to `${sanitizeBase(name)}-${shortHash()}/pages/N.pdf` via `uploadFileToArchiveControlled`.
    4. `buildAndUploadManifest(...)` → manifest token.
    5. Replace the old token at the same array index in the row's `data` (resources) / media-bearing field (questions). Other entries left untouched.
  - Persist via supabase `.update()` on the row (`data` for resources; the appropriate media-array column for questions — verify in code, fall back to `data` if same name).
  - On success: update local Statistics state so the row re-renders as "Already split".
- Errors per URL don't abort the whole row — partial successes are saved; remaining URLs marked errored with Retry.

### Wiring
- `src/pages/Statistics.tsx`:
  - Add `<TableHead>Per-page</TableHead>` between "Pages" and "OCR Status" in both the resources table (~line 1801) and questions table (~line 2290).
  - Add a matching `<TableCell><PdfSplitCell … /></TableCell>` in both row renders, passing `{ table, row, onChanged }`.
- Old Archive.org files are left in place (out of scope for this pass).

## Out of scope
- Bulk "Migrate all" button — per-row only for now (avoids accidental mass uploads, keeps the UI honest).
- Deleting old archive items.
- Migrating PDF URLs embedded inside free-text fields where they aren't in a structured array.
