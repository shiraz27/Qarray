ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS shared_with integer[] NOT NULL DEFAULT '{}'::integer[];

CREATE INDEX IF NOT EXISTS idx_resources_shared_with ON public.resources USING GIN (shared_with);

CREATE OR REPLACE FUNCTION public.enforce_resources_shared_with_mod_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_resources_shared_with_mod_only ON public.resources;
CREATE TRIGGER trg_resources_shared_with_mod_only
BEFORE UPDATE ON public.resources
FOR EACH ROW
EXECUTE FUNCTION public.enforce_resources_shared_with_mod_only();