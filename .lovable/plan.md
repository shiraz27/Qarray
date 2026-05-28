## Problem

The "Open" / "Open original" buttons render `href={url}` where `url` is now an opaque token like `arc1://cWFycm…`. Browsers don't understand the `arc1:` scheme, so the link does nothing (or shows a "page can't be displayed" error).

Three call sites are affected:

1. `src/components/PdfInlinePreview.tsx` line 262 — `href={url.replace(/ /g, '%20')}` ("Open original")
2. `src/pages/Profile.tsx` line 469 — `href={doc}` (teacher document links)
3. `src/pages/Moderation.tsx` line 596 — `href={doc}` (teacher document links in moderation queue)

`MediaPreview.tsx` already does it correctly (`href={encodedUrl}` where `encodedUrl = mediaSrc(url)`).

## Fix

Run every `href` through `mediaSrc()` from `src/utils/mediaToken.ts`. That helper:
- Returns the `fetch-media` proxy URL for `arc1://` tokens and raw archive URLs
- Passes through unchanged for anything else (YouTube, data URLs, http(s) non-archive)

So the user clicks "Open", the browser opens `https://<project>.supabase.co/functions/v1/fetch-media?token=arc1://…`, which streams the PDF inline — same domain, no archive URL exposed, native browser PDF viewer.

## Changes

### 1. `src/components/PdfInlinePreview.tsx`
- Import `mediaSrc` from `@/utils/mediaToken`
- Replace `href={url.replace(/ /g, '%20')}` with `href={mediaSrc(url)}`
- Update the warning banner text (lines ~275–280): it currently says "The Open original link goes directly to Archive.org and may be blocked by Chrome or an ad blocker." Since the link now goes through our proxy, simplify to a generic fallback hint or remove the banner entirely. Recommendation: remove it — the link no longer leaks Archive and no longer has the ad-blocker problem.

### 2. `src/pages/Profile.tsx` (line 469)
- Import `mediaSrc`
- Replace `href={doc}` with `href={mediaSrc(doc)}`

### 3. `src/pages/Moderation.tsx` (line 596)
- Import `mediaSrc`
- Replace `href={doc}` with `href={mediaSrc(doc)}`

## Out of scope

- No backend changes; `fetch-media` already serves the file inline with the right content type.
- No DB or schema changes.
- Download buttons already work (they use `fetchPdfViaProxy` / `mediaSrc`).
