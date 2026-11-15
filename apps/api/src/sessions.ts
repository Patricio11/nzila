// Guests and their sessions (Task 2.1). The first time the game is opened on
// a device, a player is made: a guest, with no personal data at all (Rule
// 16). What the device keeps is a token; what the database keeps is the hash
// of the token, so that the database alone lets nobody in.

import { createHash, randomBytes } from "node:crypto";
import { hashDeviceId } from "@nzila/db";
import { type Sql } from "postgres";
import { type AgeBand } from "@nzila/protocol";
import { type Player } from "./routes.ts";

/** A session lasts this long from when it was last used. */
export const SESSION_DAYS = 90;

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export interface NewGuest {
  readonly playerId: string;
  /** Shown to nobody and stored nowhere but on the device. */
  readonly token: string;
}

/** The version of the terms of play a new guest agrees to by coming in. */
export const PLAY_TERMS = 1;

/**
 * Makes a guest, remembers the device by its hash, and opens a session. One
 * transaction: all of it or none. The age band is what the phone worked out
 * from a year of birth it kept to itself; nobody under 15 gets this far.
 */
export async function createGuest(sql: Sql, pepper: Uint8Array, deviceId: string, platform: string | null, ageBand: AgeBand): Promise<NewGuest> {
  const token = randomBytes(32).toString("base64url");
  return sql.begin(async (tx) => {
    const [player] = await tx<{ id: string }[]>`INSERT INTO players (age_band) VALUES (${ageBand}) RETURNING id`;
    await tx`INSERT INTO consents (player_id, purpose, version, granted) VALUES (${player!.id}, 'play', ${PLAY_TERMS}, true)`;
    const [device] = await tx<{ id: string }[]>`
      INSERT INTO devices (player_id, device_hash, platform) VALUES (${player!.id}, ${hashDeviceId(deviceId, pepper)}, ${platform}) RETURNING id`;
    await tx`
      INSERT INTO player_sessions (player_id, device_id, token_hash, expires_at)
      VALUES (${player!.id}, ${device!.id}, ${hashToken(token)}, now() + make_interval(days => ${SESSION_DAYS}))`;
    return { playerId: player!.id, token };
  });
}

/** The player a token belongs to, or null: unknown, revoked, expired, or a player who may not play. */
export async function playerOfToken(sql: Sql, token: string): Promise<Player | null> {
  const [row] = await sql<{ id: string; kind: "guest" | "linked"; session_id: string }[]>`
    UPDATE player_sessions s SET last_seen_at = now(), expires_at = now() + make_interval(days => ${SESSION_DAYS})
    FROM players p
    WHERE s.token_hash = ${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at > now()
      AND p.id = s.player_id AND p.status = 'active'
    RETURNING p.id, p.kind, s.id AS session_id`;
  return row ? { id: row.id, kind: row.kind, sessionId: row.session_id } : null;
}

/** Ends one session: the device it was on must ask to come in again. */
export async function revokeSession(sql: Sql, sessionId: string): Promise<void> {
  await sql`UPDATE player_sessions SET revoked_at = now() WHERE id = ${sessionId} AND revoked_at IS NULL`;
}
