ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS shared_with INTEGER[] NOT NULL DEFAULT '{}'::integer[];

CREATE INDEX IF NOT EXISTS idx_questions_shared_with ON public.questions USING GIN (shared_with);

-- Enforce moderator-only changes to shared_with (mirrors resources policy)
CREATE OR REPLACE FUNCTION public.enforce_questions_shared_with_mod_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.shared_with IS DISTINCT FROM OLD.shared_with THEN
    IF NOT public.is_moderator_or_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only moderators or admins can change shared_with';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_shared_with_mod_only ON public.questions;
CREATE TRIGGER questions_shared_with_mod_only
BEFORE UPDATE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_questions_shared_with_mod_only();