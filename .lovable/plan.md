## Goal

In the admin Statistics page, allow selecting rows (resources or questions) and using AI to batch-fill metadata: title, description, teachers, schools, books, type, devoir type. Support multiple teachers/schools/books per item via array columns.

## 1. Schema migration

Add array columns and backfill from existing scalars.

```sql
-- resources
ALTER TABLE resources
  ADD COLUMN teacher_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN school_names  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN books         text[] NOT NULL DEFAULT '{}';

UPDATE resources SET teacher_names = ARRAY[teacher_name] WHERE teacher_name IS NOT NULL AND teacher_name <> '';
UPDATE resources SET school_names  = ARRAY[school_name]  WHERE school_name  IS NOT NULL AND school_name  <> '';
UPDATE resources SET books         = ARRAY[book]         WHERE book         IS NOT NULL AND book         <> '';

-- questions (currently only has `book`)
ALTER TABLE questions
  ADD COLUMN teacher_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN school_names  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN books         text[] NOT NULL DEFAULT '{}';

UPDATE questions SET books = ARRAY[book] WHERE book IS NOT NULL AND book <> '';

CREATE INDEX idx_resources_teacher_names ON resources USING GIN (teacher_names);
CREATE INDEX idx_resources_school_names  ON resources USING GIN (school_names);
CREATE INDEX idx_resources_books         ON resources USING GIN (books);
CREATE INDEX idx_questions_teacher_names ON questions USING GIN (teacher_names);
CREATE INDEX idx_questions_school_names  ON questions USING GIN (school_names);
CREATE INDEX idx_questions_books         ON questions USING GIN (books);
```

Old scalar columns (`teacher_name`, `school_name`, `book`) are kept for backward compatibility and continue to mirror `arr[0]` on writes (handled in app code, not triggers, to keep things simple).

## 2. Edge function — `extract-metadata`

Update the AI tool schema to return arrays instead of single strings:

```ts
{
  suggested_title: string | null,
  suggested_description: string | null,
  suggested_type_id: number | null,
  suggested_devoir_type_id: number | null,
  teacher_names: string[],   // 0..N
  school_names:  string[],   // 0..N
  books:         string[],   // 0..N
}
```

Prompt updated to instruct the model that a single document can list multiple teachers/schools/books and to return all distinct values it finds. Old `school_name`/`teacher_name` keys removed from the schema.

## 3. `src/utils/metadataExtractor.ts`

- `ExtractedMetadata` becomes:
  ```ts
  { suggested_title, suggested_description, suggested_type_id, suggested_devoir_type_id,
    teacher_names: string[], school_names: string[], books: string[] }
  ```
- `extractAndUpdateResourceMetadata(id, ocrText, opts?)` gains an optional `fields` param to limit which DB columns get written:
  ```ts
  fields?: Array<'title'|'description'|'teachers'|'schools'|'books'|'types'>
  ```
  When omitted, all fields are written. Writes:
  - `teacher_names` array, plus `teacher_name = arr[0] ?? null`
  - `school_names`, `school_name = arr[0] ?? null`
  - `books`, `book = arr[0] ?? null`
  - `title` only if `fields` includes `'title'` (never overwritten in "all fields" unless explicitly requested — current behavior is suggest-only via `suggested_titles`; we keep that)
  - `description` always merged via `mergeDescriptionWithAi` (existing behavior)
  - `type_id` / `devoir_type_id` set only when `'types'` selected
- New `extractAndUpdateQuestionMetadata(id, ocrText, opts?)` mirrors the same writes against `questions`.

## 4. Statistics page UI (`src/pages/Statistics.tsx`)

In the resource batch toolbar (visible when `selectedResourceIds.size > 0`), replace the single "Extract metadata" button with a split control:

```
[ AI fill all fields ▾ ]   [ Title ] [ Description ] [ Teachers ] [ Schools ] [ Books ] [ Types ]
```

- Primary button: runs all fields on selected rows.
- Secondary chips: each runs `extractAndUpdateResourceMetadata` with `fields: [thatField]`.
- Same toolbar added to the questions tab, calling `extractAndUpdateQuestionMetadata`.
- Each batch:
  - Iterates selected ids with concurrency 2 (avoid Lovable AI rate limit), 500ms delay between batches.
  - Toast progress `[i/N] AI: <field(s)>`.
  - Skips rows with no `ocr_text` / `ocr_status !== 'completed'` and reports `skipped` count.
  - On finish: success/skipped/failed counters + `fetchResources` / `fetchQuestions` refresh.
- Rows now show array values as small badge stacks (first 2 + "+N more") in a new "Metadata" column for quick verification.

Existing single-row "Extract metadata" buttons keep working (call all-fields path).

## 5. Resource/Question forms — minor read/write

Forms still write single values today. To avoid scope creep we only:
- On submit, when `teacher_name` / `school_name` / `book` are set, mirror them as 1-element arrays into the new columns.
- Display reads stay scalar for now (cards/details continue to read `teacher_name` etc.). A follow-up task can switch the UI to multi-select; out of scope here.

## 6. Search functions

`search_resources_normalized` and `search_questions_normalized` are extended to also match against the array columns:

```sql
OR EXISTS (SELECT 1 FROM unnest(r.teacher_names) t WHERE unaccent(lower(t)) LIKE norm_query)
OR EXISTS (SELECT 1 FROM unnest(r.school_names)  t WHERE unaccent(lower(t)) LIKE norm_query)
OR EXISTS (SELECT 1 FROM unnest(r.books)         t WHERE unaccent(lower(t)) LIKE norm_query)
```

Same pattern in question search. Existing scalar matches stay (still works for legacy data).

## Files touched

- new migration: arrays + backfill + GIN indexes + updated search functions
- `supabase/functions/extract-metadata/index.ts` — array tool schema + prompt
- `src/utils/metadataExtractor.ts` — types, per-field write, question variant
- `src/pages/Statistics.tsx` — batch toolbar (resources + questions), per-field buttons, calls
- `src/components/AddResourceForm.tsx`, `AddResourceFormWithSelection.tsx`, `AddResourceGlobalForm.tsx`, `EditResourceForm.tsx`, `AskQuestionForm.tsx`, `AskQuestionFormWithSelection.tsx`, `AskQuestionGlobalForm.tsx`, `EditQuestionForm.tsx` — write 1-element arrays alongside existing scalar fields on submit

## Out of scope

- Multi-select UI in the upload/edit forms (scalar stays for now; arrays still get populated as 1-element).
- Card/detail page UI showing all teachers/schools/books — follow-up.
- Removing legacy scalar columns — keep both until forms are migrated.
