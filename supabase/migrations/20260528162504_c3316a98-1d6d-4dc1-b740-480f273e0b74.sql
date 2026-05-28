ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS watermark_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pages_watermarked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watermark_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS watermark_error text;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS watermark_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pages_watermarked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watermark_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS watermark_error text;

CREATE INDEX IF NOT EXISTS resources_watermark_status_idx ON public.resources(watermark_status) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS questions_watermark_status_idx ON public.questions(watermark_status) WHERE deleted = false;