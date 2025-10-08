-- Add foreign key constraint with cascade delete to profiles table
-- This ensures that when a user is deleted from auth.users, their profile is also deleted

-- First, drop the constraint if it exists
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Add the foreign key constraint with ON DELETE CASCADE
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;