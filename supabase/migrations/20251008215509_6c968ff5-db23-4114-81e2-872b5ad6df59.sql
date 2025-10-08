-- Fix RLS policies for questions to properly handle moderator updates
DROP POLICY IF EXISTS "Users and moderators can update questions" ON public.questions;
DROP POLICY IF EXISTS "Users and moderators can delete questions" ON public.questions;

CREATE POLICY "Users and moderators can update questions"
ON public.questions
FOR UPDATE
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()))
WITH CHECK ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

CREATE POLICY "Users and moderators can delete questions"
ON public.questions
FOR DELETE
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

-- Fix RLS policies for answers to properly handle moderator updates
DROP POLICY IF EXISTS "Users and moderators can update answers" ON public.answers;
DROP POLICY IF EXISTS "Users and moderators can delete answers" ON public.answers;

CREATE POLICY "Users and moderators can update answers"
ON public.answers
FOR UPDATE
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()))
WITH CHECK ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

CREATE POLICY "Users and moderators can delete answers"
ON public.answers
FOR DELETE
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()));

-- Fix RLS policies for resources to properly handle moderator updates
DROP POLICY IF EXISTS "Users and moderators can update resources" ON public.resources;
DROP POLICY IF EXISTS "Users and moderators can delete resources" ON public.resources;

CREATE POLICY "Users and moderators can update resources"
ON public.resources
FOR UPDATE
USING ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()))
WITH CHECK ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()));

CREATE POLICY "Users and moderators can delete resources"
ON public.resources
FOR DELETE
USING ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()));