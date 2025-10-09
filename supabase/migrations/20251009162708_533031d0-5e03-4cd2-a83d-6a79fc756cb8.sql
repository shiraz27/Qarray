-- Create memorizations table
CREATE TABLE public.memorizations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL,
  subject_id INTEGER REFERENCES public.subjects(id),
  chapter_id INTEGER REFERENCES public.chapters(id),
  is_public BOOLEAN NOT NULL DEFAULT true,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create flashcards table
CREATE TABLE public.flashcards (
  id SERIAL PRIMARY KEY,
  memorization_id INTEGER NOT NULL REFERENCES public.memorizations(id) ON DELETE CASCADE,
  front_data JSONB NOT NULL,
  back_data JSONB NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create memorization subscriptions table
CREATE TABLE public.memorization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  memorization_id INTEGER NOT NULL REFERENCES public.memorizations(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, memorization_id)
);

-- Create flashcard reviews table for spaced repetition
CREATE TABLE public.flashcard_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  flashcard_id INTEGER NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  memorization_id INTEGER NOT NULL REFERENCES public.memorizations(id) ON DELETE CASCADE,
  quality INTEGER NOT NULL CHECK (quality >= 0 AND quality <= 5),
  ease_factor DECIMAL NOT NULL DEFAULT 2.5,
  interval INTEGER NOT NULL DEFAULT 0,
  next_review_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_memorizations_creator ON public.memorizations(creator_id);
CREATE INDEX idx_memorizations_subject ON public.memorizations(subject_id);
CREATE INDEX idx_memorizations_chapter ON public.memorizations(chapter_id);
CREATE INDEX idx_flashcards_memorization ON public.flashcards(memorization_id);
CREATE INDEX idx_memorization_subscriptions_user ON public.memorization_subscriptions(user_id);
CREATE INDEX idx_memorization_subscriptions_memorization ON public.memorization_subscriptions(memorization_id);
CREATE INDEX idx_flashcard_reviews_user ON public.flashcard_reviews(user_id);
CREATE INDEX idx_flashcard_reviews_flashcard ON public.flashcard_reviews(flashcard_id);
CREATE INDEX idx_flashcard_reviews_next_review ON public.flashcard_reviews(next_review_date);

-- Enable RLS
ALTER TABLE public.memorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memorizations
CREATE POLICY "Public memorizations are viewable by everyone"
  ON public.memorizations FOR SELECT
  USING (NOT deleted AND (is_public = true OR creator_id = auth.uid()));

CREATE POLICY "Users can create memorizations"
  ON public.memorizations FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update own memorizations"
  ON public.memorizations FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete own memorizations"
  ON public.memorizations FOR DELETE
  USING (auth.uid() = creator_id);

-- RLS Policies for flashcards
CREATE POLICY "Flashcards viewable if memorization viewable"
  ON public.flashcards FOR SELECT
  USING (
    NOT deleted AND EXISTS (
      SELECT 1 FROM public.memorizations m
      WHERE m.id = flashcards.memorization_id
      AND NOT m.deleted
      AND (m.is_public = true OR m.creator_id = auth.uid())
    )
  );

CREATE POLICY "Users can create flashcards for own memorizations"
  ON public.flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memorizations m
      WHERE m.id = flashcards.memorization_id
      AND m.creator_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcards for own memorizations"
  ON public.flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.memorizations m
      WHERE m.id = flashcards.memorization_id
      AND m.creator_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete flashcards for own memorizations"
  ON public.flashcards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.memorizations m
      WHERE m.id = flashcards.memorization_id
      AND m.creator_id = auth.uid()
    )
  );

-- RLS Policies for subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON public.memorization_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subscriptions"
  ON public.memorization_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON public.memorization_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for reviews
CREATE POLICY "Users can view own reviews"
  ON public.flashcard_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reviews"
  ON public.flashcard_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
  ON public.flashcard_reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_memorizations_updated_at
  BEFORE UPDATE ON public.memorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flashcards_updated_at
  BEFORE UPDATE ON public.flashcards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();