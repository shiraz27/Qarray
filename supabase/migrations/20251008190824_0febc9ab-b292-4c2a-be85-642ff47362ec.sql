-- Drop the check constraint
ALTER TABLE resource_types DROP CONSTRAINT IF EXISTS resource_types_type_check;

-- Update existing resource types
UPDATE resource_types SET type = 'Devoirs' WHERE id = 1;
UPDATE resource_types SET type = 'Cours' WHERE id = 2;
UPDATE resource_types SET type = 'Exercices' WHERE id = 3;
UPDATE resource_types SET type = 'Résumé' WHERE id = 4;

-- Fix the sequence
SELECT setval('resource_types_id_seq', (SELECT MAX(id) FROM resource_types));

-- Add new resource types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM resource_types WHERE type = 'PDF') THEN
    INSERT INTO resource_types (type) VALUES ('PDF');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM resource_types WHERE type = 'Vidéo') THEN
    INSERT INTO resource_types (type) VALUES ('Vidéo');
  END IF;
END $$;

-- Add type_id to questions table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'questions' AND column_name = 'type_id'
  ) THEN
    ALTER TABLE questions ADD COLUMN type_id integer REFERENCES resource_types(id);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_questions_type_id ON questions(type_id);
CREATE INDEX IF NOT EXISTS idx_resources_type_id ON resources(type_id);