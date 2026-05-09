## Goal

Add a per-cell "AI identify" affordance to the Statistics table for resources and questions. Each editable metadata cell (Title, Description, Teachers, Schools, Books, Types, Pages) gets a small ✨ button that runs AI extraction for that single field on that single row, shows the suggestion inline as an **editable preview**, and offers **Confirm** (save) or **Discard** (revert).

Nothing is written to the DB until the user clicks Confirm. This replaces the current behavior where per-field AI buttons immediately save.

## UX

Each metadata cell renders one of three states:

1. **Idle** — current value (chips / number / text) + small `✨` icon button.
2. **Loading** — spinner replaces the icon while the AI call runs.
3. **Preview** — suggested value rendered as inline editor:
   - Text fields (Title): `<Input>` prefilled with suggestion.
   - Array fields (Teachers / Schools / Books): comma-separated `<Input>` (or chip editor) prefilled with merged-suggestion list.
   - Types: multi-select of known `resource_types` with the suggested ids preselected.
   - Pages: numeric `<Input>` prefilled with the recomputed page count.
   - Description: small `<Textarea>`.
   
   Below the editor: `[Confirm ✓]` `[Discard ✗]`. Cell shows a subtle highlight (e.g. `ring-1 ring-primary/40`) so the user sees pending changes.

Confirm → single `update` on that row for just that field, then refresh the row in local state. Discard → drop the preview, restore idle.

Multiple cells in different rows can have pending previews simultaneously; each is independent.

## Technical plan (Statistics.tsx only)

1. **Pending-preview state**

   ```ts
   type CellKey = `${'r'|'q'}:${number}:${MetadataField | 'pages'}`;
   const [cellPreviews, setCellPreviews] = useState<Record<CellKey, any>>({});
   const [cellLoading, setCellLoading] = useState<Record<CellKey, boolean>>({});
   ```

2. **`runCellAi(kind, row, field)`**
   - Set loading.
   - For metadata fields: call `extractMetadataFromOCR(row.ocr_text)` directly (the *non-updating* helper from `metadataExtractor.ts`). Pull just the relevant slice (`suggested_title`, `teacher_names`, `school_names`, `books`, `suggested_type_id`+`suggested_devoir_type_id`, `suggested_description`).
   - For pages: reuse the existing single-row page-count routine to compute and stash the number without writing it.
   - Store the suggestion under `cellPreviews[key]`. Don't touch DB.

3. **`confirmCell(kind, row, field)`**
   - Build a minimal `updates` object for that single field (mirroring the per-field branches already in `extractAndUpdate*Metadata`, but only for the one field — including the legacy scalar mirrors `teacher_name` / `school_name` / `book` and, for resources types, both `type_id` and `devoir_type_id`).
   - For Description, run the value through `mergeDescriptionWithAi` only if user kept the AI block; since the preview is now plain text after edit, just save the edited string.
   - `await supabase.from(kind === 'resource' ? 'resources' : 'questions').update(updates).eq('id', row.id)`.
   - Update local `resources` / `questions` state, clear the preview.

4. **`discardCell(key)`** — just `delete cellPreviews[key]`.

5. **`<MetaCell>` component (defined inside Statistics.tsx)**
   - Props: `kind`, `row`, `field`, `value`, render helpers for idle display.
   - Renders Idle / Loading / Preview as described.
   - The existing chip render code for arrays moves into the Idle branch; the existing `Pages` and `Type(s)` cells get the same treatment.

6. **Wiring into the table**
   - Replace the current static array/number/text cells for Title, Description, Teachers, Schools, Books, Types, Pages in both the resources and questions `<TableBody>` with `<MetaCell>` instances.
   - Keep the row's existing edit (`✏️`) action button — it still opens the full form. The per-cell ✨ is additive.
   - Remove the per-field items from `aiRowMenu` (they become redundant). Keep an "All fields" entry that runs all per-cell previews in parallel for the row — same confirm/discard model, just many cells lit up at once.

7. **Batch toolbar** — unchanged. The selection-aware `[📄 Pages]` and `runAiMetadataBatch` chips still write directly (bulk operations stay immediate; preview/confirm is a per-cell affordance).

## Files touched

- `src/pages/Statistics.tsx` — all UI + state changes.
- No backend, schema, or extractor changes. `metadataExtractor.ts` already exposes the non-saving `extractMetadataFromOCR`, which is what the preview uses.

## Open question

Should the **"AI: All fields" row action** also switch to preview-mode (light up every cell with pending suggestions, requiring confirm-per-cell or a single "Confirm all" button), or keep the current immediate-save behavior? Default in this plan: switch to preview mode with a per-row `[Confirm all] [Discard all]` bar that appears when any cell on that row has a pending preview.
