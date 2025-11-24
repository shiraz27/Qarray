-- Fix search_path security warning
DROP FUNCTION IF EXISTS search_pdf_content(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION search_pdf_content(search_query TEXT, user_class_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  description TEXT,
  chapter_id INTEGER,
  subject_id INTEGER,
  type_id INTEGER,
  with_correction BOOLEAN,
  data TEXT[],
  match_snippet TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_pattern TEXT;
BEGIN
  -- Create ILIKE pattern for partial matching
  search_pattern := '%' || search_query || '%';
  
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
    -- Extract context around the match (50 chars before and after)
    SUBSTRING(
      r.ocr_text,
      GREATEST(1, POSITION(LOWER(search_query) IN LOWER(r.ocr_text)) - 50),
      100 + LENGTH(search_query)
    ) as match_snippet
  FROM resources r
  INNER JOIN chapters c ON c.id = r.chapter_id
  WHERE 
    c.class_id = user_class_id
    AND r.ocr_status = 'completed'
    AND r.deleted = false
    AND LOWER(r.ocr_text) LIKE LOWER(search_pattern)
  ORDER BY 
    -- Prioritize exact matches
    CASE 
      WHEN LOWER(r.title) LIKE LOWER(search_pattern) THEN 1
      WHEN LOWER(r.description) LIKE LOWER(search_pattern) THEN 2
      ELSE 3
    END,
    r.id DESC
  LIMIT 50;
END;
$$;