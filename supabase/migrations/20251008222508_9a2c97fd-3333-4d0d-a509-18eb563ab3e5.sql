-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_answer_notification ON public.answers;
DROP TRIGGER IF EXISTS trigger_resource_notification ON public.resources;
DROP TRIGGER IF EXISTS trigger_question_notification ON public.questions;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS notify_answer_added();
DROP FUNCTION IF EXISTS notify_bookmark_resource();
DROP FUNCTION IF EXISTS notify_bookmark_question();

-- Create notifications table if not exists
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('answer_added', 'bookmark_content', 'new_resource')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id INTEGER,
  reference_type TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to create notification for answer added
CREATE OR REPLACE FUNCTION notify_answer_added()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the question owner(s)
  INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
  SELECT 
    UNNEST(q.contributors) as user_id,
    'answer_added',
    'New Answer',
    'Someone answered your question',
    NEW.question_id,
    'question'
  FROM public.questions q
  WHERE q.id = NEW.question_id
    AND UNNEST(q.contributors) != ANY(NEW.contributors);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new resource in bookmarked chapter
CREATE OR REPLACE FUNCTION notify_bookmark_resource()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify users who have bookmarked this chapter
  INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
  SELECT 
    b.user_id,
    'bookmark_content',
    'New Content in Bookmark',
    'New resource added to a chapter you bookmarked',
    NEW.id,
    'resource'
  FROM public.bookmarks b
  WHERE b.chapter_id = NEW.chapter_id
    AND b.user_id != NEW.published_by;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new question in bookmarked chapter
CREATE OR REPLACE FUNCTION notify_bookmark_question()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify users who have bookmarked this chapter
  INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
  SELECT 
    b.user_id,
    'bookmark_content',
    'New Question in Bookmark',
    'New question added to a chapter you bookmarked',
    NEW.id,
    'question'
  FROM public.bookmarks b
  WHERE b.chapter_id = NEW.chapter_id
    AND b.user_id != ALL(NEW.contributors);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER trigger_answer_notification
  AFTER INSERT ON public.answers
  FOR EACH ROW
  EXECUTE FUNCTION notify_answer_added();

CREATE TRIGGER trigger_resource_notification
  AFTER INSERT ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION notify_bookmark_resource();

CREATE TRIGGER trigger_question_notification
  AFTER INSERT ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION notify_bookmark_question();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);