CREATE TABLE public.pdf_health_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('resource', 'question')),
  content_id integer NOT NULL,
  manifest_url text NOT NULL,
  title text,
  total_pages integer NOT NULL DEFAULT 0,
  broken_pages integer[] NOT NULL DEFAULT '{}'::integer[],
  unavailable_pages integer[] NOT NULL DEFAULT '{}'::integer[],
  manifest_error text,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (kind, content_id, manifest_url)
);

GRANT SELECT ON public.pdf_health_reports TO authenticated;
GRANT ALL ON public.pdf_health_reports TO service_role;

ALTER TABLE public.pdf_health_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pdf health reports"
  ON public.pdf_health_reports
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_pdf_health_reports_checked_at ON public.pdf_health_reports (checked_at DESC);
CREATE INDEX idx_pdf_health_reports_broken
  ON public.pdf_health_reports (kind, content_id)
  WHERE cardinality(broken_pages) > 0 OR manifest_error IS NOT NULL;