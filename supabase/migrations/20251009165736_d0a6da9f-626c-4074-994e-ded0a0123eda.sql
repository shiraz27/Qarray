-- Add class_id to memorizations table (nullable to support existing data)
ALTER TABLE public.memorizations
ADD COLUMN class_id integer;

-- Add indexes for better query performance
CREATE INDEX idx_memorizations_class_id ON public.memorizations(class_id);
CREATE INDEX idx_memorizations_subject_id ON public.memorizations(subject_id);