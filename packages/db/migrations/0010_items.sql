-- 0010_items: what a player holds, and a receipt for everything bought (Tasks 4.2 and 4.3).
--
-- A thing is a row with an owner and a place (D-4.4). Everything sold so far
-- is alike within its kind (a loaf is a loaf), so one row holds how many of a
-- kind an owner has in one place. Things that are each their own (a sofa, a
-- phone) come with Phase 5 as rows of one.

CREATE TABLE IF NOT EXISTS items (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    uuid NOT NULL REFERENCES players (id),
  -- Where it is: on the player (the Mochila) for now; at home, in a vehicle, in a business with later phases.
  place       text NOT NULL DEFAULT 'mochila' CHECK (place IN ('mochila', 'casa')),
  item        text NOT NULL CHECK (length(item) BETWEEN 1 AND 32),
  quantity    integer NOT NULL CHECK (quantity > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, place, item)
);

-- A receipt for every purchase: what, how many, at what price, where, and the transfer that paid for it.
CREATE TABLE IF NOT EXISTS receipts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  player_id    uuid NOT NULL REFERENCES players (id),
  -- The place it was bought at, by the pack's name for it.
  shop         text NOT NULL,
  lines        jsonb NOT NULL,
  total        bigint NOT NULL CHECK (total > 0),
  transfer_id  uuid NOT NULL REFERENCES ledger_transfers (id),
  -- The phone's key for the purchase: the same purchase sent twice makes one receipt.
  key          text NOT NULL,
  UNIQUE (player_id, key)
);
CREATE INDEX IF NOT EXISTS receipts_player_idx ON receipts (player_id, at DESC);
