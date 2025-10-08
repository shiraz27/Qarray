-- Drop the foreign key constraint on added_by
ALTER TABLE public.institutes 
DROP CONSTRAINT IF EXISTS institutes_added_by_fkey;

-- Make added_by nullable to avoid constraint issues
ALTER TABLE public.institutes 
ALTER COLUMN added_by DROP NOT NULL;