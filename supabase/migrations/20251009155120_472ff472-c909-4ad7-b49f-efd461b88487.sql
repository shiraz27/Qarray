-- Update default theme from pink to blue
ALTER TABLE public.profiles 
ALTER COLUMN theme SET DEFAULT 'blue';