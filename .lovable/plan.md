## Goal

1. Add the same Class + Subject filter UI from `SharedChaptersMultiSelect` to `MoveToChapterSelect`.
2. In both components, when a chapter is selected display three tags: **class**, **subject**, **chapter** (instead of the current single chip showing only `chapter · subject`).

## MoveToChapterSelect changes

Mirror `SharedChaptersMultiSelect`'s scope-filter block inside the popover:

- Load `classes` (hidden=false) on first open.
- Load `subjects` filtered by selected class ids.
- Multi-select class chips + subject chips with "Clear filters".
- Search RPC `search_chapters_normalized` fanned out per selected subject id (or per class id if no subjects, or a single null/null call when no filters), merged by id — same pattern as the multi-select.

Also extend the hydration query for the current value to include `class_id` and the class name so we can render the class tag:

```
.from('chapters').select('id, name, class_id, subjects(name), classes(name)')
```

Results from `search_chapters_normalized` already include `class_id` + `subject_name`; we'll additionally look up class names from the `classes` list loaded for the filter (cached map) when rendering tags. If a class name isn't cached yet, fall back to `Class #<id>`.

## Shared tag rendering (both components)

Below the trigger button (replacing the current single Badge row in `SharedChaptersMultiSelect`, and adding to `MoveToChapterSelect`), render for each selected chapter id a small grouped row of three `Badge`s:

```
[Class: 7ème]  [Subject: Math]  [Chapter: Fractions]
```

- `MoveToChapterSelect`: one row for the single selected chapter.
- `SharedChaptersMultiSelect`: one row per selected id (kept inside a `flex-col gap-1.5` list). Keep the existing `X` remove button at the end of each row (only on the multi-select).
- Use existing `Badge` component, `variant="secondary"` for chapter, `variant="outline"` for class/subject to differentiate.
- Truncate long names with `max-w-[12rem] truncate`.
- If class or subject name is missing from cached details, render `Class #id` / `Subject #id` placeholders.

## Class name resolution

Both components already load (or will load) the `classes` list when the popover opens. Promote that to load lazily on mount instead of waiting for `open`, so tags can render class names even before the popover is opened. Alternative for `MoveToChapterSelect`: fetch class name as part of the hydration `.select('classes(name)')` join — simpler, do that. For `SharedChaptersMultiSelect`, extend its existing hydration query the same way to include `classes(name)` and store it in `selectedDetails[id].class_name`.

## Out of scope

- No DB / RLS / persistence changes — purely UI inside the two components.
- No changes to how `chapter_id` / `shared_with` are written.
- No filter persistence across opens.

## Files

- edit `src/components/MoveToChapterSelect.tsx` — add filter block + tag rendering.
- edit `src/components/SharedChaptersMultiSelect.tsx` — extend hydration with class name + replace single badge with class/subject/chapter tag group.
