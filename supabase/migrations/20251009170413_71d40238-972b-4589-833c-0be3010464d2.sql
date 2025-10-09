-- Add upvotes and downvotes to memorizations
ALTER TABLE public.memorizations
ADD COLUMN upvotes integer DEFAULT 0,
ADD COLUMN downvotes integer DEFAULT 0;

-- Update RLS policies for memorizations to allow owner and moderator access
DROP POLICY IF EXISTS "Users can update own memorizations" ON public.memorizations;
DROP POLICY IF EXISTS "Users can delete own memorizations" ON public.memorizations;

CREATE POLICY "Users and moderators can update memorizations"
ON public.memorizations
FOR UPDATE
USING ((auth.uid() = creator_id) OR is_moderator_or_admin(auth.uid()));

CREATE POLICY "Users and moderators can delete memorizations"
ON public.memorizations
FOR DELETE
USING ((auth.uid() = creator_id) OR is_moderator_or_admin(auth.uid()));

-- Create index for better query performance on votes
CREATE INDEX idx_memorizations_upvotes ON public.memorizations(upvotes DESC);

-- Add vote support for memorizations in votes table
-- The votes table already exists and supports content_type, so we just need to ensure it works with memorizations

-- Ensure bookmarks table supports memorizations
-- The bookmarks table uses content_type and content_id, so it should already support memorizations