-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create helper function to check if user is moderator or admin
CREATE OR REPLACE FUNCTION public.is_moderator_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'moderator')
  )
$$;

-- RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update RLS policies for resources table to allow moderators/admins
DROP POLICY IF EXISTS "Users can update own resources" ON public.resources;
DROP POLICY IF EXISTS "Users can delete own resources" ON public.resources;

CREATE POLICY "Users and moderators can update resources"
ON public.resources
FOR UPDATE
TO authenticated
USING (
  auth.uid() = published_by 
  OR public.is_moderator_or_admin(auth.uid())
);

CREATE POLICY "Users and moderators can delete resources"
ON public.resources
FOR DELETE
TO authenticated
USING (
  auth.uid() = published_by 
  OR public.is_moderator_or_admin(auth.uid())
);

-- Update RLS policies for questions table
DROP POLICY IF EXISTS "Authenticated users can create questions" ON public.questions;

CREATE POLICY "Authenticated users can create questions"
ON public.questions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users and moderators can update questions"
ON public.questions
FOR UPDATE
TO authenticated
USING (
  auth.uid() = ANY(contributors)
  OR public.is_moderator_or_admin(auth.uid())
);

CREATE POLICY "Users and moderators can delete questions"
ON public.questions
FOR DELETE
TO authenticated
USING (
  auth.uid() = ANY(contributors)
  OR public.is_moderator_or_admin(auth.uid())
);