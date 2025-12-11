-- Add OCR columns to questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS ocr_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMPTZ;

-- Create search function for questions OCR content
CREATE OR REPLACE FUNCTION public.search_question_content(search_query text, user_class_id integer)
RETURNS TABLE(id integer, data text, chapter_id integer, subject_id integer, match_snippet text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  search_pattern TEXT;
BEGIN
  search_pattern := '%' || search_query || '%';
  
  RETURN QUERY
  SELECT 
    q.id,
    q.data,
    q.chapter_id,
    c.subject_id,
    SUBSTRING(
      q.ocr_text,
      GREATEST(1, POSITION(LOWER(search_query) IN LOWER(q.ocr_text)) - 50),
      100 + LENGTH(search_query)
    ) as match_snippet
  FROM questions q
  INNER JOIN chapters c ON c.id = q.chapter_id
  WHERE 
    c.class_id = user_class_id
    AND q.ocr_status = 'completed'
    AND q.deleted = false
    AND LOWER(q.ocr_text) LIKE LOWER(search_pattern)
  ORDER BY 
    CASE 
      WHEN LOWER(q.data) LIKE LOWER(search_pattern) THEN 1
      ELSE 2
    END,
    q.id DESC
  LIMIT 50;
END;
$function$;