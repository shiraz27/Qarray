ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS type_ids integer[] DEFAULT '{}'::integer[];
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS type_ids integer[] DEFAULT '{}'::integer[];

UPDATE public.resources SET type_ids = ARRAY[type_id]
WHERE type_id IS NOT NULL AND (type_ids IS NULL OR array_length(type_ids, 1) IS NULL);

UPDATE public.questions SET type_ids = ARRAY[type_id]
WHERE type_id IS NOT NULL AND (type_ids IS NULL OR array_length(type_ids, 1) IS NULL);