-- Update RLS policies for answers table to allow moderators/admins
CREATE POLICY "Users and moderators can update answers"
ON public.answers
FOR UPDATE
TO authenticated
USING (
  auth.uid() = ANY(contributors)
  OR public.is_moderator_or_admin(auth.uid())
);

CREATE POLICY "Users and moderators can delete answers"
ON public.answers
FOR DELETE
TO authenticated
USING (
  auth.uid() = ANY(contributors)
  OR public.is_moderator_or_admin(auth.uid())
);