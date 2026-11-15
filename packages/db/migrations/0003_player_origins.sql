-- 0003_player_origins: the card a player was dealt at first play (D-0.44, Task 2.3).
--
-- One row a player, written once: the family, the province it came from, the
-- bairro, and the Makuta the player starts with. The amount is a record, not
-- money: it is paid through the ledger, from a named faucet, when the ledger
-- has its API (Task 4.1), and `paid_transfer_id` then says by which transfer.

CREATE TABLE IF NOT EXISTS player_origins (
  player_id         uuid PRIMARY KEY REFERENCES players (id),
  family            text NOT NULL,
  province          text NOT NULL,
  bairro            text NOT NULL,
  makuta            bigint NOT NULL CHECK (makuta >= 0),
  -- Which table of origins it was drawn from.
  table_version     integer NOT NULL CHECK (table_version > 0),
  paid_transfer_id  uuid REFERENCES ledger_transfers (id),
  drawn_at          timestamptz NOT NULL DEFAULT now()
);

-- A card is dealt once. Nothing rewrites one except the payment of it.
CREATE OR REPLACE FUNCTION player_origins_are_final() RETURNS trigger AS $$
BEGIN
  IF NEW.family IS DISTINCT FROM OLD.family OR NEW.province IS DISTINCT FROM OLD.province OR NEW.bairro IS DISTINCT FROM OLD.bairro
     OR NEW.makuta IS DISTINCT FROM OLD.makuta OR NEW.table_version IS DISTINCT FROM OLD.table_version OR NEW.player_id IS DISTINCT FROM OLD.player_id
     OR OLD.paid_transfer_id IS NOT NULL THEN
    RAISE EXCEPTION 'a card of origin is dealt once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER player_origins_final
  BEFORE UPDATE ON player_origins
  FOR EACH ROW EXECUTE FUNCTION player_origins_are_final();
