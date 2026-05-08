## Problem

On `/resource/71`, clicking **Delete** in the confirmation dialog:
- Shows no loading indicator while the slow Archive.org cleanup runs (sequential `await` per file URL via the `delete-from-archive` edge function).
- Leaves the **Delete** button and dialog enabled, so impatient users click multiple times.
- Each extra click re-runs `handleDelete`. The first run eventually succeeds, but the later runs (now operating on an already-deleted resource) surface `Resource not found` / failure toasts.
- Net result: the action *did* work, but the UI looked frozen and then spammed errors.

## Fix (UI/UX only, in `src/pages/ResourceDetail.tsx`)

1. **Add `isDeleting` state** in `ResourceDetail`.
2. **Guard `handleDelete`**: return early if `isDeleting` is already true, set it to `true` at the start, reset in a `finally`.
3. **Loading UI in the AlertDialog**:
   - Disable both `AlertDialogAction` (Delete) and `AlertDialogCancel` while deleting.
   - Replace the action label with a `Loader2` spinner + "Deleting…" text.
   - Make the dialog non-dismissible during deletion (ignore `onOpenChange` close while `isDeleting`).
4. **Parallelize archive cleanup**: replace the sequential `for` loop with `Promise.allSettled(...)` over the archive URLs so the user waits ~1 round-trip instead of N.
5. **Handle already-deleted gracefully**: before the DB update, if `resource.deleted` is already true, just show the success toast and `navigate(-1)` without re-running. (Defensive — the dialog guard above is the primary fix.)
6. **Toast/navigation order**: only show success and navigate after the DB update resolves; on error, keep the dialog open and re-enable the buttons.

No backend, RLS, or schema changes. No change to the actual delete semantics — same soft-delete via `deleted = true` and same Archive.org cleanup.

## Files touched
- `src/pages/ResourceDetail.tsx` (single file, ~handleDelete + the AlertDialog block around line 743–763)

## Out of scope
- The same pattern likely exists on `QuestionDetail.tsx` and other detail pages. I'll only fix ResourceDetail unless you ask me to mirror the change everywhere.
