ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS watermark_stamp_count integer,
  ADD COLUMN IF NOT EXISTS watermark_overstamped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_scan_at timestamptz;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS watermark_stamp_count integer,
  ADD COLUMN IF NOT EXISTS watermark_overstamped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_scan_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_resources_watermark_overstamped ON public.resources(watermark_overstamped) WHERE watermark_overstamped = true;
CREATE INDEX IF NOT EXISTS idx_questions_watermark_overstamped ON public.questions(watermark_overstamped) WHERE watermark_overstamped = true;