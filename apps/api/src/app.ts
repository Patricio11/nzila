// The API. Stateless: everything it knows is in the database. Every route is
// declared through `declare` (routes.ts), which guards it, limits it and
// checks what it is given.

import { randomInt } from "node:crypto";
import { BASE_ORIGINS, type OriginTable } from "@nzila/economy";
import { checkLook } from "@nzila/protocol";
import Fastify, { type FastifyInstance } from "fastify";
import { type Sql } from "postgres";
import { z } from "zod";
import { memoryLimiter, type Limiter } from "./limiter.ts";
import { askName, FREE_NAME_CHANGES, loadNameFilter, rename } from "./names.ts";
import { dealOrigin, originOfPlayer } from "./origins.ts";
import { Refusal, declare, routesOf, type Gate } from "./routes.ts";
import { createGuest, playerOfToken, revokeSession } from "./sessions.ts";

export interface Deps {
  readonly sql: Sql;
  /** The secret that keys the hash of a device id (HASH_PEPPER). */
  readonly pepper: Uint8Array;
  readonly limiter?: Limiter;
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
    body: z.strictObject({ deviceId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/), platform: z.enum(["android", "ios", "desktop"]).optional(), ageBand: z.enum(["15_17", "18_plus"]) }),
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
