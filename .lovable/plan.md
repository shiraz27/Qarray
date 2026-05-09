## Problem

When a user closes the Add Resource or Ask Question dialog while uploads are still happening (or after they complete), tapping "Open Form" on the upload indicator reopens the dialog with missing/incomplete files and form values.

## Root causes (verified in code)

1. **`AskQuestionGlobalForm` has no persistence/restoration logic at all** — it doesn't use `useFormPersistence`, so closing the Ask dialog drops every uploaded URL and field. The "Open Form" indicator also always opens the **Add Resource** dialog regardless of which form started the uploads (`ActionButtons.tsx` only wires `restoreForm=true` to `setIsAddResourceDialogOpen(true)`).
2. **One-shot restore in `AddResourceGlobalForm`** — `hasRestoredRef.current = true` after the first run. Uploads that finish *after* the dialog reopens are persisted to localStorage by `UploadManagerContext` (`persistUrlToSessionByRoute`) but the form never re-merges them into `mediaUrls`, so the user sees "uploaded" in the indicator but missing tiles in the form.
3. **Callback IDs are recreated on remount** — when the dialog closes, `MediaUploader` unregisters its `onUploadComplete` listener; on reopen it registers a new `callbackId`, so in-flight uploads from the previous mount complete with no live callback (they only persist to localStorage, see #2).
4. **Manual reopen without `?restoreForm=true` skips restoration entirely** — clicking the "Add Resource" button directly while a pending session exists shows an empty form even though files exist.
5. **Save-effect race** — the `saveFormData` effect depends on `[mediaUrls, step, selectedSubject, saveFormData]` and fires immediately after the partial restore, briefly persisting an incomplete URL list (mostly cosmetic but compounds #2).

## Fix plan

### 1. Route the indicator to the correct form
- In `ActionButtons.tsx`, read the pending session via `getSessionByFormType` / `getSessionByRoute` from `useFormPersistence` when `restoreForm=true` is present. If the session's `formType === 'askQuestionGlobal'`, open the Ask dialog with restore; else open the Add Resource dialog with restore.
- Pass a new `restoreSession` prop to `AskQuestionGlobalForm` (mirroring the existing one on `AddResourceGlobalForm`).

### 2. Add persistence to `AskQuestionGlobalForm`
- Wire `useFormPersistence('askQuestionGlobal', '/dashboard')`.
- On restore: merge `restoredData.uploadedUrls` with completed `uploadManagerItems` matching `sourceRoute === '/dashboard'`, set form values + step, same pattern as `AddResourceGlobalForm`.
- Add a save effect that calls `saveFormData(...)` whenever media URLs, step, or form values change.
- On successful submit / cancel, call `clearFormSession()`.

### 3. Make the restore continuous, not one-shot (both global forms)
- Remove the `hasRestoredRef` gate from the *URL merge* path. Keep a one-shot gate only for **form values + step** (so we don't clobber what the user is typing).
- Add a dedicated effect that watches `uploadManagerItems` and `restoredData?.uploadedUrls` and reconciles `mediaUrls` to `union(currentMediaUrls, sessionUrls, completedManagerUrlsForRoute)` — preserving the order users see and dedup-ing. This way, late-completing uploads appear in the form automatically.

### 4. Restore on manual open too
- Drop the requirement that `restoreSession === true` to merge URLs. Instead:
  - Always merge pending URLs from session + upload manager into `mediaUrls` whenever the dialog mounts.
  - Only auto-jump to a saved `step` / pre-fill text fields when `restoreSession === true` *or* when there are restored URLs and no user input yet (safe pre-fill).

### 5. Stabilize the save effect
- Debounce `saveFormData` writes (e.g. coalesce within ~150 ms via a `setTimeout` ref) so the partial-restore tick doesn't persist a transient incomplete state.
- Persist only when `isRestored === true` to avoid overwriting before the initial read finishes.

### 6. Better "Open Form" affordance in `UploadStatusIndicator`
- Read the pending session's `formType` to label the button (e.g. "Open Question Form" vs "Open Resource Form") and pass that hint via the URL (`?restoreForm=resource` or `?restoreForm=question`) so `ActionButtons` opens the right dialog deterministically without re-querying localStorage.

## Files to touch

- `src/components/ActionButtons.tsx` — route restore to correct dialog, pass `restoreSession` to Ask form.
- `src/components/AskQuestionGlobalForm.tsx` — add full persistence/restoration parity with Add Resource form.
- `src/components/AddResourceGlobalForm.tsx` — split URL-merge from one-shot value-restore; add continuous merge effect; debounce save; lift the `restoreSession` gate for URL merging.
- `src/components/UploadStatusIndicator.tsx` — emit `?restoreForm=resource|question` based on the pending session's `formType`; update label.
- `src/hooks/useFormPersistence.ts` — small helper export `getActivePendingFormType()` if needed for the indicator.

## Out of scope

- Reattaching the original `File` blob (for local OCR) across remount — once the dialog was closed, the blob is gone. After restore, OCR will fall back to fetching from Archive.org via `fetch-media`, which already exists.
- Changes to the upload pipeline (`UploadManagerContext`) — current persistence to localStorage is sufficient; the bug is on the consumer side.