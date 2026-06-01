CREATE TABLE public.content_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('resource','question','answer')),
  content_id integer NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('inappropriate','quality','missing','incorrect','spam','other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX content_reports_unique_open
  ON public.content_reports (content_type, content_id, reporter_id)
  WHERE status = 'open';

CREATE INDEX content_reports_status_idx ON public.content_reports (status, created_at DESC);
CREATE INDEX content_reports_content_idx ON public.content_reports (content_type, content_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own reports"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports"
  ON public.content_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can update reports"
  ON public.content_reports FOR UPDATE TO authenticated
  USING (is_moderator_or_admin(auth.uid()))
  WITH CHECK (is_moderator_or_admin(auth.uid()));

CREATE POLICY "Moderators can delete reports"
  ON public.content_reports FOR DELETE TO authenticated
  USING (is_moderator_or_admin(auth.uid()));

CREATE TRIGGER content_reports_set_updated_at
  BEFORE UPDATE ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();