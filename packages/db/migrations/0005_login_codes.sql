-- 0005_login_codes: one-time codes sent to a phone number (Task 2.2).
--
-- Neither the number nor the code is kept: a keyed hash of each. A code
-- lives ten minutes, is used once, and stops answering after a few wrong
-- tries. Rows past their time are swept by a job (docs/legal/RETENTION.md).

CREATE TABLE IF NOT EXISTS login_codes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone_hash  text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS login_codes_phone_idx ON login_codes (phone_hash, created_at DESC);
