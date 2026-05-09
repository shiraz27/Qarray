Plan:

1. Fix the PDF proxy response handling
- Replace `supabase.functions.invoke('fetch-media')` for PDF blobs with a direct `fetch()` call to the Lovable Cloud function URL.
- Reason: `functions.invoke()` is currently returning an unexpected object for large/binary responses, which causes `Unexpected response from media proxy` and leaves Download disabled even when the backend successfully fetched the PDF.

2. Add a reusable PDF fetch helper
- Create a small shared helper that:
  - calls `fetch-media` directly with the publishable key,
  - accepts `application/pdf` and `application/octet-stream` blobs,
  - detects JSON `{ unavailable: true }` responses,
  - rejects HTML/error pages clearly,
  - supports retry for flaky Archive.org responses.
- Use it in both `PdfInlinePreview` and `MediaPreview` so preview and Download behave the same.

3. Keep Download usable even if preview fails
- In `PdfInlinePreview`, store the fetched blob for download as soon as the proxy fetch succeeds.
- If pdf.js rendering fails after the blob is fetched, keep Download enabled and show a clearer preview-only error.
- Add a fallback Download action that fetches the blob on click if the preview never loaded.

4. Stop relying on archive.org “Open” clicks as the primary path
- Change the “Open” button label/behavior to make it explicit that it opens the original Archive.org URL and may be blocked by Chrome/ad blockers/referrer behavior.
- Add `referrerPolicy="no-referrer"` to the original link to reduce cases where opening the exact same URL from the website is blocked while manual address-bar entry works.
- Keep direct Download as the recommended action.

5. Show PDF inline preview on questions too
- Update `MediaList` so PDF attachments render with `PdfInlinePreview`, not just the compact `MediaPreview` card.
- This covers question detail and answer attachments, since they use `MediaList`.

6. Improve the red warning text
- Make the warning more accurate: preview/download use the app proxy, while “Open original” depends on Archive.org and browser blocking rules.
- Avoid saying Download won’t work because the current goal is to make Download work even when the original link is blocked.

Technical files to change:
- `src/utils/pdfMediaFetch.ts` (new helper)
- `src/components/PdfInlinePreview.tsx`
- `src/components/MediaPreview.tsx`
- `src/components/MediaList.tsx`