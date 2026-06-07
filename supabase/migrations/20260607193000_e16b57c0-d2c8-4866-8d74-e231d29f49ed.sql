-- Function to get valid bookmark count (excludes deleted content)
CREATE OR REPLACE FUNCTION public.get_valid_bookmark_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM bookmarks b
  WHERE b.user_id = p_user_id
  AND (
    -- Chapter bookmarks

   (b.content_type = 'chapter' AND EXISTS (
      SELECT 1 FROM chapters c WHERE a.id = b.content_id AND c.deleted = false
    ))
    OR
    -- Question bookmarks
    (b.content_type = 'question' AND EXISTS (
      SELECT 1 FROM questions q WHERE q.id = b.content_id AND q.deleted = false
    ))
    OR
    -- Answer bookmarks
    (b.content_type = 'answer' AND EXISTS (
      SELECT 1 FROM answers a WHERE a.id = b.content_id AND a.deleted = false
    ))
    OR
    -- Resource bookmarks
    (b.content_type = 'resource' AND EXISTS (
      SELECT 1 FROM resources r WHERE r.id = b.content_id AND r.deleted = false
    ))
    OR
    -- Memorization bookmarks
    (b.content_type = 'memorization' AND EXISTS (
      SELECT 1 FROM memorizations m WHERE m.id = b.content_id AND m.deleted = false
    ))
  );
$$;