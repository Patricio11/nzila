-- 0008_talk: what was said, who has shut whom out, and what was reported (Tasks 3.5 and 3.6).
--
-- Rule 11: every way to talk ships with report, block and mute on the same
-- screen, and what is said is kept for moderation, for a limited time
-- (docs/legal/RETENTION.md: thirty days; a line attached to a report, until
-- the report is closed and ninety days more).

-- Every line a player sent to the street, said or refused. Written by the zone.
CREATE TABLE IF NOT EXISTS chat_lines (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  player_id    uuid NOT NULL REFERENCES players (id),
  -- Where it was said: free text, because a rehearsal town is no district of the registry.
  district_id  text NOT NULL,
  channel      integer NOT NULL,
  text         text NOT NULL CHECK (length(text) BETWEEN 1 AND 800),
  -- Whether anyone was sent it. A line with a listed word, or one too many too fast, is kept and not said.
  said         boolean NOT NULL,
  -- How many players it was sent to with its words.
  heard_by     integer NOT NULL DEFAULT 0 CHECK (heard_by >= 0)
);
CREATE INDEX IF NOT EXISTS chat_lines_player_idx ON chat_lines (player_id, at DESC);
CREATE INDEX IF NOT EXISTS chat_lines_at_idx ON chat_lines (at);

-- "Bloquear": the blocker neither hears nor is heard by the blocked, anywhere. One row a pair, in the direction it was asked.
CREATE TABLE IF NOT EXISTS player_blocks (
  player_id   uuid NOT NULL REFERENCES players (id),
  blocked_id  uuid NOT NULL REFERENCES players (id),
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, blocked_id),
  CHECK (player_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS player_blocks_blocked_idx ON player_blocks (blocked_id);

-- "Denunciar": a player says another did something wrong. Read by moderators in the Estúdio (Task 3.8).
CREATE TABLE IF NOT EXISTS reports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  reporter_id  uuid NOT NULL REFERENCES players (id),
  reported_id  uuid NOT NULL REFERENCES players (id),
  reason       text NOT NULL CHECK (reason IN ('insults', 'harassment', 'sexual', 'scam', 'cheating', 'name', 'other')),
  -- What the reporter wrote, if anything. Their words, kept as they wrote them.
  note         text CHECK (note IS NULL OR length(note) <= 500),
  -- The reported player's last lines at that moment, copied here so that they outlive the thirty days.
  lines        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at    timestamptz,
  closed_by    uuid REFERENCES staff (id),
  -- What was done about it, by the moderator who closed it.
  outcome      text,
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX IF NOT EXISTS reports_open_idx ON reports (status, at);
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports (reported_id, at DESC);
