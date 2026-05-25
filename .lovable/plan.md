## Goal

No mention of `archive.org` anywhere visible: not in DB rows, not in API/network responses, not in DOM/HTML, not in edge function logs. URLs become opaque tokens like `arc1://<base64url>` that decode only inside our edge functions.

## Approach

Reversible encoding (base64url of the path after `archive.org/download/`). Anyone reading our code can decode — that's accepted ("obfuscate only"). Storage shape: `arc1://cWFycmF5LWVkdWNhdGlvbmFsLWNvbnRlbnQvYmFjLWluZm8vZmlsZS5wZGY`.

```
encode("https://archive.org/download/<item>/<path>")  -> "arc1://" + base64url("<item>/<path>")
decode("arc1://<b64>")                                -> "https://archive.org/download/" + atob(<b64>)
```

## 1. Shared encoder/decoder

New `src/utils/mediaToken.ts` (client) and `supabase/functions/_shared/mediaToken.ts` (Deno, copied — edge functions can't import from `src/`):

- `encodeMediaUrl(rawUrl: string): string` — if URL starts with `https://archive.org/download/`, returns `arc1://<b64url>`; otherwise returns input unchanged (YouTube, etc.).
- `decodeMediaToken(token: string): string | null` — if `arc1://...`, returns full archive URL; else null.
- `isMediaToken(s: string): boolean`

## 2. Edge functions

**`upload-to-archive`**: At end of `single` and `complete` actions, encode `url` before returning. Caller now receives `{ url: "arc1://..." }`.

**`fetch-media`**: Accept `{ token }` (preferred) or legacy `{ url }`. If `token`, decode server-side; if a raw URL is passed, accept it for the migration window. Change all `console.log("Fetching media from:", url)` to log only the encoded token or a short hash — never the raw URL.

**`delete-from-archive`**: Accept `{ token }`, decode internally, then run existing S3 DELETE. Remove raw URL from logs.

**`process-ocr` / any other function that touches data**: Decode tokens at entry, never log raw URL.

## 3. Client wiring

**`src/utils/archiveMultipartUpload.ts`**: `singleUpload` and `multipartUpload` already return `{ url }` from edge function — that `url` is now an `arc1://` token. No code change needed; consumers store the token directly into `resources.data[]` / `questions.data`.

**`src/utils/mediaHelpers.ts` (`extractMediaFromText`)**:
- Extend URL regex to also capture `arc1://[A-Za-z0-9_-]+` tokens.
- Run type detection (pdf / image / audio / manifest) on the **decoded** path so existing extension/dash logic keeps working.
- Keep the `url` field on `MediaFile` as the token (never decoded). Consumers already pass `url` to fetch-media.

**All media consumers** (`MediaPreview`, `PdfInlinePreview`, `AudioPlayer`, `MediaList`, `MediaPreviewDialog`, `PdfInlinePreview`, OCR utilities, `ocrAndExtract`, anything calling `fetch-media`):
- Send `{ token: file.url }` to `fetch-media` instead of `{ url }`.
- For `<img src>`, `<a href>`, `<audio src>`, `<video src>`: use a small helper `mediaSrc(token) => "<supabase>/functions/v1/fetch-media?token=" + encodeURIComponent(token)`. `fetch-media` already supports streaming; add a GET branch that reads `?token=` so it works as a direct `src=`.

**Search & OCR snippets**: `ocr_text` may include raw URLs from very old data — already covered by migration step below.

## 4. Database migration

One-time `INSERT`-tool run to rewrite existing rows. Pseudocode of the SQL (run via `supabase--insert` after approval):

```sql
-- helper expression: 'arc1://' || translate(encode(convert_to(substring(u from 32), 'UTF8'), 'base64'), E'+/=\n', '-_')
-- where 32 = length('https://archive.org/download/') + 1
```

Tables/columns to rewrite (141 + 2 rows confirmed):
- `resources.data` (text[]): map each element through the expression when it starts with `https://archive.org/download/`.
- `questions.data` (text): regex-replace any `https://archive.org/download/\S+` occurrence with its encoded form.
- `resources.ocr_text`, `questions.ocr_text`: same regex-replace (defensive — likely empty matches).
- `flashcards.front_data` / `back_data` (jsonb): scan for the URL prefix as text and rewrite.

A single SQL function `public._encode_arc_url(text)` is created in the migration step purely as a helper for the data rewrite, then dropped.

## 5. Log scrubbing

- `fetch-media`: replace `Fetching media from: <url>` with `Fetching media token: <token-prefix>…` (first 12 chars).
- `upload-to-archive`: same — never echo final `https://archive.org/...` URL; log `arc1://…` only.
- `delete-from-archive`: log `Deleting token: <prefix>` only.

## 6. Migration / decoder fallback

For a one-release window, `fetch-media` accepts a raw `archive.org` URL too (so any cached frontend bundle keeps working until users refresh). After verification, that branch is removed.

## Files touched

```
new   src/utils/mediaToken.ts
new   supabase/functions/_shared/mediaToken.ts
edit  src/utils/mediaHelpers.ts                       (regex + decoded-path typing)
edit  src/utils/ocrAndExtract.ts                       (token -> fetch-media)
edit  src/utils/pdfMediaFetch.ts                       (token -> fetch-media)
edit  src/contexts/UploadManagerContext.tsx            (no-op, tokens flow through)
edit  src/components/MediaPreview.tsx
edit  src/components/MediaList.tsx
edit  src/components/MediaPreviewDialog.tsx
edit  src/components/PdfInlinePreview.tsx
edit  src/components/AudioPlayer.tsx
edit  src/components/AudioPlayerModal.tsx
edit  any component using <img src>, <a href> on data[]
edit  supabase/functions/upload-to-archive/index.ts    (encode before return + log scrub)
edit  supabase/functions/fetch-media/index.ts          (GET ?token=, POST {token}, log scrub)
edit  supabase/functions/delete-from-archive/index.ts  (token-in, log scrub)
edit  supabase/functions/process-ocr/index.ts          (decode tokens server-side)
data  migration to rewrite resources.data, questions.data, ocr_text, flashcards.*_data
```

## Out of scope

- Real encryption with a server-only secret (you chose "obfuscate only").
- Renaming the Archive.org item identifier `qarray-educational-content` — that string would still appear inside the decoded path. The token hides it from clients; only the edge function ever sees it.
