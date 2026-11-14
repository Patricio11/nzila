-- 0001_core: the tables everything else stands on (Task 0.5).
--
-- Migration convention: forward-only, and every statement is guarded so that
-- running this file again changes nothing. A change to the schema is a new
-- file with its entry in journal.json, never an edit to this one.

-- ------------------------------------------------------------------ world

CREATE TABLE IF NOT EXISTS provinces (
  id          text PRIMARY KEY,
  name_key    text NOT NULL,
  open        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS districts (
  id           text PRIMARY KEY,
  province_id  text NOT NULL REFERENCES provinces (id),
  name_key     text NOT NULL,
  open         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     text NOT NULL REFERENCES provinces (id),
  district_id     text NOT NULL REFERENCES districts (id),
  version         integer NOT NULL CHECK (version > 0),
  content_hash    text NOT NULL,
  art_pass        smallint NOT NULL CHECK (art_pass BETWEEN 0 AND 2),
  bytes_poupanca  integer NOT NULL CHECK (bytes_poupanca >= 0),
  bytes_normal    integer NOT NULL CHECK (bytes_normal >= 0),
  bytes_alta      integer NOT NULL CHECK (bytes_alta >= 0),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'staged', 'live', 'retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  UNIQUE (district_id, version)
);

-- ---------------------------------------------------------------- players

-- A guest needs no personal data at all (Rule 16). What can identify a person
-- arrives later, encrypted, in columns added by the tasks that need them.
CREATE TABLE IF NOT EXISTS players (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL DEFAULT 'guest' CHECK (kind IN ('guest', 'linked')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'deleted')),
  name              text UNIQUE,
  bi_number         text UNIQUE,
  -- Only the band is kept, never the year of birth (D-0.32).
  age_band          text CHECK (age_band IN ('15_17', '18_plus')),
  home_district_id  text REFERENCES districts (id),
  -- Where the player last was.
  province_id       text REFERENCES provinces (id),
  district_id       text REFERENCES districts (id),
  x                 integer,
  y                 integer,
  z                 integer,
  arrived_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TABLE IF NOT EXISTS devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      uuid NOT NULL REFERENCES players (id),
  -- A hash of the device id, never the id itself (Task 0.10).
  device_hash    text NOT NULL,
  platform       text,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, device_hash)
);

CREATE TABLE IF NOT EXISTS player_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES players (id),
  device_id     uuid REFERENCES devices (id),
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS player_sessions_player_idx ON player_sessions (player_id);

CREATE TABLE IF NOT EXISTS avatars (
  player_id   uuid PRIMARY KEY REFERENCES players (id),
  spec        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A history, not a state: each change of mind is a new row, and the latest
-- row for a purpose is the one that counts.
CREATE TABLE IF NOT EXISTS consents (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players (id),
  purpose    text NOT NULL CHECK (purpose IN ('play', 'analytics', 'notifications')),
  version    integer NOT NULL CHECK (version > 0),
  granted    boolean NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consents_player_purpose_idx ON consents (player_id, purpose, at DESC);

-- ------------------------------------------------------------------ staff

CREATE TABLE IF NOT EXISTS staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_roles (
  staff_id    uuid NOT NULL REFERENCES staff (id),
  role        text NOT NULL CHECK (role IN ('moderador', 'live_ops', 'economy', 'world_builder', 'support', 'platform_admin')),
  granted_by  uuid REFERENCES staff (id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, role)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_kind    text NOT NULL CHECK (actor_kind IN ('staff', 'player', 'system')),
  actor_id      text NOT NULL,
  kind          text NOT NULL,
  subject_kind  text NOT NULL,
  subject_id    text NOT NULL,
  -- Why. Every staff read of a player's data states its reason (Rule 16).
  reason        text NOT NULL CHECK (length(reason) > 0),
  meta          jsonb,
  province_id   text REFERENCES provinces (id),
  district_id   text REFERENCES districts (id)
);
CREATE INDEX IF NOT EXISTS audit_log_subject_idx ON audit_log (subject_kind, subject_id, at DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  key          text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  value        jsonb,
  province_id  text REFERENCES provinces (id),
  district_id  text REFERENCES districts (id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES staff (id)
);

-- ----------------------------------------------------------------- ledger

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id          text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('player_cash', 'player_bank', 'business_till', 'escrow', 'system_faucet', 'system_sink')),
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (id = kind || ':' || ref)
);

-- Ledger convention: every Makuta movement is one row here. Rows are never
-- changed and never removed; a correction is a new row that points at the
-- one it reverses.
CREATE TABLE IF NOT EXISTS ledger_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_account   text NOT NULL REFERENCES ledger_accounts (id),
  credit_account  text NOT NULL REFERENCES ledger_accounts (id),
  amount          bigint NOT NULL CHECK (amount > 0),
  reason          text NOT NULL,
  ref             text,
  -- The idempotency key: the same action can be recorded only once.
  action_id       text NOT NULL UNIQUE,
  province_id     text REFERENCES provinces (id),
  district_id     text REFERENCES districts (id),
  -- A transfer can be reversed at most once.
  reverses        uuid UNIQUE REFERENCES ledger_transfers (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_account <> credit_account)
);
CREATE INDEX IF NOT EXISTS ledger_transfers_debit_idx ON ledger_transfers (debit_account, created_at);
CREATE INDEX IF NOT EXISTS ledger_transfers_credit_idx ON ledger_transfers (credit_account, created_at);

-- The balance of each account, kept by the trigger below and by nothing else.
-- Only a faucet may be below zero: the database itself refuses a transfer
-- that would overdraw anyone else, even when two arrive at the same instant.
CREATE TABLE IF NOT EXISTS balances (
  account_id  text PRIMARY KEY REFERENCES ledger_accounts (id),
  balance     bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balances_not_overdrawn CHECK (balance >= 0 OR account_id LIKE 'system_faucet:%')
);

CREATE OR REPLACE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE TRIGGER ledger_transfers_append_only
  BEFORE UPDATE OR DELETE ON ledger_transfers
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE OR REPLACE TRIGGER ledger_transfers_no_truncate
  BEFORE TRUNCATE ON ledger_transfers
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

CREATE OR REPLACE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE OR REPLACE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

-- Recording a transfer moves the two balances in the same transaction.
-- Accounts are locked in order of id so two transfers between the same pair
-- of accounts cannot deadlock.
CREATE OR REPLACE FUNCTION apply_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO balances (account_id)
    SELECT a FROM unnest(ARRAY[NEW.debit_account, NEW.credit_account]) AS a ORDER BY a
    ON CONFLICT (account_id) DO NOTHING;
  PERFORM 1 FROM balances WHERE account_id IN (NEW.debit_account, NEW.credit_account) ORDER BY account_id FOR UPDATE;
  UPDATE balances SET balance = balance - NEW.amount, updated_at = now() WHERE account_id = NEW.debit_account;
  UPDATE balances SET balance = balance + NEW.amount, updated_at = now() WHERE account_id = NEW.credit_account;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER ledger_transfers_apply
  AFTER INSERT ON ledger_transfers
  FOR EACH ROW EXECUTE FUNCTION apply_transfer();

-- No Makuta moves outside the ledger: a balance changes only from inside the
-- trigger above. A direct INSERT, UPDATE or DELETE is refused.
CREATE OR REPLACE FUNCTION balances_only_by_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'balances change only through ledger_transfers' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE TRIGGER balances_guard
  BEFORE INSERT OR UPDATE OR DELETE ON balances
  FOR EACH ROW EXECUTE FUNCTION balances_only_by_ledger();
CREATE OR REPLACE TRIGGER balances_no_truncate
  BEFORE TRUNCATE ON balances
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
