-- 0006_player_email: saving the BI with an email address and a password (Task 2.2).
--
-- Never the address itself: an encrypted copy, and a keyed hash for finding
-- the account at sign-in (as the phone number is kept: packages/db/src/privacy.ts).
-- Never the password: a salted scrypt hash of it. Wrong guesses are counted
-- on the account, which is closed to guessing for a while after too many.

ALTER TABLE players ADD COLUMN IF NOT EXISTS email_enc bytea;
ALTER TABLE players ADD COLUMN IF NOT EXISTS email_hash text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS signin_failures integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS signin_locked_until timestamptz;

-- One account per address.
CREATE UNIQUE INDEX IF NOT EXISTS players_email_hash_idx ON players (email_hash);
