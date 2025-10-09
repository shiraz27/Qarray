-- Fix the notify_answer_added function to avoid using set-returning functions in JOIN conditions
CREATE OR REPLACE FUNCTION public.notify_answer_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  contributor_id uuid;
  question_chapter_id integer;
  question_class_id integer;
BEGIN
  -- Get the chapter_id and class_id for the question
  SELECT ch.id, ch.class_id INTO question_chapter_id, question_class_id
  FROM public.questions q
  INNER JOIN public.chapters ch ON q.chapter_id = ch.id
  WHERE q.id = NEW.question_id;

  -- Loop through each contributor of the question
  FOR contributor_id IN 
    SELECT UNNEST(contributors) 
    FROM public.questions 
    WHERE id = NEW.question_id
  LOOP
    -- Skip if the contributor is also answering (don't notify yourself)
    IF contributor_id = ANY(NEW.contributors) THEN
      CONTINUE;
    END IF;

    -- Check if the contributor is in the same class
    IF EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = contributor_id 
      AND class_id = question_class_id
    ) THEN
      -- Insert notification
      INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
      VALUES (
        contributor_id,
        'answer_added',
        'New Answer',
        'Someone answered your question',
        NEW.question_id,
        'question'
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Also fix notify_bookmark_question to be consistent
CREATE OR REPLACE FUNCTION public.notify_bookmark_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  bookmark_user_id uuid;
  chapter_class_id integer;
BEGIN
  -- Get the class_id for the chapter
  SELECT class_id INTO chapter_class_id
  FROM public.chapters
  WHERE id = NEW.chapter_id;

  -- Loop through bookmarks for this chapter
  FOR bookmark_user_id IN 
    SELECT b.user_id
    FROM public.bookmarks b
    WHERE b.chapter_id = NEW.chapter_id
  LOOP
    -- Skip if the user is the one who created the question
    IF bookmark_user_id = ANY(NEW.contributors) THEN
      CONTINUE;
    END IF;

    -- Check if the user is in the same class
    IF EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = bookmark_user_id 
      AND class_id = chapter_class_id
    ) THEN
      -- Insert notification
      INSERT INTO public.notifications (user_id, type, title, message, reference_id, reference_type)
      VALUES (
        bookmark_user_id,
        'bookmark_content',
        'New Question in Bookmark',
        'New question added to a chapter you bookmarked',
        NEW.id,
        'question'
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$function$;