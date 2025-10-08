-- Create bookmarks table for chapter bookmarking
CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chapter_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, chapter_id)
);

-- Enable RLS
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own bookmarks"
ON public.bookmarks
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bookmarks"
ON public.bookmarks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
ON public.bookmarks
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_bookmarks_user_chapter ON public.bookmarks(user_id, chapter_id);