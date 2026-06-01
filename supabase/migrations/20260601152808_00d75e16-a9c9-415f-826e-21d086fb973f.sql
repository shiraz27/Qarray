ALTER TABLE public.ai_generations ADD COLUMN IF NOT EXISTS model text;

UPDATE public.ai_generations SET model = 'legacy' WHERE model IS NULL;

DROP INDEX IF EXISTS uq_ai_generations_target_kind;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_generations_target_kind_model
  ON public.ai_generations (target_type, target_id, kind, COALESCE(model, ''));

CREATE INDEX IF NOT EXISTS idx_ai_generations_model ON public.ai_generations (model);