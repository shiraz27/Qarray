-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_answer_notification ON public.answers;
DROP TRIGGER IF EXISTS trigger_resource_notification ON public.resources;
DROP TRIGGER IF EXISTS trigger_question_notification ON public.questions;

-- Drop functions
DROP FUNCTION IF EXISTS notify_answer_added();
DROP FUNCTION IF EXISTS notify_bookmark_resource();
DROP FUNCTION IF EXISTS notify_bookmark_question();

-- Recreate functions with proper search_path
CREATE OR REPLACE FUNCTION notify_answer_added()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION notify_bookmark_resource()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION notify_bookmark_question()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

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