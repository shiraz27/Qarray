-- Add teacher_name and school_name columns to resources table
ALTER TABLE public.resources 
ADD COLUMN teacher_name text DEFAULT NULL,
ADD COLUMN school_name text DEFAULT NULL;

-- Create index for faster searches on these fields
CREATE INDEX idx_resources_school_name ON public.resources(school_name) WHERE school_name IS NOT NULL;
CREATE INDEX idx_resources_teacher_name ON public.resources(teacher_name) WHERE teacher_name IS NOT NULL;