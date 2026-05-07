DROP FUNCTION IF EXISTS public.search_resources_normalized(text,integer,integer,integer,integer[],boolean);

CREATE OR REPLACE FUNCTION public.search_resources_normalized(search_query text, p_class_id integer DEFAULT NULL::integer, p_subject_id integer DEFAULT NULL::integer, p_chapter_id integer DEFAULT NULL::integer, p_type_ids integer[] DEFAULT NULL::integer[], p_with_correction boolean DEFAULT NULL::boolean)
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