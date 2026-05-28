## Goal

Add a `source_link` field to resources that records where the resource originally came from (a URL or, for textbook scans, the book name). Surface it as an editable column in the Statistics admin table, expose it on upload as an admin/mod-only input, and expand the Statistics filters & search to cover all visible columns/statuses.

## 1. Database

New migration:
- `ALTER TABLE public.resources ADD COLUMN source_link text;`
- Backfill in the same migration:
  - For rows where any of `book ILIKE '%manuel scolaire%'` OR `EXISTS (unnest(books) b WHERE b ILIKE '%manuel scolaire%')` → set `source_link` to the matching book name (prefer `book`, else first matching entry in `books[]`).
  - For all other rows where `source_link IS NULL` → set to the provided Google Drive folder URL (`https://drive.google.com/drive/folders/1NXLMkzdGEjAfDnYB6kONz2hgPuuq4IXE`, stripped of the `fbclid`/`brid` tracking params for cleanliness).
- No RLS change needed (existing resources policies already cover it).

## 2. Upload form (admin/mod only)

`src/components/AddResourceGlobalForm.tsx` (and the two sibling forms if they share the publish step):
- Add a `sourceLink` field to wizard state, persisted with the existing form-persistence mechanism.
- Render a single input "Source (link or book name)" that is **only visible** when `is_moderator_or_admin` (use the same role hook already used elsewhere — verify by reading `useUserRole` / equivalent).
- On insert, include `source_link: sourceLink || null`. Non-mod uploads simply leave it null.

## 3. Statistics table — editable "From" column

`src/pages/Statistics.tsx`:
- Add `source_link` to the resources SELECT and to the `Resource` type.
- Add a `From` `<TableHead>` and `<TableCell>` between an appropriate existing column (e.g. after Books / before Pages).
- New `SourceLinkCell` component (inline or under `src/components/statistics/`): shows the current value as a clickable link if it parses as a URL, otherwise as plain text. Click → inline `<Input>` + Save / Discard buttons with the same pattern used by other editable cells (`saveResourceCell`). On save: `UPDATE resources SET source_link = ?`. Discard reverts to the original value with no DB write. Show a small "edited, unsaved" indicator while dirty.
- Questions are out of scope (per user answer).

## 4. Expanded filters & search

Statistics already has `ocrFilter`, `watermarkFilter`, `searchQuery`. Extend:
- Add `sourceFilter` select: `all | has_link | has_book_name | missing`.
- Search query now also matches `source_link`, `book`, `books[]`, `teacher_name(s)`, `school_name(s)`, `title`, `description`, `chapter name` (audit current matcher and add any missing fields).
- Status filters: ensure both `ocr_status` and `watermark_status` selects expose every value present in the DB (`pending | completed | failed | not_applicable | in_progress` where applicable). Add a combined "Needs attention" preset that ORs `ocr_status IN (failed)` OR `watermark_status IN (failed)` OR `source_link IS NULL`.
- All filters compose with AND, the search composes via case-insensitive substring across the listed fields.

## 5. Memory

Add a new memory entry `mem://features/resource-source-link` summarizing: field name, backfill rule (manuel scolaire → book name, else Drive folder URL), admin-only upload visibility, Statistics editable cell.

## Technical notes

- The Google Drive URL is stored as-is (without tracking params) so the cell can render it as an `<a target="_blank" rel="noopener noreferrer">`.
- "Manuel scolaire" match is case-insensitive substring, applied to both `book` and `books[]`.
- No changes to public/user-facing resource pages.
- No edge function changes.
- Types regenerate automatically after the migration runs.

## Out of scope

- Questions table (`source_link` not added).
- Surfacing on `/resource/:id` or cards.
- Bulk re-editing UI beyond the per-row inline editor.
