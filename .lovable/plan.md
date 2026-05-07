# Add book to OCR search + autocomplete on all book inputs

## 1. Search functions — include `book` in OCR-content search

Currently `search_pdf_content` and `search_question_content` return `book` but only filter on `ocr_text`. Update both via migration so the WHERE clause also matches `book`:

```sql
-- search_pdf_content
WHERE c.class_id = user_class_id
  AND r.deleted = false
  AND (
    (r.ocr_status = 'completed' AND unaccent(lower(r.ocr_text)) LIKE '%' || norm_query || '%')
    OR unaccent(lower(coalesce(r.book,''))) LIKE '%' || norm_query || '%'
  )
```

Same shape for `search_question_content` (match `q.book`). `match_snippet` falls back to the book name when the OCR text doesn't contain the query.

`search_resources_normalized` and `search_questions_normalized` already match on `book` — no change.

## 2. New RPCs for book autocomplete

Add two `SECURITY DEFINER STABLE` functions returning distinct book names:

- `search_resource_books_normalized(search_query text)` → `TABLE(book text)` from `resources` where `book IS NOT NULL AND book <> '' AND deleted = false` matching `unaccent(lower(book)) LIKE`. `LIMIT 15`, ordered alphabetically.
- `search_question_books_normalized(search_query text)` → same shape from `questions`.

Mirrors the existing `search_schools_normalized` / `search_teachers_normalized` pattern.

## 3. New `BookAutocomplete` component

`src/components/BookAutocomplete.tsx`, modeled on `SchoolAutocomplete` / a slimmed `TeacherBadge` autocomplete:

- Props: `value`, `onChange(name)`, `source: 'resource' | 'question'`, `placeholder`, `disabled`.
- Popover + `Command` UI with `BookOpen` icon trigger.
- Debounced (300ms) RPC call to the matching `search_*_books_normalized`.
- Shows distinct existing books; user can also choose "Use exact name: …" for a free-form value (no separate `books` table — it remains a free text column).
- Matches the visual language of `SchoolAutocomplete` (same trigger button shape, AI badge omitted since we don't auto-suggest book).

## 4. Wire `BookAutocomplete` into all forms

Replace the plain `<Input name="book">` added previously with `<BookAutocomplete source="resource" .../>` (or `"question"`) inside the `FormField` render in:

- `AddResourceForm.tsx`, `AddResourceFormWithSelection.tsx`, `AddResourceGlobalForm.tsx`, `EditResourceForm.tsx` → `source="resource"`.
- `AskQuestionForm.tsx`, `AskQuestionFormWithSelection.tsx`, `AskQuestionGlobalForm.tsx`, `EditQuestionForm.tsx` → `source="question"`.

Zod schema and payload handling stay the same (still optional string).

## 5. Notes

- No new tables; book remains a free-text column. Autocomplete is purely a UX helper sourced from existing rows.
- Types regenerate automatically after the migration.
- `.lovable/plan.md` updated to reflect the new RPCs, autocomplete component, and the OCR-search WHERE clause change.
