# Add `book` field to resources and questions

## 1. Database migration

- Add column `book text` (nullable) to `public.resources`.
- Add column `book text` (nullable) to `public.questions`.
- Backfill: `UPDATE public.resources SET book = 'CMS CLS correction manuel scolaire' WHERE book IS NULL;` (existing resources only).
- Update search RPCs to include and match on `book`:
  - `search_resources_normalized`: add `book` to RETURNS, SELECT `r.book`, add `OR unaccent(lower(coalesce(r.book,''))) LIKE norm_query`.
  - `search_questions_normalized`: add `book` to RETURNS, SELECT `q.book`, add `OR unaccent(lower(coalesce(q.book,''))) LIKE norm_query`.
  - `search_pdf_content` and `search_question_content`: add `book` to returned columns so the OCR-search UI can also display it.

## 2. Resource forms

Files: `AddResourceForm.tsx`, `AddResourceFormWithSelection.tsx`, `AddResourceGlobalForm.tsx`, `EditResourceForm.tsx`.

- Extend zod schema with `book: z.string().max(200).optional()`.
- Add to defaultValues (edit form reads from `initialData.book`).
- Add a `<FormField name="book">` input next to school/teacher with label "Book (Optional)" and placeholder `📘 e.g. CMS / CLS / Manuel scolaire`.
- Include `book: data.book || null` in insert/update payloads.
- Extend `EditResourceFormProps.initialData` with `book?: string | null` and pass it from `ResourceDetail.tsx`.

## 3. Question forms

Files: `AskQuestionForm.tsx`, `AskQuestionFormWithSelection.tsx`, `AskQuestionGlobalForm.tsx`, `EditQuestionForm.tsx`.

- Same pattern as above: zod field, default, input, payload, edit-form initialData.

## 4. Display the book name

A new shared component `src/components/BookBadge.tsx`:

- Small pill with a book icon (lucide `BookOpen`), gradient background that adapts to dark mode, truncated text with tooltip showing full value.
- Renders nothing when `book` is empty/null.

Usage:

- **Resource cards / lists** (`MainContent.tsx`, `Chapter.tsx`, `GlobalSearch.tsx`, anywhere resources are listed): render `<BookBadge book={resource.book} />` in the metadata row alongside school/teacher badges.
- **Question cards / lists** (`Chapter.tsx`, `ActionButtons.tsx` lists, `GlobalSearch.tsx`): render `<BookBadge book={question.book} />` in the same metadata area.
- **Resource detail page** (`ResourceDetail.tsx`): show the badge prominently in the header near the title, alongside school/teacher info.
- **Question detail page** (`QuestionDetail.tsx`): same — next to the question metadata.
- **Statistics page**: add a `Book` column for verification.

Visual:
- Light: soft amber/indigo gradient with dark text.
- Dark: deeper gradient, light text (follows existing badge pattern from `TeacherBadge`/`SchoolAutocomplete`).

## 5. Search

- `GlobalSearch.tsx`: surface `book` from RPC results via the new `BookBadge`. Filtering against `book` is automatic once the RPCs include it in the OR clause.

## 6. Types

`src/integrations/supabase/types.ts` regenerates automatically after the migration — no manual edit.

## Notes

- Backfill applies to existing resources only (per user request). Questions are not backfilled.
- `book` is fully optional; max length 200.
- Form persistence (`useFormPersistence`) picks up the new field automatically.
