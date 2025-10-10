-- Create user type enum
CREATE TYPE public.user_type AS ENUM ('student', 'teacher');

-- Add user type and teacher verification fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN user_type public.user_type DEFAULT 'student',
ADD COLUMN teacher_verified boolean DEFAULT false,
ADD COLUMN teacher_documents text[] DEFAULT '{}',
ADD COLUMN teacher_verification_status text DEFAULT 'pending' CHECK (teacher_verification_status IN ('pending', 'approved', 'rejected'));

-- Create index for faster queries
CREATE INDEX idx_profiles_user_type ON public.profiles(user_type);
CREATE INDEX idx_profiles_teacher_verified ON public.profiles(teacher_verified);