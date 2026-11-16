// The API. Stateless: everything it knows is in the database. Every route is
// declared through `declare` (routes.ts), which guards it, limits it and
// checks what it is given.

import { randomInt } from "node:crypto";
import { type Keyring } from "@nzila/db";
import { recordConsent } from "@nzila/db";
import { BASE_ORIGINS, type OriginTable } from "@nzila/economy";
import { checkLook } from "@nzila/protocol";
import Fastify, { type FastifyInstance } from "fastify";
import { type Sql } from "postgres";
import { z } from "zod";
import { memoryLimiter, type Limiter } from "./limiter.ts";
import { consoleSender, linkEmail, linkPhone, sendCode, signIn, signInEmail, type CodeSender } from "./linking.ts";
import { choicesOf, deleteAccount, exportOf } from "./mydata.ts";
import { askName, FREE_NAME_CHANGES, loadNameFilter, rename } from "./names.ts";
import { dealOrigin, originOfPlayer } from "./origins.ts";
import { Refusal, declare, routesOf, type Gate } from "./routes.ts";
import { createGuest, playerOfToken, revokeSession } from "./sessions.ts";

export interface Deps {
  readonly sql: Sql;
  /** The secret that keys the hash of a device id (HASH_PEPPER). */
  readonly pepper: Uint8Array;
  /** The keys personal fields are encrypted with (FIELD_KEYS). */
  readonly keyring: Keyring;
  readonly limiter?: Limiter;
  /** Who sends one-time codes, and how a code is made: the console and the server's dice unless a test brings others. */
  readonly sender?: CodeSender;
  readonly newCode?: () => string;
  /** The table a card of origin is drawn from, and the dice: the game's own unless a test brings others. */
  readonly origins?: OriginTable;
  readonly roll?: () => number;
}

const DICE = 2 ** 32;

const nothing = z.strictObject({});

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });
  const limiter = deps.limiter ?? memoryLimiter();
  const origins = deps.origins ?? BASE_ORIGINS;
  const roll = deps.roll ?? (() => randomInt(DICE) / DICE);
  const names = loadNameFilter();
  const sender = deps.sender ?? consoleSender;
  const newCode = deps.newCode ?? (() => String(randomInt(1_000_000)).padStart(6, "0"));
  const phoneShape = z.string().min(7).max(24);
  const codeShape = z.string().regex(/^\d{6}$/);
  const deviceShape = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
  const platformShape = z.enum(["android", "ios", "desktop"]).optional();
  const gate: Gate = {
    allow: (key, perMinute) => limiter.allow(key, perMinute),
    async playerOf(request) {
      const header = request.headers.authorization ?? "";
      const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header)?.[1];
      return token ? playerOfToken(deps.sql, token) : null;
    },
  };

  // No route gets in by another door: one without a guard stops the app from being built.
  app.addHook("onRoute", (route) => {
    if (!route.config?.guard) throw new Error(`${String(route.method)} ${route.url} was registered without a guard: use declare()`);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Refusal) return reply.status(error.status).send({ error: error.code });
    const status = (error as { statusCode?: number }).statusCode;
    // Something of the caller that Fastify itself refused (a body too large, bad JSON).
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: "invalid" });
    return reply.status(500).send({ error: "failed" });
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: "not_found" }));

  declare(app, gate, {
    method: "GET",
    url: "/health",
    guard: "public",
    body: nothing,
    perMinute: 600,
    handler: async () => ({ ok: true }),
  });

  // First open on a device: a guest is made. Nothing personal is asked or kept (Rule 16).
  declare(app, gate, {
    method: "POST",
    url: "/v1/guests",
    guard: "public",
    // The random id the client made for this device and keeps; only its keyed hash is stored.
    // The age band is worked out on the phone from the year of birth, which never leaves it (Task 2.6).
    body: z.strictObject({ deviceId: deviceShape, platform: platformShape, ageBand: z.enum(["15_17", "18_plus"]) }),
    // Few: an address that makes guests by the dozen is not the phone of a family.
    perMinute: 6,
    handler: async (body, _caller, reply) => {
      const guest = await createGuest(deps.sql, deps.pepper, body.deviceId, body.platform ?? null, body.ageBand);
      void reply.status(201);
      return { ...guest, ageBand: body.ageBand };
    },
  });

  declare(app, gate, {
    method: "GET",
    url: "/v1/me",
    guard: "player",
    body: nothing,
    perMinute: 120,
    handler: async (_body, caller) => {
      const [me] = await deps.sql<{ id: string; kind: string; name: string | null; bi_number: string | null; name_changes: number; age_band: string | null; arrived_at: Date }[]>`
        SELECT id, kind, name, bi_number, name_changes, age_band, arrived_at FROM players WHERE id = ${caller.player.id}`;
      const [avatar] = await deps.sql<{ spec: unknown }[]>`SELECT spec FROM avatars WHERE player_id = ${caller.player.id}`;
      return {
        id: me!.id,
        kind: me!.kind,
        name: me!.name,
        // Whether the name can still be changed for nothing.
        nameFree: me!.name_changes < FREE_NAME_CHANGES,
        biNumber: me!.bi_number,
        ageBand: me!.age_band,
        arrivedAt: me!.arrived_at.toISOString(),
        // Read back through the catalogue: a look the wardrobe no longer has is no look, and the player chooses again.
        look: checkLook(avatar?.spec),
        origin: await originOfPlayer(deps.sql, origins, caller.player.id),
      };
    },
  });

  // The name on the BI. Asked about while it is typed, then taken: the answer is one word either way.
  declare(app, gate, {
    method: "POST",
    url: "/v1/names/check",
    guard: "player",
    body: z.strictObject({ name: z.string().max(64) }),
    perMinute: 90,
    handler: async (body, caller) => ({ answer: await askName(deps.sql, names, caller.player.id, body.name) }),
  });
  declare(app, gate, {
    method: "PUT",
    url: "/v1/me/name",
    guard: "player",
    body: z.strictObject({ name: z.string().max(64) }),
    perMinute: 12,
    handler: async (body, caller) => rename(deps.sql, names, caller.player.id, body.name),
  });

  // How the player looks (D-2.1): the client proposes, and only what the wardrobe has is recorded.
  declare(app, gate, {
    method: "PUT",
    url: "/v1/me/look",
    guard: "player",
    body: z.strictObject({ look: z.unknown() }),
    perMinute: 30,
    handler: async (body, caller) => {
      const look = checkLook(body.look);
      if (!look) throw new Refusal(400, "invalid");
      await deps.sql`
        INSERT INTO avatars (player_id, spec) VALUES (${caller.player.id}, ${deps.sql.json(look as never)})
        ON CONFLICT (player_id) DO UPDATE SET spec = EXCLUDED.spec, updated_at = now()`;
      return { look };
    },
  });

  // A lotaria da vida (D-0.44): the server deals the card, once. Asking again gives the same card.
  declare(app, gate, {
    method: "POST",
    url: "/v1/me/origin",
    guard: "player",
    body: nothing,
    perMinute: 12,
    handler: async (_body, caller) => ({ origin: await dealOrigin(deps.sql, origins, roll, caller.player.id) }),
  });

  // Saving the BI (Task 2.2). A code is sent to a number; with it a guest ties the account to the number,
  // or someone comes back into theirs on another phone. Asking for a code tells nothing about the number.
  declare(app, gate, {
    method: "POST",
    url: "/v1/codes",
    guard: "public",
    body: z.strictObject({ phone: phoneShape }),
    // Few, by address; and few by number, wherever they are asked from (linking.ts).
    perMinute: 5,
    handler: async (body) => {
      await sendCode(deps.sql, deps.pepper, sender, newCode, body.phone);
      return { ok: true };
    },
  });
  declare(app, gate, {
    method: "POST",
    url: "/v1/me/phone",
    guard: "player",
    body: z.strictObject({ phone: phoneShape, code: codeShape }),
    perMinute: 10,
    handler: async (body, caller) => {
      await linkPhone(deps.sql, deps.keyring, deps.pepper, caller.player.id, body.phone, body.code);
      return { kind: "linked" };
    },
  });
  declare(app, gate, {
    method: "POST",
    url: "/v1/signin/phone",
    guard: "public",
    body: z.strictObject({ phone: phoneShape, code: codeShape, deviceId: deviceShape, platform: platformShape }),
    perMinute: 10,
    handler: async (body) => signIn(deps.sql, deps.pepper, body.phone, body.code, body.deviceId, body.platform ?? null),
  });

  // The ordinary way: an email address and a password. The same player, linked; and the way back in on another phone.
  declare(app, gate, {
    method: "POST",
    url: "/v1/me/email",
    guard: "player",
    body: z.strictObject({ email: z.string().max(254), password: z.string().max(512) }),
    perMinute: 6,
    handler: async (body, caller) => {
      await linkEmail(deps.sql, deps.keyring, deps.pepper, caller.player.id, body.email, body.password);
      return { kind: "linked" };
    },
  });
  declare(app, gate, {
    method: "POST",
    url: "/v1/signin/email",
    guard: "public",
    body: z.strictObject({ email: z.string().max(254), password: z.string().max(512), deviceId: deviceShape, platform: platformShape }),
    // Few by address; and five wrong guesses close the account itself for a while (linking.ts).
    perMinute: 10,
    handler: async (body) => signInEmail(deps.sql, deps.pepper, body.email, body.password, body.deviceId, body.platform ?? null),
  });

  // What the player agrees to, of the things that can be said no to. Both are off until they say yes (Rule 16).
  declare(app, gate, {
    method: "GET",
    url: "/v1/me/consents",
    guard: "player",
    body: nothing,
    perMinute: 60,
    handler: async (_body, caller) => choicesOf(deps.sql, caller.player.id),
  });
  declare(app, gate, {
    method: "PUT",
    url: "/v1/me/consents",
    guard: "player",
    // Playing itself is not on this list: it is agreed to by coming in and ended by deleting the account.
    body: z.strictObject({ purpose: z.enum(["analytics", "notifications"]), granted: z.boolean() }),
    perMinute: 30,
    handler: async (body, caller) => {
      await recordConsent(deps.sql, caller.player.id, body.purpose, body.granted);
      return choicesOf(deps.sql, caller.player.id);
    },
  });

  // "Os meus dados": everything kept of the player, as they may read it; and the end of the account.
  declare(app, gate, {
    method: "GET",
    url: "/v1/me/data",
    guard: "player",
    body: nothing,
    perMinute: 6,
    handler: async (_body, caller) => exportOf(deps.sql, origins, caller.player.id),
  });
  declare(app, gate, {
    method: "DELETE",
    url: "/v1/me",
    guard: "player",
    body: z.strictObject({ biNumber: z.string().max(32) }),
    perMinute: 6,
    handler: async (body, caller) => {
      await deleteAccount(deps.sql, caller.player.id, body.biNumber);
      return { ok: true };
    },
  });

  // Leaving on this device: the session ends; the player and their progress stay.
  declare(app, gate, {
    method: "DELETE",
    url: "/v1/session",
    guard: "player",
    body: nothing,
    perMinute: 30,
    handler: async (_body, caller) => {
      await revokeSession(deps.sql, caller.player.sessionId);
      return { ok: true };
    },
  });

  return app;
}

export { routesOf };
