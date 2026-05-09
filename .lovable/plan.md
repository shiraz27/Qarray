## Problem

The "Open Form" button in the upload indicator only appears after **all** uploads finish. While files are still uploading, the user has no way to reopen the form dialog they closed.

Current gating in `src/components/UploadStatusIndicator.tsx`:

```ts
const showOpenFormButton = isOnFormPage && completedCount > 0 && !hasActiveUploads;
```

The `!hasActiveUploads` clause hides the button during uploads. The header tap also only triggers `handleOpenFormOnSamePage` when `showOpenFormButton` is true.

## Fix

Always expose "Open Form" while a session exists, regardless of upload progress.

### `src/components/UploadStatusIndicator.tsx`

1. **Drop `!hasActiveUploads` from the gate.** New rule: show "Open Form" whenever the user is on the form page (`isOnFormPage`) AND there is at least one item for the session (queued, uploading, paused, completed, or failed). Effectively `isOnFormPage && items.length > 0`.
2. **Same for the off-page case.** Keep the existing "Tap to return to form" header behavior, but allow it during active uploads too — it already works for that, just verify the label.
3. **Header click while collapsed:** call `handleOpenFormOnSamePage()` whenever `isOnFormPage && items.length > 0`, not only after everything is done. When uploads are still active, expansion is also useful — keep both available: a small dedicated "Open Form" button stays in the header (always visible when on the form page with a session), while the chevron continues to expand the list.
4. **Expanded action area:** show the "Open Form" button at the top of the expanded panel whenever `showOpenFormButton` is true, regardless of `hasActiveUploads`. Currently it sits inside the `!hasActiveUploads && (completedCount > 0 || failedCount > 0)` block — move it out so it's rendered whenever on-form-page with a session.
5. **Label tweak:** when uploads are still in progress, show "Open Form (N uploading)" so the user knows reopening doesn't block the queue. When done, keep "Open Form".

### Behavior summary

| State | Header shows | Open Form button |
| --- | --- | --- |
| On form page, uploads in progress | Progress bar + chevron + small "Open Form" pill | Visible in expanded panel |
| On form page, all done | "N uploads complete" + "Open Form" pill | Visible in expanded panel |
| Off form page, uploads in progress/done | "Tap to return to form" (unchanged) | n/a (header tap navigates) |

## Files

- `src/components/UploadStatusIndicator.tsx` — only file touched.

## Out of scope

- Form-side changes (already handle continuous URL reconciliation from the previous fix, so reopening mid-upload is safe — late uploads will still appear in the form as they finish).