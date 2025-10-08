-- Update subjects with appropriate Lucide icon names

-- Math subjects
UPDATE subjects SET logo = 'Calculator' WHERE name IN ('Maths', 'Mathématiques', 'Mathématique');

-- Physics subjects
UPDATE subjects SET logo = 'Atom' WHERE name IN ('Physique', 'Physiques');

-- Chemistry
UPDATE subjects SET logo = 'FlaskConical' WHERE name = 'Chimie';

-- French language
UPDATE subjects SET logo = 'BookText' WHERE name = 'Français';

-- English language
UPDATE subjects SET logo = 'Languages' WHERE name = 'Anglais';

-- Arabic language
UPDATE subjects SET logo = 'BookOpenText' WHERE name IN ('عربية', 'العربية');

-- Philosophy
UPDATE subjects SET logo = 'Lightbulb' WHERE name IN ('فلسفة', 'الفلسفة');

-- Programming
UPDATE subjects SET logo = 'Code' WHERE name = 'Programmation';

-- Computer Science/IT
UPDATE subjects SET logo = 'Computer' WHERE name = 'Informatique';

-- STI (Industrial Technology)
UPDATE subjects SET logo = 'Cpu' WHERE name = 'STI';

-- Foreign languages (German, Italian, Spanish)
UPDATE subjects SET logo = 'Flag' WHERE name IN ('Allemand', 'Italien', 'Espagnol');

-- Biology/Life Sciences
UPDATE subjects SET logo = 'Dna' WHERE name IN ('SVT', 'Science de la vie et de la terre');

-- Electrical
UPDATE subjects SET logo = 'Zap' WHERE name = 'Electrique';

-- Mechanics
UPDATE subjects SET logo = 'Cog' WHERE name = 'Mécanique';

-- Economics
UPDATE subjects SET logo = 'TrendingUp' WHERE name = 'Economie';

-- Geography
UPDATE subjects SET logo = 'Map' WHERE name = 'الجغرافيا';

-- Management
UPDATE subjects SET logo = 'Briefcase' WHERE name = 'Gestion';

-- History
UPDATE subjects SET logo = 'Clock' WHERE name = 'التاريخ';

-- Islamic Thought
UPDATE subjects SET logo = 'BookHeart' WHERE name = 'التفكير الإسلامي';