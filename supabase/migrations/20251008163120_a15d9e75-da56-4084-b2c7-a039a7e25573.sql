-- Create states table
CREATE TABLE public.states (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

-- Create classes table
CREATE TABLE public.classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  hidden BOOLEAN NOT NULL DEFAULT false
);

-- Create devoir_types table
CREATE TABLE public.devoir_types (
  id SERIAL PRIMARY KEY,
  devoir_type TEXT NOT NULL UNIQUE,
  CONSTRAINT devoir_types_devoir_type_check CHECK (
    devoir_type IN ('contrôle 1', 'contrôle 2', 'synthèse')
  )
);

-- Create resource_types table
CREATE TABLE public.resource_types (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  CONSTRAINT resource_types_type_check CHECK (
    type IN ('devoir', 'cours', 'exercice', 'résumé')
  )
);

-- Create institutes table
CREATE TABLE public.institutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id INTEGER REFERENCES public.states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create subjects table
CREATE TABLE public.subjects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  class_id INTEGER REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  contributors UUID[] DEFAULT '{}',
  common INTEGER[] DEFAULT '{}'
);

-- Create chapters table
CREATE TABLE public.chapters (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  contributors UUID[] DEFAULT '{}'
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_number TEXT UNIQUE,
  class_id INTEGER REFERENCES public.classes(id) ON DELETE SET NULL,
  state_id INTEGER REFERENCES public.states(id) ON DELETE SET NULL,
  institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified BOOLEAN NOT NULL DEFAULT false,
  is_moderator BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false
);

-- Create resources table
CREATE TABLE public.resources (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES public.chapters(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES public.subjects(id) ON DELETE CASCADE,
  data TEXT[] NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type_id INTEGER REFERENCES public.resource_types(id) ON DELETE CASCADE,
  with_correction BOOLEAN NOT NULL DEFAULT false,
  devoir_type_id INTEGER REFERENCES public.devoir_types(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  contributors UUID[] DEFAULT '{}',
  published_by UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create questions table
CREATE TABLE public.questions (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER REFERENCES public.chapters(id) ON DELETE CASCADE,
  resource_id INTEGER REFERENCES public.resources(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  contributors UUID[] DEFAULT '{}'
);

-- Create answers table
CREATE TABLE public.answers (
  id SERIAL PRIMARY KEY,
  question_id INTEGER REFERENCES public.questions(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified BOOLEAN NOT NULL DEFAULT false,
  deleted BOOLEAN NOT NULL DEFAULT false,
  contributors UUID[] DEFAULT '{}'
);

-- Create votes table
CREATE TABLE public.votes (
  id SERIAL PRIMARY KEY,
  content_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  vote_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, user_id, content_type),
  CONSTRAINT votes_content_type_check CHECK (
    content_type IN ('resource', 'question', 'answer')
  ),
  CONSTRAINT votes_vote_type_check CHECK (
    vote_type IN ('upvote', 'downvote')
  )
);

-- Enable RLS on all tables
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devoir_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lookup tables (public read access)
CREATE POLICY "States are viewable by everyone" ON public.states FOR SELECT USING (true);
CREATE POLICY "Classes are viewable by everyone" ON public.classes FOR SELECT USING (true);
CREATE POLICY "Devoir types are viewable by everyone" ON public.devoir_types FOR SELECT USING (true);
CREATE POLICY "Resource types are viewable by everyone" ON public.resource_types FOR SELECT USING (true);
CREATE POLICY "Institutes are viewable by everyone" ON public.institutes FOR SELECT USING (true);
CREATE POLICY "Subjects are viewable by everyone" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "Chapters are viewable by everyone" ON public.chapters FOR SELECT USING (true);

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for resources
CREATE POLICY "Resources are viewable by everyone" ON public.resources FOR SELECT USING (NOT deleted);
CREATE POLICY "Authenticated users can create resources" ON public.resources FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own resources" ON public.resources FOR UPDATE USING (auth.uid() = published_by);
CREATE POLICY "Users can delete own resources" ON public.resources FOR DELETE USING (auth.uid() = published_by);

-- RLS Policies for questions
CREATE POLICY "Questions are viewable by everyone" ON public.questions FOR SELECT USING (NOT deleted);
CREATE POLICY "Authenticated users can create questions" ON public.questions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for answers
CREATE POLICY "Answers are viewable by everyone" ON public.answers FOR SELECT USING (NOT deleted);
CREATE POLICY "Authenticated users can create answers" ON public.answers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for votes
CREATE POLICY "Votes are viewable by everyone" ON public.votes FOR SELECT USING (true);
CREATE POLICY "Users can manage own votes" ON public.votes FOR ALL USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_institutes_updated_at BEFORE UPDATE ON public.institutes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_answers_updated_at BEFORE UPDATE ON public.answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();