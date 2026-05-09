## Problem

On `/chapter/:id`, clicking "Open Form" navigates to `?restoreForm=resource` but the dialog never opens.

`src/pages/Chapter.tsx` (lines 107–115) only matches the literal string `'true'`:

```ts
if (searchParams.get('restoreForm') === 'true') {
  setIsResourceDialogOpen(true);
  …
}
```

The previous fix updated the indicator to emit `?restoreForm=resource` / `?restoreForm=question`, so the chapter page no longer matches. The button is rendered (correctly) but navigating doesn't open the dialog.

## Fix

Update `Chapter.tsx`'s `restoreForm` effect to accept the new values, mirroring `ActionButtons.tsx`:

- `?restoreForm=resource` → open `isResourceDialogOpen`.
- `?restoreForm=question` → open `isQuestionDialogOpen`.
- `?restoreForm=true` (legacy) → keep current behavior, default to opening the resource dialog.

After opening the appropriate dialog, delete the query param (already handled).

That's the only change needed for the immediate "doesn't show up" complaint. `AddResourceForm` already restores its session on mount, so the dialog will pick up the persisted URLs and field values automatically.

## Files

- `src/pages/Chapter.tsx` — extend the `restoreForm` effect.

## Out of scope

- `AskQuestionForm` (chapter-scoped) has no persistence yet, so opening the question dialog from the indicator on a chapter page won't auto-fill anything. Today the indicator's pending-formType heuristic still routes to `resource` whenever the chapter form was used, so this isn't blocking the current bug. We can add persistence to `AskQuestionForm` later if the user reports it.