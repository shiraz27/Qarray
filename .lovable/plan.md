# Multiple Resource Types per Resource

Allow a resource to have several types (e.g. *Cours* + *Résumé*, or *Exercices* + *Devoirs*) with one badge displayed per type.

## Scope

- Resource type (`Devoirs / Cours / Exercices / Résumé / PDF / Vidéo`) becomes multi-select.
- `devoir_type_id` stays single (it only refines the *Devoirs* type).
- Questions are **not** changed (out of scope).

## Database

Add a new array column on `resources`, backfill from current `type_id`, and keep `type_id` populated as the "primary" type for backward compatibility (it's read in many places — Chapter list, ResourceDetail, OCR/metadata, GlobalSearch).

```sql
ALTER TABLE resources
  ADD COLUMN type_ids integer[] NOT NULL DEFAULT '{}';

UPDATE resources
SET type_ids = ARRAY[type_id]
WHERE type_id IS NOT NULL AND array_length(type_ids,1) IS NULL;

CREATE INDEX resources_type_ids_gin ON resources USING gin (type_ids);
```

A trigger keeps `type_id` in sync with `type_ids[1]` so existing reads keep working without a sweeping rewrite:

```sql
CREATE OR REPLACE FUNCTION sync_resource_primary_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type_ids IS NOT NULL AND array_length(NEW.type_ids,1) >= 1 THEN
    NEW.type_id := NEW.type_ids[1];
  ELSIF NEW.type_id IS NOT NULL AND (NEW.type_ids IS NULL OR array_length(NEW.type_ids,1) IS NULL) THEN
    NEW.type_ids := ARRAY[NEW.type_id];
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_resource_primary_type
BEFORE INSERT OR UPDATE ON resources
FOR EACH ROW EXECUTE FUNCTION sync_resource_primary_type();
```

## Forms (write side)

Replace the single `<Select>` for *Resource Type* with a multi-select chip picker (checkbox list inside a Popover, using existing shadcn primitives — same pattern already used for filter chips in `Chapter.tsx`).

Files:
- `src/components/AddResourceForm.tsx`
- `src/components/AddResourceFormWithSelection.tsx`
- `src/components/AddResourceGlobalForm.tsx`
- `src/components/EditResourceForm.tsx`

Schema change (Zod): `type_ids: z.array(z.number()).default([])`.
On submit: send `type_ids` array; `type_id` is auto-set by the DB trigger. AI auto-detect (`suggested_type_id`) seeds the array with one value; the user can add more.

Devoir-type field stays as-is, but is only shown when `type_ids` includes the "Devoirs" id (id=1).

## Display (read side)

A small reusable `ResourceTypeBadges` component renders one colored badge per id in `type_ids`, falling back to `[type_id]` if the array is empty (legacy rows before the trigger fires).

Updated to render multi-badges:
- `src/pages/Chapter.tsx` — resource cards (~line 1159, 1194) and any other place printing `resourceType.type`.
- `src/pages/ResourceDetail.tsx` — header badge area.
- `src/components/GlobalSearch.tsx` — result cards.

Filtering on the Chapter page changes from `selectedTypeFilters.includes(r.type_id)` to `r.type_ids.some(id => selectedTypeFilters.includes(id))` (with the same fallback to `type_id` for legacy rows).

## Types

`src/integrations/supabase/types.ts` regenerates automatically after the migration, exposing `type_ids: number[]`. Local `Resource` interfaces in `Chapter.tsx`, `ResourceDetail.tsx`, `GlobalSearch.tsx` get a `type_ids: number[] | null` field added.

## Out of scope

- No change to `questions.type_id` (questions remain single-typed).
- No change to `devoir_type_id` cardinality.
- No change to AI metadata extractor output shape (still returns one suggested id; user picks the rest).