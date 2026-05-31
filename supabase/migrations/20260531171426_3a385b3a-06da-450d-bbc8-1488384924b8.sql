DROP POLICY IF EXISTS "Answers are viewable by everyone" ON public.answers;

CREATE POLICY "Answers are viewable"
ON public.answers
FOR SELECT
USING (
  (NOT deleted)
  OR (auth.uid() = ANY (contributors))
  OR public.is_moderator_or_admin(auth.uid())
);