// How a route is declared. Every route of the API goes through `declare`,
// which is where the two things no route may be without are put on it: a
// guard (who may call it) and a shape (what it accepts, checked with Zod
// before the handler sees anything). A route registered any other way is
// refused when the app is built, and a test walks the list.
//
// The client proposes, the API records: a handler is never handed anything
// that was not checked.

import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { type z } from "zod";

/** Who may call a route. "public" must be chosen on purpose and is rate limited by address. */
export type Guard = "public" | "player" | "staff";

export interface Player {
  readonly id: string;
  readonly kind: "guest" | "linked";
  readonly sessionId: string;
}

/** A member of staff, as the Estúdio's session says who they are. */
export interface Staff {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly string[];
}

/** The role that may do anything any other role may. */
export const ADMIN_ROLE = "platform_admin";

export interface Caller {
  /** The player, on a route guarded "player". */
  readonly player: Player;
  /** The member of staff and the token they came with, on a route guarded "staff". */
  readonly staff: Staff;
  readonly staffToken: string;
  /** The address the request came from, for rate limits. */
  readonly address: string;
}

export interface RouteSpec<B extends z.ZodType, R> {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly url: string;
  readonly guard: Guard;
  /** On a route guarded "staff": the roles that may call it (the platform admin always may), or "any" for anyone on the staff. */
  readonly roles?: readonly string[] | "any";
  /** The shape of the body. A route with no body gives the shape of an empty object. */
  readonly body: B;
  /** How many calls a minute one caller may make (a player, or an address on a public route). */
  readonly perMinute: number;
  handler(body: z.infer<B>, caller: Caller, reply: FastifyReply): Promise<R>;
}

/** What the app gives `declare` so that it can guard a route: who is calling, and whether they have called too often. */
export interface Gate {
  playerOf(request: FastifyRequest): Promise<Player | null>;
  staffOf(request: FastifyRequest): Promise<{ staff: Staff; token: string } | null>;
  allow(key: string, perMinute: number): boolean;
}

/** An answer that is an error the caller can act on. The code is a word, never a sentence: the client has the words. */
export class Refusal extends Error {
  readonly status: number;
  readonly code: string;
  /** What else the caller is told with the code: facts, never sentences. */
  readonly more: Readonly<Record<string, unknown>>;
  constructor(status: number, code: string, more: Readonly<Record<string, unknown>> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.more = more;
  }
}

export interface Declared {
  readonly method: string;
  readonly url: string;
  readonly guard: Guard;
}

const declared = new WeakMap<FastifyInstance, Declared[]>();

/** Every route `declare` has put on this app. */
export function routesOf(app: FastifyInstance): readonly Declared[] {
  return declared.get(app) ?? [];
}

export function declare<B extends z.ZodType, R>(app: FastifyInstance, gate: Gate, spec: RouteSpec<B, R>): void {
  // A staff route says who on the staff may call it, and no other route says anything of the kind.
  if ((spec.guard === "staff") !== (spec.roles !== undefined)) throw new Error(`${spec.method} ${spec.url}: a staff route names its roles, and only a staff route does`);
  const list = declared.get(app) ?? [];
  declared.set(app, list);
  list.push({ method: spec.method, url: spec.url, guard: spec.guard });
  app.route({
    method: spec.method,
    url: spec.url,
    config: { guard: spec.guard },
    handler: async (request, reply) => {
      const address = request.ip;
      let player: Player | null = null;
      let staff: { staff: Staff; token: string } | null = null;
      if (spec.guard === "staff") {
        staff = await gate.staffOf(request);
        if (!staff) throw new Refusal(401, "unauthenticated");
        const roles = spec.roles ?? [];
        if (roles !== "any" && !staff.staff.roles.includes(ADMIN_ROLE) && !roles.some((role) => staff!.staff.roles.includes(role))) throw new Refusal(403, "forbidden");
      }
      if (spec.guard === "player") {
        player = await gate.playerOf(request);
        if (!player) throw new Refusal(401, "unauthenticated");
      }
      if (!gate.allow(`${spec.method} ${spec.url} ${player?.id ?? staff?.staff.id ?? address}`, spec.perMinute)) throw new Refusal(429, "slow_down");
      const body = spec.body.safeParse(request.body ?? {});
      if (!body.success) throw new Refusal(400, "invalid");
      // On a public route there is no player; the handler of one never reads it.
      return spec.handler(body.data as z.infer<B>, { player: player as Player, staff: staff?.staff as Staff, staffToken: staff?.token ?? "", address }, reply);
    },
  });
}

declare module "fastify" {
  interface FastifyContextConfig {
    guard?: Guard;
  }
}
