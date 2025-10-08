-- Add columns to track user-added institutes and verification status
ALTER TABLE public.institutes 
ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

-- Update RLS policy to allow authenticated users to insert institutes
CREATE POLICY "Authenticated users can add institutes" 
ON public.institutes 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = added_by);