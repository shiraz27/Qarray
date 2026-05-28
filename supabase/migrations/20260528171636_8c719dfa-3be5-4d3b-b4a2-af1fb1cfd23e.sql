ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS ocr_readability text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS ocr_readability text;