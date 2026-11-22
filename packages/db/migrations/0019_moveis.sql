-- 0019_moveis: what a player has set down in their house (Task 5.3, D-5.11). A thing that is put somewhere leaves
-- the Mochila and is here, on the floor of the house, until it is taken up again: where (the cell of the house's
-- own plan it begins at) and how it is turned (quarters). Never deleted but by its owner's hand: a thing put in a
-- house stays exactly where it was left.

CREATE TABLE IF NOT EXISTS home_things (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id   uuid NOT NULL REFERENCES players (id),
  item       text NOT NULL CHECK (length(item) BETWEEN 1 AND 32),
  cx         integer NOT NULL,
  cz         integer NOT NULL,
  rot        smallint NOT NULL CHECK (rot BETWEEN 0 AND 3),
  placed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS home_things_owner_idx ON home_things (owner_id, id);
