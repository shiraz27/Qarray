
-- Add 'ai_bot' to user_type enum
ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'ai_bot';

-- Profiles: bot model marker
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Answers: allow attaching to resources
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS resource_id integer;
CREATE INDEX IF NOT EXISTS idx_answers_resource_id ON public.answers(resource_id);

-- AI generations tracker
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('resource','question')),
  target_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('correction','summary','step_by_step','infographic')),
  bot_user_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  output_answer_id integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generations_target ON public.ai_generations(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_generations_target_kind ON public.ai_generations(target_type, target_id, kind);

GRANT SELECT ON public.ai_generations TO authenticated;
GRANT ALL ON public.ai_generations TO service_role;

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Moderators can view ai_generations"
ON public.ai_generations FOR SELECT
TO authenticated
USING (public.is_moderator_or_admin(auth.uid()));

CREATE TRIGGER trg_ai_generations_updated_at
BEFORE UPDATE ON public.ai_generations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
