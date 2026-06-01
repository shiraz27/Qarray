## Goal

Stop AI-generated output (OCR re-runs and AI bot generations) from silently overwriting the previous saved value. Both flows should produce a **proposal**, surface a before/after diff in the admin UI, and only apply when the admin clicks **Approve**. **Discard** drops the proposal.

First-time generation (no prior value) stays auto-apply — there's nothing to compare.

---

## Part 1 — OCR proposal flow

### Schema (migration)

Add to `public.resources` and `public.questions`:

```sql
ALTER TABLE public.resources
  ADD COLUMN ocr_text_proposed text,
  ADD COLUMN ocr_text_proposed_at timestamptz,
  ADD COLUMN ocr_text_proposed_readability text,
  ADD COLUMN ocr_text_proposed_status text;  -- 'completed' | 'failed' | 'not_applicable'

ALTER TABLE public.questions
  ADD COLUMN ocr_text_proposed text,
  ADD COLUMN ocr_text_proposed_at timestamptz,
  ADD COLUMN ocr_text_proposed_readability text,
  ADD COLUMN ocr_text_proposed_status text;
```

No new RLS; existing UPDATE policies (moderator/admin only on stats page) already gate writes. No new GRANTs needed (columns are inside existing tables).

### Processor changes

`src/utils/clientOcrProcessor.ts` and `src/utils/clientQuestionOcrProcessor.ts`:

- Before writing results, read the current `ocr_text` for the row.
- If existing `ocr_text` is **non-empty** (real content, not a "still processing" placeholder) AND new run finished successfully:
  - Write to `ocr_text_proposed`, `ocr_text_proposed_status`, `ocr_text_proposed_readability`, `ocr_text_proposed_at`.
  - Do **not** touch `ocr_text` / `ocr_status` / `ocr_processed_at`.
- Otherwise (no prior text, or new run failed): keep current behavior, write directly to `ocr_text` / `ocr_status` and clear any stale proposal columns.

### Admin UI

New component `src/components/statistics/OcrReviewButton.tsx`:

- Renders only when row has a non-null `ocr_text_proposed`.
- Pill button "Review new OCR" next to the existing `OcrTextEditor`.
- Opens a Dialog with two columns: **Current** (`ocr_text`) and **Proposed** (`ocr_text_proposed`), each scrollable. Header shows char counts and a unified character-diff line at the top using a small inline diff renderer (no new dependency; simple longest-common-subsequence-free diff acceptable — render add/remove blocks).
- **Approve** button: `UPDATE` row setting `ocr_text = ocr_text_proposed`, `ocr_status = ocr_text_proposed_status`, `ocr_readability = ocr_text_proposed_readability`, `ocr_processed_at = now()`, and clear all `ocr_text_proposed*` to NULL.
- **Discard** button: clear all `ocr_text_proposed*` to NULL only.

Wire button into the resources & questions tables on `Statistics.tsx` (same cell area as `OcrTextEditor`). Pull the proposed columns into the existing row fetch.

Toast on approve/discard; refresh row in place.

---

## Part 2 — AI Generations proposal flow

### Schema (migration)

```sql
ALTER TABLE public.ai_generations
  ADD COLUMN proposed_data text,
  ADD COLUMN proposed_at timestamptz,
  ADD COLUMN review_status text;  -- NULL | 'pending' | 'approved' | 'discarded'
```

### Edge function `supabase/functions/ai-generate/index.ts`

In `runGeneration`, after producing the new `dataString`:

- If `existingGen?.output_answer_id` exists (= live answer present): **do not** UPDATE the live `answers` row. Instead update `ai_generations` with `proposed_data = dataString`, `proposed_at = now()`, `review_status = 'pending'`, `status = 'completed'`, `error = null`. Skip the answer insert/update.
- If no existing live answer: keep current behavior (insert new `answers` row, set `output_answer_id`, `review_status = NULL`).

### Admin UI

Extend `AiGenerationsCard.tsx`:

- Fetch `output_answer_id`, `proposed_data`, `review_status` along with status in `fetchStatuses`.
- When a cell is `completed` AND `review_status = 'pending'`: replace the green check with an amber "Review" badge (`AlertCircle` + word "Review"), clickable.
- Click opens `<AiGenerationReviewDialog />`:
  - **Current**: fetch live answer (`answers.data` parsed JSON) by `output_answer_id`. Render the textual content of the matching kind (content / svg for infographic).
  - **Proposed**: parse `proposed_data` the same way.
  - Two-pane side-by-side rendering. For text kinds: simple word-level diff highlighting. For `infographic`: render both SVGs side by side, no diff.
  - **Approve**: `UPDATE answers SET data = proposed_data, deleted = false WHERE id = output_answer_id`; then `UPDATE ai_generations SET proposed_data = NULL, proposed_at = NULL, review_status = 'approved'`.
  - **Discard**: `UPDATE ai_generations SET proposed_data = NULL, proposed_at = NULL, review_status = 'discarded'`.

Add a top-of-card filter chip "Pending review (N)" that scrolls/highlights pending cells. (Lightweight — just a counter in the header for now.)

---

## Diff renderer

Small shared helper `src/utils/textDiff.ts` exporting `diffWords(before, after): Array<{ type: 'eq'|'add'|'del'; text: string }>` implemented with a basic LCS over whitespace-tokenized arrays. No external dependency. Used by both review dialogs.

---

## Out of scope

- Manual edits in `OcrTextEditor` continue to write straight to `ocr_text` (admin is explicitly editing — no review gate).
- No history beyond the single most recent proposal (matches "Last saved value" answer).
- No notifications/email; review is in-app only.
- No change to the public-facing answer/resource rendering — users keep seeing the current live value until admin approves.

---

## Files touched

- New migration adding proposal columns to `resources`, `questions`, `ai_generations`.
- `src/utils/clientOcrProcessor.ts`, `src/utils/clientQuestionOcrProcessor.ts` — branch on existing text.
- `src/utils/textDiff.ts` — new diff helper.
- `src/components/statistics/OcrReviewButton.tsx` — new.
- `src/components/statistics/AiGenerationReviewDialog.tsx` — new.
- `src/components/statistics/AiGenerationsCard.tsx` — fetch + render review state, pending counter.
- `src/pages/Statistics.tsx` — include proposal columns in row fetch, mount `OcrReviewButton`.
- `supabase/functions/ai-generate/index.ts` — write proposal instead of overwriting when a live answer exists.
