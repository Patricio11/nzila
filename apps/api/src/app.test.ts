// The API without a database: what can be proved about its shape alone.
// What needs PostgreSQL is in api.integration.test.ts.

import Fastify from "fastify";
import postgres from "postgres";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { buildApp, routesOf } from "./app.ts";
import { memoryLimiter } from "./limiter.ts";
import { declare, type Gate } from "./routes.ts";

// A pool that is never used: no route under test here reaches the database.
const sql = postgres("postgres://nobody@127.0.0.1:1/none", { max: 1 });
const pepper = new Uint8Array(32).fill(7);
const keyring = { current: 1, keys: new Map([[1, new Uint8Array(32).fill(8)]]) };
const app = () => buildApp({ sql, pepper, keyring });

describe("every route is guarded", () => {
  test("each route the app has was declared, with a guard, and the public ones are chosen on purpose", async () => {
    const built = app();
    await built.ready();
    const routes = routesOf(built);
    expect(routes.length).toBeGreaterThan(2);
    for (const route of routes) expect(["public", "player", "staff"], `${route.method} ${route.url}`).toContain(route.guard);
    // The list of what anyone may call without being a player. A new public route is added here on purpose or not at all.
    expect(routes.filter((route) => route.guard === "public").map((route) => `${route.method} ${route.url}`).sort()).toEqual(["GET /health", "POST /v1/codes", "POST /v1/guests", "POST /v1/password/forgot", "POST /v1/password/reset", "POST /v1/signin/email", "POST /v1/signin/phone", "POST /v1/staff/login"]);
    // And nothing reached Fastify by another door: what it prints is what was declared.
    const printed = built.printRoutes({ commonPrefix: false });
    for (const route of routes) expect(printed).toContain(route.url.split("/").pop()!);
    await built.close();
  });

  test("a route registered without a guard stops the app from being built", () => {
    const built = app();
    expect(() => built.get("/quiet", async () => ({}))).toThrow(/without a guard/);
  });

  test("a player's route refuses a caller with no token, a malformed one, and tells them nothing more", async () => {
    const built = app();
    for (const headers of [{}, { authorization: "Bearer short" }, { authorization: "Basic abcdefghijklmnopqrstuvwxyz" }]) {
      const res = await built.inject({ method: "GET", url: "/v1/me", headers });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "unauthenticated" });
    }
    await built.close();
  });
});

describe("what a route is given is checked before it is used", () => {
  test("a body of the wrong shape, with extra fields, too large, or not JSON is refused", async () => {
    // More bad bodies than one address may send in a minute: the limit has its own test.
    const built = buildApp({ sql, pepper, keyring, limiter: { allow: () => true } });
    const post = (payload: string) => built.inject({ method: "POST", url: "/v1/guests", headers: { "content-type": "application/json" }, payload });
    const good = { deviceId: "a".repeat(24), ageBand: "18_plus" };
    // Among them: no age band, the band of someone too young to have one, and a year of birth, which is never sent.
    for (const payload of ["{}", JSON.stringify({ ...good, deviceId: "short" }), JSON.stringify({ ...good, admin: true }), JSON.stringify({ ...good, platform: "fridge" }), JSON.stringify({ deviceId: good.deviceId }), JSON.stringify({ ...good, ageBand: "under_15" }), JSON.stringify({ ...good, birthYear: 1990 }), "{not json", JSON.stringify({ ...good, deviceId: "a".repeat(40_000) })]) {
      const res = await post(payload);
      expect(res.statusCode, payload.slice(0, 40)).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
      expect(res.json()).toEqual({ error: "invalid" });
    }
    await built.close();
  });

  test("an unknown address is not found, in the same plain shape", async () => {
    const built = app();
    const res = await built.inject({ method: "GET", url: "/v1/nothing" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    await built.close();
  });
});

describe("rate limits", () => {
  test("a caller is told to slow down past the limit, and may go on in the next minute", async () => {
    let now = 1_000_000;
    const built = buildApp({ sql, pepper, keyring, limiter: memoryLimiter(() => now) });
    const health = () => built.inject({ method: "GET", url: "/health" });
    for (let i = 0; i < 600; i++) expect((await health()).statusCode).toBe(200);
    const refused = await health();
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: "slow_down" });
    now += 60_000;
    expect((await health()).statusCode).toBe(200);
    await built.close();
  });

  test("the limiter counts each key apart, a limit of nothing lets nobody through, and old windows are swept", () => {
    let now = 0;
    const limiter = memoryLimiter(() => now);
    expect(limiter.allow("a", 1)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
    expect(limiter.allow("b", 1)).toBe(true);
    expect(limiter.allow("c", 0)).toBe(false);
    for (let i = 0; i < 50_010; i++) limiter.allow(`k${i}`, 1);
    now = 120_000;
    expect(limiter.allow("fresh", 1)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(true);
  });
});

test("a staff route passes nobody who is not staff, nor staff without one of its roles; and a handler that fails says only that it failed", async () => {
  const built = Fastify();
  let roles: string[] | null = null;
  const gate: Gate = { playerOf: async () => null, staffOf: async () => (roles ? { staff: { id: "s", email: "s@x", name: "S", roles }, token: "t" } : null), allow: () => true };
  built.setErrorHandler((error, _request, reply) => reply.status((error as { status?: number }).status ?? 500).send({ error: (error as { code?: string }).code ?? "failed" }));
  declare(built, gate, { method: "GET", url: "/staff", guard: "staff", roles: ["moderador"], body: z.strictObject({}), perMinute: 10, handler: async (_body, caller) => ({ who: caller.staff.name }) });
  declare(built, gate, { method: "GET", url: "/staff/any", guard: "staff", roles: "any", body: z.strictObject({}), perMinute: 10, handler: async () => ({ ok: true }) });
  // A staff route with no roles named, and roles on a route that is not for staff, do not get built at all.
  expect(() => declare(built, gate, { method: "GET", url: "/x", guard: "staff", body: z.strictObject({}), perMinute: 10, handler: async () => ({}) })).toThrow(/names its roles/);
  expect(() => declare(built, gate, { method: "GET", url: "/y", guard: "public", roles: "any", body: z.strictObject({}), perMinute: 10, handler: async () => ({}) })).toThrow(/names its roles/);
  declare(built, gate, { method: "GET", url: "/broken", guard: "public", body: z.strictObject({}), perMinute: 10, handler: async () => Promise.reject(new Error("secret detail")) });
  expect((await built.inject({ method: "GET", url: "/staff" })).json()).toEqual({ error: "unauthenticated" });
  roles = ["support"];
  expect((await built.inject({ method: "GET", url: "/staff" })).json()).toEqual({ error: "forbidden" });
  expect((await built.inject({ method: "GET", url: "/staff/any" })).json()).toEqual({ ok: true });
  roles = ["moderador"];
  expect((await built.inject({ method: "GET", url: "/staff" })).json()).toEqual({ who: "S" });
  // The platform admin may do what any role may.
  roles = ["platform_admin"];
  expect((await built.inject({ method: "GET", url: "/staff" })).json()).toEqual({ who: "S" });
  const broken = await built.inject({ method: "GET", url: "/broken" });
  expect(broken.statusCode).toBe(500);
  expect(broken.body).not.toContain("secret");
  await built.close();

  // The same through the app's own error handler.
  const whole = app();
  whole.route({ method: "GET", url: "/boom", config: { guard: "public" }, handler: async () => Promise.reject(new Error("secret detail")) });
  const res = await whole.inject({ method: "GET", url: "/boom" });
  expect(res.statusCode).toBe(500);
  expect(res.json()).toEqual({ error: "failed" });
  await whole.close();
});
