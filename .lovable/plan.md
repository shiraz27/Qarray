## Audit results

I checked every PDF URL stored across all 13 active resources. **All 13 currently return HTTP 200** from Archive.org — including id=35, id=36, and id=24 (which has spaces and parens in its filename). No URL is permanently broken.

That confirms the problem is not corrupted data in the DB. It is how the frontend renders PDFs:

1. **Google Docs viewer fails silently during Archive.org's propagation window.** Right after upload, Archive.org lists the file but its CDN nodes return 404 for several minutes. `https://docs.google.com/viewer?url=...` caches that 404 and shows a blank/broken viewer with no retry. This is why id=35 and id=36 looked broken to you — they were both uploaded today.
2. **Google Docs viewer is also unreliable for filenames with spaces or special characters** (id=24: `4sc_t1-pages-2-combined (2).pdf`). The viewer URL is built without encoding the embedded URL's special characters.
3. **The sanitizer issue from the previous plan is still real for future uploads** — it produces ugly paths like `bac-math-matiques/maths/d-rivabilit-` and risks collisions across different chapters. Still worth fixing for new uploads.

## Generalized fix

### A. PDF preview rewrite in `src/components/MediaPreview.tsx`

Replace the "click to open Google Docs viewer" card with a self-contained, reliable PDF flow:

1. **Probe the URL through the existing `fetch-media` edge function** (which already retries with exponential backoff for Archive.org 404s). Show a "Document is being processed…" loading state with a friendly message during retries, mirroring the image branch.
2. **On success**, render a card with two clear actions:
   - **Open** — opens the raw Archive.org URL in a new tab (browsers have a built-in PDF viewer; this avoids Google Docs entirely and works for all filename shapes including spaces/parens).
   - **Preview** — opens an in-app modal containing an `<iframe>` pointing directly at the encoded PDF URL. Native browser PDF rendering, no third-party dependency.
3. **On permanent failure** (after retries exhausted), show the existing "processing/retry" card so users can manually retry.
4. **Always `encodeURI()` the stored URL** before using it as an `href` or `src`, so spaces/parens in filenames like id=24 don't break the request.

This eliminates Google Docs viewer as a single point of failure and removes the entire propagation-window blank-screen class of bugs.

### B. Sanitizer fix in `supabase/functions/upload-to-archive/index.ts`

Same change proposed previously — normalize Unicode before stripping non-ASCII so accented characters become readable ASCII rather than dashes:

```ts
const sanitize = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
```

New uploads will land at clean paths (`bac-mathematiques/maths/derivabilite/...`). Existing URLs in the DB are not touched; the files they point to still exist at the old paths and will keep working.

### C. No data migration

All current URLs are reachable — no need to rewrite stored data.

## Files to change

- `src/components/MediaPreview.tsx` — new PDF preview flow with `fetch-media` probe, in-app iframe modal, proper URL encoding
- `supabase/functions/upload-to-archive/index.ts` — Unicode-aware sanitizer

## Out of scope

- Migrating existing resource URLs to the new clean format (unnecessary; old paths still resolve).
- Changes to the image or audio branches (already handle propagation correctly).
