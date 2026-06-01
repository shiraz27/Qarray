ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS watermarked_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS watermarked_urls text[] NOT NULL DEFAULT '{}';