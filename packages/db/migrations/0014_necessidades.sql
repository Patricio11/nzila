-- 0014_necessidades: each player's Fome and Energia (Task 4.4), points of a 10 000 point bar. The zone keeps them
-- while the player plays and writes them here every half minute and when they leave; a newcomer starts full.

ALTER TABLE players ADD COLUMN IF NOT EXISTS fome integer NOT NULL DEFAULT 10000 CHECK (fome BETWEEN 0 AND 10000);
ALTER TABLE players ADD COLUMN IF NOT EXISTS energia integer NOT NULL DEFAULT 10000 CHECK (energia BETWEEN 0 AND 10000);
