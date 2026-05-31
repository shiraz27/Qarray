DROP POLICY IF EXISTS "Users and moderators can update answers" ON public.answers;

CREATE POLICY "Users and moderators can update answers"
ON public.answers
FOR UPDATE
TO authenticated
USING (
  auth.uid() = ANY(contributors)
  OR public.is_moderator_or_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = ANY(contributors)
  OR public.is_moderator_or_admin(auth.uid())
  OR deleted = true
);