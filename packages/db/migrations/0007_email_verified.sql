-- 0007_email_verified: when a player proved their email address is their own (Task 2.2).
--
-- A code is sent to the address and typed back. One-time codes for an address
-- are kept in `login_codes` as codes for a number are: the column `phone_hash`
-- holds the keyed hash of whoever the code was sent to, a number or an address
-- (the two are hashed apart and cannot collide).

ALTER TABLE players ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
