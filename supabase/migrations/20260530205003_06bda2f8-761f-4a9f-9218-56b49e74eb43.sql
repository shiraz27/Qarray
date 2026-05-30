INSERT INTO public.feature_flags (id, enabled, description)
VALUES ('notifications', true, 'Show the notification bell and panel in the header')
ON CONFLICT (id) DO NOTHING;