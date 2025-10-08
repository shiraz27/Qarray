-- Fix UPDATE policy for questions to use authenticated role
DROP POLICY IF EXISTS "Users and moderators can update questions" ON public.questions;

CREATE POLICY "Users and moderators can update questions"
ON public.questions
FOR UPDATE
TO authenticated
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()))
WITH CHECK ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

-- Also fix DELETE policy for questions
DROP POLICY IF EXISTS "Users and moderators can delete questions" ON public.questions;

CREATE POLICY "Users and moderators can delete questions"
ON public.questions
FOR DELETE
TO authenticated
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

-- Fix UPDATE policy for answers
DROP POLICY IF EXISTS "Users and moderators can update answers" ON public.answers;

CREATE POLICY "Users and moderators can update answers"
ON public.answers
FOR UPDATE
TO authenticated
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()))
WITH CHECK ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

-- Fix DELETE policy for answers  
DROP POLICY IF EXISTS "Users and moderators can delete answers" ON public.answers;

CREATE POLICY "Users and moderators can delete answers"
ON public.answers
FOR DELETE
TO authenticated
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

-- Fix UPDATE policy for resources
DROP POLICY IF EXISTS "Users and moderators can update resources" ON public.resources;

CREATE POLICY "Users and moderators can update resources"
ON public.resources
FOR UPDATE
TO authenticated
USING ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()))
WITH CHECK ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()));

-- Fix DELETE policy for resources
DROP POLICY IF EXISTS "Users and moderators can delete resources" ON public.resources;

CREATE POLICY "Users and moderators can delete resources"
ON public.resources
FOR DELETE
TO authenticated
USING ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()));