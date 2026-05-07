-- Add book column
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS book text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS book text;

-- Backfill existing resources
UPDATE public.resources SET book = 'CMS CLS correction manuel scolaire' WHERE book IS NULL;

-- Update search_resources_normalized to include book
DROP FUNCTION IF EXISTS public.search_resources_normalized(text, integer, integer, integer, integer[], boolean);
CREATE OR REPLACE FUNCTION public.search_resources_normalized(search_query text, p_class_id integer DEFAULT NULL::integer, p_subject_id integer DEFAULT NULL::integer, p_chapter_id integer DEFAULT NULL::integer, p_type_ids integer[] DEFAULT NULL::integer[], p_with_correction boolean DEFAULT NULL::boolean)
 RETURNS TABLE(id integer, title text, description text, chapter_id integer, type_id integer, with_correction boolean, data text[], school_name text, teacher_name text, book text, resource_type text, subject_id integer, subject_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(search_query)) || '%';
  RETURN QUERY
  SELECT r.id, r.title, r.description, r.chapter_id,
         r.type_id, r.with_correction, r.data,
         r.school_name, r.teacher_name, r.book, rt.type AS resource_type,
         c.subject_id, s.name AS subject_name
  FROM resources r
  LEFT JOIN resource_types rt ON rt.id = r.type_id
  LEFT JOIN chapters c ON c.id = r.chapter_id
  LEFT JOIN subjects s ON s.id = c.subject_id
  WHERE r.deleted = false
    AND (
      unaccent(lower(coalesce(r.title, ''))) LIKE norm_query
      OR unaccent(lower(coalesce(r.description, ''))) LIKE norm_query
      OR unaccent(lower(coalesce(r.school_name, ''))) LIKE norm_query
      OR unaccent(lower(coalesce(r.teacher_name, ''))) LIKE norm_query
      OR unaccent(lower(coalesce(r.book, ''))) LIKE norm_query
    )
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND (p_chapter_id IS NULL OR r.chapter_id = p_chapter_id)
    AND (p_type_ids IS NULL OR r.type_id = ANY(p_type_ids))
    AND (p_with_correction IS NULL OR r.with_correction = p_with_correction)
  ORDER BY r.id DESC
  LIMIT 30;
END;
$function$;

-- Update search_questions_normalized to include book
DROP FUNCTION IF EXISTS public.search_questions_normalized(text, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.search_questions_normalized(search_query text, p_class_id integer DEFAULT NULL::integer, p_subject_id integer DEFAULT NULL::integer, p_chapter_id integer DEFAULT NULL::integer)
 RETURNS TABLE(id integer, data text, chapter_id integer, subject_id integer, subject_name text, book text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(search_query)) || '%';
  RETURN QUERY
  SELECT q.id, q.data, q.chapter_id, c.subject_id, s.name AS subject_name, q.book
  FROM questions q
  LEFT JOIN chapters c ON c.id = q.chapter_id
  LEFT JOIN subjects s ON s.id = c.subject_id
  WHERE q.deleted = false
    AND (
      unaccent(lower(q.data)) LIKE norm_query
      OR unaccent(lower(coalesce(q.book, ''))) LIKE norm_query
    )
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND (p_chapter_id IS NULL OR q.chapter_id = p_chapter_id)
  ORDER BY q.id DESC
  LIMIT 30;
END;
$function$;

-- Update search_pdf_content to include book
DROP FUNCTION IF EXISTS public.search_pdf_content(text, integer);
CREATE OR REPLACE FUNCTION public.search_pdf_content(search_query text, user_class_id integer)
 RETURNS TABLE(id integer, title text, description text, chapter_id integer, subject_id integer, type_id integer, with_correction boolean, data text[], book text, match_snippet text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := unaccent(lower(search_query));
  RETURN QUERY
  SELECT
    r.id, r.title, r.description, r.chapter_id, c.subject_id,
    r.type_id, r.with_correction, r.data, r.book,
    SUBSTRING(
      r.ocr_text,
      GREATEST(1, POSITION(norm_query IN unaccent(lower(r.ocr_text))) - 50),
      100 + LENGTH(norm_query)
    ) as match_snippet
  FROM resources r
  INNER JOIN chapters c ON c.id = r.chapter_id
  WHERE c.class_id = user_class_id
    AND r.ocr_status = 'completed'
    AND r.deleted = false
    AND unaccent(lower(r.ocr_text)) LIKE '%' || norm_query || '%'
  ORDER BY
    CASE
      WHEN unaccent(lower(r.title)) LIKE '%' || norm_query || '%' THEN 1
      WHEN unaccent(lower(r.description)) LIKE '%' || norm_query || '%' THEN 2
      ELSE 3
    END, r.id DESC
  LIMIT 50;
END;
$function$;

-- Update search_question_content to include book
DROP FUNCTION IF EXISTS public.search_question_content(text, integer);
CREATE OR REPLACE FUNCTION public.search_question_content(search_query text, user_class_id integer)
 RETURNS TABLE(id integer, data text, chapter_id integer, subject_id integer, book text, match_snippet text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := unaccent(lower(search_query));
  RETURN QUERY
  SELECT
    q.id, q.data, q.chapter_id, c.subject_id, q.book,
    SUBSTRING(
      q.ocr_text,
      GREATEST(1, POSITION(norm_query IN unaccent(lower(q.ocr_text))) - 50),
      100 + LENGTH(norm_query)
    ) as match_snippet
  FROM questions q
  INNER JOIN chapters c ON c.id = q.chapter_id
  WHERE c.class_id = user_class_id
    AND q.ocr_status = 'completed'
    AND q.deleted = false
    AND unaccent(lower(q.ocr_text)) LIKE '%' || norm_query || '%'
  ORDER BY
    CASE WHEN unaccent(lower(q.data)) LIKE '%' || norm_query || '%' THEN 1 ELSE 2 END,
    q.id DESC
  LIMIT 50;
END;
$function$;