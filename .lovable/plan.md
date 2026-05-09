## Diagnosis

**Per-chapter Pages tile is hidden, not missing.** The aggregation in `Chapter.tsx` (lines 224-238) correctly SUMs `resources.page_count + questions.page_count`, and the tile renders when `totalPages > 0` (line 811). But the database currently has **37 of 60 non-deleted resources with `page_count IS NULL`** (and 0/0 questions filled), so chapters whose resources are all-NULL show no tile. The real fix is making the backfill actually finish.

**Backfill issues in `Statistics.tsx` `runPageCountBackfill`:**
1. **No per-row timeout** — a single slow PDF fetch (Archive.org has been timing out at 30s × 3 retries = up to ~90s per attempt) blocks the whole loop. With 37 rows, the user sees the UI "stuck."
2. **Failed PDFs stay NULL forever** — `computePageCountFromUrls` returns `null` if any PDF fails, so the row is skipped *and* re-fetched on every subsequent run, never making progress. There's no way to mark a row as "tried, give up."
3. **Not resumable across reloads** — progress is in component state only; closing the tab restarts from scratch (but at least re-queries NULL rows).
4. **Sequential** — one row at a time, no concurrency. With ~30s per slow PDF that's hours.
5. **Outer `catch` resets status to `null`** — one unhandled throw kills the run silently.

## Plan

### 1. Backfill rewrite (`src/pages/Statistics.tsx` + `src/utils/pageCountHelpers.ts`)

- **Per-row timeout wrapper**: race `computePageCountFromUrls` against a 45s `Promise.race` timeout. On timeout, treat as failure for that row.
- **Partial-success accounting in `computePageCountFromUrls`**: return an object `{ count: number; complete: boolean }` instead of `number | null`. `complete: false` means at least one PDF failed but we still got a partial count from images/other PDFs.
  - If `complete === true`: write `page_count = count` (final).
  - If `complete === false` AND `count > 0`: write the partial count (better than NULL, user sees something) and mark the row as attempted via a small in-memory `failedIds` set so this run skips re-trying it.
  - If `count === 0` AND not complete: leave NULL but add to `failedIds`; next run will retry (in case Archive.org recovers later).
- **Concurrency**: process in parallel batches of 4 using `Promise.allSettled`. Update progress after each settled promise, not after each batch.
- **Resumable progress**: persist `{ resourceCursor, questionCursor, failedIds }` to `localStorage` keyed `pageBackfill:v1`. On click, resume from cursor if present; add a "Reset" secondary button to clear it.
- **Robust error boundary**: each row's work is wrapped in its own try/catch; the outer try only handles the initial fetch of NULL rows. Never reset status to `null` mid-run — surface errors in the UI as a counter (`X failed, Y succeeded, Z skipped`).
- **UI**: show three counters (success / partial / failed) and a "Continue" button if the previous run was interrupted.

### 2. Helper update (`src/utils/pageCountHelpers.ts`)

Change return type:
```ts
export type PageCountResult = { count: number; complete: boolean };
export async function computePageCountFromUrls(urls: string[]): Promise<PageCountResult>
export async function computePageCountFromText(text: string): Promise<PageCountResult>
```
Update the 8 form components and the 2 backfill call sites accordingly. Forms keep the previous behavior (use `result.count` if `complete` else `null` — same as today).

### 3. Chapter tile visibility (`src/pages/Chapter.tsx`)

Minor UX so users see *something* while backfill hasn't run:
- Also count `resources.page_count IS NULL` rows; if `totalPages === 0` but `nullCount > 0`, show the tile with `—` and tooltip "Pending page-count computation". Otherwise hide as today.
- If `totalPages > 0` and some are still NULL, show `totalPages+` (with a `+` suffix and tooltip "Some items still pending").

### Out of scope
- Server-side backfill (PDF parsing isn't available in Postgres; would require a new edge function — bigger change, skip unless asked).
- Changing per-card badges (already correct).

## Files touched

- `src/utils/pageCountHelpers.ts` — new return type, per-row timeout helper.
- `src/pages/Statistics.tsx` — rewrite `runPageCountBackfill` with concurrency, resume, partial writes, richer UI.
- `src/pages/Chapter.tsx` — show tile with `—` or `+` when partially filled.
- `src/components/AddResourceForm.tsx`, `AddResourceFormWithSelection.tsx`, `AddResourceGlobalForm.tsx`, `EditResourceForm.tsx`, `AskQuestionForm.tsx`, `AskQuestionFormWithSelection.tsx`, `AskQuestionGlobalForm.tsx`, `EditQuestionForm.tsx` — adapt to new helper return shape (1-line change each: `result.complete ? result.count : null`).
