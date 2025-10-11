-- Add tutorial tracking fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tutorial_step INTEGER DEFAULT 0;