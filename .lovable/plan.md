I investigated the OCR flow and found a likely cause: the current file-type detection only recognizes URLs containing `.pdf` or Archive-style `-pdf`. Your example resources do have `.pdf`, but the code still has several duplicated/fragile checks and old `not_applicable` rows that can remain from earlier misclassification. Also, if a URL is encoded or redirected in a way that hides the extension, the UI and OCR processor may still treat it as non-OCR-able.

Example URL to verify from your end:

```text
https://archive.org/download/qarray-educational-content/bac-math-matiques/maths/fonction-exponentielle/221-272.pdf
```

I confirmed this URL currently resolves as a real PDF through Archive.org and through the app’s media proxy. Another currently working example is:

```text
https://archive.org/download/qarray-educational-content/bac-sciences-exp-rimentales/math-matiques/primitives/119-133.pdf
```

Plan to fix this properly:

1. Centralize media type detection
   - Create one shared helper for detecting PDF/image/video/audio URLs instead of separate slightly different checks in Statistics, OCR processors, and forms.
   - Make PDF detection more robust for:
     - `.pdf`
     - `%2Epdf` / encoded filenames
     - query strings after filenames
     - Archive.org sanitized `-pdf` paths
     - URLs where the browser/proxy response `Content-Type` is `application/pdf` even if the URL itself is unclear.

2. Fix OCR processor classification
   - In `clientOcrProcessor.ts` and `clientQuestionOcrProcessor.ts`, if URL detection is unknown, fetch the file first and inspect the returned blob MIME type.
   - If the blob MIME type is `application/pdf`, process it as a PDF.
   - If it is an image MIME type, OCR it as an image.
   - Only set `not_applicable` when the file is definitely video/audio or there are no attachments.
   - If the URL/file cannot be fetched, mark it as `failed`, not `not_applicable`, so it remains retryable.

3. Fix Statistics retry visibility
   - Use the same shared helper for `canProcess`, batch OCR, and row actions.
   - Show the retry/play button for `not_applicable` rows that have a likely PDF/image URL.
   - Add a small way to inspect/copy the attachment URL from the Statistics row, so you can verify a problematic URL without digging into the database.

4. Clean up existing stale N/A PDF rows
   - Add a safe database migration that converts existing `not_applicable` resources/questions with PDF/image-looking URLs back to `pending`.
   - Leave true video/audio-only content as `not_applicable`.

5. Improve diagnostic messages
   - Store clearer `ocr_text` messages such as:
     - `No media files found`
     - `Only video/audio files found`
     - `Could not fetch PDF/image file — retry later`
     - `Unknown URL type, but response was application/pdf`
   - This should make future N/A cases much easier to diagnose.