-- Function to delete bookmarks when content is soft-deleted
CREATE OR REPLACE FUNCTION public.delete_bookmarks_on_content_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when deleted changes from false to true
  IF NEW.deleted = true AND OLD.deleted = false THEN
    DELETE FROM public.bookmarks 
    WHERE content_id = NEW.id 
    AND content_type = TG_ARGV[0];
  END IF;
  RETURN NEW;
END;
$$;

-- Function to delete bookmarks when chapter is soft-deleted
CREATE OR REPLACE FUNCTION public.delete_chapter_bookmarks_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deleted = true AND OLD.deleted = false THEN
    DELETE FROM public.bookmarks 
    WHERE chapter_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Function to get valid bookmark count (excludes deleted content)
CREATE OR REPLACE FUNCTION public.get_valid_bookmark_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM bookmarks b
  WHERE b.user_id = p_user_id
  AND (
    -- Chapter bookmarks

   (b.content_type = 'chapter' AND EXISTS (
      SELECT 1 FROM chapters c WHERE a.id = b.content_id AND a.deleted = false
    ))
    OR
    -- Question bookmarks
    (b.content_type = 'question' AND EXISTS (
      SELECT 1 FROM questions q WHERE q.id = b.content_id AND q.deleted = false
    ))
    OR
    -- Answer bookmarks
    (b.content_type = 'answer' AND EXISTS (
      SELECT 1 FROM answers a WHERE a.id = b.content_id AND a.deleted = false
    ))
    OR
    -- Resource bookmarks
    (b.content_type = 'resource' AND EXISTS (
      SELECT 1 FROM resources r WHERE r.id = b.content_id AND r.deleted = false
    ))
    OR
    -- Memorization bookmarks
    (b.content_type = 'memorization' AND EXISTS (
      SELECT 1 FROM memorizations m WHERE m.id = b.content_id AND m.deleted = false
    ))
  );
$$;

-- Triggers for each content type
CREATE TRIGGER delete_question_bookmarks
  AFTER UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_bookmarks_on_content_delete('question');

CREATE TRIGGER delete_answer_bookmarks
  AFTER UPDATE ON public.answers
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_bookmarks_on_content_delete('answer');

CREATE TRIGGER delete_resource_bookmarks
  AFTER UPDATE ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_bookmarks_on_content_delete('resource');

CREATE TRIGGER delete_memorization_bookmarks
  AFTER UPDATE ON public.memorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_bookmarks_on_content_delete('memorization');

CREATE TRIGGER delete_chapter_bookmarks
  AFTER UPDATE ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_chapter_bookmarks_on_delete();