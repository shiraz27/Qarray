-- Add content_type and content_id columns to bookmarks table
ALTER TABLE public.bookmarks 
ADD COLUMN content_type text,
ADD COLUMN content_id integer;

-- Make chapter_id nullable since we'll now support different content types
ALTER TABLE public.bookmarks 
ALTER COLUMN chapter_id DROP NOT NULL;

-- Add a check constraint to ensure either chapter_id or (content_type + content_id) is provided
ALTER TABLE public.bookmarks 
ADD CONSTRAINT bookmarks_content_check 
CHECK (
  (chapter_id IS NOT NULL AND content_type IS NULL AND content_id IS NULL) OR
  (chapter_id IS NULL AND content_type IS NOT NULL AND content_id IS NOT NULL)
);

-- Create index for better performance
CREATE INDEX idx_bookmarks_content ON public.bookmarks(content_type, content_id);
CREATE INDEX idx_bookmarks_user_content ON public.bookmarks(user_id, content_type, content_id);