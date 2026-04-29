
-- Restrict direct profile access to owner and moderators/admins
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id OR public.is_moderator_or_admin(auth.uid()));

-- Public-safe view: only non-sensitive fields
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT
  user_id,
  full_name,
  avatar_color,
  user_type,
  teacher_verified,
  class_id,
  institute_id,
  created_at,
  tutorial_completed,
  tutorial_step
FROM public.profiles
WHERE deleted = false;

-- Allow public read on the view (RLS on underlying table no longer permits this,
-- but security_invoker means we'd be blocked too). Use security_definer view instead.
DROP VIEW public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker = false)
AS
SELECT
  user_id,
  full_name,
  avatar_color,
  user_type,
  teacher_verified,
  class_id,
  institute_id,
  created_at,
  tutorial_completed,
  tutorial_step
FROM public.profiles
WHERE deleted = false;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Public function for landing page student count (no PII exposure)
CREATE OR REPLACE FUNCTION public.get_student_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.profiles WHERE deleted = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_count() TO anon, authenticated;
