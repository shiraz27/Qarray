-- Allow moderators and admins to insert test notifications
CREATE POLICY "Moderators can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (is_moderator_or_admin(auth.uid()));