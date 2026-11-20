-- 0015_tunables: the game's numbers, version after version (Task 4.6, D-4.24). The first is tunables/base.json as
-- the code ships it; each change made in the Estúdio is the next, whole, with who made it, when and why. The zone and
-- the API play by the newest one that reads as valid, and pick a new one up within half a minute.

CREATE TABLE IF NOT EXISTS tunables_versions (
  version   integer PRIMARY KEY CHECK (version > 0),
  -- Every tunable, as the validator in packages/economy/src/tunables.ts reads them.
  tunables  jsonb NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  -- Who changed them; null for a version that came with the code (the file).
  staff_id  uuid REFERENCES staff (id),
  reason    text NOT NULL CHECK (length(reason) > 0)
);
