-- Fix UPDATE RLS policies for soft delete operations

-- 1. Fix memorizations UPDATE policy
DROP POLICY IF EXISTS "Users and moderators can update memorizations" ON memorizations;

CREATE POLICY "Users and moderators can update memorizations"
ON memorizations FOR UPDATE
USING ((auth.uid() = creator_id) OR is_moderator_or_admin(auth.uid()))
WITH CHECK (true);

-- 2. Fix questions UPDATE policy
DROP POLICY IF EXISTS "Users and moderators can update questions" ON questions;

CREATE POLICY "Users and moderators can update questions"
ON questions FOR UPDATE
USING ((auth.uid() = ANY (contributors)) OR is_moderator_or_admin(auth.uid()))
WITH CHECK (true);

-- 3. Fix resources UPDATE policy
DROP POLICY IF EXISTS "Users and moderators can update resources" ON resources;

CREATE POLICY "Users and moderators can update resources"
ON resources FOR UPDATE
USING ((auth.uid() = published_by) OR is_moderator_or_admin(auth.uid()))
WITH CHECK (true);