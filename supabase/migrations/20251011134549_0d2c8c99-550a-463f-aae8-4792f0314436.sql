-- Add flashcard_review as valid notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('answer_added', 'bookmark_content', 'new_resource', 'flashcard_review'));