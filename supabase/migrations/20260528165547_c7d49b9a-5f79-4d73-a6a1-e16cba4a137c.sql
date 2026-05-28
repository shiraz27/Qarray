ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS source_link text;

-- Backfill: manuel scolaire → book name
UPDATE public.resources
SET source_link = book
WHERE source_link IS NULL
  AND book ILIKE '%manuel scolaire%';

UPDATE public.resources r
SET source_link = sub.matched
FROM (
  SELECT id, (
    SELECT b FROM unnest(books) b WHERE b ILIKE '%manuel scolaire%' LIMIT 1
  ) AS matched
  FROM public.resources
) sub
WHERE r.id = sub.id
  AND r.source_link IS NULL
  AND sub.matched IS NOT NULL;

-- Backfill: everything else → Drive folder URL
UPDATE public.resources
SET source_link = 'https://drive.google.com/drive/folders/1NXLMkzdGEjAfDnYB6kONz2hgPuuq4IXE'
WHERE source_link IS NULL;