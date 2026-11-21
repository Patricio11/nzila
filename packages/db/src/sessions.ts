// Who a session token belongs to, and where a player was last. Both the API
// and the zone need these, and there must be one answer to each: a token the
// API would refuse, the zone refuses.

import { createHash } from "node:crypto";
import { type Sql } from "postgres";

/** A session lasts this long from when it was last used. */
export const SESSION_DAYS = 90;

/** What the database keeps of a token: its hash, so that the database alone lets nobody in. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export interface SessionPlayer {
  readonly id: string;
  readonly kind: "guest" | "linked";
  readonly sessionId: string;
}

/** The player a token belongs to, or null: unknown, revoked, expired, or a player who may not play. Using a session keeps it alive. */
export async function playerOfSession(sql: Sql, token: string): Promise<SessionPlayer | null> {
  const [row] = await sql<{ id: string; kind: "guest" | "linked"; session_id: string }[]>`
    UPDATE player_sessions s SET last_seen_at = now(), expires_at = now() + make_interval(days => ${SESSION_DAYS})
    FROM players p
    WHERE s.token_hash = ${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at > now()
      AND p.id = s.player_id AND p.status = 'active'
    RETURNING p.id, p.kind, s.id AS session_id`;
  return row ? { id: row.id, kind: row.kind, sessionId: row.session_id } : null;
}

/** What others are shown of a player: the name on the BI, its number, and the look they chose (as it was stored: whoever reads it checks it). */
export async function faceOf(sql: Sql, playerId: string): Promise<{ name: string; biNumber: string; look: unknown }> {
  const [row] = await sql<{ name: string | null; bi_number: string | null; spec: unknown }[]>`
    SELECT p.name, p.bi_number, a.spec FROM players p LEFT JOIN avatars a ON a.player_id = p.id WHERE p.id = ${playerId}`;
  return { name: row?.name ?? "", biNumber: row?.bi_number ?? "", look: row?.spec ?? null };
}

/** Whether a player is 18 or over, as they said on coming in (D-0.32): what is kept for adults asks this, and nothing else of their age is known. */
export async function adultOf(sql: Sql, playerId: string): Promise<boolean> {
  const [row] = await sql<{ adult: boolean }[]>`SELECT age_band = '18_plus' AS adult FROM players WHERE id = ${playerId}`;
  return row?.adult === true;
}

/** A place in a district: millimetres. */
export interface Whereabouts {
  readonly districtId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where a player last stood, or null for one who has not been anywhere yet. */
export async function whereaboutsOf(sql: Sql, playerId: string): Promise<Whereabouts | null> {
  const [row] = await sql<{ district_id: string | null; x: number | null; y: number | null; z: number | null }[]>`
    SELECT district_id, x, y, z FROM players WHERE id = ${playerId} AND status = 'active'`;
  if (!row || row.district_id === null || row.x === null || row.y === null || row.z === null) return null;
  return { districtId: row.district_id, x: row.x, y: row.y, z: row.z };
}

/** Keeps where a player stands, for their return. Written by the zone and by nothing else (D-3.1). */
export async function keepWhereabouts(sql: Sql, playerId: string, provinceId: string, at: Whereabouts): Promise<void> {
  await sql`
    UPDATE players SET province_id = ${provinceId}, district_id = ${at.districtId}, x = ${at.x}, y = ${at.y}, z = ${at.z}
    WHERE id = ${playerId} AND status = 'active'`;
}

/** How many times a player has crossed from one bairro to another today (the server's day, UTC): the first is on the house (D-11.2). */
export async function viagensHoje(sql: Sql, playerId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM viagens WHERE player_id = ${playerId} AND at >= date_trunc('day', now())`;
  return row?.n ?? 0;
}

/** Writes a crossing down. False when this very crossing (its key) was written already. */
export async function recordViagem(sql: Sql, crossing: { playerId: string; de: string; para: string; paid: number; key: string }): Promise<boolean> {
  const rows = await sql`
    INSERT INTO viagens (player_id, de, para, paid, key) VALUES (${crossing.playerId}, ${crossing.de}, ${crossing.para}, ${crossing.paid}, ${crossing.key})
    ON CONFLICT (player_id, key) DO NOTHING RETURNING id`;
  return rows.length > 0;
}
