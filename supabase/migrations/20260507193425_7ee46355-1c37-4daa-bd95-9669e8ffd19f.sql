-- Update OCR content search to also match book name
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
    CASE
      WHEN r.ocr_text IS NOT NULL AND unaccent(lower(r.ocr_text)) LIKE '%' || norm_query || '%' THEN
        SUBSTRING(
          r.ocr_text,
          GREATEST(1, POSITION(norm_query IN unaccent(lower(r.ocr_text))) - 50),
          100 + LENGTH(norm_query)
        )
      ELSE coalesce(r.book, '')
    END as match_snippet
  FROM resources r
  INNER JOIN chapters c ON c.id = r.chapter_id
  WHERE c.class_id = user_class_id
    AND r.deleted = false
    AND (
      (r.ocr_status = 'completed' AND unaccent(lower(coalesce(r.ocr_text,''))) LIKE '%' || norm_query || '%')
      OR unaccent(lower(coalesce(r.book,''))) LIKE '%' || norm_query || '%'
    )
  ORDER BY
    CASE
      WHEN unaccent(lower(coalesce(r.title,''))) LIKE '%' || norm_query || '%' THEN 1
      WHEN unaccent(lower(coalesce(r.description,''))) LIKE '%' || norm_query || '%' THEN 2
      ELSE 3
    END, r.id DESC
  LIMIT 50;
END;
$function$;

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
    CASE
      WHEN q.ocr_text IS NOT NULL AND unaccent(lower(q.ocr_text)) LIKE '%' || norm_query || '%' THEN
        SUBSTRING(
          q.ocr_text,
          GREATEST(1, POSITION(norm_query IN unaccent(lower(q.ocr_text))) - 50),
          100 + LENGTH(norm_query)
        )
      ELSE coalesce(q.book, '')
    END as match_snippet
  FROM questions q
  INNER JOIN chapters c ON c.id = q.chapter_id
  WHERE c.class_id = user_class_id
    AND q.deleted = false
    AND (
      (q.ocr_status = 'completed' AND unaccent(lower(coalesce(q.ocr_text,''))) LIKE '%' || norm_query || '%')
      OR unaccent(lower(coalesce(q.book,''))) LIKE '%' || norm_query || '%'
    )
  ORDER BY
    CASE WHEN unaccent(lower(coalesce(q.data,''))) LIKE '%' || norm_query || '%' THEN 1 ELSE 2 END,
    q.id DESC
  LIMIT 50;
END;
$function$;

-- Autocomplete RPCs for distinct book names
CREATE OR REPLACE FUNCTION public.search_resource_books_normalized(search_query text)
 RETURNS TABLE(book text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(coalesce(search_query, ''))) || '%';
  RETURN QUERY
  SELECT DISTINCT r.book
  FROM resources r
  WHERE r.book IS NOT NULL
    AND r.book <> ''
    AND r.deleted = false
    AND unaccent(lower(r.book)) LIKE norm_query
  ORDER BY r.book ASC
  LIMIT 15;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_question_books_normalized(search_query text)
 RETURNS TABLE(book text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_query TEXT;
BEGIN
  norm_query := '%' || unaccent(lower(coalesce(search_query, ''))) || '%';
  RETURN QUERY
  SELECT DISTINCT q.book
  FROM questions q
  WHERE q.book IS NOT NULL
    AND q.book <> ''
    AND q.deleted = false
    AND unaccent(lower(q.book)) LIKE norm_query
  ORDER BY q.book ASC
  LIMIT 15;
END;
$function$;