-- 0012_partidas: the games played at the tables of the street, and each player's points at each game, in each
-- bairro (Task 4B.1). A game is written when it ends with at least one player seated; a kota's seat is written with
-- which kota it was. The points are counted the way chess counts them (packages/games/src/classificacao.ts).

CREATE TABLE IF NOT EXISTS partidas (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  district_id  text NOT NULL,
  -- The table's place in the district's list of tables.
  mesa         smallint NOT NULL,
  jogo         text NOT NULL CHECK (jogo IN ('xadrez', 'damas', 'ludo')),
  rapida       boolean NOT NULL DEFAULT false,
  por_tempo    boolean NOT NULL DEFAULT false,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partidas_district_idx ON partidas (district_id, at DESC);

CREATE TABLE IF NOT EXISTS partida_lugares (
  partida_id     bigint NOT NULL REFERENCES partidas (id),
  lugar          smallint NOT NULL,
  -- A player, or a kota of the bairro (by its number) when nobody sat there.
  player_id      uuid REFERENCES players (id),
  kota           smallint,
  resultado      text NOT NULL CHECK (resultado IN ('ganhou', 'perdeu', 'empate')),
  pontos_antes   integer,
  pontos_depois  integer,
  PRIMARY KEY (partida_id, lugar),
  CHECK ((player_id IS NULL) <> (kota IS NULL))
);
CREATE INDEX IF NOT EXISTS partida_lugares_player_idx ON partida_lugares (player_id);

CREATE TABLE IF NOT EXISTS classificacao (
  player_id    uuid NOT NULL REFERENCES players (id),
  jogo         text NOT NULL CHECK (jogo IN ('xadrez', 'damas', 'ludo')),
  district_id  text NOT NULL,
  pontos       integer NOT NULL,
  jogos        integer NOT NULL DEFAULT 0,
  vitorias     integer NOT NULL DEFAULT 0,
  empates      integer NOT NULL DEFAULT 0,
  derrotas     integer NOT NULL DEFAULT 0,
  atualizado   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, jogo, district_id)
);
CREATE INDEX IF NOT EXISTS classificacao_board_idx ON classificacao (jogo, district_id, pontos DESC);
