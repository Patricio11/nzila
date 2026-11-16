// The bots' accounts: players with a session each, made straight in the
// database as the API would have made them, and taken away again afterwards.
// They are marked by their name ("Enxame …") so that a run that died leaves
// nothing that cannot be found.

import { randomBytes } from "node:crypto";
import { hashToken } from "@nzila/db";
import { type Sql } from "postgres";

export interface SwarmGuests {
  readonly tokens: string[];
  remove(): Promise<void>;
}

export async function makeGuests(sql: Sql, count: number): Promise<SwarmGuests> {
  const run = randomBytes(4).toString("hex");
  const ids: string[] = [];
  const tokens: string[] = [];
  for (let n = 1; n <= count; n++) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO players (age_band, name, name_key) VALUES ('18_plus', ${`Enxame ${run} ${n}`}, ${`enxame ${run} ${n}`}) RETURNING id`;
    const token = randomBytes(32).toString("base64url");
    await sql`INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES (${row!.id}, ${hashToken(token)}, now() + interval '1 hour')`;
    ids.push(row!.id);
    tokens.push(token);
  }
  return {
    tokens,
    remove: async () => {
      await sql`DELETE FROM player_sessions WHERE player_id = ANY(${ids})`;
      await sql`DELETE FROM players WHERE id = ANY(${ids})`;
    },
  };
}
