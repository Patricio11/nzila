// "Os meus dados" (Task 2.6, Rule 16): what a player may ask of what the
// game keeps of them. To see all of it, as a file; and to have it deleted.
//
// Deleting follows docs/legal/RETENTION.md: the player's row stays, emptied
// of everything that says who they were, so that the ledger rows pointing at
// it stay valid and become anonymous. The devices, the sessions, the look
// and the card of origin go. The history of consents stays for its period:
// it is the proof that they agreed. The audit log records that it was done.

import { audit, blockedBy, consentsOf, statementOf, walletOf } from "@nzila/db";
import { accountId } from "@nzila/economy";
import { type OriginTable } from "@nzila/economy";
import { checkLook } from "@nzila/protocol";
import { type Sql } from "postgres";
import { originOfPlayer } from "./origins.ts";
import { Refusal } from "./routes.ts";

/** Everything the game keeps of one player, in words a person can read. Hashes are left out: they say nothing to their owner. */
export async function exportOf(sql: Sql, origins: OriginTable, playerId: string): Promise<Record<string, unknown>> {
  const [player] = await sql<{ kind: string; name: string | null; bi_number: string | null; name_changes: number; age_band: string | null; arrived_at: Date; district_id: string | null; by_phone: boolean; by_email: boolean }[]>`
    SELECT kind, name, bi_number, name_changes, age_band, arrived_at, district_id, phone_hash IS NOT NULL AS by_phone, email_hash IS NOT NULL AS by_email FROM players WHERE id = ${playerId}`;
  const [avatar] = await sql<{ spec: unknown; updated_at: Date }[]>`SELECT spec, updated_at FROM avatars WHERE player_id = ${playerId}`;
  const devices = await sql<{ platform: string | null; first_seen_at: Date; last_seen_at: Date }[]>`SELECT platform, first_seen_at, last_seen_at FROM devices WHERE player_id = ${playerId} ORDER BY first_seen_at`;
  const sessions = await sql<{ created_at: Date; last_seen_at: Date; expires_at: Date; revoked_at: Date | null }[]>`
    SELECT created_at, last_seen_at, expires_at, revoked_at FROM player_sessions WHERE player_id = ${playerId} ORDER BY created_at`;
  const consents = await sql<{ purpose: string; version: number; granted: boolean; at: Date }[]>`SELECT purpose, version, granted, at FROM consents WHERE player_id = ${playerId} ORDER BY at, id`;
  const lines = await sql<{ at: Date; text: string; said: boolean; district_id: string }[]>`SELECT at, text, said, district_id FROM chat_lines WHERE player_id = ${playerId} ORDER BY at, id`;
  const shutOut = await blockedBy(sql, playerId);
  const reported = await sql<{ at: Date; reason: string; note: string | null; status: string }[]>`SELECT at, reason, note, status FROM reports WHERE reporter_id = ${playerId} ORDER BY at, id`;
  const measures = await sql<{ at: Date; kind: string; reason: string; until: Date | null; lifted_at: Date | null }[]>`SELECT at, kind, reason, until, lifted_at FROM sanctions WHERE player_id = ${playerId} ORDER BY at, id`;
  await audit.log(sql, { actorKind: "player", actorId: playerId, kind: "player.export", subjectKind: "player", subjectId: playerId, reason: "the player asked for their data" });
  return {
    exportedAt: new Date().toISOString(),
    player: { id: playerId, kind: player!.kind, name: player!.name, biNumber: player!.bi_number, nameChanges: player!.name_changes, ageBand: player!.age_band, arrivedAt: player!.arrived_at, lastDistrict: player!.district_id },
    // How the BI was saved. The number and the address themselves are kept encrypted and are the player's own to know.
    savedWith: { phoneNumber: player!.by_phone, email: player!.by_email },
    look: avatar ? { ...checkLook(avatar.spec), updatedAt: avatar.updated_at } : null,
    origin: await originOfPlayer(sql, origins, playerId),
    consents: consents.map((row) => ({ purpose: row.purpose, version: row.version, granted: row.granted, at: row.at })),
    devices: devices.map((row) => ({ platform: row.platform, firstSeen: row.first_seen_at, lastSeen: row.last_seen_at })),
    sessions: sessions.map((row) => ({ opened: row.created_at, lastUsed: row.last_seen_at, expires: row.expires_at, ended: row.revoked_at })),
    // What they said in the street, kept thirty days for moderation; whom they shut out; what they reported
    // (what they wrote of it, not whom: that is the other player's to be told by a moderator, or not).
    said: lines.map((row) => ({ at: row.at, text: row.text, passedOn: row.said, district: row.district_id })),
    blocked: shutOut,
    reports: reported.map((row) => ({ at: row.at, reason: row.reason, note: row.note, status: row.status })),
    // What they hold, and every Makuta that came or went: the other side said as a kind, never as another player.
    wallet: await walletOf(sql, playerId),
    movements: [...(await statementOf(sql, accountId("player_cash", playerId), 500)).map((line) => ({ account: "carteira", ...line })), ...(await statementOf(sql, accountId("player_bank", playerId), 500)).map((line) => ({ account: "banco", ...line }))].map(
      (line) => ({ account: line.account, at: line.at, amount: line.amount, reason: line.reason, ref: line.ref, with: line.other.slice(0, line.other.indexOf(":")) }),
    ),
    // What the moderators did about them, and why they said they did it. Not which moderator.
    moderation: measures.map((row) => ({ at: row.at, kind: row.kind, reason: row.reason, until: row.until, lifted: row.lifted_at })),
  };
}

/** What a player agrees to now, of the things that can be said no to. */
export async function choicesOf(sql: Sql, playerId: string): Promise<{ analytics: boolean; notifications: boolean }> {
  const { analytics, notifications } = await consentsOf(sql, playerId);
  return { analytics, notifications };
}

/**
 * Deletes a player's account. `biNumber` must be their own: it is asked for so
 * that a request sent by mistake, or by a page that is not the game, deletes
 * nobody.
 */
export async function deleteAccount(sql: Sql, playerId: string, biNumber: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [player] = await tx<{ bi_number: string | null }[]>`SELECT bi_number FROM players WHERE id = ${playerId} FOR UPDATE`;
    if (!player || player.bi_number !== biNumber) throw new Refusal(409, "not_confirmed");
    await tx`DELETE FROM player_sessions WHERE player_id = ${playerId}`;
    await tx`DELETE FROM devices WHERE player_id = ${playerId}`;
    await tx`DELETE FROM avatars WHERE player_id = ${playerId}`;
    await tx`DELETE FROM player_origins WHERE player_id = ${playerId}`;
    // Whom they shut out, and who shut them out: nobody is left to hear. What they said stays its thirty days, and
    // what was reported stays with the moderators, under a player who is now nobody (docs/legal/RETENTION.md).
    await tx`DELETE FROM player_blocks WHERE player_id = ${playerId} OR blocked_id = ${playerId}`;
    await tx`
      UPDATE players SET status = 'deleted', deleted_at = now(), name = NULL, name_key = NULL, bi_number = NULL, age_band = NULL,
        home_district_id = NULL, province_id = NULL, district_id = NULL, x = NULL, y = NULL, z = NULL, phone_enc = NULL, phone_hash = NULL,
        email_enc = NULL, email_hash = NULL, password_hash = NULL, email_verified_at = NULL, signin_failures = 0, signin_locked_until = NULL
      WHERE id = ${playerId}`;
    await audit.log(tx as unknown as Sql, { actorKind: "player", actorId: playerId, kind: "player.delete", subjectKind: "player", subjectId: playerId, reason: "the player deleted their account" });
  });
}
