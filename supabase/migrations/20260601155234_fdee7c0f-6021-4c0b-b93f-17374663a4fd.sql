ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS ocr_text_proposed text,
  ADD COLUMN IF NOT EXISTS ocr_text_proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_text_proposed_readability text,
  ADD COLUMN IF NOT EXISTS ocr_text_proposed_status text;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS ocr_text_proposed text,
  ADD COLUMN IF NOT EXISTS ocr_text_proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_text_proposed_readability text,
  ADD COLUMN IF NOT EXISTS ocr_text_proposed_status text;

ALTER TABLE public.ai_generations
  ADD COLUMN IF NOT EXISTS proposed_data text,
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_status text;