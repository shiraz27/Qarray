
# True Background Upload System (Facebook Messenger Style)

## Summary

This plan implements a global background upload system that works like Facebook Messenger - uploads continue even when you navigate away from the page where you started them, and you receive toast notifications about success or failure from anywhere in the app.

## Key Differences from Previous Plan

| Aspect | Previous Plan | This Plan |
|--------|---------------|-----------|
| Scope | Per-component | Global app-wide |
| Navigation | Tied to form | Survives route changes |
| State | Local useState | React Context + global store |
| Notifications | In-form feedback | Toast notifications anywhere |
| Callback | Direct callback | Event-based / callback registry |

---

## Architecture

```text
+------------------+      +----------------------+      +-------------------+
|   MediaUploader  | ---> |  UploadManagerContext | ---> |  Background Queue |
|   (any page)     |      |  (global provider)    |      |  (processes files)|
+------------------+      +----------------------+      +-------------------+
        |                          |                            |
        |                          v                            v
        |                  +----------------+           +----------------+
        |                  | Upload Status  |           | Toast Notifs   |
        |                  | (floating UI)  |           | (on complete)  |
        |                  +----------------+           +----------------+
        |                                                       
        +-- User can navigate away freely, uploads continue ---+
```

---

## Implementation Details

### 1. Upload Manager Context (`src/contexts/UploadManagerContext.tsx`)

A React Context that wraps the entire app (in App.tsx) and provides:

- **Global upload queue** - Files are added from any component, processed sequentially
- **Persistent state** - Survives page navigation because the provider is at the app root
- **Callbacks registry** - Components can register callbacks to receive completed URLs
- **Browser close warning** - `beforeunload` event prevents accidental tab closure

Key interface:
```typescript
interface UploadItem {
  id: string;
  file: File;
  fileName: string;
  fileType: 'image' | 'audio' | 'pdf';
  status: 'queued' | 'uploading' | 'completed' | 'failed';
  progress: number;
  url?: string;
  error?: string;
  retryCount: number;
  // Metadata for organization
  chapterId?: number;
  contentType?: string;
  contentId?: string;
  // Callback ID for notifying originating component
  callbackId?: string;
}

interface UploadManagerContextType {
  // Add file to background queue
  addToQueue: (file: File, options: UploadOptions) => string; // returns upload ID
  
  // Remove from queue (only if not yet started)
  removeFromQueue: (id: string) => void;
  
  // Retry failed upload
  retryUpload: (id: string) => void;
  
  // Get uploads by callback ID (for component-specific tracking)
  getUploadsByCallback: (callbackId: string) => UploadItem[];
  
  // Register callback for when upload completes
  onUploadComplete: (callbackId: string, callback: (url: string) => void) => () => void;
  
  // Current state
  items: UploadItem[];
  hasActiveUploads: boolean;
  pendingCount: number;
}
```

### 2. Floating Upload Status Indicator (`src/components/UploadStatusIndicator.tsx`)

A small floating UI element (bottom-right corner) that appears when there are active uploads:

- Shows count of pending/uploading files
- Expandable to see individual file progress
- Shows retry button for failed uploads
- Collapses automatically when all complete
- Visible across all pages

### 3. Updated MediaUploader Component

Changes to `src/components/MediaUploader.tsx`:

- Instead of calling `uploadToArchive` directly and awaiting, use `addToQueue`
- Generate a unique `callbackId` for this uploader instance
- Register callback to receive completed URLs via `onUploadComplete`
- Show local status (queued/uploading) for files initiated from this component
- Allow user to continue without waiting

Key changes:
```typescript
// Before (blocking)
const uploadToArchive = async (file: File, fileType: 'image') => {
  setIsUploading(true);
  try {
    const result = await supabase.functions.invoke('upload-to-archive', {...});
    onMediaUploaded(result.data.url, fileType);
  } finally {
    setIsUploading(false);
  }
};

// After (non-blocking)
const { addToQueue, onUploadComplete } = useUploadManager();
const callbackId = useMemo(() => `uploader-${Date.now()}`, []);

useEffect(() => {
  return onUploadComplete(callbackId, (url) => {
    onMediaUploaded(url, 'image'); // Called asynchronously when done
  });
}, [callbackId]);

const handleUpload = (file: File) => {
  addToQueue(file, {
    fileType: 'image',
    chapterId,
    contentType,
    callbackId,
  });
  // Returns immediately - user can continue
};
```

### 4. Updated Edge Function with Retry Logic

Changes to `supabase/functions/upload-to-archive/index.ts`:

- Add retry logic with exponential backoff for 503 errors
- Return structured error responses with retry hints
- Add request delay to avoid Archive.org rate limits

### 5. Form Component Updates

Minimal changes needed to form components because:
- MediaUploader handles queue integration
- Forms just need to track if `pendingCount > 0` to show warning
- Final submit can proceed with completed uploads only

Update pattern for all forms:
```typescript
const { getUploadsByCallback, pendingCount } = useUploadManager();

// Show warning if user tries to submit with pending uploads
const handleSubmit = () => {
  const pending = getUploadsByCallback(callbackId).filter(u => u.status !== 'completed');
  if (pending.length > 0) {
    toast.warning(`${pending.length} file(s) still uploading. Please wait.`);
    return;
  }
  // Proceed with submit using completed URLs
};
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/contexts/UploadManagerContext.tsx` | New | Global upload manager context |
| `src/components/UploadStatusIndicator.tsx` | New | Floating upload status UI |
| `src/App.tsx` | Modify | Wrap with UploadManagerProvider |
| `src/components/MediaUploader.tsx` | Modify | Use context instead of direct upload |
| `supabase/functions/upload-to-archive/index.ts` | Modify | Add retry logic |
| Form components (multiple) | Modify | Add pending upload checks |

Forms to update:
- `src/components/AddResourceForm.tsx`
- `src/components/AddResourceGlobalForm.tsx`
- `src/components/AddResourceFormWithSelection.tsx`
- `src/components/AskQuestionForm.tsx`
- `src/components/AskQuestionGlobalForm.tsx`
- `src/components/AskQuestionFormWithSelection.tsx`
- `src/components/AnswerQuestionForm.tsx`
- `src/components/EditAnswerForm.tsx`
- `src/components/EditQuestionForm.tsx`
- `src/components/EditResourceForm.tsx`
- `src/components/FlashcardEditor.tsx`

---

## User Experience Flow

### Uploading Flow:
1. User selects file(s) in any form
2. Files are added to global queue immediately
3. Toast: "File added to upload queue"
4. User can continue filling form or navigate to other pages
5. Floating indicator shows "2 files uploading..."
6. When complete: Toast notification "File uploaded successfully"
7. If user returns to form, the URL is already attached

### Navigation During Upload:
1. User starts upload in Chapter page
2. User navigates to Bookmarks page
3. Upload continues in background (floating indicator visible)
4. Toast appears: "upload-123.jpg uploaded successfully"
5. User returns to form - file is already attached

### Tab Close Warning:
1. User tries to close browser tab while uploads pending
2. Browser shows: "You have uploads in progress. Are you sure you want to leave?"
3. User can choose to stay or leave (losing pending uploads)

### Retry Flow:
1. Upload fails (503 rate limit after retries)
2. Toast: "Failed to upload file.jpg - tap to retry"
3. Floating indicator shows failed count with retry button
4. User clicks retry, file re-queues

---

## Technical Details

### Rate Limiting Strategy
- Maximum 1 concurrent upload to Archive.org
- 1.5 second delay between uploads
- Exponential backoff on 503: 2s, 4s, 8s delays
- Maximum 3 retry attempts before marking as failed

### Multiple File Upload Fix
Current issue: Multiple files are uploaded in a blocking loop, causing rate limit errors.

Solution: Files are queued individually, processed one at a time with delays between each.

### Callback Registry
Components register callbacks with unique IDs. When an upload completes, the context:
1. Looks up the callback ID from the upload item
2. Calls all registered callbacks for that ID
3. Callbacks update the component's local state with the new URL

This ensures that even if the user navigated away and back, the component can still receive the URL.

---

## Edge Cases Handled

1. **User navigates away during upload**: Upload continues, toast notification appears
2. **User closes tab during upload**: Browser warning dialog appears
3. **Multiple files selected**: Queued and processed one at a time with delays
4. **Upload fails after retries**: Shows in floating indicator with retry button
5. **User submits form before uploads complete**: Warning message, submit blocked
6. **User returns to form after upload complete**: URL already attached via callback
7. **Network connection lost**: Retry on reconnection (using navigator.onLine)
