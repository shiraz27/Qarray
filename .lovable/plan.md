## Problem

Large Archive.org PDFs (like `integral (1).pdf`) fail in `docs.google.com/viewer` with "Ce fichier est trop volumineux pour être prévisualisé". Google's viewer caps around ~25MB and rejects bigger files.

## Fix

Update `src/components/MediaPreview.tsx` PDF branch (lines 84–100):

1. **Primary action**: open the raw PDF URL directly (`href={encodedUrl}`) so the browser's native PDF viewer renders it — no size cap.
2. **Secondary action**: keep an optional "Open in Google Viewer" link as a small fallback for users who prefer it (only useful for smaller files).
3. Keep current card UI (icon + label), just change the click target and add a second small link.

## Technical notes

- `encodedUrl` already exists in the component (spaces → `%20`).
- Archive.org sets proper `Content-Type: application/pdf` and `Content-Disposition: inline`, so browsers render in-tab.
- No changes to upload pipeline, OCR, or any other preview type. Single-file edit.
