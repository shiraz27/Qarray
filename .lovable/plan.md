
# Fix: Add "Go to Form" Button When Uploads Complete

## Problem
When uploads complete and the user is already on `/dashboard`, the upload indicator shows "✓ Files added to form above" but the Add Resource dialog isn't open. There's no button to open it - tapping the indicator just expands/collapses the file list.

## Root Cause
The logic in `UploadStatusIndicator.tsx`:
- `showReturnButton` is `false` when user is on the same page as `sourceRoute`
- When on the same page, it shows "Files added to form above" message
- But dialog-based forms can be closed while on the same page
- No mechanism exists to re-open the dialog from the indicator

## Solution
Add an explicit "Open Form" button in the indicator that appears when:
1. Uploads are completed (not actively uploading)
2. User is on the source page (`isOnFormPage = true`)
3. There are completed uploads ready

This button will navigate to the same page with `?restoreForm=true` which triggers the dialog to open via the existing `ActionButtons` logic.

## Changes

### `src/components/UploadStatusIndicator.tsx`
1. Add a new "Open Form" button in the expanded section when `isOnFormPage` and uploads are complete
2. This button will call `handleNavigateToForm()` with the `?restoreForm=true` flag
3. Update the header click behavior - when on the form page and not expanded, clicking should also trigger the form open

```text
Key changes:
- Add handleOpenFormOnSamePage() function that navigates with ?restoreForm=true
- Add "Open Form" button in expanded section when isOnFormPage && completedCount > 0 && !hasActiveUploads
- Update header click to open form when on same page with completed uploads
- Change the "Files added to form above" message to include action text
```

## Technical Details

### New Button Location
In the expanded section, before the "Clear list" button:
```
[File list]
---
[Open Form button] ← NEW when isOnFormPage && completedCount > 0
[Clear list button]
```

### Click Behavior Update
When collapsed and tapped:
- If on different page → navigate to source with `?restoreForm=true`
- If on same page with completed uploads → navigate to same URL with `?restoreForm=true` (forces dialog open)
- Otherwise → expand the indicator

### Visual Changes
- Header shows "Tap to open form" instead of static "Files added" message
- Arrow icon when there are completed files to indicate actionable state
- Primary colored header background when there are ready files

## User Flow After Fix
1. User opens Add Resource dialog on dashboard
2. Uploads files, dialog closes or user navigates away and back
3. Uploads complete, indicator shows "2 uploads complete"
4. User taps indicator header → dialog opens with files restored
5. OR user expands indicator → sees "Open Form" button → taps → dialog opens
