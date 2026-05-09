## Problem

Uploading a ~13-page PDF (just above the 16 MB multipart threshold) frequently fails with `Part upload failed: 403 Forbidden`. Larger files succeed more often because they have more parts and one transient 403 is less fatal proportionally — but right now any 403 that survives 3 retries kills the whole upload.

Two real issues in the current multipart flow:

1. When a part PUT fails (403 or otherwise), the worker retries the **same presigned URL**. If the failure is signature/clock/race-related, retrying the identical URL can't recover.
2. There is no fallback to the proxied `upload-part` action in the edge function, even though that path uses the standard `LOW` auth header that the working single-shot upload uses.
3. Concurrency is hard-coded to 4 parallel parts, which increases the chance of archive.org rejecting an early part because the multipart upload state hasn't fully propagated after `initiate`.

## Fix

### 1. Re-sign on every retry (`src/utils/archiveMultipartUpload.ts`)

In the part worker, move the `sign-part` call inside the retry loop so each attempt gets a fresh presigned URL. This eliminates stale-signature / clock-skew failures.

### 2. Fall back to proxied `upload-part` after a presigned 403

If a presigned PUT fails with 401/403 (signature/auth class of errors) more than once, switch that part to the existing `upload-part` action via `supabase.functions.invoke('upload-to-archive')`, sending the chunk as `FormData`. This path is already implemented in the edge function (`handleUploadPart`) and uses the same `LOW <key>:<secret>` header that single-shot uploads use successfully.

This gives us a guaranteed working path for parts even if presigning is flaky for a given file/region/time. Progress reporting for fallback parts will be coarser (one update per part) — acceptable.

### 3. Lower default concurrency from 4 → 2

Reduces archive.org race conditions immediately after `initiate`, which is the most likely root cause of the intermittent 403 specifically on small multipart uploads. Larger files still benefit from parallelism but with less contention.

### 4. Treat 403 as retryable for parts

Currently `putPartXhr` flags only 5xx/429 as retryable. For multipart parts on archive.org, 403 is also retryable in practice (signature races, propagation), so mark it retryable so the worker actually attempts the re-sign + fallback before giving up.

## Files to change

- `src/utils/archiveMultipartUpload.ts`
  - Move `sign-part` inside per-attempt retry loop
  - Add proxied `upload-part` fallback after first 401/403 on a part
  - Mark 403 as retryable
  - Drop `CONCURRENCY` from 4 to 2

No changes needed to the edge function — `handleUploadPart` already exists and works.

## Out of scope

- The PDF preview/proxy path (already fixed in the previous turn).
- Increasing the multipart threshold — keeping 16 MB so we still get resumable uploads for genuinely large files.
