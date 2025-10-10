-- Reset the sequence for chapters table to continue from the highest ID
SELECT setval('chapters_id_seq', (SELECT MAX(id) FROM chapters));

-- Reset the sequence for subjects table to continue from the highest ID
SELECT setval('subjects_id_seq', (SELECT MAX(id) FROM subjects));