## Goal

Show every in-progress upload (queued, uploading with %, paused, failed, completed) directly inside the form's media list — not just completed files. Mirror the controls already in the floating upload indicator (pause, resume, cancel, retry, remove).

## Where

All forms render uploads through `src/components/MediaUploader.tsx`. The "Uploaded Files" card there currently only lists completed URLs (`uploadedMedia` prop). The hint banner says "N files uploading in background" but doesn't show which ones or their progress.

## Approach

Extend `MediaUploader.tsx` to render a single combined list:

1. **Pull in-flight items from `useUploadManager`** filtered by `sourceRoute === location.pathname` and status in `{queued, uploading, paused, failed}`. This catches files queued from a previous form mount (after restore), not just from the current `callbackId`.
2. **Render rows for each pending item** with: file-type icon, filename, status pill, progress bar with percentage, and inline action buttons:
   - `uploading` → Pause + Cancel buttons
   - `paused` → Resume + Cancel buttons
   - `queued` → Cancel/Remove
   - `failed` → Retry + Remove (also show the error message under the name)
3. **Render completed rows** from `uploadedMedia` exactly as today (filename + Remove).
4. **Dedup** so a file that completes mid-render doesn't appear twice (a pending row + an `uploadedMedia` row): once an item's status becomes `completed`, it drops from the pending list, and the same URL shows up in `uploadedMedia` via the existing callback path.
5. **Heading** updates to "Files (X total · Y uploading)" so users see counts at a glance.
6. **Replace the standalone "background uploads" alert** with the inline list. Keep one short note ("You can close this form — uploads continue in the background.") above the list when there are any in-flight items.

## Behavior summary

| Item state | Row content | Controls |
| --- | --- | --- |
| Queued | "Waiting…" | Cancel |
| Uploading | Progress bar + "X%" | Pause, Cancel |
| Paused | "Paused X%" (dim bar) | Resume, Cancel |
| Failed | Error text | Retry, Remove |
| Completed | (in `uploadedMedia`) | Remove |

## Files

- `src/components/MediaUploader.tsx` — only file touched.

## Out of scope

- The floating `UploadStatusIndicator` keeps working as-is.
- No changes to upload pipeline, persistence, or other forms — they all consume `MediaUploader`, so they get the new view automatically.