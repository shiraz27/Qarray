CREATE POLICY "Moderators can update ai_generations"
ON public.ai_generations FOR UPDATE TO authenticated
USING (is_moderator_or_admin(auth.uid()))
WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can delete ai_generations"
ON public.ai_generations FOR DELETE TO authenticated
USING (is_moderator_or_admin(auth.uid()));