-- 0011_recados: os recados do dia, the family's money for the taxi, and the cantina's card
-- (docs/DAILY_PLAY_PROPOSAL.md, approved by the founder on 2026-11-18).
--
-- A player's errands for a day are not written down: they follow by rule from the player and the date
-- (packages/economy/src/recados.ts). What is written is what was done, once each, and the transfer that paid
-- for it. `n` is the errand's place in the day; 8 is the errand for two (giving a thing to another player),
-- 7 is being given it, 9 is the family's money for the taxi.

CREATE TABLE IF NOT EXISTS recados_feitos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id    uuid NOT NULL REFERENCES players (id),
  day          date NOT NULL,
  n            smallint NOT NULL CHECK (n BETWEEN 0 AND 9),
  kind         text NOT NULL CHECK (kind IN ('traz', 'vaiver', 'guarda', 'cumprimenta', 'adois', 'recebeu', 'familia')),
  -- Where it was done: the festa of the week counts a bairro's errands.
  district_id  text,
  transfer_id  uuid REFERENCES ledger_transfers (id),
  at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, day, n)
);
CREATE INDEX IF NOT EXISTS recados_feitos_district_idx ON recados_feitos (district_id, day);

-- The cantina's card: a stamp for each day a player buys at a shop; when it fills, the dona gives the gift and a
-- new card begins. Only the filling is written down; the stamps are the days of the receipts since.
CREATE TABLE IF NOT EXISTS cartoes_cheios (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players (id),
  shop       text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cartoes_cheios_player_idx ON cartoes_cheios (player_id, shop, at DESC);
