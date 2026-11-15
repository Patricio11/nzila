// The API against a real PostgreSQL (`pnpm services` starts it). Each run
// makes its own database and drops it afterwards.

import { connect, databaseUrl, loadMigrations, loadWorldSeed, migrate, parsePepper, seed } from "@nzila/db";
import { BASE_ORIGINS } from "@nzila/economy";
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
const newGuest = async (n: number, ageBand = "18_plus") => {
  const res = await app.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(n), platform: "android", ageBand } });
  expect(res.statusCode).toBe(201);
  return res.json() as { playerId: string; token: string; ageBand: string; name: string; biNumber: string };
};
const as = (token: string) => ({ authorization: `Bearer ${token}` });

describe("a guest", () => {
  test("is made on first open with nothing personal: a player, a device known only by a hash, a session known only by a hash", async () => {
    const guest = await newGuest(1);
    expect(guest.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const [player] = await sql`SELECT kind, status, name, age_band FROM players WHERE id = ${guest.playerId}`;
    // Of their age, only the band (D-0.32); and that they came in under the terms of play.
    expect(player).toMatchObject({ kind: "guest", status: "active", age_band: "18_plus" });
    // They arrive with a BI number, which is the order of their arrival, and a first name made from it.
    expect(guest).toMatchObject({ name: expect.stringMatching(/^Caluanda \d{4,}$/), biNumber: expect.stringMatching(/^\d{8}-LA$/) });
    expect(player!.name).toBe(guest.name);
    expect(Number(guest.biNumber.slice(0, 8))).toBe(Number(guest.name.split(" ")[1]));
    expect(await sql`SELECT purpose, version, granted FROM consents WHERE player_id = ${guest.playerId}`).toEqual([{ purpose: "play", version: 1, granted: true }]);
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
    expect(me.json()).toMatchObject({ id: a.playerId, kind: "guest", name: a.name, nameFree: true, biNumber: a.biNumber, ageBand: "18_plus", look: null, origin: null });
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
  for (let n = 100; n < 108; n++) codes.push((await limited.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(n), ageBand: "15_17" } })).statusCode);
  expect(codes).toEqual([201, 201, 201, 201, 201, 201, 429, 429]);
  await limited.close();
});

describe("how a player looks", () => {
  const her = { sex: "f", skin: 2, hair: "trancas", hairColour: "hairBlack", top: "blusa", topColour: "awningGold", bottom: "pano", bottomColour: "awningTeal", bands: "awningGold", shoe: "shoeTan" };
  const put = (token: string, look: unknown) => app.inject({ method: "PUT", url: "/v1/me/look", headers: as(token), payload: { look } });

  test("is recorded when the wardrobe has it, replaced when it is changed, and given back", async () => {
    const guest = await newGuest(20);
    expect((await put(guest.token, her)).statusCode).toBe(200);
    const changed = await put(guest.token, { ...her, hair: "afro", extras: ["oculos"], tall: 1 });
    expect(changed.json()).toEqual({ look: { ...her, hair: "afro", extras: ["oculos"], tall: 1, broad: 0 } });
    expect(await sql`SELECT count(*)::int AS n FROM avatars WHERE player_id = ${guest.playerId}`).toEqual([{ n: 1 }]);
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) });
    expect(me.json()).toMatchObject({ look: { hair: "afro", extras: ["oculos"] } });
  });

  test("is refused when anything in it is not in the wardrobe: the client proposes, the API records", async () => {
    const guest = await newGuest(21);
    for (const look of [{ ...her, hair: "galo" }, { ...her, topColour: "gold-plated" }, { ...her, makuta: 1_000_000 }, "naked", null]) {
      const res = await put(guest.token, look);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid" });
    }
    expect(await sql`SELECT 1 FROM avatars WHERE player_id = ${guest.playerId}`).toEqual([]);
    expect((await app.inject({ method: "PUT", url: "/v1/me/look", payload: { look: her } })).statusCode).toBe(401);
  });

  test("a look kept from a wardrobe that has since changed is no look", async () => {
    const guest = await newGuest(22);
    await sql`INSERT INTO avatars (player_id, spec) VALUES (${guest.playerId}, ${sql.json({ ...her, hair: "a style long gone" })})`;
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).json()).toMatchObject({ look: null });
  });
});

describe("a lotaria da vida", () => {
  const deal = (token: string) => app.inject({ method: "POST", url: "/v1/me/origin", headers: as(token) });
  const families = new Map(BASE_ORIGINS.families.map((family) => [family.id, family]));

  test("the server deals one card, from the table, and asking again gives the same card", async () => {
    const guest = await newGuest(30);
    const first = await deal(guest.token);
    expect(first.statusCode).toBe(200);
    const card = (first.json() as { origin: { family: string; pai: string; mae: string; tier: string; province: string; bairro: string; makuta: number; version: number } }).origin;
    const family = families.get(card.family)!;
    expect(card).toMatchObject({ pai: family.pai, mae: family.mae, tier: family.tier, version: BASE_ORIGINS.version });
    expect(family.bairros).toContain(card.bairro);
    expect(card.makuta).toBeGreaterThanOrEqual(1500);
    for (let n = 0; n < 5; n++) expect((await deal(guest.token)).json()).toEqual({ origin: card });
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).json()).toMatchObject({ origin: card });
    expect(await sql`SELECT count(*)::int AS n FROM player_origins WHERE player_id = ${guest.playerId}`).toEqual([{ n: 1 }]);
    // The card is a record. No Makuta has moved: that is the ledger's to do (Task 4.1).
    expect(await sql`SELECT paid_transfer_id FROM player_origins WHERE player_id = ${guest.playerId}`).toEqual([{ paid_transfer_id: null }]);
  });

  test("twenty requests at the same instant deal one card", async () => {
    const guest = await newGuest(31);
    const cards = await Promise.all(Array.from({ length: 20 }, () => deal(guest.token)));
    expect(new Set(cards.map((res) => res.statusCode))).toEqual(new Set([200]));
    expect(new Set(cards.map((res) => res.body)).size).toBe(1);
  });

  test("no rerolls: a second guest on the same device is dealt the first one's card", async () => {
    // Dice that would deal the poorest family first and the richest ever after.
    let rolls = 0;
    const loaded = buildApp({ sql, pepper, limiter: { allow: () => true }, roll: () => (rolls++ < 4 ? 0 : 0.9999) });
    const guestOn = async (n: number) => (await loaded.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(n), ageBand: "18_plus" } })).json() as { token: string };
    const dealt = async (token: string) => ((await loaded.inject({ method: "POST", url: "/v1/me/origin", headers: as(token) })).json() as { origin: { family: string; makuta: number } }).origin;
    const first = await dealt((await guestOn(32)).token);
    expect(first).toMatchObject({ tier: "aperto", makuta: 1500 });
    // The same phone, wiped of its account and trying again for a better family.
    expect(await dealt((await guestOn(32)).token)).toEqual(first);
    // Another phone gets its own draw.
    expect(await dealt((await guestOn(33)).token)).toMatchObject({ tier: "ouro", makuta: 250000 });
    await loaded.close();
  });

  test("a card, once dealt, cannot be rewritten in the database either", async () => {
    const guest = await newGuest(34);
    await deal(guest.token);
    await expect(sql`UPDATE player_origins SET makuta = 1000000 WHERE player_id = ${guest.playerId}`).rejects.toThrow(/dealt once/);
  });

  test("is dealt to nobody without a session", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/me/origin" })).statusCode).toBe(401);
  });
});

describe("a name", () => {
  const ask = async (token: string, name: string) => ((await app.inject({ method: "POST", url: "/v1/names/check", headers: as(token), payload: { name } })).json() as { answer: string }).answer;
  const take = (token: string, name: unknown) => app.inject({ method: "PUT", url: "/v1/me/name", headers: as(token), payload: { name } });

  test("is asked about while it is typed, taken once for nothing, and then it is theirs alone", async () => {
    const a = await newGuest(40);
    const b = await newGuest(41);
    expect(await ask(a.token, "Zé Manel")).toBe("free");
    const taken = await take(a.token, "  Zé   Manel ");
    expect(taken.statusCode).toBe(200);
    expect(taken.json()).toEqual({ name: "Zé Manel", nameFree: false });
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(a.token) })).json()).toMatchObject({ name: "Zé Manel", nameFree: false, biNumber: a.biNumber });
    // The same name, however it is written, is taken for everyone else and theirs for them.
    for (const other of ["Zé Manel", "ze manel", "ZE-MANEL", "zémanel"]) expect(await ask(b.token, other), other).toBe("taken");
    expect(await ask(a.token, "ze manel")).toBe("yours");
    const stolen = await take(b.token, "ze-manel");
    expect(stolen.statusCode).toBe(409);
    expect(stolen.json()).toEqual({ error: "name_taken" });
    // The name they arrived with is nobody's to choose: names of that shape are the game's to give.
    expect(await ask(b.token, a.name)).toBe("refused");
  });

  test("a correction of the same name costs nothing; a second change is not to be had yet", async () => {
    const guest = await newGuest(42);
    expect((await take(guest.token, "Dona Xepa")).statusCode).toBe(200);
    expect((await take(guest.token, "Dona Xépa")).json()).toEqual({ name: "Dona Xépa", nameFree: false });
    const again = await take(guest.token, "Outra Pessoa");
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "name_spent" });
    expect((await sql`SELECT name, name_changes FROM players WHERE id = ${guest.playerId}`)[0]).toEqual({ name: "Dona Xépa", name_changes: 1 });
  });

  test("is refused when it is not a name, passes for the game, or the filter objects", async () => {
    const guest = await newGuest(43);
    expect(await ask(guest.token, "Zé")).toBe("short");
    expect(await ask(guest.token, "Um nome comprido demais")).toBe("long");
    expect(await ask(guest.token, "<b>Zé</b>")).toBe("letters");
    for (const name of ["Nzila Oficial", "Admin", "Moderador Zé", "Suporte", "Caluanda 7", "caluanda-123456"]) expect(await ask(guest.token, name), name).toBe("refused");
    expect((await take(guest.token, "A Equipa")).json()).toEqual({ error: "name_refused" });
    expect((await take(guest.token, "Zé")).json()).toEqual({ error: "invalid" });
    expect((await take(guest.token, 42)).json()).toEqual({ error: "invalid" });
    // A word from the filter's list, however it is dressed.
    const [bad] = (await import("node:fs")).readFileSync(new URL("../../../packages/i18n/filter/pt.txt", import.meta.url), "utf8").split(/\r?\n/).filter((line) => /^[a-z]{4,10}$/.test(line));
    expect(bad).toBeDefined();
    expect(await ask(guest.token, bad!)).toBe("refused");
    expect(await ask(guest.token, bad!.toUpperCase().replace(/a/gi, "4"))).toBe("refused");
    // Nothing of all that changed their name or spent their change.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).json()).toMatchObject({ name: guest.name, nameFree: true });
  });

  test("two players who ask for one name at the same instant: one gets it", async () => {
    const guests = await Promise.all([44, 45, 46, 47].map((n) => newGuest(n)));
    const answers = await Promise.all(guests.map((guest) => take(guest.token, "Rainha Ginga")));
    expect(answers.map((res) => res.statusCode).sort()).toEqual([200, 409, 409, 409]);
    expect(await sql`SELECT count(*)::int AS n FROM players WHERE name_key = 'rainhaginga'`).toEqual([{ n: 1 }]);
  });

  test("is asked of nobody without a session", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/names/check", payload: { name: "Zé Manel" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/v1/me/name", payload: { name: "Zé Manel" } })).statusCode).toBe(401);
  });
});
