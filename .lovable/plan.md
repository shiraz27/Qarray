## Problem

`ERR_BLOCKED_BY_CLIENT` on `ia600505.us.archive.org` is caused by **ad blockers / privacy extensions** (uBlock, Brave Shields, AdBlock, etc.) blocking requests to Archive.org's CDN subdomains. Archive.org files are not actually broken — the URL works in incognito or with extensions disabled.

This isn't a server/code bug, but we can make the app gracefully handle it instead of showing Chrome's blank "blocked" page inside the iframe.

## Proposed changes

### 1. `MediaPreview.tsx` — Detect blocked iframe and offer proxy fallback

- After opening the PDF preview iframe, attach an `onLoad`/timeout check. If the iframe fails to load within ~4 seconds (typical signature of `ERR_BLOCKED_BY_CLIENT`), show an inline notice:
  > "Your browser or an extension (ad blocker / privacy shield) is blocking archive.org. Try disabling it for this site, or use the proxy preview below."
- Add a **"Use proxy preview"** button that fetches the PDF through our existing `fetch-media` edge function, converts the response to a blob URL, and renders that in the iframe. Since the blob is served from our own origin, ad blockers won't touch it.
- Apply the same fallback to the **Open** action: if the user clicks Open and returns reporting it's blocked, the inline notice (already visible) tells them why.

### 2. Add a small banner on the resource detail page

When any media on the page is detected as blocked, show a one-time dismissible banner explaining the ad blocker issue with a link to whitelist instructions. This avoids users thinking the app is broken.

### 3. Image previews — same fallback

Apply the same blob-proxy fallback to images on `onError` (currently they just show "Image processing..." which is misleading when the real cause is an ad blocker).

## Technical details

- Blob URL pattern:
  ```ts
  const { data } = await supabase.functions.invoke('fetch-media', { body: { url } });
  const blobUrl = URL.createObjectURL(data as Blob);
  // use blobUrl in <iframe src> or <img src>
  // remember to URL.revokeObjectURL on unmount
  ```
- Detection heuristic for blocked iframe: start a 4s timer on mount; if `onLoad` fires, clear it; if it fires, switch to "blocked" UI state.
- The `fetch-media` function already exists and handles Archive.org retries — no edge function changes needed.

## Files to modify

- `src/components/MediaPreview.tsx` — add blocked-detection + blob proxy fallback for PDF iframe and images
- `src/pages/ResourceDetail.tsx` — optional dismissible banner explaining ad blocker behavior

## What this does NOT fix

If the user clicks **Open** (new tab) → archive.org directly, the ad blocker will still block it. Only the in-app preview (proxied through our domain) is guaranteed to work. We'll make this clear in the UI copy.
