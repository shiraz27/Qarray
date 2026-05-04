-- Reset stale not_applicable rows that actually contain PDF/image URLs
UPDATE public.resources
SET ocr_status = 'pending',
    ocr_text = NULL,
    ocr_processed_at = NULL
WHERE deleted = false
  AND ocr_status = 'not_applicable'
  AND EXISTS (
    SELECT 1
    FROM unnest(data) AS u(url)
    WHERE lower(u.url) LIKE '%.pdf%'
       OR lower(u.url) LIKE '%-pdf%'
       OR lower(u.url) ~ '\.(jpg|jpeg|png|gif|webp)([?#/].*)?$'
       OR lower(u.url) ~ '-(jpg|jpeg|png|gif|webp)([?#/].*)?$'
  );

UPDATE public.questions
SET ocr_status = 'pending',
    ocr_text = NULL,
    ocr_processed_at = NULL
WHERE deleted = false
  AND ocr_status = 'not_applicable'
  AND (
    lower(data) LIKE '%.pdf%'
    OR lower(data) LIKE '%-pdf%'
    OR lower(data) ~ '\.(jpg|jpeg|png|gif|webp)'
    OR lower(data) ~ '-(jpg|jpeg|png|gif|webp)'
  );