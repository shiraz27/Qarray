-- Add avatar_color column to profiles table for customizable avatars
ALTER TABLE public.profiles
ADD COLUMN avatar_color text DEFAULT 'gradient-primary';