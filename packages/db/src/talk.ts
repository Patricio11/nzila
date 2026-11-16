// What was said, who has shut whom out, what was reported (Tasks 3.5 and 3.6).
// The zone writes lines and reads blocks; the API writes blocks and reports.

import { type Sql } from "postgres";

export interface ChatLine {
  readonly playerId: string;
  readonly districtId: string;
  readonly channel: number;
  readonly text: string;
  readonly said: boolean;
  readonly heardBy: number;
}

/** Keeps lines for moderation. Several at once: the zone writes them in batches, never one a message. */
export async function keepChatLines(sql: Sql, lines: readonly ChatLine[]): Promise<void> {
  if (lines.length === 0) return;
  const rows = lines.map((line) => ({ player_id: line.playerId, district_id: line.districtId, channel: line.channel, text: line.text, said: line.said, heard_by: line.heardBy }));
  await sql`INSERT INTO chat_lines ${sql(rows, "player_id", "district_id", "channel", "text", "said", "heard_by")}`;
}

/** Everyone a player neither hears nor is heard by: whom they blocked, and who blocked them. */
export async function shutOutOf(sql: Sql, playerId: string): Promise<string[]> {
  const rows = await sql<{ other: string }[]>`
    SELECT blocked_id AS other FROM player_blocks WHERE player_id = ${playerId}
    UNION SELECT player_id AS other FROM player_blocks WHERE blocked_id = ${playerId}`;
  return rows.map((row) => row.other);
}

/** The player a BI number belongs to, if they may still be met. A BI number is what one player knows another by. */
export async function playerOfBi(sql: Sql, biNumber: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM players WHERE bi_number = ${biNumber} AND status = 'active'`;
  return row?.id ?? null;
}

/** "Bloquear". Asking twice changes nothing. */
export async function blockPlayer(sql: Sql, playerId: string, blockedId: string): Promise<void> {
  await sql`INSERT INTO player_blocks (player_id, blocked_id) VALUES (${playerId}, ${blockedId}) ON CONFLICT DO NOTHING`;
}

export async function unblockPlayer(sql: Sql, playerId: string, blockedId: string): Promise<void> {
  await sql`DELETE FROM player_blocks WHERE player_id = ${playerId} AND blocked_id = ${blockedId}`;
}

/** Whom a player has blocked, as they are shown to that player: by name and BI number, newest first. */
export async function blockedBy(sql: Sql, playerId: string): Promise<{ name: string | null; biNumber: string | null; at: string }[]> {
  const rows = await sql<{ name: string | null; bi_number: string | null; at: Date }[]>`
    SELECT p.name, p.bi_number, b.at FROM player_blocks b JOIN players p ON p.id = b.blocked_id WHERE b.player_id = ${playerId} ORDER BY b.at DESC`;
  return rows.map((row) => ({ name: row.name, biNumber: row.bi_number, at: row.at.toISOString() }));
}

/** How long what was said is kept, and how long a report is kept after it is closed: docs/legal/RETENTION.md. */
export const CHAT_KEPT_DAYS = 30;
export const REPORT_KEPT_DAYS = 90;

/**
 * Deletes what has been kept its time: lines said more than thirty days ago, and reports closed more than ninety
 * days ago (with the lines copied into them). Gives back how many of each went.
 */
export async function expireTalk(sql: Sql): Promise<{ lines: number; reports: number }> {
  const lines = await sql`DELETE FROM chat_lines WHERE at < now() - make_interval(days => ${CHAT_KEPT_DAYS})`;
  const reports = await sql`DELETE FROM reports WHERE status = 'closed' AND closed_at < now() - make_interval(days => ${REPORT_KEPT_DAYS})`;
  return { lines: lines.count, reports: reports.count };
}

export const REPORT_REASONS = ["insults", "harassment", "sexual", "scam", "cheating", "name", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** How many of the reported player's last lines are copied into a report, and from how far back. */
const LINES_IN_A_REPORT = 20;
const LINES_FROM_MINUTES = 15;

/**
 * "Denunciar". The reported player's last lines are copied into the report as it is made, so that a moderator
 * reads what was said then, and so that they outlive the thirty days lines are otherwise kept. Gives back the report's number.
 */
export async function reportPlayer(sql: Sql, reporterId: string, reportedId: string, reason: ReportReason, note: string | null): Promise<number> {
  const lines = await sql<{ at: Date; text: string; said: boolean; district_id: string; channel: number }[]>`
    SELECT at, text, said, district_id, channel FROM chat_lines
    WHERE player_id = ${reportedId} AND at > now() - make_interval(mins => ${LINES_FROM_MINUTES})
    ORDER BY at DESC, id DESC LIMIT ${LINES_IN_A_REPORT}`;
  const copied = lines.reverse().map((line) => ({ at: line.at.toISOString(), text: line.text, said: line.said, districtId: line.district_id, channel: line.channel }));
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO reports (reporter_id, reported_id, reason, note, lines)
    VALUES (${reporterId}, ${reportedId}, ${reason}, ${note}, ${sql.json(copied as never)}) RETURNING id`;
  return Number(row!.id);
}
