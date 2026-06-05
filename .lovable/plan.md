## PDF Rollback via Archive.org History

Restore an overstamped (or otherwise damaged) PDF to a healthy earlier version using Archive.org's built-in file history — no extra backup storage needed.

### How Archive.org history works

Each time a file in an item is overwritten via S3, Archive.org keeps the previous version in `history/files/<filename>.~N~`. `~1~` is the very first original (pre any overwrite), `~2~` the next, etc. The current live file is the unsuffixed one. We list these versions via the item's metadata API:

```
GET https://archive.org/metadata/qarray-educational-content
→ files[]  // includes entries with name "history/files/<key>.~N~"
```

### Backend

1. **New edge function `pdf-rollback`** (verify_jwt=false, validates JWT in code, requires admin/moderator)
   - Input: `{ table: 'resources'|'questions', id: number, version?: 'earliest'|'previous'|number }` — defaults to `earliest` (the `~1~` version = pristine original).
   - For each Archive.org URL on the row (expand split-PDF manifests too):
     - Fetch item metadata, filter `files[]` for `history/files/<key>.~N~`.
     - Pick the requested version (default `~1~`).
     - Download that history file via the `fetch-media` proxy.
     - Re-upload to the current key via the existing `upload-to-archive` `overwrite` action.
   - After all URLs restored, reset DB fields:
     - `watermark_status = 'pending'`
     - `pages_watermarked = 0`
     - `watermark_processed_at = null`
     - `watermark_error = null`
     - `watermarked_urls = '{}'`
     - `watermark_stamp_count = null`
     - `watermark_overstamped = false`
     - `watermark_scan_at = null`
   - Returns `{ restored: number, skipped: number, errors: string[] }`.

2. **New endpoint `pdf-rollback-list-versions`** (or same function with `action=list`)
   - Given a row, return the list of available history versions per URL (N, size, mtime) so the per-row UI can let the admin pick which version to roll back to instead of always defaulting to earliest.

### UI

1. **Per-row button — `RollbackVersionDialog.tsx`**
   - Added to the watermark cell in Statistics, next to `WatermarkStatusEditor`.
   - Opens a dialog that:
     - Calls list-versions, shows a table of `~N~ | mtime | size` per file.
     - Default selection: earliest (`~1~`).
     - Confirm → calls `pdf-rollback` with the chosen version.
     - Shows per-URL progress and final status.

2. **Bulk action in Statistics toolbar**
   - "Rollback over-stamped" button (admin only).
   - Confirms count, then iterates rows with `watermark_overstamped = true` and calls `pdf-rollback` with `version='earliest'` for each. Progress toast.

### Files

**Created**
- `supabase/functions/pdf-rollback/index.ts`
- `src/components/statistics/RollbackVersionDialog.tsx`
- `src/utils/pdfRollback.ts` (client wrapper: list versions, invoke rollback, bulk loop)

**Edited**
- `src/pages/Statistics.tsx` — wire per-row button into watermark cell and add bulk toolbar action.

### Notes / limitations

- Archive.org's metadata refresh after an overwrite has eventual-consistency lag (often minutes). The function uses the same retry/backoff pattern as `fetch-media`.
- If a row has no `history/files/*` entries, the current file IS the original — the dialog tells the admin "no history available" and disables rollback.
- Split-PDF manifests: each per-page PDF is rolled back independently; the manifest itself isn't touched.
- No new database tables are added — Archive.org IS the version store.
