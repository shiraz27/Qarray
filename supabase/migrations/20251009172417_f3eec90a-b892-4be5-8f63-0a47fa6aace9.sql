-- Add verified column to memorizations table
ALTER TABLE public.memorizations 
ADD COLUMN verified boolean NOT NULL DEFAULT false;