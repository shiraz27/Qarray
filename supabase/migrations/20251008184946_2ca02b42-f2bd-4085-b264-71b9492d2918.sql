-- Temporarily drop restrictive INSERT policies
DROP POLICY IF EXISTS "Authenticated users can create resources" ON public.resources;
DROP POLICY IF EXISTS "Authenticated users can create questions" ON public.questions;
DROP POLICY IF EXISTS "Authenticated users can create answers" ON public.answers;

-- Create temporary permissive policies for data insertion
CREATE POLICY "Temp allow all inserts on resources" ON public.resources
FOR INSERT WITH CHECK (true);

CREATE POLICY "Temp allow all inserts on questions" ON public.questions
FOR INSERT WITH CHECK (true);

CREATE POLICY "Temp allow all inserts on answers" ON public.answers
FOR INSERT WITH CHECK (true);

-- Insert sample resource for Maths - Calcul intégral chapter (chapter_id: 1)
INSERT INTO public.resources (
  title,
  description,
  data,
  chapter_id,
  subject_id,
  type_id,
  with_correction,
  devoir_type_id,
  verified,
  deleted
) VALUES (
  'Exercices sur le Calcul Intégral',
  'Collection d''exercices pratiques sur le calcul intégral avec corrections détaillées',
  ARRAY['https://example.com/calcul-integral-exercices.pdf'],
  1,
  1,
  3,
  true,
  NULL,
  true,
  false
);

-- Insert sample question
INSERT INTO public.questions (
  data,
  chapter_id,
  verified,
  deleted
) VALUES (
  'Comment calculer l''intégrale de la fonction f(x) = x² entre 0 et 2?',
  1,
  true,
  false
);

-- Get the ID of the inserted question to link the answer
INSERT INTO public.answers (
  data,
  question_id,
  verified,
  deleted
) VALUES (
  'Pour calculer l''intégrale de f(x) = x² entre 0 et 2: ∫₀² x² dx = [x³/3]₀² = (2³/3) - (0³/3) = 8/3',
  (SELECT id FROM public.questions WHERE data LIKE 'Comment calculer l''intégrale%' ORDER BY created_at DESC LIMIT 1),
  true,
  false
);

-- Drop temporary policies
DROP POLICY IF EXISTS "Temp allow all inserts on resources" ON public.resources;
DROP POLICY IF EXISTS "Temp allow all inserts on questions" ON public.questions;
DROP POLICY IF EXISTS "Temp allow all inserts on answers" ON public.answers;

-- Restore original restrictive policies
CREATE POLICY "Authenticated users can create resources" ON public.resources
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create questions" ON public.questions
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create answers" ON public.answers
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);