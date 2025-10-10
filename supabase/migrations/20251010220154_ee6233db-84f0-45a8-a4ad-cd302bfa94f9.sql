-- Enable pg_cron and pg_net extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule the flashcard review check to run daily at 8 AM UTC
SELECT cron.schedule(
  'check-flashcard-reviews-daily',
  '0 8 * * *', -- Run at 8:00 AM UTC every day
  $$
  SELECT
    net.http_post(
        url:='https://xwqmdhnuthprzfbyoxlb.supabase.co/functions/v1/check-flashcard-reviews',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3cW1kaG51dGhwcnpmYnlveGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4ODcxNzIsImV4cCI6MjA3NTQ2MzE3Mn0.qVP6vOLYLZcgGGIWNK5ZmydzoI4CbTZa6EPl1Q8ruKY"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);