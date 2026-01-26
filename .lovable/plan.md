
# Fix: Form Restoration, Cleanup, and Duplicate File Issues

## Problems Identified

### 1. Missing File / Duplicate URLs Issue
When uploading files, both `addUploadedUrl()` and `saveFormData()` update the session. This causes:
- `addUploadedUrl()` adds one URL to the session
- `saveFormData()` saves the entire `mediaUrls` array (which may include the same URL again)
- Result: duplicate URLs in session, making it look like files are missing when restored

### 2. Uploaded Files Don't Clean Up
- Sessions persist in localStorage even after successful form submission if the component unmounts before cleanup
- No automatic cleanup when user abandons a form
- The upload indicator's "Clear list" only clears the visual queue, not the localStorage session

### 3. Chapter Page Dialog Doesn't Auto-Open
- `Chapter.tsx` has a resource dialog but doesn't detect `?restoreForm=true` query parameter
- When "Tap to return" navigates to `/chapter/52?restoreForm=true`, the page loads but the dialog stays closed
- User has to manually click "Add Resource" to see their restored files

## Solution

### Fix 1: Eliminate Duplicate URL Storage
**In `AddResourceForm.tsx` and `AddResourceGlobalForm.tsx`:**
- Remove the separate `addUploadedUrl()` call from `handleMediaUploaded`
- The `saveFormData()` in the useEffect already saves `mediaUrls` - this is sufficient
- OR: Only use `addUploadedUrl()` and remove `mediaUrls` from `saveFormData()`

The cleaner approach is to let `saveFormData()` handle all persistence since it saves the complete state.

### Fix 2: Clear Sessions on Form Close (Not Just Success)
**In `AddResourceForm.tsx`, `AddResourceGlobalForm.tsx`:**
- Add cleanup when form is cancelled or dialog closes
- Clear session only when form submits successfully OR when user explicitly cancels
- Add an option to clear session on cancel (with user choice to keep for later)

**In `useFormPersistence.ts`:**
- Add `removeUploadedUrl()` function to keep session in sync when files are removed from the form

### Fix 3: Auto-Open Dialog on Chapter Page
**In `src/pages/Chapter.tsx`:**
- Import `useSearchParams` from `react-router-dom`
- Add `useEffect` to detect `?restoreForm=true` query parameter
- When detected, set `isResourceDialogOpen(true)` and clear the query param

## Files to Change

### `src/pages/Chapter.tsx`
```text
- Import useSearchParams
- Add useEffect to check for restoreForm query param
- Auto-open resource dialog when restoreForm=true
- Clear query param after opening
```

### `src/components/AddResourceForm.tsx`
```text
- Remove addUploadedUrl() call from handleMediaUploaded
- Let saveFormData() handle all URL persistence
- Update removeMedia to also update session
```

### `src/components/AddResourceGlobalForm.tsx`
```text
- Remove addUploadedUrl() call from handleMediaUploaded  
- Let saveFormData() handle all URL persistence
- Update removeMedia to also update session
```

### `src/hooks/useFormPersistence.ts`
```text
- Add removeUploadedUrl() function
- Export it for use in forms when files are manually removed
```

## Technical Details

### Why Duplicates Occur
Current flow when file uploads:
1. `handleMediaUploaded` → `setMediaUrls([...prev, url])` → triggers useEffect
2. `handleMediaUploaded` → `addUploadedUrl(url)` → saves to session.uploadedUrls
3. useEffect (mediaUrls changes) → `saveFormData({...}, mediaUrls)` → overwrites session.uploadedUrls

If timing is off, or if mediaUrls doesn't yet include the new URL, the session gets out of sync.

### Fixed Flow
1. `handleMediaUploaded` → `setMediaUrls([...prev, url])`
2. useEffect (mediaUrls changes) → `saveFormData({...}, mediaUrls)` → single source of truth

### Session Lifecycle
- **Create**: When first file is uploaded or form field is filled
- **Update**: On every mediaUrls or form field change
- **Clear**: On successful submission OR explicit cancel
- **Expire**: After 24 hours of inactivity

## User Flow After Fix

### Scenario 1: Upload from Chapter Page
1. Go to `/chapter/52`, click "Add Resource"
2. Upload files, navigate away while uploading
3. See upload indicator, tap "Return to form"
4. Navigate to `/chapter/52?restoreForm=true`
5. Dialog auto-opens with correct file count (no duplicates)
6. Submit form → session clears → indicator clears

### Scenario 2: Clean Start
1. Go to any form with no pending session
2. Form starts fresh with no leftover files
3. Upload new files, submit
4. No stale data remains
