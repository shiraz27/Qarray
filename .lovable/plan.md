
## Goal

Make large Archive.org uploads dramatically faster, show real progress from byte 0, and add pause/resume.

## Root causes (measured against current code)

1. **Double bandwidth.** Every 8 MB part is sent browser → edge function → archive.org. The edge function re-buffers the whole part (`await chunk.arrayBuffer()`), then re-uploads. Each part also pays a fresh boot (logs show `booted (time: ~30ms)` per call) plus Supabase request overhead.
2. **Sequential parts.** `multipartUpload` in `archiveMultipartUpload.ts` uploads one part at a time.
3. **Fake 10%.** `processQueue` sets `progress: 10` immediately, before any byte is sent. The next update only fires when part 1 finishes.
4. **Per-part granularity only.** Even with multipart, progress jumps in 8 MB chunks; no in-flight bytes.
5. **No pause/resume.** `UploadStatusIndicator` only exposes Retry / Remove (queued) / Clear.

## Solution

Move the actual byte transfer **directly from the browser to archive.org**, keep credentials server-side via short-lived **presigned PUT URLs**, run parts in parallel, and wire real `xhr.upload.onprogress` events into the UI with pause/resume.

### Architecture

```text
Browser                                 Edge function                Archive.org S3
  |-- initiate ---------------------->|                              |
  |                                   |---- POST ?uploads ---------->|
  |<--- { uploadId, key, finalUrl }---|<--- <UploadId>... -----------|
  |                                                                  |
  |-- sign-part(partNumber) ------>|                                  |
  |<--- { url, headers, expiresAt }-|                                 |
  |                                                                  |
  |---------- PUT chunk (XHR, onprogress) -------------------------->|
  |<------------------------ ETag -----------------------------------|
  |                                                                  |
  |-- complete(parts) -------------->|---- POST ?uploadId=... ------>|
  |<--- { url } ---------------------|<---- finalize ----------------|
```

Credentials never leave the edge function. Each presigned URL is a single-use `PUT` valid for ~1 hour, generated using archive.org's S3-compatible query-string auth (HMAC-SHA1 over the canonical string, same scheme already used implicitly via the `LOW` auth header).

### Edge function changes (`supabase/functions/upload-to-archive/index.ts`)

- Keep `single`, `initiate`, `complete`, `abort` actions as-is (they are small JSON/control calls).
- **Remove** `upload-part` body proxying. Replace with a new action **`sign-part`**:
  - Input: `{ key, uploadId, partNumber }`.
  - Output: `{ url, method: "PUT", headers: { ... }, expiresAt }`.
  - Implementation: build `https://s3.us.archive.org/<item>/<key>?partNumber=N&uploadId=...&AWSAccessKeyId=...&Expires=...&Signature=...` where Signature = `base64(HMAC-SHA1(secret, stringToSign))` and `stringToSign = "PUT\n\n\n<expires>\n/<item>/<key>?partNumber=N&uploadId=..."`. Use Web Crypto (`crypto.subtle.importKey` + `sign("HMAC", key, data)` with SHA-1) — no extra deps.
- Keep request validation; require auth header from caller (existing `verify_jwt` setting).

### Frontend changes (`src/utils/archiveMultipartUpload.ts`)

Rewrite `multipartUpload` around an XHR-based per-part uploader:

```ts
function putPartXhr(url, blob, onProgress, signal): Promise<string /* etag */>
```

- Uses `XMLHttpRequest` for `xhr.upload.onprogress` (fetch still has no upload progress in browsers).
- `signal.addEventListener('abort', () => xhr.abort())` for pause/cancel.
- Returns `ETag` from `xhr.getResponseHeader('ETag')`.

Orchestrator:

- Initiate via edge function → `{ uploadId, key }`.
- Build a part list `[{ partNumber, start, end }]`.
- Maintain a worker pool with **`CONCURRENCY = 4`** (configurable). Each worker:
  1. Take next un-uploaded part.
  2. Call `sign-part` (cheap JSON).
  3. `putPartXhr(url, file.slice(start, end), partProgress, abortSignal)` with retry/backoff (3 attempts, exponential).
  4. Record `{ partNumber, etag, uploadedBytes }`.
- A shared `bytesByPart: Map<number, number>` is summed on each progress tick; emit one aggregated `onProgress({ loaded, total, ratio })` from byte 0.
- On all parts done → `complete`. On unrecoverable failure or user cancel → `abort`.
- Threshold logic unchanged (single PUT under 16 MB), but route the single PUT through a presigned URL too, so even small files get true progress and skip the proxy.

### Pause / Resume / Cancel API

Extend the helper:

```ts
uploadFileToArchive(file, options, onProgress?, controls?)
  → { url, controller: { pause(), resume(), cancel() } }
```

- Internal state: `running | paused | cancelled`.
- `pause()`: set state, abort in-flight XHRs (parts already started lose progress for that part only — archive.org keeps completed parts).
- `resume()`: re-arm `AbortController`, restart workers; they skip parts already in `completedParts`.
- `cancel()`: abort + call `abort` action; reject promise.

### Upload manager + UI

`src/contexts/UploadManagerContext.tsx`:

- Replace the fake `progress: 10` initialization with `progress: 0`. Keep `status: 'uploading'` separately.
- Store the per-item `controller` returned by `uploadFileToArchive` in a `controllersRef: Map<id, controller>`.
- Add `pauseUpload(id)`, `resumeUpload(id)`, `cancelUpload(id)` to context. Add `'paused'` to `UploadItem.status`.
- Map progress callback's `ratio` directly to `Math.round(ratio * 100)` (no more 10–95 clamp).
- Reduce/remove the outer `OUTER_RETRIES` loop (part-level retries already handle transient failures; full restart from scratch wastes parts archive.org already accepted).

`src/components/UploadStatusIndicator.tsx`:

- Add Pause / Resume buttons next to each `uploading`/`paused` item (Lucide `Pause` / `Play`).
- Add Cancel button (X) for `uploading`/`paused` (currently only `queued` can be removed).
- Header summary shows `Paused` state when applicable.
- Optional: a global "Pause all" / "Resume all" in the expanded footer.

### Performance impact (for the user's 250-page PDF case)

- **Eliminating the proxy** removes one full upload of every byte (≈ halves the time).
- **Parallelism × 4** roughly halves the remaining wall time on typical residential uplinks (until uplink saturates).
- Cold-start cost per part disappears (parts no longer hit the edge function).
- Realistic expectation: 15–20 min → ~3–6 min for a ~50 MB PDF over a 20 Mbps uplink.

### Edge cases & details

- **Signature character set.** When signing, encode the path and query string the same way archive.org expects (RFC 3986 except `/`). Sub-resources `partNumber` and `uploadId` are **part of the canonical string** — include them in `stringToSign`.
- **CORS.** Archive.org's S3 endpoint already allows cross-origin PUT from browsers (used by the Internet Archive Uploader). If a specific header gets blocked, drop it from the signed request (we only need `Authorization` via query string, no custom headers).
- **ETag handling unchanged** — store exactly as returned, including quotes, send back in `complete` XML.
- **Resuming after page reload** is out of scope (would require persisting `uploadId` + per-part ETags). Pause/resume here is in-session only. Easy to add later.
- **Single-PUT path** for files < 16 MB also switches to a signed direct PUT for consistency and real progress; metadata headers move into the signed request via `x-amz-meta-*` headers (allowed on PUT-object). Alternatively keep current proxy for small files if signing PUT-object proves brittle — flagged as a fallback.
- `delete-from-archive`, `fetch-media`, OCR, and DB schema all unchanged.
- `verify_jwt` setting unchanged.

### Out of scope

- Cross-session resumable uploads (would need persisting multipart state to DB).
- Background uploads after closing the tab.
- Adaptive concurrency / bandwidth probing.

### Files touched

- `supabase/functions/upload-to-archive/index.ts` — add `sign-part`, keep others; remove `upload-part` proxy (or keep as a deprecated fallback for one release).
- `src/utils/archiveMultipartUpload.ts` — XHR uploader, parallel worker pool, pause/resume controller.
- `src/contexts/UploadManagerContext.tsx` — `paused` status, controllers map, pause/resume/cancel actions, real progress.
- `src/components/UploadStatusIndicator.tsx` — Pause / Resume / Cancel buttons, paused styling, optional global controls.
- `mem://infrastructure/archive-multipart-uploads.md` — update documented flow.
