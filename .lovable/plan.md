
# Fix: Return to Form with Uploaded Files

## Problem Summary
When you upload files from the dashboard's "Add Resource" dialog:
1. Files upload in the background
2. You navigate away
3. Tapping "Return to form" takes you to `/dashboard?restoreForm=true`
4. BUT the dialog doesn't open and your uploaded files are lost

## Root Causes
1. **Dialog doesn't auto-open**: The `AddResourceGlobalForm` lives inside a Dialog controlled by local state in `ActionButtons.tsx`. When navigating to `/dashboard?restoreForm=true`, the dialog stays closed.
2. **No form persistence in global form**: `AddResourceGlobalForm` lacks the `useFormPersistence` hook that `AddResourceForm` has - uploaded URLs are never saved.
3. **Wrong route tracking**: Since the dialog opens on `/dashboard`, tapping return just navigates to the same page without opening the dialog.

## Solution

### 1. Add form persistence to `AddResourceGlobalForm`
Integrate the `useFormPersistence` hook (same as `AddResourceForm` already has):
- Save `mediaUrls`, form values, and current step to localStorage
- Restore state when form opens with `restoreForm=true` flag

### 2. Auto-open dialog when `restoreForm=true` is in URL
Update `ActionButtons.tsx` to:
- Check for `restoreForm=true` query parameter on mount
- Automatically open the Add Resource dialog if detected
- Clear the query parameter after opening

### 3. Pass restore flag to the form
Ensure the dialog passes a signal to `AddResourceGlobalForm` so it knows to restore session data

## Files to Change

### `src/components/ActionButtons.tsx`
```text
- Import useSearchParams from react-router-dom
- Add useEffect to detect ?restoreForm=true
- Auto-open Add Resource dialog when flag is present
- Clear query param after opening
```

### `src/components/AddResourceGlobalForm.tsx`
```text
- Import useFormPersistence hook
- Initialize form persistence with formType='addResourceGlobal'
- Save mediaUrls, step, and form values on change
- Restore uploaded URLs and form state on mount
- Clear session on successful submit
- Update MediaUploader to persist uploaded URLs
```

### `src/hooks/useFormPersistence.ts`
```text
- Update getSessionByRoute to also match by formType
- Add helper to check for any pending global form session
```

## User Flow After Fix
1. Open "Add Resource" from dashboard
2. Upload files, navigate away while uploading
3. See "Tap to return to form" in upload indicator
4. Tap it - navigates to `/dashboard?restoreForm=true`
5. Dialog auto-opens with uploaded files restored
6. Continue filling form and submit

## Technical Details

The key insight is that dialog-based forms need special handling:
- Store a flag indicating which dialog should auto-open
- The persistence hook already stores sourceRoute, but we also need to track that it's a dialog form
- `ActionButtons` reads the URL param and opens the correct dialog

This matches the existing pattern in `AddResourceForm` but adapted for the dialog-based global form context.
