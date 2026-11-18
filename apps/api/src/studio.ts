// The Estúdio's routes (Task 3.8): what staff may ask of the API. Every one of
// them is guarded "staff" and names the roles that may call it; every read of
// a player and everything done to one carries a reason, which is written to
// the audit log before the answer is given (Rule 16).
//
// Staff sign in with an address and a password (D-3.11: no second factor yet).
// A staff session is not a player's: it lasts a working day, and its token
// opens nothing in the game.

import { randomBytes } from "node:crypto";
import { lastLedgerAudit } from "@nzila/db";
import { audit, closeReport, closeStaffSession, lastAudit, liftSanction, namesOf, openReports, openStaffSession, playerForStaff, sanction, staffToSignIn } from "@nzila/db";
import { type Presence } from "@nzila/presence";
import { type FastifyInstance } from "fastify";
import { type Sql } from "postgres";
import { z } from "zod";
import { hashPassword, passwordMatches } from "./linking.ts";
import { Refusal, declare, type Gate } from "./routes.ts";

const nothing = z.strictObject({});
/** Why: asked of every read of a player and of everything done to one. A few words at least, so that it is a reason and not a dot. */
const reasonShape = z.string().trim().min(4).max(300);
/** A player is asked for by the number of their BI, or by their name. */
const playerKey = z.string().trim().min(2).max(40);

/** A hash nobody's password matches: a guess at an address with no account costs the same time as one at a real account. */
let nobody: Promise<string> | null = null;

export function studioRoutes(app: FastifyInstance, gate: Gate, deps: { sql: Sql; presence: Presence }): void {
  const { sql, presence } = deps;

  /** The player a key belongs to, as staff see them; the read is written down with its reason first. */
  const find = async (key: string, staffId: string, reason: string, kind = "player.read") => {
    const player = await playerForStaff(sql, key);
    if (!player) throw new Refusal(404, "not_found");
    await audit.log(sql, { actorKind: "staff", actorId: staffId, kind, subjectKind: "player", subjectId: player.id, reason });
    return player;
  };

  /** Where a player is at this moment, if a zone has them. */
  const whereNow = async (playerId: string): Promise<{ room: string; channel: number } | null> => {
    for (const zone of await presence.zones()) for (const room of zone.rooms) for (const channel of room.channels) if (channel.who?.includes(playerId)) return { room: room.name, channel: channel.number };
    return null;
  };

  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/login",
    guard: "public",
    body: z.strictObject({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) }),
    // Few: this door is tried by people who should not be at it.
    perMinute: 5,
    handler: async (body) => {
      const known = await staffToSignIn(sql, body.email);
      nobody ??= hashPassword(randomBytes(24).toString("base64"));
      const right = await passwordMatches(body.password, known?.passwordHash ?? (await nobody));
      if (!known || !right) throw new Refusal(401, "wrong");
      const token = randomBytes(32).toString("base64url");
      await openStaffSession(sql, known.id, token);
      await audit.log(sql, { actorKind: "staff", actorId: known.id, kind: "staff.signin", subjectKind: "staff", subjectId: known.id, reason: "signed in to the Estúdio" });
      return { token };
    },
  });

  declare(app, gate, {
    method: "GET",
    url: "/v1/staff/me",
    guard: "staff",
    roles: "any",
    body: nothing,
    perMinute: 120,
    handler: async (_body, caller) => ({ name: caller.staff.name, email: caller.staff.email, roles: caller.staff.roles }),
  });

  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/logout",
    guard: "staff",
    roles: "any",
    body: nothing,
    perMinute: 30,
    handler: async (_body, caller) => {
      await closeStaffSession(sql, caller.staffToken);
      return { ok: true };
    },
  });

  // ------------------------------------------------------------ Jogadores
  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/players/find",
    guard: "staff",
    roles: ["support", "moderador"],
    body: z.strictObject({ key: playerKey, reason: reasonShape }),
    perMinute: 60,
    handler: async (body, caller) => {
      const player = await find(body.key, caller.staff.id, body.reason);
      return { player: { ...player, now: await whereNow(player.id) } };
    },
  });

  // ------------------------------------------------------------ Canais
  declare(app, gate, {
    method: "GET",
    url: "/v1/staff/channels",
    guard: "staff",
    roles: ["live_ops", "moderador", "support"],
    body: nothing,
    perMinute: 120,
    handler: async () => {
      const zones = await presence.zones();
      const names = await namesOf(sql, zones.flatMap((zone) => zone.rooms.flatMap((room) => room.channels.flatMap((channel) => channel.who ?? []))));
      return {
        zones: zones.map((zone) => ({
          id: zone.id,
          rooms: zone.rooms.map((room) => ({
            name: room.name,
            channels: room.channels.map((channel) => ({
              number: channel.number,
              players: channel.players,
              meanMs: channel.meanMs ?? null,
              worstMs: channel.worstMs ?? null,
              who: (channel.who ?? []).map((id) => names.get(id) ?? { name: null, biNumber: null }),
            })),
          })),
        })),
      };
    },
  });

  // A player who is stuck is put out of their channel and comes in again at the district's door.
  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/channels/kick",
    guard: "staff",
    roles: ["live_ops", "moderador", "support"],
    body: z.strictObject({ key: playerKey, reason: reasonShape }),
    perMinute: 30,
    handler: async (body, caller) => {
      const player = await playerForStaff(sql, body.key);
      if (!player) throw new Refusal(404, "not_found");
      return { ok: true, sanction: await sanction(sql, { playerId: player.id, kind: "kick", reason: body.reason, staffId: caller.staff.id }) };
    },
  });

  // ------------------------------------------------------------ Moderação
  declare(app, gate, {
    method: "GET",
    url: "/v1/staff/reports",
    guard: "staff",
    roles: ["moderador"],
    body: nothing,
    perMinute: 120,
    handler: async () => ({ reports: await openReports(sql) }),
  });

  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/reports/close",
    guard: "staff",
    roles: ["moderador"],
    body: z.strictObject({ id: z.number().int().positive(), outcome: reasonShape }),
    perMinute: 60,
    handler: async (body, caller) => {
      if (!(await closeReport(sql, body.id, caller.staff.id, body.outcome))) throw new Refusal(404, "not_found");
      return { ok: true };
    },
  });

  // Mute, suspend, ban. How long is said in hours, from one to a year; a ban has no end and says none.
  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/sanctions",
    guard: "staff",
    roles: ["moderador"],
    body: z.strictObject({ key: playerKey, kind: z.enum(["mute", "suspend", "ban"]), reason: reasonShape, hours: z.number().min(1).max(8760).optional(), reportId: z.number().int().positive().optional() }),
    perMinute: 30,
    handler: async (body, caller) => {
      if ((body.kind === "ban") !== (body.hours === undefined)) throw new Refusal(400, "invalid");
      const player = await playerForStaff(sql, body.key);
      if (!player) throw new Refusal(404, "not_found");
      const id = await sanction(sql, { playerId: player.id, kind: body.kind, reason: body.reason, staffId: caller.staff.id, ...(body.hours === undefined ? {} : { hours: body.hours }), ...(body.reportId === undefined ? {} : { reportId: body.reportId }) });
      return { ok: true, sanction: id };
    },
  });

  declare(app, gate, {
    method: "POST",
    url: "/v1/staff/sanctions/lift",
    guard: "staff",
    roles: ["moderador"],
    body: z.strictObject({ id: z.number().int().positive(), reason: reasonShape }),
    perMinute: 30,
    handler: async (body, caller) => {
      if (!(await liftSanction(sql, body.id, caller.staff.id, body.reason))) throw new Refusal(404, "not_found");
      return { ok: true };
    },
  });

  // ------------------------------------------------------------ Registo
  // What staff have done, newest first. Anyone on the staff may read it: the log is how staff are watched too.
  declare(app, gate, {
    method: "GET",
    url: "/v1/staff/audit",
    guard: "staff",
    roles: "any",
    body: nothing,
    perMinute: 60,
    // With it: whether the books balanced the last time they were proved. Everyone on the staff should see that.
    handler: async () => ({ entries: await lastAudit(sql), ledger: await lastLedgerAudit(sql) }),
  });
}
