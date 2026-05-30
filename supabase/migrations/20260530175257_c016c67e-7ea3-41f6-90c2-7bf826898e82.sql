
CREATE TABLE public.app_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL CHECK (severity IN ('info','warn','error','critical')),
  category text NOT NULL CHECK (category IN ('preview','download','upload','ocr','ai','other')),
  event_type text NOT NULL,
  message text,
  url text,
  target_url text,
  content_type text,
  content_id integer,
  user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT ON public.app_events TO authenticated;
GRANT ALL ON public.app_events TO service_role;

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all app events"
  ON public.app_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can insert own events"
  ON public.app_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE INDEX idx_app_events_created_at ON public.app_events (created_at DESC);
CREATE INDEX idx_app_events_category_severity ON public.app_events (category, severity, created_at DESC);

-- Alert dedup table for health-digest
CREATE TABLE public.health_alert_sent (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.health_alert_sent TO service_role;
ALTER TABLE public.health_alert_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read alert sent log"
  ON public.health_alert_sent
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_health_alert_sent_alert ON public.health_alert_sent (alert_id, sent_at DESC);
