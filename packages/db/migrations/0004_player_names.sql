-- 0004_player_names: the name on the BI and its number (Task 2.3).
--
-- Two names are the same name when they differ only by case, accents or
-- separators: `name_key` is the plain form (packages/protocol/src/name.ts),
-- and it is the key that must be unique. `name_changes` counts how often the
-- player has changed the name they arrived with: the first change is free.
--
-- A BI number is the order of arrival: whoever came first holds the lowest.

ALTER TABLE players ADD COLUMN IF NOT EXISTS name_key text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS name_changes integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS players_name_key_idx ON players (name_key);

CREATE SEQUENCE IF NOT EXISTS bi_numbers START WITH 1001;
