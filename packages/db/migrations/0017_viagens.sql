-- 0017_viagens: every crossing from one bairro to another (Task 11.2, D-11.2). The first of each day costs
-- nothing, so each is written down whether it was paid or not: what was paid is in the ledger as well.

CREATE TABLE IF NOT EXISTS viagens (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players (id),
  de         text NOT NULL,
  para       text NOT NULL,
  paid       bigint NOT NULL CHECK (paid >= 0),
  key        text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, key)
);
CREATE INDEX IF NOT EXISTS viagens_player_idx ON viagens (player_id, at DESC);
