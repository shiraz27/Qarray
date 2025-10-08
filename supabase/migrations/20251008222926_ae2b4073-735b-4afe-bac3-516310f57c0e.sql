-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS trigger_answer_notification ON public.answers;
DROP TRIGGER IF EXISTS trigger_resource_notification ON public.resources;
DROP TRIGGER IF EXISTS trigger_question_notification ON public.questions;
DROP FUNCTION IF EXISTS notify_answer_added();
DROP FUNCTION IF EXISTS notify_bookmark_resource();
DROP FUNCTION IF EXISTS notify_bookmark_question();

-- Updated function to create notification for answer added (class-specific)
CREATE OR REPLACE FUNCTION notify_answer_added()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the question owner(s) and only notify if they're in the same class as the chapter
  INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
  SELECT 
    UNNEST(q.contributors) as user_id,
    'answer_added',
    'New Answer',
    'Someone answered your question',
    NEW.question_id,
    'question'
  FROM public.questions q
  INNER JOIN public.chapters ch ON q.chapter_id = ch.id
  INNER JOIN public.profiles p ON p.user_id = UNNEST(q.contributors)
  WHERE q.id = NEW.question_id
    AND UNNEST(q.contributors) != ANY(NEW.contributors)
    AND p.class_id = ch.class_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Updated function to create notification for new resource in bookmarked chapter (class-specific)
CREATE OR REPLACE FUNCTION notify_bookmark_resource()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify users who have bookmarked this chapter and are in the same class
  INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
  SELECT 
    b.user_id,
    'bookmark_content',
    'New Content in Bookmark',
    'New resource added to a chapter you bookmarked',
    NEW.id,
    'resource'
  FROM public.bookmarks b
  INNER JOIN public.chapters ch ON b.chapter_id = ch.id
  INNER JOIN public.profiles p ON p.user_id = b.user_id
  WHERE b.chapter_id = NEW.chapter_id
    AND b.user_id != NEW.published_by
    AND p.class_id = ch.class_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Updated function to create notification for new question in bookmarked chapter (class-specific)
CREATE OR REPLACE FUNCTION notify_bookmark_question()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify users who have bookmarked this chapter and are in the same class
  INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
  SELECT 
    b.user_id,
    'bookmark_content',
    'New Question in Bookmark',
    'New question added to a chapter you bookmarked',
    NEW.id,
    'question'
  FROM public.bookmarks b
  INNER JOIN public.chapters ch ON b.chapter_id = ch.id
  INNER JOIN public.profiles p ON p.user_id = b.user_id
  WHERE b.chapter_id = NEW.chapter_id
    AND b.user_id != ALL(NEW.contributors)
    AND p.class_id = ch.class_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate triggers
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