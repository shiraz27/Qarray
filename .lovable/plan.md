
# Fix: Persist Uploaded Files When Form is Closed

## Problem
When you upload 4 files and close the form dialog, only 1 file is restored. This happens because:

1. Files upload in the background via `UploadManagerContext`
2. When a file completes, it tries to notify the `MediaUploader` component
3. BUT if the dialog was closed, `MediaUploader` unmounted and removed its callback
4. The completed URL exists in the upload queue but never gets saved to localStorage
5. Only files that completed BEFORE the dialog closed get persisted

## Root Cause
The current flow relies on callbacks:
```
Upload completes → UploadManager notifies callback → MediaUploader calls setMediaUrls → useEffect saves to localStorage
```

When the form closes, the callback chain breaks at step 2.

## Solution
Make `UploadManagerContext` directly persist completed URLs to the form session in localStorage, bypassing the callback chain entirely.

### New Flow:
```
Upload completes → UploadManager saves URL directly to localStorage session → Form restores all URLs when reopened
```

## Files to Change

### `src/contexts/UploadManagerContext.tsx`
1. Import `getSessions` and `saveSessions` helpers (or export them from useFormPersistence)
2. When an upload completes, ALSO save the URL directly to the form session using `sourceRoute`
3. This ensures URLs persist even when form is closed

```text
Changes:
- Add helper to persist URL to form session by route
- In processQueue, after upload success, call persistUrlToSession(url, sourceRoute)
- The session will have all URLs when form reopens
```

### `src/hooks/useFormPersistence.ts`
1. Export the `getSessions` and `saveSessions` helpers so UploadManager can use them
2. Add a utility function `persistUrlToSessionByRoute(route, url)` that:
   - Finds the session matching the route
   - Adds the URL to `uploadedUrls` if not already present
   - Saves back to localStorage

```text
Changes:
- Export getSessions and saveSessions
- Add persistUrlToSessionByRoute(route: string, url: string) function
```

### `src/components/AddResourceGlobalForm.tsx`
1. When restoring, merge URLs from:
   - The form session's `uploadedUrls`
   - Completed uploads in the UploadManager that match the form's route
2. Deduplicate to avoid showing the same file twice

```text
Changes:
- On restoration, also check UploadManager for completed items matching sourceRoute
- Merge and deduplicate URLs before setting mediaUrls
```

## Technical Details

### Why Direct Persistence Works
- `sourceRoute` is already stored on each `UploadItem`
- When upload completes, we know exactly which form session to update
- This decouples URL persistence from component lifecycle

### Deduplication Strategy
When restoring:
1. Get URLs from localStorage session
2. Get URLs from completed uploads in UploadManager matching the route
3. Combine with `[...new Set([...sessionUrls, ...managerUrls])]`

### Backward Compatibility
- Existing callback mechanism still works for live updates when form is open
- Direct persistence is a fallback for when form is closed
- Both mechanisms can coexist safely

## User Flow After Fix
1. Open "Add Resource" dialog
2. Upload 4 files, close dialog while uploads are in progress
3. All 4 uploads complete in background
4. Each completed URL is saved directly to localStorage by UploadManager
5. User taps "Return to form"
6. Form restores all 4 files from localStorage
