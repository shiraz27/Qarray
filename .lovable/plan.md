# Share identical resources across chapters (mods/admins only)

## Goal
Let admins/moderators mark a single resource as also belonging to other chapters, without re-uploading and without any visual distinction from native resources. No interaction with the existing `chapter_common_mappings` (that stays a cross-class chapter-equivalence feature).

## Data model

Add one column to `resources`:

- `shared_with integer[] NOT NULL DEFAULT '{}'` — list of additional chapter IDs the resource also appears in.

GIN index on `shared_with` for fast `&&` / `ANY` lookups.

Single source of truth: the row still lives in its native `chapter_id`. `shared_with` is a pure visibility extension.

No new table, no join, no duplication. Bookmarks, votes, OCR, page_count stay 1:1 with the row.

## Permissions

RLS already lets moderators update any resource. We add:

- A new policy or column-level constraint enforcing that **only `is_moderator_or_admin(auth.uid())` can write `shared_with`**. Simplest path: an `UPDATE` trigger that raises if `NEW.shared_with IS DISTINCT FROM OLD.shared_with` and the caller isn't a mod/admin. Owners keep their normal edit rights on all other fields.
- Editing the resource itself (title, files, etc.) from any shared chapter remains a mod/admin action, matching your "manual cross editing for mods/admins only" requirement. Owners can still edit content from the native chapter as today.

## Query change (transparent merge)

In `Chapter.tsx` (and any other place listing resources by chapter — `MainContent.tsx`, count queries) replace:

```ts
.eq('chapter_id', chapterId)
```

with:

```ts
.or(`chapter_id.eq.${chapterId},shared_with.cs.{${chapterId}}`)
```

(`cs` = contains). Same filter for the count query and the page-count aggregation. Result: shared resources appear inline, ordered with native ones, with zero visual difference.

## UI

### Reading
Nothing changes. No badge, no section, no tooltip. Identical to native resources.

### Editing (mods/admins only)
In `EditResourceForm.tsx`, add a moderator-gated field **"Also share with chapters"**:

- Multi-select autocomplete searching chapters via existing `search_chapters_normalized` RPC.
- Shows current `shared_with` as removable chips.
- Hidden entirely for non-mods.
- Saves as `shared_with: number[]`.

We reuse the existing chapter search RPC, so no new endpoint.

### Add flow
Skip for v1 — moderators add `shared_with` from the edit form after creation. (Keeps the upload wizard untouched.)

## Why this avoids confusion with "Common chapters"

| Feature | Scope | Trigger | Storage |
|---|---|---|---|
| `chapter_common_mappings` | Maps **chapters** that teach the same topic across **different classes**, populated by AI | Edge function `match-common-chapters` | Separate table |
| `resources.shared_with` | Lists extra chapters where **one specific resource** also appears | Manual mod action per resource | Column on `resources` |

They never touch the same code path. The common-chapters AI job is unaffected.

## Files touched

- New migration: add `shared_with` column + GIN index + write-restriction trigger.
- `src/pages/Chapter.tsx`: swap `.eq('chapter_id', …)` → `.or(...)` in the 4 resource queries (list + count + page-count aggregate).
- `src/components/MainContent.tsx`: same swap where it lists chapter resources.
- `src/components/EditResourceForm.tsx`: add mod-only "Also share with chapters" multi-select, persist `shared_with`.
- `src/hooks/useUserRole.ts` (already exists) used to gate the UI.

## Out of scope (v1)
- Surfacing in Add flow.
- Bulk share UI (can iterate later from Statistics/Moderation).
- Auto-propagating to common-chapter equivalents (kept independent on purpose).
