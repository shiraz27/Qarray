-- Drop the foreign key constraint on user_id in profiles table
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Keep user_id as it is (already nullable based on schema)