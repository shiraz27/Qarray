# Page count for resources & questions

Display a "pages" indicator (PDF pages + 1 per image, videos/audio ignored) on resource and question cards, on their detail pages, and as an aggregated total on the chapter page.

## 1. Database (migration)

Add a nullable `page_count INTEGER` column to:
- `resources`
- `questions`

No RLS changes (existing SELECT policies cover reads; UPDATE policies already allow contributors/moderators to write).

A separate one-shot migration **fills existing rows** by parsing each row's media:
- For `resources.data` (text[]): for every URL classified as PDF (via the same dash-extension logic as `mediaTypeUtils`), fetch via `fetch-media` proxy server-side using `pdf-lib`/`pdfjs` is not available in Postgres — so the migration only sets `page_count = (number of image URLs)` deterministically from the URL list, and leaves PDFs to be backfilled by a client-side admin tool (see §4).
- Same logic for `questions.data` (text), extracting URLs via regex.

Rows with at least one PDF stay `NULL` until backfilled; rows with only images get a final value immediately. This keeps the migration fast and deterministic.

## 2. Compute on upload (client-side)

In `AddResourceForm`, `AddResourceFormWithSelection`, `AddResourceGlobalForm`, `EditResourceForm`, and the three Ask/Edit Question forms:

- After the user picks files but before/at insert time, compute `page_count`:
  - For each PDF file/URL: load via `pdfjs-dist` (already in deps) and read `pdf.numPages`.
  - For each image: +1.
  - Skip video/audio/unknown.
- Pass `page_count` in the `INSERT`/`UPDATE` payload alongside `data`.
- Use a small helper `src/utils/pageCountHelpers.ts` exposing:
  - `computePageCountFromUrls(urls: string[]): Promise<number>`
  - `computePageCountFromText(text: string): Promise<number>` (extracts URLs from question `data`)

Helper reuses `detectMediaType`, `isPdfUrl`, `isImageUrl` from `mediaTypeUtils.ts` and the existing `fetch-media` edge function for CORS-safe PDF byte fetches (same approach used by `clientOcrProcessor`).

## 3. UI surfaces

Pages displayed as a small badge with a `FileText` icon (e.g., `📄 12 pages`):

- **Resource card** (`MainContent.tsx` resource list, `Bookmarks.tsx` resource items, search results in `GlobalSearch.tsx`): show next to the existing type/correction badges.
- **Question card** (`MainContent.tsx` questions list, `Bookmarks.tsx`, `GlobalSearch.tsx`): same.
- **ResourceDetail.tsx** & **QuestionDetail.tsx**: show inline near title metadata.
- **Chapter page** (`Chapter.tsx`): aggregated header chip "X pages of content" = `SUM(resources.page_count) + SUM(questions.page_count)` for that chapter, fetched in one `select('page_count').eq('chapter_id', …)` per table (lightweight, only a single int column).
- Hidden / not rendered when `page_count` is `NULL` or `0` — never show "0 pages" or a placeholder.

## 4. Admin backfill tool (lazy, on-demand)

Because PDF page counts can't be computed from a SQL migration, add an **"Backfill page counts"** button to `Statistics.tsx` (admin-only, alongside existing OCR controls):

- Fetches rows where `page_count IS NULL` AND data contains a PDF, in batches of 20.
- For each row, runs `computePageCountFromUrls` client-side (same pdfjs path as OCR).
- Writes back `page_count` per row with progress UI mirroring the existing OCR progress.
- Skippable / resumable like the OCR batch.

This is the "expensive operation, lazy load" piece — done once by an admin per environment.

## 5. Lazy on the read side

For card lists, `page_count` is already on the row (cheap int), so no extra round-trip. For chapter aggregation, run the two `SUM` queries in parallel with the existing chapter data load; show a skeleton chip while pending.

## Files touched

- `supabase/migrations/<new>.sql` — add columns + image-only backfill.
- `src/utils/pageCountHelpers.ts` — new.
- `src/components/AddResourceForm.tsx`, `AddResourceFormWithSelection.tsx`, `AddResourceGlobalForm.tsx`, `EditResourceForm.tsx`.
- `src/components/AskQuestionForm.tsx`, `AskQuestionFormWithSelection.tsx`, `AskQuestionGlobalForm.tsx`, `EditQuestionForm.tsx`.
- `src/components/MainContent.tsx`, `src/components/GlobalSearch.tsx`, `src/pages/Bookmarks.tsx` — card badges.
- `src/pages/ResourceDetail.tsx`, `src/pages/QuestionDetail.tsx` — header metadata.
- `src/pages/Chapter.tsx` — aggregate chip.
- `src/pages/Statistics.tsx` — admin backfill button.
- `src/integrations/supabase/types.ts` — auto-regenerated.

## Out of scope

- Storing per-file page counts (only a single total per row).
- Counting frames/duration for video/audio.
- Recomputing automatically when files change (admin can re-run backfill or edit triggers it via the same upload-time path).
