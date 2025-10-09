-- Add theme column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN theme text DEFAULT 'pink' NOT NULL;

-- Add custom_theme_color column for custom color picker
ALTER TABLE public.profiles 
ADD COLUMN custom_theme_color text;

-- Add check constraint for predefined themes
ALTER TABLE public.profiles 
ADD CONSTRAINT valid_theme CHECK (theme IN ('pink', 'green', 'blue', 'black', 'custom'));