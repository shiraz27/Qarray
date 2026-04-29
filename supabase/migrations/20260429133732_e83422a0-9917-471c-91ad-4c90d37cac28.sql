-- Enable accent-insensitive matching
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Helper: normalized text (immutable wrapper for indexing-friendly use)
-- We don't index here; just make queries consistent.

-- Rewrite OCR search functions to be accent-insensitive
CREATE OR REPLACE FUNCTION public.search_pdf_content(search_query text, user_class_id integer)
 RETURNS TABLE(id integer, title text, description text, chapter_id integer, subject_id integer, type_id integer, with_correction boolean, data text[], match_snippet text)
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
    r.id,
    r.title,
    r.description,
    r.chapter_id,
    c.subject_id,
    r.type_id,
    r.with_correction,
    r.data,
    SUBSTRING(
      r.ocr_text,
      GREATEST(1, POSITION(norm_query IN unaccent(lower(r.ocr_text))) - 50),
      100 + LENGTH(norm_query)
    ) as match_snippet
  FROM resources r
  INNER JOIN chapters c ON c.id = r.chapter_id
  WHERE
    c.class_id = user_class_id
    AND r.ocr_status = 'completed'
    AND r.deleted = false
    AND unaccent(lower(r.ocr_text)) LIKE '%' || norm_query || '%'
  ORDER BY
    CASE
      WHEN unaccent(lower(r.title)) LIKE '%' || norm_query || '%' THEN 1
      WHEN unaccent(lower(r.description)) LIKE '%' || norm_query || '%' THEN 2
      ELSE 3
    END,
    r.id DESC
  LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_question_content(search_query text, user_class_id integer)
 RETURNS TABLE(id integer, data text, chapter_id integer, subject_id integer, match_snippet text)
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
    q.id,
    q.data,
    q.chapter_id,
    c.subject_id,
    SUBSTRING(
      q.ocr_text,
      GREATEST(1, POSITION(norm_query IN unaccent(lower(q.ocr_text))) - 50),
      100 + LENGTH(norm_query)
    ) as match_snippet
  FROM questions q
  INNER JOIN chapters c ON c.id = q.chapter_id
  WHERE
    c.class_id = user_class_id
    AND q.ocr_status = 'completed'
    AND q.deleted = false
    AND unaccent(lower(q.ocr_text)) LIKE '%' || norm_query || '%'
  ORDER BY
    CASE
      WHEN unaccent(lower(q.data)) LIKE '%' || norm_query || '%' THEN 1
      ELSE 2
    END,
    q.id DESC
  LIMIT 50;
END;
$function$;

-- Accent-insensitive search RPCs

CREATE OR REPLACE FUNCTION public.search_chapters_normalized(search_query text, p_class_id integer DEFAULT NULL, p_subject_id integer DEFAULT NULL)
 RETURNS TABLE(id integer, name text, subject_id integer, subject_name text, class_id integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(search_query)) || '%';
  RETURN QUERY
  SELECT c.id, c.name, c.subject_id, s.name AS subject_name, s.class_id
  FROM chapters c
  INNER JOIN subjects s ON s.id = c.subject_id
  WHERE c.deleted = false
    AND s.deleted = false
    AND unaccent(lower(c.name)) LIKE norm_query
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id)
  ORDER BY c.id DESC
  LIMIT 30;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_resources_normalized(
  search_query text,
  p_class_id integer DEFAULT NULL,
  p_subject_id integer DEFAULT NULL,
  p_chapter_id integer DEFAULT NULL,
  p_type_ids integer[] DEFAULT NULL,
  p_with_correction boolean DEFAULT NULL
)
 RETURNS TABLE(
   id integer, title text, description text, chapter_id integer,
   type_id integer, with_correction boolean, data text[],
   school_name text, teacher_name text, resource_type text,
   subject_id integer, subject_name text
 )
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
         r.school_name, r.teacher_name, rt.type AS resource_type,
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

CREATE OR REPLACE FUNCTION public.search_questions_normalized(
  search_query text,
  p_class_id integer DEFAULT NULL,
  p_subject_id integer DEFAULT NULL,
  p_chapter_id integer DEFAULT NULL
)
 RETURNS TABLE(id integer, data text, chapter_id integer, subject_id integer, subject_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(search_query)) || '%';
  RETURN QUERY
  SELECT q.id, q.data, q.chapter_id, c.subject_id, s.name AS subject_name
  FROM questions q
  LEFT JOIN chapters c ON c.id = q.chapter_id
  LEFT JOIN subjects s ON s.id = c.subject_id
  WHERE q.deleted = false
    AND unaccent(lower(q.data)) LIKE norm_query
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND (p_chapter_id IS NULL OR q.chapter_id = p_chapter_id)
  ORDER BY q.id DESC
  LIMIT 30;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_answers_normalized(
  search_query text,
  p_class_id integer DEFAULT NULL
)
 RETURNS TABLE(id integer, data text, question_id integer, subject_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(search_query)) || '%';
  RETURN QUERY
  SELECT a.id, a.data, a.question_id, s.name AS subject_name
  FROM answers a
  LEFT JOIN questions q ON q.id = a.question_id
  LEFT JOIN chapters c ON c.id = q.chapter_id
  LEFT JOIN subjects s ON s.id = c.subject_id
  WHERE a.deleted = false
    AND unaccent(lower(a.data)) LIKE norm_query
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
  ORDER BY a.id DESC
  LIMIT 30;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_institutes_normalized(search_query text, p_state_id integer DEFAULT NULL)
 RETURNS TABLE(id uuid, name text, verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(coalesce(search_query, ''))) || '%';
  RETURN QUERY
  SELECT i.id, i.name, i.verified
  FROM institutes i
  WHERE unaccent(lower(i.name)) LIKE norm_query
    AND (p_state_id IS NULL OR i.state_id = p_state_id)
  ORDER BY i.verified DESC, i.name ASC
  LIMIT 15;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_teachers_normalized(search_query text)
 RETURNS TABLE(teacher_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(coalesce(search_query, ''))) || '%';
  RETURN QUERY
  SELECT DISTINCT r.teacher_name
  FROM resources r
  WHERE r.teacher_name IS NOT NULL
    AND r.teacher_name <> ''
    AND r.deleted = false
    AND unaccent(lower(r.teacher_name)) LIKE norm_query
  ORDER BY r.teacher_name ASC
  LIMIT 15;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_schools_normalized(search_query text)
 RETURNS TABLE(school_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(coalesce(search_query, ''))) || '%';
  RETURN QUERY
  SELECT DISTINCT r.school_name
  FROM resources r
  WHERE r.school_name IS NOT NULL
    AND r.school_name <> ''
    AND r.deleted = false
    AND unaccent(lower(r.school_name)) LIKE norm_query
  ORDER BY r.school_name ASC
  LIMIT 15;
END;
$function$;