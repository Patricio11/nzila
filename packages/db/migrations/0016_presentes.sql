-- 0016_presentes: every thing one player hands another (Task 10.13's gift, D-10.2). The one given to is told who
-- gave it; a moderator can see things passed to move value; the Album will find the firsts here. Kept as the
-- ledger's rows are: under a player who is nobody once their account is deleted.

CREATE TABLE IF NOT EXISTS presentes (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  de        uuid NOT NULL REFERENCES players (id),
  para      uuid NOT NULL REFERENCES players (id),
  item      text NOT NULL,
  quantity  integer NOT NULL CHECK (quantity > 0),
  at        timestamptz NOT NULL DEFAULT now(),
  CHECK (de <> para)
);
CREATE INDEX IF NOT EXISTS presentes_para_idx ON presentes (para, at DESC);
CREATE INDEX IF NOT EXISTS presentes_de_idx ON presentes (de, at DESC);
