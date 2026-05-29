## Diagnosis

Three separate problems are stacking up to make audio feel broken:

1. **Recording approval flow is confusing.** After "Stop Recording", `MediaUploader` shows a `Preview Recording` button that doesn't actually play the recording — it opens another modal-style preview step where the user must then click `Keep`. There is no inline playback of the freshly recorded blob, and the button labels ("Preview", "Keep") don't match what they do (queue an upload).
2. **Player gives no signal while the file is still propagating.** `AudioPlayer` just mounts `<audio src={mediaSrc(url)} preload="metadata" />`. While the upload is in progress, or while Archive.org is still ingesting (the `fetch-media` proxy returns `{ unavailable: true, error: "Source not ready yet…" }` for several seconds after a successful PUT), the `<audio>` element fails silently. There's no spinner, no "still processing" hint, no retry — the play button just appears broken.
3. **No per-file upload visibility in the player slot.** When a resource/question has an audio entry, the only "this thing exists but isn't ready yet" signal lives in the global `UploadStatusIndicator`. The audio card itself looks fully ready.

The user's chunking hunch is partially solved already: `archiveMultipartUpload.ts` already does 8 MB parts with 2× concurrency for files ≥ 16 MB. Recorded webm clips are almost always under that threshold, so the real wins are around (a) communicating state and (b) lowering the multipart threshold for audio so longer recordings use parallel parts.

## Changes

### 1. Inline recording approval (`src/components/MediaUploader.tsx`)
- After `mediaRecorder.onstop`, keep the existing `audioBlob` state, but render an inline preview block right where the buttons live:
  - Native `<audio controls src={URL.createObjectURL(audioBlob)} />` so the user can listen immediately, no extra step.
  - Two buttons: `Use Recording` (queues upload via existing `queueFileUpload(file, 'audio')`, then clears state) and `Re-record` (drops the blob and goes back to `Start Recording`).
- Delete `handlePreviewRecording` and the audio branch of the generic preview/keep dialog. Camera image preview path stays unchanged.
- Revoke the object URL on unmount/cleanup to prevent leaks.

### 2. Show a "still processing" state in the player (`src/components/AudioPlayer.tsx`)
- Add a `status` state: `'probing' | 'ready' | 'processing' | 'error'`.
- On mount, do a lightweight readiness probe against `mediaSrc(url)` (GET with `Range: bytes=0-0`). If response is `application/json` with `{ unavailable: true }`, set status to `'processing'` and schedule a retry with exponential backoff (3s → 6s → 12s → cap 30s). On a real media content-type, set `'ready'` and mount `<audio>`.
- While `'processing'`: render the existing card chrome with a `Loader2` spinner, a clear message ("Audio is still being processed by storage. This usually takes 10–60 seconds.") and a `Retry now` button.
- On `<audio>`'s `error` event: flip to `'error'` with a retry button that re-runs the probe.
- Also wire `onWaiting` / `onCanPlay` so the play button shows a spinner while the browser is buffering after a play click.

### 3. Surface upload-in-progress directly on the audio card (`src/components/MediaPreview.tsx`)
- Use `useUploadManager().uploads` to find any active upload whose resulting URL matches `url` (compare on the last path segment / file name — uploads are tracked by file, and the URL is the file's archive download URL once known). When matched and status is `queued` / `uploading`:
  - Disable the "Click to play" tap target.
  - Replace the subtitle text with `Uploading… {Math.round(progress*100)}%` and render a thin progress bar.
- When the upload finishes, the entry simply transitions to the normal "Click to play" card — and the `AudioPlayer` probe in change 2 covers the post-upload propagation gap.

### 4. Lower multipart threshold for audio (`src/utils/archiveMultipartUpload.ts`)
- Make `MULTIPART_THRESHOLD` and `PART_SIZE` per-`fileType`: audio uses 6 MB threshold, 3 MB parts, concurrency 3. Image/PDF unchanged.
- Strictly a speed-up for longer recordings; small clips still take the single PUT path.

## Verification

- Record a 5-second clip, hit `Use Recording`. Expectation: clip appears in the pending list immediately, no extra "Preview/Keep" step.
- Open a resource that contains an audio URL right after uploading. Expectation: audio card briefly shows `Uploading… NN%`, then the player opens with a `Processing…` state that auto-resolves to playable within a minute, without the user needing to refresh.
- Open an old, fully-propagated audio resource. Expectation: probe completes immediately and the player behaves exactly as today.
- Record a long (>10 min) clip. Expectation: upload uses multipart with smaller parts and finishes noticeably faster.

## Out of scope

- No DB or RLS changes — purely client + helper code.
- No changes to `upload-to-archive` or `fetch-media` edge functions; they already support multipart and retries.
- Not addressing Archive.org's own propagation delay — only communicating it to the user.
