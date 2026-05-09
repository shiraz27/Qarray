## Goal

On `/statistics`, surface metadata directly in the resources/questions tables (Title, Teachers, Schools, Books, Types, Pages) with per-row and batch actions. Move the page-count backfill into the same selection toolbar so it works on selected rows like the AI fields.

## Changes

### 1. Fetch the missing columns

`fetchResources` currently selects only `school_name, teacher_name` (legacy scalars). Add the array columns and page count:

```
id, title, description, data, ocr_status, ocr_text, chapter_id,
chapters(name), resource_types(type),
school_name, teacher_name,
teacher_names, school_names, books, type_ids, page_count
```

For `fetchQuestions`, add: `book, teacher_names, school_names, books, type_ids, page_count`.

Also load `resourceTypes` (already loaded for selectors) so we can render type chips by id.

### 2. Add visible columns in the resources table

Insert columns between `Title` and `Type`:

```
ID | ☐ | Title | Teachers | Schools | Books | Types | Pages | Chapter | OCR | OCR Text | Actions
```

- `Teachers` / `Schools` / `Books`: render `text[]` as small chips (max 2 visible + "+N"); empty cell when array is empty. Click chip → no-op (display only). Cell has small `✏️` icon → opens existing `EditResourceForm` (same as current row Edit action).
- `Types`: render `type_ids` as chips using `resourceTypes` lookup; falls back to scalar `type_id` if `type_ids` is empty.
- `Pages`: render `page_count` as a number; empty `—` when null.
- Keep existing `Title`, `Type` (scalar resource_type), `Chapter`, `OCR Status`, `OCR Text`, `Actions` columns. (The existing scalar `Type` column can stay as-is; the new `Types` column shows the multi-select. We can drop the scalar one later if redundant.)

For questions: same idea but only `Teachers | Schools | Books | Types | Pages` (questions have no title/description).

### 3. Per-row inline AI buttons

In each row's `Actions` cell, alongside existing buttons, add a small `Sparkles ▾` dropdown that calls `runAiMetadataBatch(kind, [row.id], [field])` for each field individually plus an "All fields" entry. This already works — just exposes the per-row variant.

### 4. Page-count backfill — selection-aware

Currently `runPageCountBackfill` scans all NULL rows globally. Refactor to accept a scope:

```ts
runPageCountBackfill(opts?: {
  scope?: 'all-null' | 'selected-resources' | 'selected-questions',
  ids?: number[],
  skipPreviouslyFailed?: boolean,
})
```

- `all-null` (default): existing behavior — kept for the global "Backfill all" button at the top of the page.
- `selected-*`: fetch `id, data` only for the given ids (no `page_count IS NULL` filter, so it can recompute), run the same pool, and write `page_count`.

In both batch toolbars (resources at line 1616, questions at line 2054), add a new chip next to the AI chips:

```
[📄 Pages] — recomputes page_count for selected rows
```

Disabled while `pageBackfillStatus.running`. Reuses the existing progress toast/UI.

### 5. Files touched

- `src/pages/Statistics.tsx` — only file. No backend, no schema, no new components.

```text
fetch columns ──► table headers ──► table cells ──► row-level AI menu
                                                  ──► batch "Pages" chip → runPageCountBackfill({scope:'selected-…'})
```

### Open question

Is the existing scalar `Type` column (showing `resource_types.type` from `type_id`) still useful once the new `Types` chip column shows the full `type_ids` set? My default is to keep both for now; tell me if you'd rather drop the scalar one.