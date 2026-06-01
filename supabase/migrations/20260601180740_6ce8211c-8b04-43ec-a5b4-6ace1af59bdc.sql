-- 1) Add AI description proposal columns to resources
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS description_proposed text,
  ADD COLUMN IF NOT EXISTS description_proposed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS description_proposed_status text,
  ADD COLUMN IF NOT EXISTS description_proposed_model text;

-- 2) Swap ai_generations uniqueness so multiple models per (target,kind) coexist
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.ai_generations'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_generations DROP CONSTRAINT %I', cname);
  END LOOP;
END$$;

-- Drop any plain unique indexes on the old triple
DROP INDEX IF EXISTS public.ai_generations_target_type_target_id_kind_key;
DROP INDEX IF EXISTS public.ai_generations_target_kind_unique;

-- New unique: one row per (target_type, target_id, kind, model)
-- Use COALESCE so NULL model still constrains to one legacy row.
CREATE UNIQUE INDEX IF NOT EXISTS ai_generations_target_kind_model_unique
  ON public.ai_generations (target_type, target_id, kind, COALESCE(model, ''));