# Common Chapters Across Bac Classes

Match chapters with similar topics across different Bac classes (e.g., "LE DIPOLE RC" in Bac Informatique ↔ "Dipole RC" in Bac Mathématiques) using AI, then surface them as a collapsible "Common Chapters" section under the native chapters of each Bac subject.

## Scope

- Applies only to classes whose name starts with "Bac" (ids 15–21).
- Subjects are matched across Bac classes by **name similarity** (AI-judged: e.g., Maths ↔ Mathématiques ↔ Mathématique, Physique ↔ Physiques).
- Within matched subjects, **chapters** are matched by topic equivalence (AI-judged).

## How it works (user view)

1. On a Bac subject's chapters page, native chapters render as today.
2. Below them, a collapsible accordion **"Common Chapters from other Bac classes"** shows matched chapters, each with a badge like `From Bac Mathématiques`.
3. Tapping a common chapter opens that chapter's existing page (with its own questions/resources from its native class).
4. Non-Bac classes are unaffected.

## How matching is produced (admin view)

- A new card in **Statistics → Admin** called **"Match Common Chapters"** with a button **"Run AI Match"**.
- Clicking it calls a new edge function `match-common-chapters` that:
  1. Loads all subjects+chapters for Bac classes (ids 15–21).
  2. Uses **Gemini 2.5 Flash** (Lovable AI Gateway) in two passes:
     - **Pass A — subject groups:** cluster Bac subjects by name equivalence.
     - **Pass B — chapter pairs:** for each subject group, ask the model to return pairs of equivalent chapter ids across classes.
  3. Wipes prior mappings and inserts fresh rows into a new `chapter_common_mappings` table.
- Shows progress and a result toast (e.g., "Matched 87 chapter pairs across 6 subject groups").
- Re-runnable any time content changes.

## Database

New table `chapter_common_mappings`:

```text
id              bigserial pk
chapter_id      int   -- "host" chapter (the one viewing this page)
common_chapter_id int -- the matched chapter from another Bac class
created_at      timestamptz default now()
unique (chapter_id, common_chapter_id)
```

- Symmetric inserts: for each AI-returned pair (A,B), insert both (A→B) and (B→A) so lookups are one-way by `chapter_id`.
- RLS: SELECT for everyone (public discovery, mirrors `chapters` policy). INSERT/DELETE restricted to `is_moderator_or_admin`.
- Index on `chapter_id`.

## UI changes

**`src/components/MainContent.tsx`**
- After fetching native chapters, if the current class is Bac (id in 15..21), fetch:
  - `chapter_common_mappings` rows where `chapter_id IN (nativeChapterIds)` joined to `chapters` (id, name, subject_id, class_id) and `classes` (name).
  - Deduplicate target chapters (a single common chapter may match multiple natives).
- Render new `<Accordion>` below the native chapters list titled **"Common Chapters from other Bac classes"** with a count badge.
- Each item: chapter card (same visual style, slightly muted) + a small badge `From {className}`. Click navigates to `/chapter/{commonChapterId}`.
- Hide accordion entirely if there are no mappings.

**`src/components/AdminDeleteTab.tsx`** (or new `MatchCommonChaptersTab` in Statistics)
- New section with description, "Run AI Match" button, last-run timestamp (read from max `created_at` in the mappings table), live status, and result count.

## Edge function `match-common-chapters`

- Auth: validate JWT, require admin role via `has_role`.
- CORS headers, Zod validation of (empty) body.
- Pulls Bac subjects/chapters via service role client.
- Calls Lovable AI Gateway (`google/gemini-2.5-flash`) with structured tool-calling:
  - Tool 1 returns `subject_groups: [[subject_id, ...], ...]`.
  - Tool 2 (called per group) returns `pairs: [{a: chapter_id, b: chapter_id}, ...]`.
- Inserts symmetric rows in batches; truncates the table first inside a single transaction.
- Returns `{ groups, pairs, durationMs }`.

## Files

- New migration: create `chapter_common_mappings` with RLS + index.
- New: `supabase/functions/match-common-chapters/index.ts`.
- Edited: `src/components/MainContent.tsx` (fetch + accordion).
- Edited: `src/pages/Statistics.tsx` and/or `src/components/AdminDeleteTab.tsx` (admin trigger UI).

## Notes / non-goals

- No merging of content; opening a common chapter shows its original page as-is (per your choice).
- No automatic re-run; admin re-triggers manually after adding chapters.
- Cost is bounded: matching runs over Bac classes only, in two AI passes, cached in DB.
