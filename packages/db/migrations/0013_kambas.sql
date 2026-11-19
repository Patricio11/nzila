-- 0013_kambas: who is whose kamba, who has asked, and what kambas write to each other (Task 4B.2, Task 10.1 brought
-- forward). A kamba is asked from the BI card of someone met and is a kamba once they say yes; both are written,
-- one row each way, so that each player's list is read from one side. What kambas write is kept thirty days, as
-- what is said in the street is (docs/legal/RETENTION.md), and goes with the account.

CREATE TABLE IF NOT EXISTS kamba_pedidos (
  de        uuid NOT NULL REFERENCES players (id),
  para      uuid NOT NULL REFERENCES players (id),
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (de, para),
  CHECK (de <> para)
);
CREATE INDEX IF NOT EXISTS kamba_pedidos_para_idx ON kamba_pedidos (para, at DESC);

CREATE TABLE IF NOT EXISTS kambas (
  player_id  uuid NOT NULL REFERENCES players (id),
  kamba_id   uuid NOT NULL REFERENCES players (id),
  desde      timestamptz NOT NULL DEFAULT now(),
  -- The conversation is muted by this player: what comes is kept, nothing is pointed out.
  calado     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (player_id, kamba_id),
  CHECK (player_id <> kamba_id)
);

CREATE TABLE IF NOT EXISTS mensagens (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  de         uuid NOT NULL REFERENCES players (id),
  para       uuid NOT NULL REFERENCES players (id),
  -- 'texto', a line written; 'convite', come and play (`jogo`, in `district_id`).
  kind       text NOT NULL DEFAULT 'texto' CHECK (kind IN ('texto', 'convite')),
  texto      text NOT NULL DEFAULT '',
  jogo       text CHECK (jogo IS NULL OR jogo IN ('xadrez', 'damas', 'ludo')),
  district_id text,
  at         timestamptz NOT NULL DEFAULT now(),
  lida_at    timestamptz
);
CREATE INDEX IF NOT EXISTS mensagens_conversa_idx ON mensagens (para, de, at DESC);
CREATE INDEX IF NOT EXISTS mensagens_de_idx ON mensagens (de, para, at DESC);
CREATE INDEX IF NOT EXISTS mensagens_at_idx ON mensagens (at);
