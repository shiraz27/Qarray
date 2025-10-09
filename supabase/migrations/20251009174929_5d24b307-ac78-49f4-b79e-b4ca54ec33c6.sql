-- Add RLS policies for moderators/admins to manage subjects
CREATE POLICY "Moderators can create subjects"
ON public.subjects
FOR INSERT
TO authenticated
WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can update subjects"
ON public.subjects
FOR UPDATE
TO authenticated
USING (is_moderator_or_admin(auth.uid()))
WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can delete subjects"
ON public.subjects
FOR DELETE
TO authenticated
USING (is_moderator_or_admin(auth.uid()));

-- Add RLS policies for moderators/admins to manage chapters
CREATE POLICY "Moderators can create chapters"
ON public.chapters
FOR INSERT
TO authenticated
WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can update chapters"
ON public.chapters
FOR UPDATE
TO authenticated
USING (is_moderator_or_admin(auth.uid()))
WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can delete chapters"
ON public.chapters
FOR DELETE
TO authenticated
USING (is_moderator_or_admin(auth.uid()));