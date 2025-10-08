-- Delete questions without contributors
DELETE FROM public.questions
WHERE contributors IS NULL OR contributors = '{}';

-- Delete answers without contributors
DELETE FROM public.answers
WHERE contributors IS NULL OR contributors = '{}';

-- Delete resources without contributors
DELETE FROM public.resources
WHERE contributors IS NULL OR contributors = '{}';