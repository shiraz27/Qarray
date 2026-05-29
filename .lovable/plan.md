## Problem

Multi-page PDFs (any PDF > 3 pages uploaded since the split-PDF feature shipped) cannot be previewed or stamped. The UI shows **"Couldn't load multi-page PDF"** and stamps fail with:

```
{ "unavailable": true, "upstreamStatus": 200,
  "upstreamContentType": "application/json",
  "error": "Source not ready yet — please retry shortly." }
```

## Root cause

In `supabase/functions/fetch-media/index.ts` (lines ~158–191), the proxy guards against Archive.org HTML/JSON/XML interstitials by treating any `application/json` upstream response as "not ready yet". That guard is too broad: split-PDF manifests are **legitimately** `manifest.json` files served as `application/json`. Every manifest fetch therefore returns `unavailable=true`, and `fetchSplitPdfManifest` (`src/utils/splitPdfManifest.ts`) throws → preview and stamp pipelines fail for every multi-page PDF.

This matches the symptom timeline (started ~24h ago, oldest unaffected PDF is May 28) — it began when the manifest-aware proxy guard / split-PDF flow went live together.

## Fix

Allow the manifest through the proxy without weakening the interstitial protection for binary media:

1. In `supabase/functions/fetch-media/index.ts`, before the `looksTextual` branch, detect when the resolved upstream URL is a split-PDF manifest (path ends with `manifest.json` or the Archive.org dashified `manifest-json` variant, matching `isSplitPdfManifestUrl` rules already used on the client).
2. If it is a manifest, **skip** the textual-interstitial rejection and stream the JSON body through with its real `application/json` Content-Type so `fetchSplitPdfManifest` can parse it.
3. Leave all other behavior (binary passthrough, retry/backoff, real interstitial detection for non-manifest URLs, `unavailable` envelope for upstream non-OK) unchanged.

## Out of scope

- No changes to `splitPdfManifest.ts`, the upload pipeline, or the DB.
- No change to how single-page PDFs / images / audio are proxied.
- No retroactive re-upload — existing manifests will start working as soon as the proxy is fixed.

## Verification

- Open any PDF uploaded on/after May 28 with > 3 pages → preview renders, page navigation works.
- Try to stamp the same PDF → no more "Source not ready yet" error.
- Open a single-page PDF and an image → still load normally (regression check).
- Network tab: manifest request returns `Content-Type: application/json` with the manifest body (not the `unavailable` envelope).
