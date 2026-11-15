// The API against a real PostgreSQL (`pnpm services` starts it). Each run
// makes its own database and drops it afterwards.

import { connect, databaseUrl, loadMigrations, loadWorldSeed, migrate, parsePepper, seed } from "@nzila/db";
import { type FastifyInstance } from "fastify";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app.ts";
import { memoryLimiter } from "./limiter.ts";

const name = `nzila_api_test_${process.pid}_${Date.now()}`;
const pepper = parsePepper(Buffer.alloc(32, 9).toString("base64"));
let admin: Sql;
let sql: Sql;
let app: FastifyInstance;

beforeAll(async () => {
  admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(databaseUrl());
  url.pathname = `/${name}`;
  sql = connect(url.toString(), 10);
  await migrate(sql, await loadMigrations());
  await seed(sql, await loadWorldSeed());
  // Limits wide open here: they have their own test, and these tests make many guests from one address.
  app = buildApp({ sql, pepper, limiter: { allow: () => true } });
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

const device = (n: number): string => `device-${String(n).padStart(4, "0")}-abcdefghij`;
const newGuest = async (n: number) => {
  const res = await app.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(n), platform: "android" } });
  expect(res.statusCode).toBe(201);
  return res.json() as { playerId: string; token: string };
};
const as = (token: string) => ({ authorization: `Bearer ${token}` });

describe("a guest", () => {
  test("is made on first open with nothing personal: a player, a device known only by a hash, a session known only by a hash", async () => {
    const guest = await newGuest(1);
    expect(guest.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const [player] = await sql`SELECT kind, status, name, age_band FROM players WHERE id = ${guest.playerId}`;
    expect(player).toEqual({ kind: "guest", status: "active", name: null, age_band: null });
    const [seen] = await sql`SELECT device_hash, platform FROM devices WHERE player_id = ${guest.playerId}`;
    expect(seen!.platform).toBe("android");
    expect(seen!.device_hash).not.toContain(device(1));
    expect(seen!.device_hash).toMatch(/^[0-9a-f]{64}$/);
    const [session] = await sql`SELECT token_hash, revoked_at, expires_at > now() + interval '80 days' AS long FROM player_sessions WHERE player_id = ${guest.playerId}`;
    expect(session!.token_hash).not.toBe(guest.token);
    expect(session).toMatchObject({ revoked_at: null, long: true });
    // The token is nowhere in the database, in any form but its hash.
    const dump = JSON.stringify(await sql`SELECT * FROM player_sessions`) + JSON.stringify(await sql`SELECT * FROM devices`) + JSON.stringify(await sql`SELECT * FROM players`);
    expect(dump).not.toContain(guest.token);
  });

  test("is themselves with their token, and nobody without it", async () => {
    const a = await newGuest(2);
    const b = await newGuest(3);
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: as(a.token) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: a.playerId, kind: "guest", name: null, ageBand: null });
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(b.token) })).json()).toMatchObject({ id: b.playerId });
    // A token that was never issued, of the right shape.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as("x".repeat(43)) })).statusCode).toBe(401);
  });

  test("two guests from one device are two players: a device id is a hint, never a key", async () => {
    const first = await newGuest(4);
    const second = await newGuest(4);
    expect(second.playerId).not.toBe(first.playerId);
  });

  test("leaves on a device and that token is dead, while the player remains", async () => {
    const guest = await newGuest(5);
    expect((await app.inject({ method: "DELETE", url: "/v1/session", headers: as(guest.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).statusCode).toBe(401);
    expect((await sql`SELECT status FROM players WHERE id = ${guest.playerId}`)[0]).toEqual({ status: "active" });
  });

  test("an expired session, and the session of a player who may not play, let nobody in", async () => {
    const late = await newGuest(6);
    await sql`UPDATE player_sessions SET expires_at = now() - interval '1 minute' WHERE player_id = ${late.playerId}`;
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(late.token) })).statusCode).toBe(401);
    const banned = await newGuest(7);
    await sql`UPDATE players SET status = 'banned' WHERE id = ${banned.playerId}`;
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(banned.token) })).statusCode).toBe(401);
  });

  test("using a session keeps it alive", async () => {
    const guest = await newGuest(8);
    await sql`UPDATE player_sessions SET expires_at = now() + interval '1 day', last_seen_at = now() - interval '5 days' WHERE player_id = ${guest.playerId}`;
    await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) });
    const [session] = await sql`SELECT expires_at > now() + interval '80 days' AS long, last_seen_at > now() - interval '1 minute' AS fresh FROM player_sessions WHERE player_id = ${guest.playerId}`;
    expect(session).toEqual({ long: true, fresh: true });
  });
});

test("an address that makes guests by the dozen is told to slow down", async () => {
  const limited = buildApp({ sql, pepper, limiter: memoryLimiter() });
  const codes: number[] = [];
  for (let n = 100; n < 108; n++) codes.push((await limited.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(n) } })).statusCode);
  expect(codes).toEqual([201, 201, 201, 201, 201, 201, 429, 429]);
  await limited.close();
});
