-- Resources: array columns
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS teacher_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS school_names  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS books         text[] NOT NULL DEFAULT '{}';

UPDATE public.resources
SET teacher_names = ARRAY[teacher_name]
WHERE teacher_name IS NOT NULL AND teacher_name <> ''
  AND (teacher_names IS NULL OR array_length(teacher_names, 1) IS NULL);

UPDATE public.resources
SET school_names = ARRAY[school_name]
WHERE school_name IS NOT NULL AND school_name <> ''
  AND (school_names IS NULL OR array_length(school_names, 1) IS NULL);

UPDATE public.resources
SET books = ARRAY[book]
WHERE book IS NOT NULL AND book <> ''
  AND (books IS NULL OR array_length(books, 1) IS NULL);

-- Questions: array columns (questions only had `book`)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS teacher_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS school_names  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS books         text[] NOT NULL DEFAULT '{}';

UPDATE public.questions
SET books = ARRAY[book]
WHERE book IS NOT NULL AND book <> ''
  AND (books IS NULL OR array_length(books, 1) IS NULL);

-- GIN indexes for array search
CREATE INDEX IF NOT EXISTS idx_resources_teacher_names ON public.resources USING GIN (teacher_names);
CREATE INDEX IF NOT EXISTS idx_resources_school_names  ON public.resources USING GIN (school_names);
CREATE INDEX IF NOT EXISTS idx_resources_books         ON public.resources USING GIN (books);
CREATE INDEX IF NOT EXISTS idx_questions_teacher_names ON public.questions USING GIN (teacher_names);
CREATE INDEX IF NOT EXISTS idx_questions_school_names  ON public.questions USING GIN (school_names);
CREATE INDEX IF NOT EXISTS idx_questions_books         ON public.questions USING GIN (books);

-- Update search_resources_normalized to also match against arrays
CREATE OR REPLACE FUNCTION public.search_resources_normalized(
  search_query text,
  p_class_id integer DEFAULT NULL::integer,
  p_subject_id integer DEFAULT NULL::integer,
  p_chapter_id integer DEFAULT NULL::integer,
  p_type_ids integer[] DEFAULT NULL::integer[],
  p_with_correction boolean DEFAULT NULL::boolean
)
RETURNS TABLE(id integer, title text, description text, chapter_id integer, type_id integer, with_correction boolean, data text[], school_name text, teacher_name text, book text, resource_type text, subject_id integer, subject_name text, type_ids integer[])
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
         c.subject_id, s.name AS subject_name, r.type_ids
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
      OR EXISTS (SELECT 1 FROM unnest(coalesce(r.teacher_names, '{}'::text[])) t WHERE unaccent(lower(t)) LIKE norm_query)
      OR EXISTS (SELECT 1 FROM unnest(coalesce(r.school_names,  '{}'::text[])) t WHERE unaccent(lower(t)) LIKE norm_query)
      OR EXISTS (SELECT 1 FROM unnest(coalesce(r.books,         '{}'::text[])) t WHERE unaccent(lower(t)) LIKE norm_query)
    )
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND (p_chapter_id IS NULL OR r.chapter_id = p_chapter_id)
    AND (p_type_ids IS NULL OR r.type_ids && p_type_ids OR r.type_id = ANY(p_type_ids))
    AND (p_with_correction IS NULL OR r.with_correction = p_with_correction)
  ORDER BY r.id DESC
  LIMIT 30;
END;
$function$;

-- Update search_questions_normalized to also match against arrays
CREATE OR REPLACE FUNCTION public.search_questions_normalized(
  search_query text,
  p_class_id integer DEFAULT NULL::integer,
  p_subject_id integer DEFAULT NULL::integer,
  p_chapter_id integer DEFAULT NULL::integer
)
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
      OR EXISTS (SELECT 1 FROM unnest(coalesce(q.teacher_names, '{}'::text[])) t WHERE unaccent(lower(t)) LIKE norm_query)
      OR EXISTS (SELECT 1 FROM unnest(coalesce(q.school_names,  '{}'::text[])) t WHERE unaccent(lower(t)) LIKE norm_query)
      OR EXISTS (SELECT 1 FROM unnest(coalesce(q.books,         '{}'::text[])) t WHERE unaccent(lower(t)) LIKE norm_query)
    )
    AND (p_class_id IS NULL OR s.class_id = p_class_id)
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND (p_chapter_id IS NULL OR q.chapter_id = p_chapter_id)
  ORDER BY q.id DESC
  LIMIT 30;
END;
$function$;