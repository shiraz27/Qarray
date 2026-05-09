## Problem

On `/statistics`, the per-field AI buttons (Title, Description, Teachers, Schools, Books, Types) already exist but are hidden inside a single "AI fill ▾" dropdown menu. That's why it looks like the UI you asked for isn't there — it only appears after clicking the dropdown.

`Types` is already wired up (it sets `type_id` and `devoir_type_id` for resources, and `type_id` for questions), so nothing missing there — it just needs to be visible.

## Fix — flatten the dropdown into a visible chip row

In `src/pages/Statistics.tsx`, replace the `AI fill ▾` dropdown in both batch toolbars (resources toolbar around line 1593, questions toolbar around line 2043) with a flat row of small buttons directly in the toolbar:

```
[N selected]   [✨ All]  [Title] [Description] [Teachers] [Schools] [Books] [Types]   [Retry ▾] [Clear]
```

- Each chip calls `runAiMetadataBatch(kind, ids, [field])` (already implemented).
- `All` calls it with `fields` undefined.
- For the questions toolbar, hide `Title` and `Description` chips (questions don't have those AI updates today — matches current dropdown behavior).
- Wrap the chips in `flex flex-wrap gap-1` so they reflow nicely on smaller widths; the toolbar stays one row on desktop (1008px viewport you're on).
- Keep the existing `isExtractingBatch` disabled state and spinner on the `All` chip.
- Delete the `aiBatchMenuItems` helper and the two `DropdownMenu` wrappers that hosted it (the `Retry selected` dropdown stays as-is — it has 3 OCR modes that make sense as a menu).

## Files touched

- `src/pages/Statistics.tsx` — replace both AI-fill dropdowns with inline chip rows; remove now-unused `aiBatchMenuItems`.

No backend, schema, or extractor changes — everything per-field already works, this is purely making it visible.