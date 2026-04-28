CREATE TABLE public.chapter_common_mappings (
  id BIGSERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL,
  common_chapter_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chapter_common_mappings_unique UNIQUE (chapter_id, common_chapter_id),
  CONSTRAINT chapter_common_mappings_no_self CHECK (chapter_id <> common_chapter_id)
);

CREATE INDEX idx_chapter_common_mappings_chapter_id ON public.chapter_common_mappings(chapter_id);

ALTER TABLE public.chapter_common_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Common chapter mappings are viewable by everyone"
  ON public.chapter_common_mappings FOR SELECT
  USING (true);

CREATE POLICY "Moderators can insert mappings"
  ON public.chapter_common_mappings FOR INSERT
  TO authenticated
  WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can delete mappings"
  ON public.chapter_common_mappings FOR DELETE
  TO authenticated
  USING (is_moderator_or_admin(auth.uid()));