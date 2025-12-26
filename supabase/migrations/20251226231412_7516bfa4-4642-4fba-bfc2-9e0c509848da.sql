-- Add institute_id column to resources table to link to institutes
ALTER TABLE public.resources 
ADD COLUMN institute_id uuid REFERENCES public.institutes(id);

-- Create index for faster lookups
CREATE INDEX idx_resources_institute_id ON public.resources(institute_id);