# Share-with chapter picker: class/subject filters + small "Shared with" badge

## Goal
Make the moderator-only "Also share with chapters" picker faster to scope, and surface where a resource is shared with a tiny, unobtrusive badge that lists the destination classes/subjects (not chapter names).

## 1. Filtered chapter picker (in `EditResourceForm` → `SharedChaptersMultiSelect`)

Add two filter rows above the chapter search input, inside the popover:

- **Classes** — multi-select, fetched from `classes` (where `hidden = false`), ordered by id.
- **Subjects** — multi-select, fetched from `subjects` filtered by the picked class ids (and `deleted = false`). Disabled until at least one class is picked. Clears automatically when classes change.

Chapter search behavior:

- If exactly one class is picked → call `search_chapters_normalized(search, p_class_id)`.
- If exactly one subject is picked → call `search_chapters_normalized(search, null, p_subject_id)`.
- For multi-select (multiple classes and/or subjects), call the RPC once per id and merge/dedupe by chapter id (RPC only accepts single ids today; cheaper than a schema change).
- Without filters, behavior is unchanged.

Search input still works, but with filters it scopes to only those classes/subjects. Selected chapter chips remain visible across filter changes (a chapter stays selected even if it falls outside the active filter).

Self-chapter still excluded via existing `excludeChapterId`.

## 2. Small "Shared with" badge

A new compact, read-only badge component `SharedWithBadge` that renders a single muted `Badge` like:

`Shared · 3 classes · 2 subjects`

- Counts derive from the resource's `shared_with` chapter ids → join to `chapters.class_id` and `chapters.subject_id` → distinct counts.
- Hover/tap reveals a `HoverCard`/`Popover` listing the class names and subject names (no chapter names — keeps it concise and matches your "map the class/subjects" ask).
- Renders nothing when `shared_with` is empty.

### Where it appears
- `ResourceDetail.tsx` next to the title (same row as existing badges).
- Resource cards rendered in `Chapter.tsx` and `MainContent.tsx`, inline next to the title (tiny `text-[10px]`, `variant="secondary"`).

Visibility is universal (not mod-only) — it's metadata, not a control. This does **not** alter the existing "no visual distinction between native and shared resources" rule: the badge appears on the *origin* row everywhere it's shown; native resources without `shared_with` simply don't render it.

### Data fetching
Single helper hook `useSharedWithSummary(sharedWithIds: number[])`:
- `chapters` select `id, class_id, subject_id, classes(name), subjects(name)`
- Returns `{ classes: {id,name}[], subjects: {id,name}[] }`
- Memoized, skipped when array empty.

## Files

- `src/components/SharedChaptersMultiSelect.tsx` — add class/subject multi-filters, fetch + merge logic.
- `src/components/SharedWithBadge.tsx` — new compact badge with hover details.
- `src/hooks/useSharedWithSummary.ts` — new hook.
- `src/pages/ResourceDetail.tsx` — render badge near title.
- `src/pages/Chapter.tsx` and `src/components/MainContent.tsx` — render badge inline on resource rows (only where `shared_with.length > 0`).

## Out of scope
- New RPC variants accepting arrays of class/subject ids (current merge-on-client is fine for picker volumes).
- Editing `shared_with` from the badge (still done from `EditResourceForm`).
- Showing per-chapter destination names in the badge tooltip.
