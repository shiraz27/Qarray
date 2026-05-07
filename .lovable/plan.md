## Problem

Adding a resource fails with:
> Could not find the 'type_ids' column of 'resources' in the schema cache

The earlier multi-type migration updated the `search_resources_normalized` function to reference `r.type_ids`, and frontend forms were updated to send `type_ids`, but the actual `type_ids` column was never added to the `resources` (or `questions`) tables.

## Fix

Single migration that adds the missing columns and backfills them from the existing single `type_id`:

```sql
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS type_ids integer[] DEFAULT '{}'::integer[];

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS type_ids integer[] DEFAULT '{}'::integer[];

-- Backfill from existing type_id so old records keep showing a badge
UPDATE public.resources
SET type_ids = ARRAY[type_id]
WHERE type_id IS NOT NULL
  AND (type_ids IS NULL OR array_length(type_ids, 1) IS NULL);

UPDATE public.questions
SET type_ids = ARRAY[type_id]
WHERE type_id IS NOT NULL
  AND (type_ids IS NULL OR array_length(type_ids, 1) IS NULL);
```

No code changes needed — the existing forms (`AddResourceForm`, `AddResourceGlobalForm`, `EditResourceForm`, `ResourceTypeBadges`, etc.) already write/read `type_ids`. After this migration, adding resources will work and existing resources will display their badge.
