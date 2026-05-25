-- Token encoder: arc1:// + base64url of the path that follows https://archive.org/download/
CREATE OR REPLACE FUNCTION public._encode_arc_url(u text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  prefix CONSTANT text := 'https://archive.org/download/';
  path text;
  b64 text;
BEGIN
  IF u IS NULL OR position(prefix in u) <> 1 THEN
    RETURN u;
  END IF;
  path := substring(u from length(prefix) + 1);
  b64 := translate(replace(encode(convert_to(path, 'UTF8'), 'base64'), E'\n', ''), '+/=', '-_ ');
  RETURN 'arc1://' || replace(b64, ' ', '');
END;
$$;

-- Encode every element of resources.data that starts with the archive prefix
UPDATE public.resources
SET data = ARRAY(
  SELECT public._encode_arc_url(elem)
  FROM unnest(data) AS elem
)
WHERE EXISTS (SELECT 1 FROM unnest(data) e WHERE e LIKE 'https://archive.org/download/%');

-- Rewrite any archive.org URL embedded in questions.data text
UPDATE public.questions
SET data = regexp_replace(
  data,
  'https://archive\.org/download/([^\s\n")''<>]+)',
  public._encode_arc_url('https://archive.org/download/' || '\1'),
  'g'
)
WHERE data LIKE '%https://archive.org/download/%';

-- Defensive: scrub ocr_text columns too (mostly empty but safe)
UPDATE public.resources
SET ocr_text = regexp_replace(
  ocr_text,
  'https://archive\.org/download/([^\s\n")''<>]+)',
  public._encode_arc_url('https://archive.org/download/' || '\1'),
  'g'
)
WHERE ocr_text LIKE '%https://archive.org/download/%';

UPDATE public.questions
SET ocr_text = regexp_replace(
  ocr_text,
  'https://archive\.org/download/([^\s\n")''<>]+)',
  public._encode_arc_url('https://archive.org/download/' || '\1'),
  'g'
)
WHERE ocr_text LIKE '%https://archive.org/download/%';

-- Clean up helper
DROP FUNCTION public._encode_arc_url(text);