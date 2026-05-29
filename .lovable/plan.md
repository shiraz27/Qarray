## Diagnosis

Saving a resource/question edit is slow because `computePageCountFromUrls(mediaUrls)` runs **on every save, for every existing URL, even when nothing about the media changed**. For each PDF URL it:

1. POSTs to the `fetch-media` edge function
2. Downloads the **full PDF blob** through the proxy
3. Parses it with pdfjs-dist to count pages

These run **sequentially** (`for…of` in `src/utils/pageCountHelpers.ts`). The recent network logs show the same proxy hammered with split-PDF `manifest.json` lookups that even return `unavailable` ("Source not ready yet"), triggering more internal retries. So a resource with 3–5 PDFs becomes a 10–60 s save where the wire suggests "files being re-uploaded" — it's the proxy re-downloading them to recount pages.

The user's intuition is correct in spirit: we are reprocessing unchanged media. We are not literally re-uploading, but the proxy round-trip + PDF parse is dominating the save latency.

Other concern from the user — "not adding only changes but including everything" — also lines up: the update payload sends every column even when fields weren't modified. That's not the perf killer (text columns are tiny), but it's worth tightening as a small bonus.

## Changes

### 1. `src/utils/pageCountHelpers.ts` — parallelize + add diff helper
- Replace the sequential `for…of` in `computePageCountFromUrls` with `Promise.all` so PDF fetches happen concurrently. Keeps the same `{ count, complete }` shape.
- Add a tiny helper `mediaUrlsEqual(a: string[], b: string[]): boolean` that returns true when both arrays contain the same URLs (order-insensitive). Used by callers to skip recompute when nothing changed.

### 2. `src/components/EditResourceForm.tsx` — only recompute when media changed
- Compute `mediaChanged = !mediaUrlsEqual(mediaUrls, initialData.data)`.
- If `mediaChanged` is **false**: do **not** include `page_count` in the update payload at all (leaves DB value intact, zero proxy calls).
- If `mediaChanged` is **true**: keep current behavior but `await` `computePageCountFromUrls(mediaUrls)` (now parallelized). To make saves feel instant even in this branch, fire the page-count recompute **after** the main update returns:
  - Send the UPDATE without `page_count`.
  - After success and `toast.success`, kick off `computePageCountFromUrls(mediaUrls)` in the background; once it resolves, do a second small UPDATE setting only `page_count`. Errors are swallowed (existing page_count stays).
  - This unblocks the user immediately while still keeping page_count fresh.

### 3. `src/components/EditQuestionForm.tsx` — same treatment
- Currently the question form doesn't have access to the previous media list. Parse it once from `initialData.data` text with the same regex used in `computePageCountFromText` (`/(https?:\/\/[^\s\n")]+)/g`) to derive `initialMediaUrls`.
- Apply the same `mediaChanged` check, omit `page_count` when unchanged, and run the recompute in the background on change.

### 4. Optional micro-cleanup (resources only)
- Build the `updateData` object as a true diff: only include fields whose value differs from `initialData`. Skips no-op writes to `school_names`/`teacher_names`/`books`/`type_ids` arrays and prevents unnecessary `updated_at` churn. Low risk because the keys removed are simply not sent to PostgREST.

## Verification

- Open an existing resource with several PDFs, change just the title, save. Expectation: save returns in well under a second; no `fetch-media` requests for PDF blobs are issued.
- Add a new PDF to the same resource and save. Expectation: save returns immediately; one background batch of `fetch-media` calls happens after the success toast, followed by a small `page_count`-only UPDATE.
- Same two scenarios for a question edit.

## Out of scope

- No DB schema or RLS changes.
- No changes to upload code paths (already async via `UploadManager`).
- No change to `fetch-media` retry policy; this plan removes the need to call it in the common case.
