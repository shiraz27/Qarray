-- Fix SELECT policies to allow soft delete operations

-- 1. Update Questions SELECT Policy
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON questions;

CREATE POLICY "Questions are viewable by everyone"
ON questions FOR SELECT
USING (
  (NOT deleted) 
  OR (auth.uid() = ANY (contributors)) 
  OR is_moderator_or_admin(auth.uid())
);

-- 2. Update Memorizations SELECT Policy
DROP POLICY IF EXISTS "Public memorizations are viewable by everyone" ON memorizations;

CREATE POLICY "Public memorizations are viewable by everyone"
ON memorizations FOR SELECT
USING (
  ((NOT deleted) AND ((is_public = true) OR (creator_id = auth.uid())))
  OR (creator_id = auth.uid())
  OR is_moderator_or_admin(auth.uid())
);

-- 3. Update Resources SELECT Policy
DROP POLICY IF EXISTS "Resources are viewable by everyone" ON resources;

CREATE POLICY "Resources are viewable by everyone"
ON resources FOR SELECT
USING (
  (NOT deleted) 
  OR (auth.uid() = published_by) 
  OR is_moderator_or_admin(auth.uid())
);