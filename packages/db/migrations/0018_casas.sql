-- 0018_casas: the house a player's family gave them (Phase 5; D-3.13, D-5.8). One a player, in the bairro the
-- family's card wakes them in. It costs nothing and is never lost (D-5.2). A bairro has as many houses as were
-- built, and more families than houses: many are given the same house, and each has its own inside.

CREATE TABLE IF NOT EXISTS family_homes (
  player_id   uuid PRIMARY KEY REFERENCES players (id),
  district_id text NOT NULL,
  house       integer NOT NULL CHECK (house >= 1),
  kind        text NOT NULL,
  given_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_homes_house_idx ON family_homes (district_id, house);
