
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS page_count INTEGER;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS page_count INTEGER;

-- Backfill image-only rows deterministically.
-- Image extension match (regular .png/.jpg... or Archive.org -png/-jpg...)
-- PDF detection: presence of any pdf marker -> leave NULL for admin backfill.
WITH r_url AS (
  SELECT r.id, u AS url
  FROM public.resources r,
       LATERAL unnest(r.data) AS u
),
r_classified AS (
  SELECT
    id,
    bool_or(
      lower(url) LIKE '%.pdf%' OR lower(url) LIKE '%-pdf%' OR lower(url) LIKE '%%2epdf%'
    ) AS has_pdf,
    COUNT(*) FILTER (
      WHERE lower(url) ~ '\.(jpg|jpeg|png|gif|webp)'
         OR lower(url) ~ '-(jpg|jpeg|png|gif|webp)($|[/?#])'
    ) AS image_count
  FROM r_url
  GROUP BY id
)
UPDATE public.resources r
SET page_count = rc.image_count
FROM r_classified rc
WHERE r.id = rc.id
  AND rc.has_pdf = false
  AND r.page_count IS NULL;

-- For questions: extract URLs from data (text) via regex
WITH q_url AS (
  SELECT q.id, m[1] AS url
  FROM public.questions q,
       LATERAL regexp_matches(q.data, '(https?://[^\s")]+)', 'g') AS m
),
q_classified AS (
  SELECT
    id,
    bool_or(
      lower(url) LIKE '%.pdf%' OR lower(url) LIKE '%-pdf%'
    ) AS has_pdf,
    COUNT(*) FILTER (
      WHERE lower(url) ~ '\.(jpg|jpeg|png|gif|webp)'
         OR lower(url) ~ '-(jpg|jpeg|png|gif|webp)($|[/?#])'
    ) AS image_count
  FROM q_url
  GROUP BY id
)
UPDATE public.questions q
SET page_count = qc.image_count
FROM q_classified qc
WHERE q.id = qc.id
  AND qc.has_pdf = false
  AND q.page_count IS NULL;
