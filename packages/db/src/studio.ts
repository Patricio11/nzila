// What the Estúdio reads and writes (Task 3.8): staff and their sessions, what
// is done to a player (mute, suspend, ban, kick) and the queue of reports.
//
// The zone reads sanctions too, to carry them out: the API writes a row, and
// within a few seconds the zone that has the player acts on it. Nothing here
// is done without a reason, and whatever changes a player's standing writes
// its audit row in the same transaction: both or neither (Rule 16).

import { type Sql } from "postgres";
import { audit } from "./audit.ts";
import { hashToken } from "./sessions.ts";

export const STAFF_ROLES = ["moderador", "live_ops", "economy", "world_builder", "support", "platform_admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** A staff session lasts a working day and is not kept alive by use: staff sign in every morning. */
export const STAFF_SESSION_HOURS = 12;

export interface StaffMember {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly StaffRole[];
}

/** Makes a staff account, or gives an existing one (by its address) a new password and more roles. The hash is made by the caller. */
export async function putStaff(sql: Sql, who: { email: string; name: string; passwordHash: string; roles: readonly StaffRole[] }): Promise<string> {
  const email = who.email.trim().toLowerCase();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO staff (email, name, password_hash) VALUES (${email}, ${who.name.trim()}, ${who.passwordHash})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, status = 'active' RETURNING id`;
    for (const role of who.roles) await tx`INSERT INTO staff_roles (staff_id, role) VALUES (${row!.id}, ${role}) ON CONFLICT DO NOTHING`;
    // A new password ends whatever was open under the old one.
    await tx`UPDATE staff_sessions SET revoked_at = now() WHERE staff_id = ${row!.id} AND revoked_at IS NULL`;
    return row!.id;
  });
}

/** What signing in is checked against: null for nobody, for a disabled account, and for one with no password. */
export async function staffToSignIn(sql: Sql, email: string): Promise<{ id: string; passwordHash: string } | null> {
  const [row] = await sql<{ id: string; password_hash: string | null }[]>`
    SELECT id, password_hash FROM staff WHERE email = ${email.trim().toLowerCase()} AND status = 'active'`;
  return row?.password_hash ? { id: row.id, passwordHash: row.password_hash } : null;
}

export async function openStaffSession(sql: Sql, staffId: string, token: string): Promise<void> {
  await sql`INSERT INTO staff_sessions (staff_id, token_hash, expires_at) VALUES (${staffId}, ${hashToken(token)}, now() + make_interval(hours => ${STAFF_SESSION_HOURS}))`;
}

/** The staff member a token belongs to, with their roles; null for a token that is unknown, ended or too old, or an account switched off. */
export async function staffOfSession(sql: Sql, token: string): Promise<StaffMember | null> {
  const [row] = await sql<{ id: string; email: string; name: string; roles: StaffRole[] }[]>`
    SELECT s.id, s.email, s.name, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
    FROM staff_sessions t JOIN staff s ON s.id = t.staff_id LEFT JOIN staff_roles r ON r.staff_id = s.id
    WHERE t.token_hash = ${hashToken(token)} AND t.revoked_at IS NULL AND t.expires_at > now() AND s.status = 'active'
    GROUP BY s.id`;
  return row ? { id: row.id, email: row.email, name: row.name, roles: row.roles } : null;
}

export async function closeStaffSession(sql: Sql, token: string): Promise<void> {
  await sql`UPDATE staff_sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

// ------------------------------------------------------------------ sanctions

export const SANCTION_KINDS = ["mute", "suspend", "ban", "kick"] as const;
export type SanctionKind = (typeof SANCTION_KINDS)[number];

/** A kick is acted on by the zone within this long of being made, and is nothing after it. */
export const KICK_LIVES_S = 30;

export interface Sanction {
  readonly id: number;
  readonly playerId: string;
  readonly kind: SanctionKind;
  /** When it ends, as a time; null for a ban and a kick. */
  readonly until: string | null;
}

/**
 * What stands against each of these players now: sanctions not lifted and not over, and kicks made a moment ago.
 * One question for a whole channel: the zone asks it every few seconds.
 */
export async function standingAgainst(sql: Sql, playerIds: readonly string[]): Promise<Sanction[]> {
  if (playerIds.length === 0) return [];
  const rows = await sql<{ id: string; player_id: string; kind: SanctionKind; until: Date | null }[]>`
    SELECT id, player_id, kind, until FROM sanctions
    WHERE player_id IN ${sql(playerIds)} AND lifted_at IS NULL
      AND ((kind = 'kick' AND at > now() - make_interval(secs => ${KICK_LIVES_S})) OR (kind <> 'kick' AND (until IS NULL OR until > now())))
    ORDER BY id`;
  return rows.map((row) => ({ id: Number(row.id), playerId: row.player_id, kind: row.kind, until: row.until?.toISOString() ?? null }));
}

/** Whether a player is kept out of every street (suspended or banned), and until when; null when they are not. */
export async function keptOut(sql: Sql, playerId: string): Promise<{ kind: "suspend" | "ban"; until: string | null } | null> {
  const standing = await standingAgainst(sql, [playerId]);
  const ban = standing.find((one) => one.kind === "ban");
  if (ban) return { kind: "ban", until: null };
  const suspensions = standing.filter((one) => one.kind === "suspend").map((one) => one.until!).sort();
  return suspensions.length > 0 ? { kind: "suspend", until: suspensions[suspensions.length - 1]! } : null;
}

export interface NewSanction {
  readonly playerId: string;
  readonly kind: SanctionKind;
  readonly reason: string;
  readonly staffId: string;
  /** How long a mute or a suspension lasts. Not given for a ban or a kick. */
  readonly hours?: number;
  readonly reportId?: number;
}

/** Does something to a player, and writes that it was done: both or neither. Gives back the sanction's number. */
export async function sanction(sql: Sql, what: NewSanction): Promise<number> {
  const timed = what.kind === "mute" || what.kind === "suspend";
  if (timed && !(what.hours !== undefined && what.hours > 0)) throw new Error(`sanction: a ${what.kind} needs how long it lasts`);
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; until: Date | null }[]>`
      INSERT INTO sanctions (player_id, kind, reason, staff_id, until, report_id)
      VALUES (${what.playerId}, ${what.kind}, ${what.reason.trim()}, ${what.staffId}, ${timed ? tx`now() + make_interval(mins => ${Math.round(what.hours! * 60)})` : null}, ${what.reportId ?? null})
      RETURNING id, until`;
    await audit.log(tx as unknown as Sql, {
      actorKind: "staff",
      actorId: what.staffId,
      kind: `player.${what.kind}`,
      subjectKind: "player",
      subjectId: what.playerId,
      reason: what.reason,
      meta: { sanction: Number(row!.id), until: row!.until?.toISOString() ?? null, ...(what.reportId === undefined ? {} : { report: what.reportId }) },
    });
    return Number(row!.id);
  });
}

/** Takes a sanction back, with why. False when there is no such sanction still standing. */
export async function liftSanction(sql: Sql, id: number, staffId: string, reason: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ player_id: string; kind: string }[]>`
      UPDATE sanctions SET lifted_at = now(), lifted_by = ${staffId}, lift_reason = ${reason.trim()}
      WHERE id = ${id} AND lifted_at IS NULL AND kind <> 'kick' RETURNING player_id, kind`;
    if (!row) return false;
    await audit.log(tx as unknown as Sql, { actorKind: "staff", actorId: staffId, kind: `player.${row.kind}.lift`, subjectKind: "player", subjectId: row.player_id, reason, meta: { sanction: id } });
    return true;
  });
}

// --------------------------------------------------------------------- reports

export interface QueuedReport {
  readonly id: number;
  readonly at: string;
  readonly reason: string;
  readonly note: string | null;
  readonly lines: unknown;
  readonly reporter: { name: string | null; biNumber: string | null };
  readonly reported: { name: string | null; biNumber: string | null };
  /** How many reports are open against the same player, this one among them. */
  readonly against: number;
}

/** The reports nobody has answered, oldest first: whoever waited longest is read first. */
export async function openReports(sql: Sql, limit = 50): Promise<QueuedReport[]> {
  const rows = await sql<{ id: string; at: Date; reason: string; note: string | null; lines: unknown; reporter_name: string | null; reporter_bi: string | null; reported_name: string | null; reported_bi: string | null; against: number }[]>`
    SELECT r.id, r.at, r.reason, r.note, r.lines, a.name AS reporter_name, a.bi_number AS reporter_bi, b.name AS reported_name, b.bi_number AS reported_bi,
           (SELECT count(*)::int FROM reports o WHERE o.reported_id = r.reported_id AND o.status = 'open') AS against
    FROM reports r JOIN players a ON a.id = r.reporter_id JOIN players b ON b.id = r.reported_id
    WHERE r.status = 'open' ORDER BY r.at, r.id LIMIT ${limit}`;
  return rows.map((row) => ({
    id: Number(row.id),
    at: row.at.toISOString(),
    reason: row.reason,
    note: row.note,
    lines: row.lines,
    reporter: { name: row.reporter_name, biNumber: row.reporter_bi },
    reported: { name: row.reported_name, biNumber: row.reported_bi },
    against: row.against,
  }));
}

/** Closes a report with what was done about it. False when it is not there or already closed. */
export async function closeReport(sql: Sql, id: number, staffId: string, outcome: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ reported_id: string }[]>`
      UPDATE reports SET status = 'closed', closed_at = now(), closed_by = ${staffId}, outcome = ${outcome.trim()}
      WHERE id = ${id} AND status = 'open' RETURNING reported_id`;
    if (!row) return false;
    await audit.log(tx as unknown as Sql, { actorKind: "staff", actorId: staffId, kind: "report.close", subjectKind: "report", subjectId: String(id), reason: outcome, meta: { reported: row.reported_id } });
    return true;
  });
}

// --------------------------------------------------------------------- a player, as staff see them

export interface PlayerForStaff {
  readonly id: string;
  readonly name: string | null;
  readonly biNumber: string | null;
  readonly kind: string;
  readonly status: string;
  readonly ageBand: string | null;
  readonly arrivedAt: string;
  readonly bairro: string | null;
  readonly districtId: string | null;
  readonly sanctions: { id: number; at: string; kind: string; reason: string; until: string | null; by: string; lifted: boolean; standing: boolean }[];
  readonly reportsAgainst: number;
  readonly reportsMade: number;
  readonly lines: { at: string; text: string; said: boolean; districtId: string; channel: number }[];
}

/**
 * A player found by the number of their BI, or by their name: what a moderator needs to judge a report and what
 * support needs to see where someone is. Not their address, their number, their device or their family's trade.
 * The caller writes the audit row: this is a read of a player's data.
 */
export async function playerForStaff(sql: Sql, key: string): Promise<PlayerForStaff | null> {
  const asked = key.trim();
  const [row] = await sql<{ id: string; name: string | null; bi_number: string | null; kind: string; status: string; age_band: string | null; arrived_at: Date; district_id: string | null; bairro: string | null }[]>`
    SELECT p.id, p.name, p.bi_number, p.kind, p.status, p.age_band, p.arrived_at, p.district_id, o.bairro
    FROM players p LEFT JOIN player_origins o ON o.player_id = p.id
    WHERE p.status <> 'deleted' AND (p.bi_number = ${asked} OR lower(p.name) = ${asked.toLowerCase()})
    ORDER BY (p.bi_number = ${asked}) DESC LIMIT 1`;
  if (!row) return null;
  const sanctions = await sql<{ id: string; at: Date; kind: string; reason: string; until: Date | null; by: string; lifted: boolean; standing: boolean }[]>`
    SELECT s.id, s.at, s.kind, s.reason, s.until, f.name AS by, s.lifted_at IS NOT NULL AS lifted,
           (s.lifted_at IS NULL AND s.kind <> 'kick' AND (s.until IS NULL OR s.until > now())) AS standing
    FROM sanctions s JOIN staff f ON f.id = s.staff_id WHERE s.player_id = ${row.id} ORDER BY s.at DESC, s.id DESC LIMIT 30`;
  const [counts] = await sql<{ against: number; made: number }[]>`
    SELECT (SELECT count(*)::int FROM reports WHERE reported_id = ${row.id}) AS against, (SELECT count(*)::int FROM reports WHERE reporter_id = ${row.id}) AS made`;
  const lines = await sql<{ at: Date; text: string; said: boolean; district_id: string; channel: number }[]>`
    SELECT at, text, said, district_id, channel FROM chat_lines WHERE player_id = ${row.id} ORDER BY at DESC, id DESC LIMIT 30`;
  return {
    id: row.id,
    name: row.name,
    biNumber: row.bi_number,
    kind: row.kind,
    status: row.status,
    ageBand: row.age_band,
    arrivedAt: row.arrived_at.toISOString(),
    bairro: row.bairro,
    districtId: row.district_id,
    sanctions: sanctions.map((one) => ({ id: Number(one.id), at: one.at.toISOString(), kind: one.kind, reason: one.reason, until: one.until?.toISOString() ?? null, by: one.by, lifted: one.lifted, standing: one.standing })),
    reportsAgainst: counts!.against,
    reportsMade: counts!.made,
    lines: lines.map((line) => ({ at: line.at.toISOString(), text: line.text, said: line.said, districtId: line.district_id, channel: line.channel })),
  };
}

/** The names and BI numbers of these players, for a list of who is in a channel. */
export async function namesOf(sql: Sql, playerIds: readonly string[]): Promise<Map<string, { name: string | null; biNumber: string | null }>> {
  if (playerIds.length === 0) return new Map();
  const rows = await sql<{ id: string; name: string | null; bi_number: string | null }[]>`SELECT id, name, bi_number FROM players WHERE id IN ${sql(playerIds)}`;
  return new Map(rows.map((row) => [row.id, { name: row.name, biNumber: row.bi_number }]));
}

/** The last things staff did, newest first, with who did them. */
export async function lastAudit(sql: Sql, limit = 100): Promise<{ at: string; by: string; kind: string; subject: string; reason: string }[]> {
  const rows = await sql<{ at: Date; by: string | null; actor_id: string; kind: string; subject_kind: string; subject_id: string; reason: string; subject_name: string | null }[]>`
    SELECT a.at, f.name AS by, a.actor_id, a.kind, a.subject_kind, a.subject_id, a.reason, p.bi_number AS subject_name
    FROM audit_log a LEFT JOIN staff f ON f.id::text = a.actor_id LEFT JOIN players p ON a.subject_kind = 'player' AND p.id::text = a.subject_id
    WHERE a.actor_kind = 'staff' ORDER BY a.at DESC, a.id DESC LIMIT ${limit}`;
  return rows.map((row) => ({ at: row.at.toISOString(), by: row.by ?? row.actor_id, kind: row.kind, subject: row.subject_name ?? `${row.subject_kind} ${row.subject_id}`, reason: row.reason }));
}
