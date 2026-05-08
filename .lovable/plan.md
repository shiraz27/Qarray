## Goal

Switch Archive.org uploads from a single PUT to S3-style multipart uploads so large files upload more reliably (better resume on transient 503s, no single huge edge-function request).

## Approach

Archive.org's S3 endpoint supports the standard AWS S3 multipart protocol with `LOW <access>:<secret>` auth:

- Initiate: `POST /<item>/<key>?uploads` → returns XML with `<UploadId>`
- Upload part: `PUT /<item>/<key>?partNumber=N&uploadId=...` → returns `ETag`
- Complete: `POST /<item>/<key>?uploadId=...` with XML body listing parts → final URL
- Abort: `DELETE /<item>/<key>?uploadId=...`

Archive.org's minimum part size is 5 MB (last part can be smaller). We'll use **8 MB parts** and apply multipart to any file **≥ 16 MB**; smaller files keep the existing single-PUT path (no benefit, more round-trips).

Because the edge function still has request size + timeout limits, the browser does the slicing and orchestration; the edge function only proxies signed credentials per call. We refactor `upload-to-archive` into a single function with an `action` discriminator so we don't multiply functions or `verify_jwt` config.

## Edge function changes (`supabase/functions/upload-to-archive/index.ts`)

Add an `action` field on the request. Existing single-shot upload stays the default for backwards compatibility.

Actions:
1. `single` (default, current behavior) — multipart formData with `file`, used for small files.
2. `initiate` — JSON body `{ fileName, fileType, chapterId?, contentType?, contentId? }`. Resolves the same folder path / metadata as today, calls `POST ...?uploads` with `x-amz-auto-make-bucket:1` and metadata headers. Returns `{ uploadId, key, finalUrl }`.
3. `upload-part` — multipart formData `{ key, uploadId, partNumber, chunk }`. Forwards `PUT ...?partNumber=N&uploadId=...` to archive.org with the chunk bytes, returns `{ partNumber, etag }`. Wraps the existing retry/backoff logic on 503/5xx.
4. `complete` — JSON `{ key, uploadId, parts: [{ partNumber, etag }] }`. Sends `POST ...?uploadId=...` with the parts XML. Returns `{ url }`.
5. `abort` — JSON `{ key, uploadId }`. Sends `DELETE ...?uploadId=...`. Best-effort.

The chapter/subject/class lookup currently in the function moves into `initiate` only (other steps don't need it). Path-building, sanitization, and metadata header logic are factored into a small helper shared with `single`.

## Frontend changes

### New helper: `src/utils/archiveMultipartUpload.ts`

Single entry: `uploadFileToArchive(file, options, onProgress?) → { url }`.

- If `file.size < 16 MB` → call existing `action: 'single'` path (formData), unchanged behavior.
- Else:
  1. `initiate` → `{ uploadId, key }`.
  2. Slice file into 8 MB chunks; for each part, call `upload-part` with retry/backoff (reuse the same exponential backoff logic that's currently in `UploadManagerContext`). Report progress as `(completedBytes / totalBytes)`.
  3. On success → `complete` with the collected `{ partNumber, etag }` array → final URL.
  4. On unrecoverable failure → `abort` and surface error to caller.
- Parts upload **sequentially** (matches current "one upload at a time" queue and avoids hammering archive.org). Configurable concurrency = 1 for now.

### Call sites

Replace direct `supabase.functions.invoke('upload-to-archive', { body: formData })` with `uploadFileToArchive(...)` in:

- `src/contexts/UploadManagerContext.tsx` — `uploadWithRetry` becomes a thin wrapper calling the helper, forwarding per-part progress to `setItems(... progress ...)` so the existing `UploadStatusIndicator` shows real progress instead of just queued/uploading.
- `src/pages/Profile.tsx` — teacher document upload.
- `src/pages/CompleteProfile.tsx` — same pattern.

Outer retry in `UploadManagerContext` stays (covers full-file retry) but inner part-level retries handled inside the helper, so we drop the outer retry count to 1–2 to avoid 3×3 retry storms.

## Edge cases & details

- ETag must be captured exactly as returned (with quotes) and sent back in the complete XML — archive.org validates this.
- Metadata headers (`x-archive-meta-*`) are only allowed on `initiate`, not on part uploads or complete.
- If a part upload fails after all retries, run `abort` so we don't leave dangling multipart sessions on archive.org.
- Keep the existing `encodeForHeader` / `sanitize` helpers; nothing changes about folder layout or final URL format (`https://archive.org/download/<item>/<folderPath>`), so existing DB rows and `fetch-media` proxy continue to work.
- `verify_jwt` setting in `supabase/config.toml` for `upload-to-archive` is unchanged.

## Out of scope

- No DB schema changes.
- No change to `fetch-media`, OCR pipeline, or how URLs are stored.
- No parallel part uploads (can be added later if needed).
