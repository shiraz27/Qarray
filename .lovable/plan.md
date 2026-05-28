## Root cause

`PdfInlinePreview` calls `fetchPdfViaProxy` → `fetch-media` edge function. The frontend logic:

```ts
if (contentType.includes('application/json')) {
  if (payload?.unavailable) return { kind: 'unavailable', ... };
  return { kind: 'error', message: payload?.error || `Proxy error (${res.status})` };
}
```

The proxy itself only emits JSON in three shapes (`{unavailable, error}` at 200, `{error}` at 400/500), each always populating `error`. So `Proxy error (200)` only surfaces when the JSON came from **upstream Archive.org**, not from our wrapper — the proxy currently streams upstream `Content-Type` unchanged. Intermittent because Archive.org occasionally responds 200 with an HTML/JSON interstitial for files that are still propagating.

## Fix

Disambiguate "our wrapper JSON" from "upstream JSON" using a header, and wrap non-binary upstream responses so the existing Retry UI shows instead of a cryptic error.

### 1. `supabase/functions/fetch-media/index.ts`

- Add header `X-Proxy-Result: wrapped` to every JSON envelope response (400 invalid token, 200 unavailable, 500 catch-all).
- After a successful `fetchWithRetry`, sniff upstream `Content-Type`. If it starts with `application/json`, `text/html`, `text/xml`, or `application/xml` (i.e. clearly not the binary we asked for), treat as a soft-unavailable: return our standard wrapper at HTTP 200 with `{ unavailable: true, upstreamStatus: 200, upstreamContentType, error: 'Source not ready yet — please retry shortly.' }` and `X-Proxy-Result: wrapped`. Don't read the upstream body (just drop it).
- For genuine binary passthrough, add header `X-Proxy-Result: upstream` so the frontend can tell.

### 2. `src/utils/pdfMediaFetch.ts`

- Read `X-Proxy-Result` from the response.
- Only interpret the body as the wrapper envelope when `X-Proxy-Result === 'wrapped'`. In that branch keep current behaviour: `unavailable` → `{kind: 'unavailable'}`, else `{kind: 'error', message: payload.error || 'Couldn't load file. Please try again.'}` (no more "Proxy error (200)" string).
- If the header is missing/`upstream` and the body content-type is JSON/text (i.e. not binary), return `{ kind: 'unavailable', message: 'Source not ready yet — please retry shortly.' }` so `PdfInlinePreview` shows its existing "File still processing — Retry" panel instead of a hard error. This also covers the case of an older deployed edge function until the new version rolls out.
- Binary path unchanged.

## Scope

- No DB / RLS / component changes. `PdfInlinePreview` already renders the `unavailable` state with a Retry button — that's exactly what users should see for this transient case.
- Other callers (`pdfSplitUpload`, `pdfBackfill`, `clientOcrProcessor`, etc.) use the same util and benefit automatically.

## Files

- edit `supabase/functions/fetch-media/index.ts`
- edit `src/utils/pdfMediaFetch.ts`
