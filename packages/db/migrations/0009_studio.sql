-- 0009_studio: staff who can sign in, and what they do to a player (Task 3.8).
--
-- Rule 16: nothing is done to a player, and nothing of a player is read,
-- without a reason that is written down. Every row here has one, and the
-- routes that write these rows write the audit log in the same breath.

-- A password, kept as a salted scrypt hash like a player's. No second factor
-- yet (D-3.11): added before anyone outside the founder's hands has an account.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS staff_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff (id),
  -- Only the hash of the token is kept: a copy of this table opens nothing.
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS staff_sessions_staff_idx ON staff_sessions (staff_id);

-- What was done to a player, by whom, why, and until when.
--   mute     they play, and nothing they say is passed on
--   suspend  they are not let into a street with others until it ends
--   ban      the same, with no end
--   kick     put out of their channel once, to come in again at the district's door: for a player who is stuck
-- A sanction that was a mistake is lifted, never deleted.
CREATE TABLE IF NOT EXISTS sanctions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  player_id    uuid NOT NULL REFERENCES players (id),
  kind         text NOT NULL CHECK (kind IN ('mute', 'suspend', 'ban', 'kick')),
  reason       text NOT NULL CHECK (length(btrim(reason)) > 0),
  staff_id     uuid NOT NULL REFERENCES staff (id),
  -- When it ends. A ban has none; a kick is over as it is made.
  until        timestamptz,
  -- The report it answers, if it answers one.
  report_id    bigint REFERENCES reports (id) ON DELETE SET NULL,
  lifted_at    timestamptz,
  lifted_by    uuid REFERENCES staff (id),
  lift_reason  text,
  CHECK (kind <> 'ban' OR until IS NULL),
  CHECK (kind NOT IN ('mute', 'suspend') OR until IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS sanctions_player_idx ON sanctions (player_id, at DESC);
