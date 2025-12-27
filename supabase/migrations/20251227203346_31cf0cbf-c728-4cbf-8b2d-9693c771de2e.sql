-- Create feature_flags table
CREATE TABLE public.feature_flags (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can view feature flags
CREATE POLICY "Feature flags are viewable by everyone"
  ON public.feature_flags FOR SELECT
  USING (true);

-- Only moderators/admins can update
CREATE POLICY "Moderators can update feature flags"
  ON public.feature_flags FOR UPDATE
  USING (is_moderator_or_admin(auth.uid()))
  WITH CHECK (is_moderator_or_admin(auth.uid()));

-- Insert initial feature flag for memorizations
INSERT INTO public.feature_flags (id, enabled, description)
VALUES ('memorizations', true, 'Enable or disable the memorization/flashcard feature');