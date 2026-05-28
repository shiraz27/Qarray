## Goal

Add a mod-only "Move to chapter" selector to both `EditResourceForm.tsx` and `EditQuestionForm.tsx`. Persists by updating `resources.chapter_id` / `questions.chapter_id`. RLS already allows mods/admins to update either table.

## New shared component

`src/components/MoveToChapterSelect.tsx` — single-chapter picker reusing the same UX as `SharedChaptersMultiSelect` (class/subject filter + `search_chapters_normalized` RPC + debounce + hydration of current chapter name), but single-select.

Props:
```ts
{ value: number | null; onChange: (id: number) => void; excludeChapterId?: number; disabled?: boolean; }
```

Behavior:
- Trigger label shows current chapter name + subject (hydrated via `chapters` select like the multi-select does).
- Clicking an option in the popover sets `value` and closes the popover. No "clear" — moving requires a destination.
- The current chapter is shown but disabled (`(current chapter)` hint), same pattern as `excludeChapterId` in the existing component.

## EditResourceForm changes

Inside the existing `{isModerator && (...)}` block, add a second dashed-border section directly under the shared-chapters block:

```
Move to chapter [Mod only]
This permanently moves the resource to another chapter. Shared chapters are unaffected.
<MoveToChapterSelect value={targetChapterId} onChange={setTargetChapterId} excludeChapterId={chapterId} />
```

- `targetChapterId` state initialized to `chapterId` prop.
- In `onSubmit`, when `isModerator && targetChapterId && targetChapterId !== chapterId`, include `chapter_id: targetChapterId` in `updateData`. Otherwise omit (keeps non-mods and no-op safe).
- On success, since the parent assumes the resource still belongs to the original chapter, surface a toast "Resource moved" and still call `onSuccess()` (parent already refetches).

## EditQuestionForm changes

`EditQuestionForm` currently has no shared-chapters UI. Add a new mod-only block (gated by `useUserRole().isModerator`) at the bottom of the form, above the action buttons, with the same `MoveToChapterSelect`. Persist `chapter_id: targetChapterId` in the `questions` update when changed.

Import `useUserRole` (not currently used here).

## Out of scope

- Bulk move, undo, moving across classes with warnings, updating any denormalized counters, re-running OCR. Just a straight `chapter_id` rewrite.
- No DB/RLS changes — existing mod/admin UPDATE policies on `resources` and `questions` already cover this.

## Files

- create `src/components/MoveToChapterSelect.tsx`
- edit `src/components/EditResourceForm.tsx`
- edit `src/components/EditQuestionForm.tsx`
