-- 0002_player_contact: where a linked account's phone number is kept (Task 0.10).
--
-- Never the number itself: an encrypted copy that support can read back for a
-- logged reason, and a keyed hash for finding the account at sign-in. A guest
-- has neither. See packages/db/src/privacy.ts.

ALTER TABLE players ADD COLUMN IF NOT EXISTS phone_enc bytea;
ALTER TABLE players ADD COLUMN IF NOT EXISTS phone_hash text;

-- One account per phone number.
CREATE UNIQUE INDEX IF NOT EXISTS players_phone_hash_idx ON players (phone_hash);
