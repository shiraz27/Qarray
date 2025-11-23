-- Add OCR tracking columns to resources table
ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS ocr_status TEXT DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed', 'not_applicable')),
ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMPTZ;

-- Add full-text search index for performance
CREATE INDEX IF NOT EXISTS idx_resources_ocr_text_gin 
ON public.resources 
USING gin(to_tsvector('english', COALESCE(ocr_text, '')));

-- Set existing non-PDF resources to 'not_applicable'
UPDATE public.resources 
SET ocr_status = 'not_applicable' 
WHERE NOT EXISTS (
  SELECT 1 FROM unnest(data) AS url 
  WHERE url ILIKE '%.pdf'
);

-- Create search function for PDF content
CREATE OR REPLACE FUNCTION search_pdf_content(search_query TEXT, user_class_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  description TEXT,
  chapter_id INTEGER,
  subject_id INTEGER,
  data TEXT[],
  match_snippet TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.title,
    r.description,
    r.chapter_id,
    r.subject_id,
    r.data,
    ts_headline('english', r.ocr_text, plainto_tsquery('english', search_query), 'MaxWords=50, MinWords=25') as match_snippet,
    ts_rank(to_tsvector('english', COALESCE(r.ocr_text, '')), plainto_tsquery('english', search_query)) as rank
  FROM resources r
  INNER JOIN chapters c ON c.id = r.chapter_id
  WHERE 
    c.class_id = user_class_id
    AND r.ocr_status = 'completed'
    AND r.deleted = false
    AND to_tsvector('english', COALESCE(r.ocr_text, '')) @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;