// The API against a real PostgreSQL (`pnpm services` starts it). Each run
// makes its own database and drops it afterwards.

import { auditLedger, connect, databaseUrl, decryptField, keepChatLines, putStaff, shutOutOf, standingAgainst, loadMigrations, loadWorldSeed, migrate, normalizePhone, parseKeyring, parsePepper, seed } from "@nzila/db";
import { BASE_ORIGINS, BASE_TUNABLES } from "@nzila/economy";
import { ZONE_TTL_S, memoryPresence } from "@nzila/presence";
import { type FastifyInstance } from "fastify";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app.ts";
import { memoryLimiter } from "./limiter.ts";
import { hashPassword } from "./linking.ts";

const name = `nzila_api_test_${process.pid}_${Date.now()}`;
const pepper = parsePepper(Buffer.alloc(32, 9).toString("base64"));
const keyring = parseKeyring(`1:${Buffer.alloc(32, 3).toString("base64")}`);
// The codes "sent" to each number, newest last: what a phone would have received.
const sent = new Map<string, string[]>();
const sender = { send: async (phone: string, code: string) => void sent.set(phone, [...(sent.get(phone) ?? []), code]) };
// The letters "sent", newest last, by address: what a mailbox would have received.
const letters = new Map<string, { subject: string; text: string }[]>();
const mailer = { send: async (letter: { to: string; subject: string; text: string }) => void letters.set(letter.to, [...(letters.get(letter.to) ?? []), letter]) };
const mailedCode = (email: string): string => /\d{6}/.exec(letters.get(email)!.at(-1)!.subject)![0];
// Where zones say they are: this test plays the zone and says what it likes.
// Its clock can be put forward, to let a zone fall silent.
let later = 0;
const presence = memoryPresence(() => Date.now() + later);
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
  app = buildApp({ guests: true, sql, pepper, keyring, sender, mailer, phoneCodes: true, limiter: { allow: () => true }, presence });
  // A database made, migrated and seeded, while the other suites make theirs: more than the ten seconds a hook is given.
}, 60_000);

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  // Three suites drop their databases at the same moment: more than the ten seconds a hook is given.
}, 60_000);

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
  const limited = buildApp({ guests: true, sql, pepper, keyring, mailer, limiter: memoryLimiter() });
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
    // With the card comes its Makuta, in the Carteira, through the ledger: once, however often the card is asked for.
    const wallet = { cash: card.makuta, bank: 0 };
    expect(first.json()).toEqual({ origin: card, wallet });
    for (let n = 0; n < 5; n++) expect((await deal(guest.token)).json()).toEqual({ origin: card, wallet });
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).json()).toMatchObject({ origin: card, wallet });
    expect(await sql`SELECT count(*)::int AS n FROM player_origins WHERE player_id = ${guest.playerId}`).toEqual([{ n: 1 }]);
    const grants = await sql<{ id: string; debit_account: string; credit_account: string; amount: string; reason: string; action_id: string }[]>`SELECT id, debit_account, credit_account, amount, reason, action_id FROM ledger_transfers WHERE credit_account = ${`player_cash:${guest.playerId}`}`;
    expect(grants).toMatchObject([{ debit_account: "system_faucet:grant", amount: String(card.makuta), reason: "grant", action_id: `origin:${guest.playerId}` }]);
    // And the card says by which transfer it was paid.
    expect(await sql`SELECT paid_transfer_id FROM player_origins WHERE player_id = ${guest.playerId}`).toEqual([{ paid_transfer_id: grants[0]!.id }]);
  });

  test("a card dealt before Makuta was real is paid the next time it is asked for, once; the wallet and its lines are the player's own to read", async () => {
    const guest = await newGuest(35);
    const other = await newGuest(36);
    // As it was before the ledger was live: a card, and nothing in the books.
    await sql`INSERT INTO player_origins (player_id, family, province, bairro, makuta, table_version) VALUES (${guest.playerId}, ${BASE_ORIGINS.families[0]!.id}, 'Luanda', ${BASE_ORIGINS.families[0]!.bairros[0]!}, 2500, ${BASE_ORIGINS.version})`;
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).json()).toMatchObject({ wallet: { cash: 0, bank: 0 } });
    await Promise.all(Array.from({ length: 8 }, () => deal(guest.token)));
    const read = await app.inject({ method: "GET", url: "/v1/me/wallet", headers: as(guest.token) });
    expect(read.json()).toMatchObject({ cash: 2500, bank: 0, bankLines: [] });
    const { cashLines } = read.json() as { cashLines: { amount: number; reason: string; ref: string; with: string }[] };
    expect(cashLines).toMatchObject([{ amount: 2500, reason: "grant", ref: "origin", with: "system_faucet" }]);
    // Nobody's id is in it, and nobody else's wallet can be asked for.
    expect(read.body).not.toContain(guest.playerId);
    await deal(other.token);
    expect(((await app.inject({ method: "GET", url: "/v1/me/wallet", headers: as(other.token) })).json() as { cashLines: unknown[] }).cashLines).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/v1/me/wallet" })).statusCode).toBe(401);
    // The books balance: every Makuta a player holds is one the faucet paid out.
    const audit = await auditLedger(sql);
    expect(audit).toMatchObject({ ok: true, sum: 0, wrong: [], overdrawn: [] });
    expect(audit.transfers).toBeGreaterThan(1);
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
    const loaded = buildApp({ guests: true, sql, pepper, keyring, mailer, limiter: { allow: () => true }, roll: () => (rolls++ < 4 ? 0 : 0.9999) });
    const guestOn = async (n: number) => (await loaded.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(n), ageBand: "18_plus" } })).json() as { token: string };
    const dealt = async (token: string) => ((await loaded.inject({ method: "POST", url: "/v1/me/origin", headers: as(token) })).json() as { origin: { family: string; makuta: number } }).origin;
    const first = await dealt((await guestOn(32)).token);
    expect(first).toMatchObject({ tier: "aperto", makuta: 1500 });
    // The same phone, wiped of its account and trying again for a better family.
    expect(await dealt((await guestOn(32)).token)).toEqual(first);
    // Another phone gets its own draw.
    expect(await dealt((await guestOn(33)).token)).toMatchObject({ tier: "ouro", makuta: 250000 });
    // And a second account on that phone is born into the same rich family with the least any family begins
    // with: one grant of a family's Makuta a phone. Its wallet holds what its card says.
    const younger = await guestOn(33);
    expect(await dealt(younger.token)).toMatchObject({ tier: "ouro", makuta: 1500 });
    expect((await loaded.inject({ method: "GET", url: "/v1/me", headers: as(younger.token) })).json()).toMatchObject({ wallet: { cash: 1500, bank: 0 } });
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

describe("os meus dados", () => {
  const her = { sex: "f", skin: 2, hair: "trancas", hairColour: "hairBlack", top: "blusa", topColour: "awningGold", bottom: "pano", bottomColour: "awningTeal", bands: "awningGold", shoe: "shoeTan" };
  const settled = async (n: number) => {
    const guest = await newGuest(n);
    await app.inject({ method: "PUT", url: "/v1/me/look", headers: as(guest.token), payload: { look: her } });
    await app.inject({ method: "POST", url: "/v1/me/origin", headers: as(guest.token) });
    return guest;
  };

  test("analytics and notifications are off until the player says yes, and each yes and no is kept as history", async () => {
    const guest = await newGuest(50);
    const choices = () => app.inject({ method: "GET", url: "/v1/me/consents", headers: as(guest.token) });
    const choose = (purpose: string, granted: unknown) => app.inject({ method: "PUT", url: "/v1/me/consents", headers: as(guest.token), payload: { purpose, granted } });
    expect((await choices()).json()).toEqual({ analytics: false, notifications: false });
    expect((await choose("analytics", true)).json()).toEqual({ analytics: true, notifications: false });
    expect((await choose("analytics", false)).json()).toEqual({ analytics: false, notifications: false });
    expect((await choose("notifications", true)).json()).toEqual({ analytics: false, notifications: true });
    // Playing cannot be said no to here, and a yes must be a yes.
    expect((await choose("play", false)).statusCode).toBe(400);
    expect((await choose("analytics", "yes")).statusCode).toBe(400);
    expect((await sql`SELECT purpose, granted FROM consents WHERE player_id = ${guest.playerId} ORDER BY id`).map((row) => `${row.purpose}:${row.granted}`)).toEqual(["play:true", "analytics:true", "analytics:false", "notifications:true"]);
  });

  test("the player is given everything kept of them, in words, with no hash in it, and the asking is recorded", async () => {
    const guest = await settled(51);
    const res = await app.inject({ method: "GET", url: "/v1/me/data", headers: as(guest.token) });
    expect(res.statusCode).toBe(200);
    const data = res.json() as Record<string, unknown>;
    expect(data).toMatchObject({
      player: { id: guest.playerId, kind: "guest", name: guest.name, biNumber: guest.biNumber, ageBand: "18_plus" },
      look: { hair: "trancas" },
      origin: { makuta: expect.any(Number), family: expect.any(String) },
      consents: [{ purpose: "play", granted: true }],
      devices: [{ platform: "android" }],
      sessions: [{ ended: null }],
    });
    expect(res.body).not.toMatch(/[0-9a-f]{64}/);
    expect(res.body).not.toContain(guest.token);
    expect(await sql`SELECT actor_kind, kind FROM audit_log WHERE subject_id = ${guest.playerId}`).toEqual([{ actor_kind: "player", kind: "player.export" }]);
  });

  test("deleting the account removes what says who they were and keeps the row, so that the books still add up", async () => {
    const guest = await settled(52);
    const other = await settled(53);
    // Not without their own BI number: a request sent by mistake deletes nobody.
    for (const biNumber of ["", other.biNumber, "00000000-LA"]) {
      const refused = await app.inject({ method: "DELETE", url: "/v1/me", headers: as(guest.token), payload: { biNumber } });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({ error: "not_confirmed" });
    }
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: as(guest.token) })).statusCode).toBe(400);

    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: as(guest.token), payload: { biNumber: guest.biNumber } })).statusCode).toBe(200);
    const [row] = await sql`SELECT status, name, name_key, bi_number, age_band, phone_hash, deleted_at IS NOT NULL AS dated FROM players WHERE id = ${guest.playerId}`;
    expect(row).toEqual({ status: "deleted", name: null, name_key: null, bi_number: null, age_band: null, phone_hash: null, dated: true });
    for (const table of ["devices", "player_sessions", "avatars", "player_origins"]) expect(await sql`SELECT 1 FROM ${sql(table)} WHERE player_id = ${guest.playerId}`, table).toEqual([]);
    // The proof that they agreed is kept for its period; that they left is recorded.
    expect(await sql`SELECT purpose FROM consents WHERE player_id = ${guest.playerId}`).toEqual([{ purpose: "play" }]);
    expect((await sql`SELECT kind FROM audit_log WHERE subject_id = ${guest.playerId}`).map((entry) => entry.kind)).toContain("player.delete");
    // Their token is dead, their name is free for someone else, and nobody else was touched.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(other.token) })).json()).toMatchObject({ name: other.name, look: { hair: "trancas" }, origin: { family: expect.any(String) } });
  });

  test("none of it is for anybody without a session", async () => {
    for (const [method, url] of [["GET", "/v1/me/consents"], ["PUT", "/v1/me/consents"], ["GET", "/v1/me/data"], ["DELETE", "/v1/me"]] as const) expect((await app.inject({ method, url })).statusCode, url).toBe(401);
  });
});

describe("saving the BI with a phone number", () => {
  const her = { sex: "f", skin: 2, hair: "trancas", hairColour: "hairBlack", top: "blusa", topColour: "awningGold", bottom: "pano", bottomColour: "awningTeal", bands: "awningGold", shoe: "shoeTan" };
  const askCode = (phone: string) => app.inject({ method: "POST", url: "/v1/codes", payload: { phone } });
  const codeFor = async (phone: string): Promise<string> => {
    expect((await askCode(phone)).statusCode).toBe(200);
    // The sender is given the number in its one canonical form.
    return sent.get(normalizePhone(phone)!)!.at(-1)!;
  };
  const link = (token: string, phone: string, code: string) => app.inject({ method: "POST", url: "/v1/me/phone", headers: as(token), payload: { phone, code } });
  const signIn = (phone: string, code: string, n: number) => app.inject({ method: "POST", url: "/v1/signin/phone", payload: { phone, code, deviceId: device(n), platform: "ios" } });
  const me = async (token: string) => app.inject({ method: "GET", url: "/v1/me", headers: as(token) });

  test("a guest proves a number with a code and is linked: the same player, the number kept only encrypted and hashed", async () => {
    const guest = await newGuest(60);
    const code = await codeFor("923 456 060");
    expect(code).toMatch(/^\d{6}$/);
    const linked = await link(guest.token, "+244923456060", code);
    expect(linked.statusCode).toBe(200);
    expect((await me(guest.token)).json()).toMatchObject({ id: guest.playerId, kind: "linked", name: guest.name, biNumber: guest.biNumber });
    const [row] = await sql`SELECT phone_enc, phone_hash FROM players WHERE id = ${guest.playerId}`;
    expect(row!.phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(decryptField(row!.phone_enc as Uint8Array, "players.phone", keyring)).toBe("+244923456060");
    const everything = JSON.stringify(await sql`SELECT * FROM players WHERE id = ${guest.playerId}`) + JSON.stringify(await sql`SELECT phone_hash, code_hash FROM login_codes`);
    expect(everything).not.toContain("923456060");
    expect(everything).not.toContain(code);
    // The code was used: it opens nothing a second time.
    expect((await link(guest.token, "923456060", code)).json()).toEqual({ error: "wrong_code" });
  });

  test("a wrong code is refused, five tries are all a code gets, and a number is sent few codes", async () => {
    const guest = await newGuest(61);
    const code = await codeFor("923456061");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let n = 0; n < 5; n++) expect((await link(guest.token, "923456061", wrong)).json()).toEqual({ error: "wrong_code" });
    // The right code, after five wrong ones, is refused too.
    expect((await link(guest.token, "923456061", code)).json()).toEqual({ error: "wrong_code" });
    expect((await me(guest.token)).json()).toMatchObject({ kind: "guest" });
    // A fresh code works; a third is still sent; a fourth in the quarter of an hour is not.
    expect((await link(guest.token, "923456061", await codeFor("923456061"))).statusCode).toBe(200);
    expect((await askCode("923456061")).statusCode).toBe(200);
    const refused = await askCode("923456061");
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: "slow_down" });
    // What is not a phone number is sent nothing.
    expect((await askCode("not a number")).statusCode).toBe(400);
    expect((await askCode("12345")).statusCode).toBe(400);
  });

  test("an expired code opens nothing", async () => {
    const guest = await newGuest(62);
    const code = await codeFor("923456062");
    await sql`UPDATE login_codes SET expires_at = now() - interval '1 second' WHERE used_at IS NULL`;
    expect((await link(guest.token, "923456062", code)).json()).toEqual({ error: "wrong_code" });
  });

  test("on a second phone the number brings the whole player back, and the older phone is put out", async () => {
    const first = await newGuest(63);
    await app.inject({ method: "PUT", url: "/v1/me/look", headers: as(first.token), payload: { look: her } });
    await app.inject({ method: "PUT", url: "/v1/me/name", headers: as(first.token), payload: { name: "Nga Muturi" } });
    const card = ((await app.inject({ method: "POST", url: "/v1/me/origin", headers: as(first.token) })).json() as { origin: unknown }).origin;
    expect((await link(first.token, "923456063", await codeFor("923456063"))).statusCode).toBe(200);

    const second = await signIn("923456063", await codeFor("923456063"), 64);
    expect(second.statusCode).toBe(200);
    const { playerId, token } = second.json() as { playerId: string; token: string };
    expect(playerId).toBe(first.playerId);
    expect((await me(token)).json()).toMatchObject({ id: first.playerId, kind: "linked", name: "Nga Muturi", biNumber: first.biNumber, look: { hair: "trancas" }, origin: card });
    // One active session a player: the newer one wins.
    expect((await me(first.token)).statusCode).toBe(401);
    expect(await sql`SELECT count(*)::int AS n FROM devices WHERE player_id = ${first.playerId}`).toEqual([{ n: 2 }]);
  });

  test("a guest who proves a number that already has an account is told so, changes nothing, and may go into it with the same code", async () => {
    const owner = await newGuest(65);
    expect((await link(owner.token, "923456065", await codeFor("923456065"))).statusCode).toBe(200);
    const guest = await newGuest(66);
    const code = await codeFor("923456065");
    const told = await link(guest.token, "923456065", code);
    expect(told.statusCode).toBe(409);
    expect(told.json()).toEqual({ error: "has_account" });
    expect((await me(guest.token)).json()).toMatchObject({ id: guest.playerId, kind: "guest" });
    // Told only after a right code: a wrong one learns nothing about the number.
    expect((await link(guest.token, "923456065", code === "000000" ? "111111" : "000000")).json()).toEqual({ error: "wrong_code" });
    const inside = await signIn("923456065", code, 66);
    expect((inside.json() as { playerId: string }).playerId).toBe(owner.playerId);
  });

  test("a number nobody saved a BI with signs nobody in, and says the same thing to a wrong code as to no code at all", async () => {
    const code = await codeFor("923456067");
    const nobody = await signIn("923456067", code, 67);
    expect(nobody.statusCode).toBe(404);
    expect(nobody.json()).toEqual({ error: "no_account" });
    expect((await signIn("923456068", "123456", 68)).json()).toEqual({ error: "wrong_code" });
    expect((await app.inject({ method: "POST", url: "/v1/me/phone", payload: { phone: "923456067", code } })).statusCode).toBe(401);
  });
});

describe("saving the BI with an email address and a password", () => {
  const link = (token: string, email: unknown, password: unknown) => app.inject({ method: "POST", url: "/v1/me/email", headers: as(token), payload: { email, password } });
  const signIn = (email: string, password: string, n: number) => app.inject({ method: "POST", url: "/v1/signin/email", payload: { email, password, deviceId: device(n) } });
  const me = (token: string) => app.inject({ method: "GET", url: "/v1/me", headers: as(token) });

  test("a guest is linked: the same player; the address kept only encrypted and hashed, the password only as a salted hash", async () => {
    const guest = await newGuest(70);
    expect((await link(guest.token, " Dona.Xepa@Exemplo.AO ", "funje com peixe")).statusCode).toBe(200);
    expect((await me(guest.token)).json()).toMatchObject({ id: guest.playerId, kind: "linked", biNumber: guest.biNumber });
    const [row] = await sql`SELECT email_enc, email_hash, password_hash FROM players WHERE id = ${guest.playerId}`;
    expect(decryptField(row!.email_enc as Uint8Array, "players.email", keyring)).toBe("dona.xepa@exemplo.ao");
    expect(row!.password_hash).toMatch(/^scrypt\$15\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    const everything = JSON.stringify(await sql`SELECT * FROM players WHERE id = ${guest.playerId}`);
    expect(everything).not.toContain("dona.xepa");
    expect(everything).not.toContain("funje");
    // What they may take away says how the BI was saved, and nothing of the secret.
    const data = await app.inject({ method: "GET", url: "/v1/me/data", headers: as(guest.token) });
    expect(data.json()).toMatchObject({ savedWith: { phoneNumber: false, email: true } });
    expect(data.body).not.toContain("scrypt");
  });

  test("what is not an address, or not a password worth the name, saves nothing", async () => {
    const guest = await newGuest(71);
    for (const [email, password] of [["not an address", "funje com peixe"], ["a@b.ao", "curta"], ["a@b.ao", "12345678"], ["ze.manel.luanda@b.ao", "ze.manel.luanda"], [42, "funje com peixe"]] as const) {
      const res = await link(guest.token, email, password);
      expect(res.statusCode, String(email)).toBe(400);
    }
    expect((await me(guest.token)).json()).toMatchObject({ kind: "guest" });
    expect((await app.inject({ method: "POST", url: "/v1/me/email", payload: { email: "a@b.ao", password: "funje com peixe" } })).statusCode).toBe(401);
  });

  test("an address is one player's: a second guest who asks for it is told it has an account", async () => {
    const owner = await newGuest(72);
    expect((await link(owner.token, "kota@exemplo.ao", "muamba de galinha")).statusCode).toBe(200);
    const other = await newGuest(73);
    const told = await link(other.token, "KOTA@exemplo.ao", "outra palavra-passe");
    expect(told.statusCode).toBe(409);
    expect(told.json()).toEqual({ error: "has_account" });
    expect((await me(other.token)).json()).toMatchObject({ kind: "guest" });
  });

  test("on a second phone the address and the password bring the player back, and the older phone is put out", async () => {
    const first = await newGuest(74);
    await app.inject({ method: "PUT", url: "/v1/me/name", headers: as(first.token), payload: { name: "Tia Bia" } });
    expect((await link(first.token, "tia.bia@exemplo.ao", "calulu de peixe seco")).statusCode).toBe(200);
    const second = await signIn("Tia.Bia@exemplo.ao", "calulu de peixe seco", 75);
    expect(second.statusCode).toBe(200);
    const { playerId, token } = second.json() as { playerId: string; token: string };
    expect(playerId).toBe(first.playerId);
    expect((await me(token)).json()).toMatchObject({ name: "Tia Bia", kind: "linked" });
    expect((await me(first.token)).statusCode).toBe(401);
  });

  test("a wrong password and an address nobody has are told the same thing; five wrong guesses close the account for a while, even to the right password", async () => {
    const guest = await newGuest(76);
    expect((await link(guest.token, "mano@exemplo.ao", "kizaca com ginguba")).statusCode).toBe(200);
    const nobody = await signIn("ninguem@exemplo.ao", "kizaca com ginguba", 77);
    const wrong = await signIn("mano@exemplo.ao", "outra coisa qualquer", 77);
    expect([nobody.statusCode, nobody.json()]).toEqual([400, { error: "wrong_login" }]);
    expect([wrong.statusCode, wrong.json()]).toEqual([400, { error: "wrong_login" }]);
    expect((await signIn("not an address", "kizaca com ginguba", 77)).json()).toEqual({ error: "wrong_login" });
    for (let n = 0; n < 4; n++) expect((await signIn("mano@exemplo.ao", `guess number ${n}`, 77)).statusCode).toBe(400);
    const closed = await signIn("mano@exemplo.ao", "kizaca com ginguba", 77);
    expect([closed.statusCode, closed.json()]).toEqual([429, { error: "slow_down" }]);
    // When the quarter of an hour has passed, the right password opens it, and the count begins again.
    await sql`UPDATE players SET signin_locked_until = now() - interval '1 second' WHERE id = ${guest.playerId}`;
    expect((await signIn("mano@exemplo.ao", "kizaca com ginguba", 77)).statusCode).toBe(200);
    expect((await sql`SELECT signin_failures, signin_locked_until FROM players WHERE id = ${guest.playerId}`)[0]).toEqual({ signin_failures: 0, signin_locked_until: null });
  }, 30_000);

  test("deleting the account takes the address and the password with it", async () => {
    const guest = await newGuest(78);
    expect((await link(guest.token, "adeus@exemplo.ao", "ate a proxima vez")).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: as(guest.token), payload: { biNumber: guest.biNumber } })).statusCode).toBe(200);
    expect((await sql`SELECT email_enc, email_hash, password_hash FROM players WHERE id = ${guest.playerId}`)[0]).toEqual({ email_enc: null, email_hash: null, password_hash: null });
    expect((await signIn("adeus@exemplo.ao", "ate a proxima vez", 79)).json()).toEqual({ error: "wrong_login" });
  });
});

describe("an email address proved, a password forgotten, a password changed", () => {
  const post = (url: string, token: string | null, payload: Record<string, unknown> = {}) => app.inject({ method: "POST", url, headers: token ? as(token) : {}, payload });
  const saved = async (n: number, email: string, password: string) => {
    const guest = await newGuest(n);
    expect((await post("/v1/me/email", guest.token, { email, password })).statusCode).toBe(200);
    return guest;
  };
  const me = async (token: string) => (await app.inject({ method: "GET", url: "/v1/me", headers: as(token) })).json() as { savedWith: { email: boolean; emailVerified: boolean; phoneNumber: boolean } };

  test("saving sends a letter with a code; typed back, the address is proved; a wrong code proves nothing", async () => {
    const guest = await saved(80, "prova@exemplo.ao", "funje com peixe");
    expect(letters.get("prova@exemplo.ao")).toHaveLength(1);
    expect(letters.get("prova@exemplo.ao")![0]!.subject).toMatch(/^\d{6} é o teu código do Nzila$/);
    expect(await me(guest.token)).toMatchObject({ savedWith: { email: true, emailVerified: false, phoneNumber: false } });
    const code = mailedCode("prova@exemplo.ao");
    const wrong = await post("/v1/me/email/verify", guest.token, { code: code === "000000" ? "111111" : "000000" });
    expect([wrong.statusCode, wrong.json()]).toEqual([400, { error: "wrong_code" }]);
    expect((await post("/v1/me/email/verify", guest.token, { code })).json()).toEqual({ verified: true });
    expect(await me(guest.token)).toMatchObject({ savedWith: { emailVerified: true } });
    // Used once.
    expect((await post("/v1/me/email/verify", guest.token, { code })).statusCode).toBe(400);
    // Neither the address nor the code is anywhere in the clear.
    const everything = JSON.stringify(await sql`SELECT * FROM login_codes`) + JSON.stringify(await sql`SELECT * FROM players WHERE id = ${guest.playerId}`);
    expect(everything).not.toContain("prova@");
    expect(everything).not.toContain(code);
  });

  test("the letter can be asked for again, a few times; and only by someone who saved an address", async () => {
    const guest = await saved(81, "outra.vez@exemplo.ao", "funje com peixe");
    expect((await post("/v1/me/email/code", guest.token)).statusCode).toBe(200);
    expect((await post("/v1/me/email/code", guest.token)).statusCode).toBe(200);
    expect(letters.get("outra.vez@exemplo.ao")).toHaveLength(3);
    const refused = await post("/v1/me/email/code", guest.token);
    expect([refused.statusCode, refused.json()]).toEqual([429, { error: "slow_down" }]);
    // The newest code is the one that counts.
    expect((await post("/v1/me/email/verify", guest.token, { code: mailedCode("outra.vez@exemplo.ao") })).statusCode).toBe(200);
    const plain = await newGuest(82);
    expect((await post("/v1/me/email/code", plain.token)).json()).toEqual({ error: "not_saved" });
    expect((await post("/v1/me/email/verify", plain.token, { code: "123456" })).json()).toEqual({ error: "not_saved" });
  });

  test("a forgotten password: asking says the same for any address; the code and a new password bring the player in, and the old password is dead", async () => {
    const guest = await saved(83, "esqueci@exemplo.ao", "a palavra antiga");
    const before = letters.get("esqueci@exemplo.ao")!.length;
    const known = await post("/v1/password/forgot", null, { email: "Esqueci@exemplo.ao" });
    const unknown = await post("/v1/password/forgot", null, { email: "ninguem.aqui@exemplo.ao" });
    const nonsense = await post("/v1/password/forgot", null, { email: "isto não é" });
    for (const answer of [known, unknown, nonsense]) expect([answer.statusCode, answer.json()]).toEqual([200, { ok: true }]);
    // The letter goes without the answer waiting for it.
    await expect.poll(() => letters.get("esqueci@exemplo.ao")!.length).toBe(before + 1);
    expect(letters.has("ninguem.aqui@exemplo.ao")).toBe(false);
    expect(letters.get("esqueci@exemplo.ao")!.at(-1)!.subject).toContain("palavra-passe");
    const code = mailedCode("esqueci@exemplo.ao");
    const reset = (password: string, withCode = code, email = "esqueci@exemplo.ao") => post("/v1/password/reset", null, { email, code: withCode, password, deviceId: device(84) });
    expect((await reset("curta")).json()).toEqual({ error: "invalid" });
    expect((await reset("a palavra nova", code === "000000" ? "111111" : "000000")).json()).toEqual({ error: "wrong_code" });
    const done = await reset("a palavra nova");
    expect(done.statusCode).toBe(200);
    const { playerId, token } = done.json() as { playerId: string; token: string };
    expect(playerId).toBe(guest.playerId);
    // Whoever has the code has the mailbox: the address counts as proved, and every older session is ended.
    expect(await me(token)).toMatchObject({ savedWith: { email: true, emailVerified: true } });
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).statusCode).toBe(401);
    const signIn = (password: string) => post("/v1/signin/email", null, { email: "esqueci@exemplo.ao", password, deviceId: device(85) });
    expect((await signIn("a palavra antiga")).json()).toEqual({ error: "wrong_login" });
    expect((await signIn("a palavra nova")).statusCode).toBe(200);
    // The code is spent, and a code for an address with no account opens nothing.
    expect((await reset("mais uma palavra")).json()).toEqual({ error: "wrong_code" });
    expect((await reset("mais uma palavra", "123456", "ninguem.aqui@exemplo.ao")).json()).toEqual({ error: "wrong_code" });
  }, 30_000);

  test("a player who knows their password chooses another: other phones are put out, this one stays", async () => {
    const guest = await saved(86, "mudar@exemplo.ao", "a primeira palavra");
    const elsewhere = (await post("/v1/signin/email", null, { email: "mudar@exemplo.ao", password: "a primeira palavra", deviceId: device(87) })).json() as { token: string };
    const change = (token: string, current: string, next: string) => app.inject({ method: "PUT", url: "/v1/me/password", headers: as(token), payload: { current, next } });
    expect((await change(elsewhere.token, "não é esta", "a segunda palavra")).json()).toEqual({ error: "wrong_login" });
    expect((await change(elsewhere.token, "a primeira palavra", "curta")).json()).toEqual({ error: "invalid" });
    expect((await change(elsewhere.token, "a primeira palavra", "a segunda palavra")).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(elsewhere.token) })).statusCode).toBe(200);
    expect((await post("/v1/signin/email", null, { email: "mudar@exemplo.ao", password: "a primeira palavra", deviceId: device(88) })).json()).toEqual({ error: "wrong_login" });
    const again = (await post("/v1/signin/email", null, { email: "mudar@exemplo.ao", password: "a segunda palavra", deviceId: device(88) })).json() as { token: string };
    expect(again.token).toBeTruthy();
    // Someone with no saved address has no password to change; and nobody without a session changes anything.
    const plain = await newGuest(89);
    expect((await change(plain.token, "x", "a segunda palavra")).json()).toEqual({ error: "not_saved" });
    expect((await app.inject({ method: "PUT", url: "/v1/me/password", payload: { current: "a", next: "b" } })).statusCode).toBe(401);
    expect(guest.playerId).toBeTruthy();
  }, 30_000);

  test("a letter that cannot be sent does not undo the saving, and is not the player's problem", async () => {
    const broken = buildApp({ guests: true, sql, pepper, keyring, mailer: { send: async () => Promise.reject(new Error("the post office is shut")) }, limiter: { allow: () => true } });
    const guest = (await broken.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(90), ageBand: "18_plus" } })).json() as { token: string };
    const res = await broken.inject({ method: "POST", url: "/v1/me/email", headers: as(guest.token), payload: { email: "sem.correio@exemplo.ao", password: "funje com peixe" } });
    expect(res.statusCode).toBe(200);
    expect((await broken.inject({ method: "GET", url: "/v1/me", headers: as(guest.token) })).json()).toMatchObject({ kind: "linked" });
    await broken.close();
  });
});

test("with no provider paid to send codes, a BI is not saved with a phone number: the routes refuse", async () => {
  const off = buildApp({ guests: true, sql, pepper, keyring, mailer, limiter: { allow: () => true } });
  const guest = (await off.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(91), ageBand: "18_plus" } })).json() as { token: string };
  for (const res of [
    await off.inject({ method: "POST", url: "/v1/codes", payload: { phone: "923456091" } }),
    await off.inject({ method: "POST", url: "/v1/me/phone", headers: as(guest.token), payload: { phone: "923456091", code: "123456" } }),
    await off.inject({ method: "POST", url: "/v1/signin/phone", payload: { phone: "923456091", code: "123456", deviceId: device(91) } }),
  ]) expect([res.statusCode, res.json()]).toEqual([403, { error: "forbidden" }]);
  expect(sent.has("+244923456091")).toBe(false);
  await off.close();
});

test("deleting an account keeps the books: the ledger's rows stay, still add up, and point at a player who is nobody now (Task 2.7)", async () => {
  const guest = await newGuest(95);
  await app.inject({ method: "PUT", url: "/v1/me/name", headers: as(guest.token), payload: { name: "Sai de Cena" } });
  // Makuta that reached this player and was partly spent, written straight into the ledger as Phase 4's routes will.
  const cash = `player_cash:${guest.playerId}`;
  await sql`INSERT INTO ledger_accounts (id, kind, ref) VALUES (${cash}, 'player_cash', ${guest.playerId})`;
  const [faucet] = await sql<{ id: string }[]>`SELECT id FROM ledger_accounts WHERE kind = 'system_faucet' LIMIT 1`;
  const [sink] = await sql<{ id: string }[]>`SELECT id FROM ledger_accounts WHERE kind = 'system_sink' LIMIT 1`;
  await sql`INSERT INTO ledger_transfers (debit_account, credit_account, amount, reason, action_id) VALUES (${faucet!.id}, ${cash}, 2500, 'starting_grant', ${`del-test-in-${guest.playerId}`})`;
  await sql`INSERT INTO ledger_transfers (debit_account, credit_account, amount, reason, action_id) VALUES (${cash}, ${sink!.id}, 200, 'fare', ${`del-test-out-${guest.playerId}`})`;
  const total = async () => (await sql<{ sum: string }[]>`SELECT coalesce(sum(balance), 0)::text AS sum FROM balances`)[0]!.sum;
  const before = await total();

  expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: as(guest.token), payload: { biNumber: guest.biNumber } })).statusCode).toBe(200);

  // Both rows are there, untouched; the player's balance is what it was; the whole still adds up to what it did.
  expect((await sql`SELECT amount::int AS amount, reason FROM ledger_transfers WHERE debit_account = ${cash} OR credit_account = ${cash} ORDER BY created_at`).map((row) => `${row.reason}:${row.amount}`)).toEqual(["starting_grant:2500", "fare:200"]);
  expect((await sql`SELECT balance::int AS balance FROM balances WHERE account_id = ${cash}`)[0]).toEqual({ balance: 2300 });
  expect(await total()).toBe(before);
  // And whoever they point at has no name, no number, no way in: the rows are anonymous.
  expect((await sql`SELECT status, name, bi_number, email_hash, phone_hash FROM players WHERE id = ${guest.playerId}`)[0]).toEqual({ status: "deleted", name: null, bi_number: null, email_hash: null, phone_hash: null });
});

describe("where to play", () => {
  const join = (token: string, payload: object) => app.inject({ method: "POST", url: "/v1/play/join", headers: as(token), payload });
  const zone = (id: string, channels: [number, number][], address = "") => presence.announce({ id, address, rooms: [{ name: "ao-lua.l1", channels: channels.map(([number, players]) => ({ number, players })) }] });

  test("only a player is told, only about a district, and with no zone running it there is nowhere to send them", async () => {
    const guest = await newGuest(900);
    expect((await app.inject({ method: "POST", url: "/v1/play/join", payload: { districtId: "ao-lua/l1" } })).statusCode).toBe(401);
    for (const districtId of ["ao-lua", "../../etc", "AO-LUA/L1", "ao-lua/l1/extra", ""]) expect((await join(guest.token, { districtId })).statusCode, districtId).toBe(400);
    expect((await join(guest.token, { districtId: "ao-lua/l1", channel: 0 })).statusCode).toBe(400);
    const none = await join(guest.token, { districtId: "ao-lua/l1" });
    expect(none.statusCode).toBe(503);
    expect(none.json()).toEqual({ error: "no_zone" });
  });

  test("a player is given a channel, the zone that holds it and a ticket; the ticket is a seat for that player there, taken once", async () => {
    const guest = await newGuest(901);
    await zone("zone-a", [], "wss://zona-a.exemplo/z");
    const res = await join(guest.token, { districtId: "ao-lua/l1" });
    expect(res.statusCode).toBe(200);
    const told = res.json() as { address: string; room: string; seat: string; channel: number };
    expect(told).toMatchObject({ address: "wss://zona-a.exemplo/z", room: "ao-lua.l1", channel: 1 });
    // The ticket says nothing of who it is for, and is not their session.
    expect(told.seat).not.toBe(guest.token);
    expect(told.seat).not.toContain(guest.playerId);
    expect(await presence.claim(told.seat)).toEqual({ playerId: guest.playerId, zoneId: "zone-a", room: "ao-lua.l1", channel: 1 });
    expect(await presence.claim(told.seat)).toBeNull();
    // A district no zone here runs is still nowhere.
    expect((await join(guest.token, { districtId: "ao-ben/b1" })).json()).toEqual({ error: "no_zone" });
  });

  test("people are put together until a channel is comfortably full, then another is opened; a friend's invitation goes past that, until the channel is truly full", async () => {
    const guest = await newGuest(902);
    await zone("zone-a", [[1, BASE_TUNABLES.channels.fillTo - 1], [2, 3]]);
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ channel: 1, address: "", copies: 2 });
    // One copy of a bairro: the phone is told so, and names no channel to its player (D-3.13).
    await zone("zone-a", [[1, 4]]);
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ channel: 1, copies: 1 });
    await zone("zone-a", [[1, BASE_TUNABLES.channels.fillTo]]);
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ channel: 2, copies: 2 });
    await zone("zone-a", [[1, BASE_TUNABLES.channels.fillTo], [2, 3]]);
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ channel: 2 });
    await zone("zone-a", [[1, BASE_TUNABLES.channels.fillTo], [2, BASE_TUNABLES.channels.cap]]);
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ channel: 3 });
    // Invited to the first, which is comfortably full and not truly: let in.
    expect((await join(guest.token, { districtId: "ao-lua/l1", channel: 1 })).json()).toMatchObject({ channel: 1 });
    // Invited to the second, which holds all it can: told so, and the phone may ask for anywhere.
    const full = await join(guest.token, { districtId: "ao-lua/l1", channel: 2 });
    expect(full.statusCode).toBe(409);
    expect(full.json()).toEqual({ error: "full" });
    await presence.retire("zone-a");
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).statusCode).toBe(503);
  });

  test("someone whose line dropped is sent back to the channel keeping their place, not to wherever is emptiest; unless the zone keeping it has died", async () => {
    const guest = await newGuest(904);
    await zone("zone-a", [[1, 10], [4, 30]], "wss://a.exemplo");
    await presence.hold({ playerId: guest.playerId, zoneId: "zone-a", room: "ao-lua.l1", channel: 1 });
    // Left to itself the matchmaker would say channel 4, the fullest with room.
    const back = (await join(guest.token, { districtId: "ao-lua/l1" })).json() as { seat: string; channel: number };
    expect(back.channel).toBe(1);
    expect(await presence.claim(back.seat)).toMatchObject({ zoneId: "zone-a", channel: 1 });
    // The place is theirs alone: another player is put where the matchmaker thinks best.
    expect((await join((await newGuest(905)).token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ channel: 4 });
    // A place kept by a zone that no longer speaks is no place: they are put somewhere that is alive.
    later += (ZONE_TTL_S + 1) * 1000;
    await zone("zone-b", [[2, 5]], "wss://b.exemplo");
    await presence.hold({ playerId: guest.playerId, zoneId: "zone-a", room: "ao-lua.l1", channel: 1 });
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ address: "wss://b.exemplo", channel: 2 });
    await presence.unhold(guest.playerId);
    await presence.retire("zone-b");
  });

  test("a zone that dies stops being sent anyone: its players, asking again, are put in one that is alive", async () => {
    const guest = await newGuest(903);
    await zone("zone-dying", [[1, 20]], "wss://a-morrer.exemplo");
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toMatchObject({ address: "wss://a-morrer.exemplo", channel: 1 });
    // It says nothing more. A little later another zone is up, and says so.
    later += (ZONE_TTL_S + 1) * 1000;
    await zone("zone-alive", [], "wss://viva.exemplo");
    const moved = (await join(guest.token, { districtId: "ao-lua/l1" })).json() as { address: string; seat: string; channel: number };
    expect(moved).toMatchObject({ address: "wss://viva.exemplo", channel: 1 });
    expect(await presence.claim(moved.seat)).toMatchObject({ zoneId: "zone-alive" });
    // And with every zone silent there is nowhere, said plainly: the phone lets the player walk alone.
    later += (ZONE_TTL_S + 1) * 1000;
    expect((await join(guest.token, { districtId: "ao-lua/l1" })).json()).toEqual({ error: "no_zone" });
  });
});

describe("other players: looking, shutting out, reporting (Rule 11)", () => {
  const post = (token: string, url: string, payload: object) => app.inject({ method: "POST", url, headers: as(token), payload });

  test("the BI of someone met in the street shows what a card shows and nothing more; a number that is nobody's shows nothing", async () => {
    const me = await newGuest(950);
    const them = await newGuest(951);
    await app.inject({ method: "POST", url: "/v1/me/origin", headers: as(them.token), payload: {} });
    const card = await post(me.token, "/v1/players/card", { biNumber: them.biNumber });
    expect(card.statusCode).toBe(200);
    const shown = card.json() as Record<string, unknown>;
    expect(Object.keys(shown).sort()).toEqual(["arrivedAt", "bairro", "biNumber", "name"]);
    expect(shown).toMatchObject({ name: them.name, biNumber: them.biNumber });
    expect(typeof shown.bairro).toBe("string");
    expect((await post(me.token, "/v1/players/card", { biNumber: "99999999-LA" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/players/card", payload: { biNumber: them.biNumber } })).statusCode).toBe(401);
    expect((await post(me.token, "/v1/players/card", { biNumber: "'; DROP TABLE players; --" })).statusCode).toBe(400);
  });

  test("a player shuts another out and lets them back in; asking twice changes nothing; nobody shuts themselves out; the list is theirs alone", async () => {
    const me = await newGuest(952);
    const them = await newGuest(953);
    expect((await post(me.token, "/v1/blocks", { biNumber: them.biNumber })).statusCode).toBe(200);
    expect((await post(me.token, "/v1/blocks", { biNumber: them.biNumber })).statusCode).toBe(200);
    expect((await post(me.token, "/v1/blocks", { biNumber: me.biNumber })).statusCode).toBe(400);
    expect((await post(me.token, "/v1/blocks", { biNumber: "99999999-LA" })).statusCode).toBe(404);
    const mine = (await app.inject({ method: "GET", url: "/v1/blocks", headers: as(me.token) })).json() as { blocked: { name: string; biNumber: string }[] };
    expect(mine.blocked).toMatchObject([{ name: them.name, biNumber: them.biNumber }]);
    // The other is told nothing, and their own list is empty.
    expect(((await app.inject({ method: "GET", url: "/v1/blocks", headers: as(them.token) })).json() as { blocked: unknown[] }).blocked).toEqual([]);
    // What the zone reads: each is shut out from the other, whoever asked.
    expect(await shutOutOf(sql, me.playerId)).toEqual([them.playerId]);
    expect(await shutOutOf(sql, them.playerId)).toEqual([me.playerId]);
    expect((await app.inject({ method: "DELETE", url: "/v1/blocks", headers: as(me.token), payload: { biNumber: them.biNumber } })).statusCode).toBe(200);
    expect(await shutOutOf(sql, them.playerId)).toEqual([]);
  });

  test("a report reaches the moderators with the reported player's last lines as they were, and outlives them; the reporter's file says they made it", async () => {
    const me = await newGuest(954);
    const them = await newGuest(955);
    await keepChatLines(sql, [
      { playerId: them.playerId, districtId: "ao-lua/l1", channel: 1, text: "primeira coisa", said: true, heardBy: 2 },
      { playerId: them.playerId, districtId: "ao-lua/l1", channel: 1, text: "segunda, recusada", said: false, heardBy: 0 },
      { playerId: me.playerId, districtId: "ao-lua/l1", channel: 1, text: "o que eu disse", said: true, heardBy: 1 },
    ]);
    const res = await post(me.token, "/v1/reports", { biNumber: them.biNumber, reason: "insults", note: "  chamou-me nomes  " });
    expect(res.statusCode).toBe(200);
    const [report] = await sql<{ reporter_id: string; reported_id: string; reason: string; note: string; status: string; lines: { text: string; said: boolean }[] }[]>`SELECT reporter_id, reported_id, reason, note, status, lines FROM reports WHERE id = ${(res.json() as { report: number }).report}`;
    expect(report).toMatchObject({ reporter_id: me.playerId, reported_id: them.playerId, reason: "insults", note: "chamou-me nomes", status: "open" });
    // Their lines, in the order they were said, the refused one too; and none of the reporter's own.
    expect(report!.lines.map((line) => [line.text, line.said])).toEqual([["primeira coisa", true], ["segunda, recusada", false]]);
    // Not a reason the game knows, and not oneself.
    expect((await post(me.token, "/v1/reports", { biNumber: them.biNumber, reason: "não gosto dele" })).statusCode).toBe(400);
    expect((await post(me.token, "/v1/reports", { biNumber: me.biNumber, reason: "other" })).statusCode).toBe(400);
    // An empty note is no note.
    const bare = await post(me.token, "/v1/reports", { biNumber: them.biNumber, reason: "other", note: "   " });
    const [second] = await sql<{ note: string | null }[]>`SELECT note FROM reports WHERE id = ${(bare.json() as { report: number }).report}`;
    expect(second!.note).toBeNull();
    // "Os meus dados": what they said, whom they shut out, what they reported (and not whom).
    await post(me.token, "/v1/blocks", { biNumber: them.biNumber });
    const file = (await app.inject({ method: "GET", url: "/v1/me/data", headers: as(me.token) })).json() as { said: { text: string }[]; blocked: { biNumber: string }[]; reports: Record<string, unknown>[] };
    expect(file.said.map((line) => line.text)).toEqual(["o que eu disse"]);
    expect(file.blocked.map((one) => one.biNumber)).toEqual([them.biNumber]);
    expect(file.reports).toHaveLength(2);
    expect(JSON.stringify(file.reports)).not.toContain(them.playerId);
    expect(JSON.stringify(file.reports)).not.toContain(them.biNumber);
    // Deleting the account: nobody is left shut out by it; the report stays with the moderators.
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: as(me.token), payload: { biNumber: me.biNumber } })).statusCode).toBe(200);
    expect(await shutOutOf(sql, them.playerId)).toEqual([]);
    expect((await sql`SELECT 1 FROM reports WHERE reporter_id = ${me.playerId}`).length).toBe(2);
  });
});

describe("the Estúdio (Task 3.8)", () => {
  const staffPost = (token: string | null, url: string, payload: unknown = {}) => app.inject({ method: "POST", url, ...(token ? { headers: as(token) } : {}), payload: payload as Record<string, unknown> });
  const staffGet = (token: string | null, url: string) => app.inject({ method: "GET", url, ...(token ? { headers: as(token) } : {}) });
  const signIn = async (email: string, password: string): Promise<string> => {
    const res = await staffPost(null, "/v1/staff/login", { email, password });
    expect(res.statusCode).toBe(200);
    return (res.json() as { token: string }).token;
  };
  let mod: string;
  let support: string;
  let boss: string;

  beforeAll(async () => {
    await putStaff(sql, { email: "Mod@nzila.test", name: "Moderadora Um", passwordHash: await hashPassword("palavra-passe-um"), roles: ["moderador"] });
    await putStaff(sql, { email: "apoio@nzila.test", name: "Apoio Um", passwordHash: await hashPassword("palavra-passe-dois"), roles: ["support"] });
    await putStaff(sql, { email: "chefe@nzila.test", name: "Chefe", passwordHash: await hashPassword("palavra-passe-tres"), roles: ["platform_admin"] });
    mod = await signIn("mod@nzila.test", "palavra-passe-um");
    support = await signIn("apoio@nzila.test", "palavra-passe-dois");
    boss = await signIn("chefe@nzila.test", "palavra-passe-tres");
  }, 60_000);

  test("staff sign in with an address and a password; a wrong one, an unknown address and a switched-off account open nothing; a player's token is not staff's", async () => {
    expect((await staffPost(null, "/v1/staff/login", { email: "mod@nzila.test", password: "errada" })).json()).toEqual({ error: "wrong" });
    expect((await staffPost(null, "/v1/staff/login", { email: "ninguem@nzila.test", password: "palavra-passe-um" })).json()).toEqual({ error: "wrong" });
    expect((await staffGet(mod, "/v1/staff/me")).json()).toEqual({ name: "Moderadora Um", email: "mod@nzila.test", roles: ["moderador"] });
    expect((await staffGet(null, "/v1/staff/me")).statusCode).toBe(401);
    const guest = await newGuest(900);
    expect((await staffGet(guest.token, "/v1/staff/me")).statusCode).toBe(401);
    // And staff's token is no player's.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(mod) })).statusCode).toBe(401);
    // Only the hash of the token is kept, and the password as a salted hash.
    const kept = JSON.stringify(await sql`SELECT * FROM staff_sessions`) + JSON.stringify(await sql`SELECT * FROM staff`);
    expect(kept).not.toContain(mod);
    expect(kept).not.toContain("palavra-passe");
    // Signing out ends that session and no other.
    const again = await signIn("mod@nzila.test", "palavra-passe-um");
    expect((await staffPost(again, "/v1/staff/logout")).statusCode).toBe(200);
    expect((await staffGet(again, "/v1/staff/me")).statusCode).toBe(401);
    expect((await staffGet(mod, "/v1/staff/me")).statusCode).toBe(200);
    // A session lasts a working day.
    const short = await signIn("apoio@nzila.test", "palavra-passe-dois");
    await sql`UPDATE staff_sessions SET expires_at = now() - interval '1 minute' WHERE created_at = (SELECT max(created_at) FROM staff_sessions)`;
    expect((await staffGet(short, "/v1/staff/me")).statusCode).toBe(401);
    // An account switched off is out at once, and cannot come back in.
    await putStaff(sql, { email: "fora@nzila.test", name: "Fora", passwordHash: await hashPassword("palavra-passe-fora"), roles: ["moderador"] });
    const out = await signIn("fora@nzila.test", "palavra-passe-fora");
    await sql`UPDATE staff SET status = 'disabled' WHERE email = 'fora@nzila.test'`;
    expect((await staffGet(out, "/v1/staff/me")).statusCode).toBe(401);
    expect((await staffPost(null, "/v1/staff/login", { email: "fora@nzila.test", password: "palavra-passe-fora" })).statusCode).toBe(401);
  });

  test("a player is found by BI number or name, only with a reason, and the read is written down; each role does its own work and no other", async () => {
    const guest = await newGuest(901);
    expect((await staffPost(support, "/v1/staff/players/find", { key: guest.biNumber })).statusCode).toBe(400);
    expect((await staffPost(support, "/v1/staff/players/find", { key: guest.biNumber, reason: "x" })).statusCode).toBe(400);
    expect((await staffPost(support, "/v1/staff/players/find", { key: "000-nobody", reason: "pedido 12 do apoio" })).statusCode).toBe(404);
    const found = await staffPost(support, "/v1/staff/players/find", { key: guest.biNumber, reason: "pedido 12 do apoio" });
    expect(found.statusCode).toBe(200);
    const { player } = found.json() as { player: Record<string, unknown> };
    expect(player).toMatchObject({ id: guest.playerId, name: guest.name, biNumber: guest.biNumber, kind: "guest", status: "active", ageBand: "18_plus", sanctions: [], reportsAgainst: 0, lines: [], now: null });
    // By name too, however it is capitalised.
    expect(((await staffPost(mod, "/v1/staff/players/find", { key: guest.name.toUpperCase(), reason: "a ver uma denúncia" })).json() as { player: { id: string } }).player.id).toBe(guest.playerId);
    const rows = await sql<{ actor_id: string; reason: string }[]>`SELECT actor_id, reason FROM audit_log WHERE kind = 'player.read' AND subject_id = ${guest.playerId} ORDER BY id`;
    expect(rows.map((row) => row.reason)).toEqual(["pedido 12 do apoio", "a ver uma denúncia"]);
    // Nothing of how they saved their BI, their device or their sessions is in it.
    expect(found.body).not.toMatch(/hash|token|device|email|phone/i);
    // Support does not moderate; a moderator does; the platform admin may do either.
    expect((await staffGet(support, "/v1/staff/reports")).statusCode).toBe(403);
    expect((await staffPost(support, "/v1/staff/sanctions", { key: guest.biNumber, kind: "mute", reason: "não é comigo", hours: 1 })).statusCode).toBe(403);
    expect((await staffGet(mod, "/v1/staff/reports")).statusCode).toBe(200);
    expect((await staffGet(boss, "/v1/staff/reports")).statusCode).toBe(200);
    expect((await staffPost(boss, "/v1/staff/players/find", { key: guest.biNumber, reason: "a conferir o apoio" })).statusCode).toBe(200);
  });

  test("the report queue is read oldest first with what was said; a sanction answers a report, keeps the player out or silent, is written down, and can be lifted", async () => {
    const me = await newGuest(910);
    const them = await newGuest(911);
    await keepChatLines(sql, [{ playerId: them.playerId, districtId: "ao-lua/l1", channel: 1, text: "uma coisa feia", said: true, heardBy: 1 }]);
    const reported = await app.inject({ method: "POST", url: "/v1/reports", headers: as(me.token), payload: { biNumber: them.biNumber, reason: "insults", note: "foi comigo" } });
    const reportId = (reported.json() as { report: number }).report;
    const queue = ((await staffGet(mod, "/v1/staff/reports")).json() as { reports: { id: number; reason: string; note: string | null; lines: { text: string }[]; reporter: { biNumber: string }; reported: { biNumber: string; name: string }; against: number }[] }).reports;
    expect(queue.map((one) => one.id)).toEqual([...queue.map((one) => one.id)].sort((a, b) => a - b));
    const mine = queue.find((one) => one.id === reportId)!;
    expect(mine).toMatchObject({ reason: "insults", note: "foi comigo", reporter: { biNumber: me.biNumber }, reported: { biNumber: them.biNumber, name: them.name }, against: 1 });
    expect(mine.lines.map((line) => line.text)).toEqual(["uma coisa feia"]);

    // A zone is running, and they can come in.
    await presence.announce({ id: "zone-s", address: "", rooms: [{ name: "ao-lua.l1", channels: [{ number: 1, players: 1, who: [them.playerId], meanMs: 1.5, worstMs: 4 }] }] });
    const join = (token: string) => app.inject({ method: "POST", url: "/v1/play/join", headers: as(token), payload: { districtId: "ao-lua/l1" } });
    expect((await join(them.token)).statusCode).toBe(200);

    // A mute and a suspension say how long; a ban says none; nothing is done without a reason.
    expect((await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "mute", reason: "insultos na rua" })).statusCode).toBe(400);
    expect((await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "ban", reason: "insultos na rua", hours: 5 })).statusCode).toBe(400);
    expect((await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "mute", hours: 2 })).statusCode).toBe(400);
    expect((await staffPost(mod, "/v1/staff/sanctions", { key: "000-nobody", kind: "mute", reason: "insultos na rua", hours: 2 })).statusCode).toBe(404);
    const muted = await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "mute", reason: "insultos na rua", hours: 2, reportId });
    expect(muted.statusCode).toBe(200);
    const muteId = (muted.json() as { sanction: number }).sanction;
    expect(await standingAgainst(sql, [them.playerId, me.playerId])).toMatchObject([{ id: muteId, playerId: them.playerId, kind: "mute" }]);
    // Silenced is not kept out.
    expect((await join(them.token)).statusCode).toBe(200);

    const suspended = await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "suspend", reason: "voltou a insultar", hours: 24 });
    const suspendId = (suspended.json() as { sanction: number }).sanction;
    const refused = await join(them.token);
    expect(refused.statusCode).toBe(403);
    const said = refused.json() as { error: string; kind: string; until: string };
    expect(said).toMatchObject({ error: "kept_out", kind: "suspend" });
    expect(Math.abs(Date.parse(said.until) - Date.now() - 24 * 3600_000)).toBeLessThan(60_000);
    // Everything else of the game is still theirs: their BI, their data.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: as(them.token) })).statusCode).toBe(200);
    // The reporter is not touched.
    expect((await join(me.token)).statusCode).toBe(200);

    // Lifted, with why: they may come in again. Lifting twice is nothing to lift.
    expect((await staffPost(mod, "/v1/staff/sanctions/lift", { id: suspendId })).statusCode).toBe(400);
    expect((await staffPost(mod, "/v1/staff/sanctions/lift", { id: suspendId, reason: "foi engano meu" })).statusCode).toBe(200);
    expect((await staffPost(mod, "/v1/staff/sanctions/lift", { id: suspendId, reason: "foi engano meu" })).statusCode).toBe(404);
    expect((await join(them.token)).statusCode).toBe(200);
    // A suspension that has run out keeps nobody out.
    await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "suspend", reason: "uma hora de fora", hours: 1 });
    expect((await join(them.token)).statusCode).toBe(403);
    await sql`UPDATE sanctions SET until = now() - interval '1 second' WHERE player_id = ${them.playerId} AND kind = 'suspend' AND lifted_at IS NULL`;
    expect((await join(them.token)).statusCode).toBe(200);
    // A ban has no end.
    const banned = await staffPost(mod, "/v1/staff/sanctions", { key: them.biNumber, kind: "ban", reason: "ameaças repetidas" });
    expect((await join(them.token)).json()).toEqual({ error: "kept_out", kind: "ban", until: null });

    // The report is closed with what was done; closing it twice is nothing to close; it leaves the queue.
    expect((await staffPost(mod, "/v1/staff/reports/close", { id: reportId })).statusCode).toBe(400);
    expect((await staffPost(mod, "/v1/staff/reports/close", { id: reportId, outcome: "silenciado duas horas" })).statusCode).toBe(200);
    expect((await staffPost(mod, "/v1/staff/reports/close", { id: reportId, outcome: "silenciado duas horas" })).statusCode).toBe(404);
    expect(((await staffGet(mod, "/v1/staff/reports")).json() as { reports: { id: number }[] }).reports.some((one) => one.id === reportId)).toBe(false);
    const [closed] = await sql<{ status: string; outcome: string; closed_by: string }[]>`SELECT status, outcome, closed_by FROM reports WHERE id = ${reportId}`;
    expect(closed).toMatchObject({ status: "closed", outcome: "silenciado duas horas" });

    // What a moderator sees of them now: the history, with who did it, what stands and what was lifted; and where they are.
    const seen = ((await staffPost(mod, "/v1/staff/players/find", { key: them.biNumber, reason: "a rever o caso" })).json() as { player: { sanctions: { id: number; kind: string; by: string; lifted: boolean; standing: boolean }[]; reportsAgainst: number; lines: { text: string }[]; now: unknown } }).player;
    expect(seen.sanctions.map((one) => [one.kind, one.lifted, one.standing])).toEqual([["ban", false, true], ["suspend", false, false], ["suspend", true, false], ["mute", false, true]]);
    expect(seen.sanctions.every((one) => one.by === "Moderadora Um")).toBe(true);
    expect(seen).toMatchObject({ reportsAgainst: 1, now: { room: "ao-lua.l1", channel: 1 } });
    expect(seen.lines.map((line) => line.text)).toEqual(["uma coisa feia"]);

    // "Os meus dados": what was done about them and why is theirs to read; who did it is not.
    const file = (await app.inject({ method: "GET", url: "/v1/me/data", headers: as(them.token) })).json() as { moderation: { kind: string; reason: string }[] };
    expect(file.moderation.map((one) => one.kind)).toEqual(["mute", "suspend", "suspend", "ban"]);
    expect(file.moderation[0]!.reason).toBe("insultos na rua");
    expect(JSON.stringify(file)).not.toContain("Moderadora");
    // Every one of those was written to the log that cannot be changed, with its reason; and the log can be read.
    const log = await sql<{ kind: string; reason: string }[]>`SELECT kind, reason FROM audit_log WHERE subject_id = ${them.playerId} AND actor_kind = 'staff' AND kind <> 'player.read' ORDER BY id`;
    expect(log.map((row) => row.kind)).toEqual(["player.mute", "player.suspend", "player.suspend.lift", "player.suspend", "player.ban"]);
    expect(log[0]!.reason).toBe("insultos na rua");
    const entries = ((await staffGet(support, "/v1/staff/audit")).json() as { entries: { by: string; kind: string; subject: string; reason: string }[] }).entries;
    expect(entries[0]).toMatchObject({ by: "Moderadora Um", kind: "player.read", subject: them.biNumber, reason: "a rever o caso" });
    expect(entries.some((entry) => entry.kind === "report.close" && entry.reason === "silenciado duas horas")).toBe(true);
    await expect(sql`DELETE FROM audit_log WHERE subject_id = ${them.playerId}`).rejects.toThrow();
    expect((banned.json() as { ok: boolean }).ok).toBe(true);
    await presence.retire("zone-s");
  });

  test("the channels are shown with who is in each and how their steps go; a stuck player is kicked with a reason", async () => {
    const guest = await newGuest(920);
    await presence.announce({ id: "zone-c", address: "", rooms: [{ name: "ao-lua.l1", channels: [{ number: 1, players: 1, who: [guest.playerId], meanMs: 2.25, worstMs: 9.5 }, { number: 2, players: 0 }] }] });
    expect((await staffGet(null, "/v1/staff/channels")).statusCode).toBe(401);
    const shown = (await staffGet(support, "/v1/staff/channels")).json() as { zones: { id: string; rooms: { name: string; channels: { number: number; players: number; meanMs: number | null; worstMs: number | null; who: { name: string; biNumber: string }[] }[] }[] }[] };
    const zone = shown.zones.find((one) => one.id === "zone-c")!;
    expect(zone.rooms[0]!.channels).toEqual([
      { number: 1, players: 1, meanMs: 2.25, worstMs: 9.5, who: [{ name: guest.name, biNumber: guest.biNumber }] },
      { number: 2, players: 0, meanMs: null, worstMs: null, who: [] },
    ]);
    expect(JSON.stringify(shown)).not.toContain(guest.playerId);
    expect((await staffPost(support, "/v1/staff/channels/kick", { key: guest.biNumber })).statusCode).toBe(400);
    expect((await staffPost(support, "/v1/staff/channels/kick", { key: guest.biNumber, reason: "preso numa parede" })).statusCode).toBe(200);
    expect(await standingAgainst(sql, [guest.playerId])).toMatchObject([{ playerId: guest.playerId, kind: "kick", until: null }]);
    // A kick keeps nobody out, and is nothing half a minute later.
    expect((await app.inject({ method: "POST", url: "/v1/play/join", headers: as(guest.token), payload: { districtId: "ao-lua/l1" } })).statusCode).toBe(200);
    await sql`UPDATE sanctions SET at = now() - interval '31 seconds' WHERE player_id = ${guest.playerId}`;
    expect(await standingAgainst(sql, [guest.playerId])).toEqual([]);
    expect((await sql`SELECT 1 FROM audit_log WHERE kind = 'player.kick' AND subject_id = ${guest.playerId} AND reason = 'preso numa parede'`).length).toBe(1);
    await presence.retire("zone-c");
  });
});

describe("registering (D-4.12: everyone has an account)", () => {
  const register = (payload: Record<string, unknown>, on = app) => on.inject({ method: "POST", url: "/v1/register", payload });
  const form = (n: number, more: Record<string, unknown> = {}) => ({ deviceId: device(n), platform: "android", ageBand: "18_plus", email: `nova${n}@exemplo.ao`, password: "uma frase que so eu sei", ...more });

  test("an address and a password, and the player exists: linked, in a session, with a BI, and a letter with the code on its way; the address is not yet proved", async () => {
    const res = await register(form(700));
    expect(res.statusCode).toBe(201);
    const made = res.json() as { playerId: string; token: string; name: string; biNumber: string; kind: string; ageBand: string };
    expect(made).toMatchObject({ kind: "linked", ageBand: "18_plus" });
    const me = (await app.inject({ method: "GET", url: "/v1/me", headers: as(made.token) })).json() as { kind: string; savedWith: Record<string, boolean>; biNumber: string };
    expect(me).toMatchObject({ kind: "linked", biNumber: made.biNumber, savedWith: { email: true, emailVerified: false } });
    expect(letters.get("nova700@exemplo.ao")).toHaveLength(1);
    // They prove it when they like, with the code that was sent.
    expect((await app.inject({ method: "POST", url: "/v1/me/email/verify", headers: as(made.token), payload: { code: mailedCode("nova700@exemplo.ao") } })).statusCode).toBe(200);
    // And come back in on another phone with what they registered with.
    expect((await app.inject({ method: "POST", url: "/v1/signin/email", payload: { email: "NOVA700@exemplo.ao", password: "uma frase que so eu sei", deviceId: device(701) } })).statusCode).toBe(200);
    // Neither the address nor the password is kept as written.
    const kept = JSON.stringify(await sql`SELECT * FROM players WHERE id = ${made.playerId}`);
    expect(kept).not.toContain("nova700");
    expect(kept).not.toContain("uma frase");
  });

  test("an address already used makes nobody; nor does an address that is not one, or a password not worth the name", async () => {
    await register(form(710));
    const before = await sql`SELECT count(*)::int AS n FROM players`;
    expect((await register(form(711, { email: "nova710@exemplo.ao" }))).json()).toEqual({ error: "has_account" });
    expect((await register(form(712, { email: "isto não é" }))).json()).toEqual({ error: "invalid" });
    expect((await register(form(713, { password: "curta" }))).json()).toEqual({ error: "invalid" });
    expect((await register({ email: "x@exemplo.ao", password: "uma frase que so eu sei" })).statusCode).toBe(400);
    expect(await sql`SELECT count(*)::int AS n FROM players`).toEqual(before);
    // Two at the same instant with one address: one player.
    const holders = async (): Promise<number> => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM players WHERE email_hash IS NOT NULL AND status = 'active'`)[0]!.n;
    const held = await holders();
    const both = await Promise.all([register(form(714, { email: "gemeos@exemplo.ao" })), register(form(715, { email: "gemeos@exemplo.ao" }))]);
    expect(both.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    // One more player holds an address, not two; and nobody was left behind as a player without one.
    expect(await holders()).toBe(held + 1);
    expect(await sql`SELECT count(*)::int AS n FROM players p JOIN devices d ON d.player_id = p.id WHERE p.status = 'active' AND p.email_hash IS NULL AND p.created_at > now() - interval '3 seconds' AND p.kind = 'guest' AND p.name IS NOT NULL AND d.platform = 'android' AND p.id NOT IN (SELECT player_id FROM player_sessions)`).toEqual([{ n: 0 }]);
  });

  test("nobody plays without registering: the door for guests is shut unless a server is started with it open", async () => {
    const shut = buildApp({ sql, pepper, keyring, mailer, limiter: { allow: () => true } });
    expect((await shut.inject({ method: "POST", url: "/v1/guests", payload: { deviceId: device(720), ageBand: "18_plus" } })).json()).toEqual({ error: "forbidden" });
    expect((await register(form(721), shut)).statusCode).toBe(201);
    await shut.close();
  });
});

describe("the bank: into the Banco and out of it, at a caixa (Task 4.1)", () => {
  const bank = (token: string | null, way: "deposit" | "withdraw", payload: Record<string, unknown>) => app.inject({ method: "POST", url: `/v1/bank/${way}`, ...(token ? { headers: as(token) } : {}), payload });
  const born = async (n: number) => {
    const guest = await newGuest(n);
    const card = ((await app.inject({ method: "POST", url: "/v1/me/origin", headers: as(guest.token) })).json() as { origin: { makuta: number } }).origin;
    return { ...guest, makuta: card.makuta };
  };

  test("only someone the zone says is standing at a caixa may bank; what goes in is safe, what comes out is on them; a second sending moves nothing", async () => {
    const one = await born(800);
    // Nowhere near a caixa, as far as any zone has said: the phone's word for it is not asked.
    expect((await bank(one.token, "deposit", { amount: 500, key: "primeiro-01" })).json()).toEqual({ error: "not_at_caixa" });
    await presence.mark(one.playerId, "caixa");
    const put = await bank(one.token, "deposit", { amount: 500, key: "primeiro-01" });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ cash: one.makuta - 500, bank: 500 });
    // The line dropped and the phone sends it again: the same answer, and nothing more moved.
    expect((await bank(one.token, "deposit", { amount: 500, key: "primeiro-01" })).json()).toEqual(put.json());
    // The same key for something else is refused, not recorded.
    expect((await bank(one.token, "deposit", { amount: 700, key: "primeiro-01" })).json()).toEqual({ error: "invalid" });
    // More than they hold, either way: said plainly, nothing moved.
    expect((await bank(one.token, "deposit", { amount: one.makuta, key: "demais-0001" })).json()).toEqual({ error: "insufficient" });
    expect((await bank(one.token, "withdraw", { amount: 501, key: "demais-0002" })).json()).toEqual({ error: "insufficient" });
    const out = await bank(one.token, "withdraw", { amount: 200, key: "levantar-01" });
    expect(out.json()).toMatchObject({ cash: one.makuta - 300, bank: 300 });
    // Their statement says so, each side with its sign; and the Banco's own lines are its own.
    const wallet = (await app.inject({ method: "GET", url: "/v1/me/wallet", headers: as(one.token) })).json() as { cash: number; bank: number; cashLines: { amount: number; reason: string }[]; bankLines: { amount: number; reason: string; with: string }[] };
    expect(wallet).toMatchObject({ cash: one.makuta - 300, bank: 300 });
    expect(wallet.bankLines.map((line) => [line.amount, line.reason, line.with])).toEqual([[-200, "bank_out", "player_cash"], [500, "bank_in", "player_cash"]]);
    expect(wallet.cashLines.map((line) => [line.amount, line.reason])).toEqual([[200, "bank_out"], [-500, "bank_in"], [one.makuta, "grant"]]);
    // Not an amount, not a key, nobody: nothing.
    for (const payload of [{ amount: 0, key: "zero-00001" }, { amount: 1.5, key: "meio-00001" }, { amount: -5, key: "menos-0001" }, { amount: 100, key: "x" }, { amount: 100 }]) expect((await bank(one.token, "deposit", payload)).statusCode).toBe(400);
    expect((await bank(null, "deposit", { amount: 100, key: "ninguem-001" })).statusCode).toBe(401);
    // Someone else standing at a caixa banks their own, never this one's.
    const two = await born(801);
    await presence.mark(two.playerId, "caixa");
    expect((await bank(two.token, "withdraw", { amount: 100, key: "alheio-0001" })).json()).toEqual({ error: "insufficient" });
    expect(await auditLedger(sql)).toMatchObject({ ok: true, sum: 0 });
  });
});


describe("handing Makuta to another player, in person (Task 4.1, D-4.11)", () => {
  const post = (token: string, url: string, payload: Record<string, unknown> = {}) => app.inject({ method: "POST", url, headers: as(token), payload });
  const registered = async (n: number) => {
    const email = `mao${n}@exemplo.ao`;
    const made = (await app.inject({ method: "POST", url: "/v1/register", payload: { deviceId: device(n), platform: "android", ageBand: "18_plus", email, password: "uma frase que so eu sei" } })).json() as { playerId: string; token: string; name: string; biNumber: string };
    const cash = ((await post(made.token, "/v1/me/origin")).json() as { wallet: { cash: number } }).wallet.cash;
    return { ...made, email, cash };
  };

  test("only to someone the zone says is beside them, from an address that is proved, after the days a new account waits, inside the day's limit; recorded once; the other is told", async () => {
    const giver = await registered(950);
    const taker = await registered(951);
    const pay = (amount: number, key: string, to = taker.biNumber) => post(giver.token, "/v1/pay", { biNumber: to, amount, key });
    // Not standing together, as far as any zone has said.
    expect((await pay(100, "primeira-001")).json()).toEqual({ error: "not_together" });
    await presence.mark(giver.playerId, "com", `outro-qualquer,${taker.playerId}`);
    // The address is not proved yet.
    expect((await pay(100, "primeira-001")).json()).toEqual({ error: "unproved" });
    expect((await post(giver.token, "/v1/me/email/verify", { code: mailedCode(giver.email) })).statusCode).toBe(200);
    // A new account sends nothing for its first days, and is told how many are left.
    expect((await pay(100, "primeira-001")).json()).toEqual({ error: "too_new", days: BASE_TUNABLES.transfers.noSendDays });
    await sql`UPDATE players SET arrived_at = now() - interval '4 days' WHERE id = ${giver.playerId}`;
    const paid = await pay(100, "primeira-001");
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ cash: giver.cash - 100, bank: 0 });
    // Sent again by a phone on a bad line: nothing more moves.
    expect((await pay(100, "primeira-001")).json()).toEqual(paid.json());
    // The other holds it, and their phone is told who gave it, once it asks.
    const got = (await app.inject({ method: "GET", url: "/v1/me/balance", headers: as(taker.token) })).json() as { cash: number; got: { amount: number; from: string } };
    expect(got).toMatchObject({ cash: taker.cash + 100, got: { amount: 100, from: giver.name } });
    expect((await app.inject({ method: "GET", url: "/v1/me/balance", headers: as(giver.token) })).json()).toMatchObject({ cash: giver.cash - 100, got: null });
    // More than is in the Carteira; and more than a new account may send in a day, however much it holds.
    if (BASE_TUNABLES.transfers.newAccountDailyCap - 100 >= giver.cash) expect((await pay(giver.cash, "demais-00001")).json()).toEqual({ error: "insufficient" });
    expect((await pay(BASE_TUNABLES.transfers.newAccountDailyCap, "demais-00002")).json()).toEqual({ error: "over_limit", left: BASE_TUNABLES.transfers.newAccountDailyCap - 100 });
    // Not to oneself, not to nobody, not an amount that is not one.
    expect((await pay(50, "eu-mesmo-0001", giver.biNumber)).statusCode).toBe(400);
    expect((await pay(50, "ninguem-00001", "000-nobody")).statusCode).toBe(404);
    for (const amount of [0, -5, 1.5]) expect((await pay(amount, "quanto-00001")).statusCode).toBe(400);
    // Someone who has shut the giver out is given nothing by them: to the giver they are not there.
    await post(taker.token, "/v1/blocks", { biNumber: giver.biNumber });
    expect((await pay(50, "fechado-00001")).json()).toEqual({ error: "not_found" });
    expect(await auditLedger(sql)).toMatchObject({ ok: true, sum: 0 });
  });
});

describe("things, and the cantina (Tasks 4.2 and 4.3)", () => {
  const post = (token: string, url: string, payload: Record<string, unknown>) => app.inject({ method: "POST", url, headers: as(token), payload });
  const born = async (n: number) => {
    const guest = await newGuest(n);
    const cash = ((await post(guest.token, "/v1/me/origin", {})).json() as { wallet: { cash: number } }).wallet.cash;
    return { ...guest, cash };
  };
  const shopping = (token: string, lines: { item: string; quantity: number }[], key: string, shop = "cantina-largo") => post(token, "/v1/shop/buy", { shop, lines, key });

  test("bought at the grille of a cantina the zone says the player stands at: paid through the ledger, in the Mochila, on a receipt; sent twice, bought once", async () => {
    const one = await born(1300);
    expect((await shopping(one.token, [{ item: "pao", quantity: 2 }], "compra-0001")).json()).toEqual({ error: "not_at_shop" });
    await presence.mark(one.playerId, "loja", "cantina-largo");
    // At another shop than the one asked for, nothing is sold.
    expect((await shopping(one.token, [{ item: "pao", quantity: 2 }], "compra-0001", "cantina-marginal")).json()).toEqual({ error: "not_at_shop" });
    const bought = await shopping(one.token, [{ item: "pao", quantity: 2 }, { item: "sumo", quantity: 1 }], "compra-0001");
    expect(bought.statusCode).toBe(200);
    const said = bought.json() as { receipt: { id: number; shop: string; total: number; lines: unknown[] }; cash: number; items: { item: string; quantity: number }[] };
    expect(said.receipt).toMatchObject({ shop: "cantina-largo", total: 300, lines: [{ item: "pao", quantity: 2, price: 50, amount: 100 }, { item: "sumo", quantity: 1, price: 200, amount: 200 }] });
    expect(said.cash).toBe(one.cash - 300);
    expect(said.items).toEqual([{ item: "pao", quantity: 2 }, { item: "sumo", quantity: 1 }]);
    // A phone on a bad line sends it again: the same receipt, nothing more paid or carried.
    const again = (await shopping(one.token, [{ item: "pao", quantity: 2 }, { item: "sumo", quantity: 1 }], "compra-0001")).json() as { receipt: { id: number }; cash: number; items: unknown[] };
    expect(again.receipt.id).toBe(said.receipt.id);
    expect(again.cash).toBe(one.cash - 300);
    expect(again.items).toEqual(said.items);
    // Twenty at the same instant with one key: one purchase.
    const burst = await Promise.all(Array.from({ length: 10 }, () => shopping(one.token, [{ item: "agua", quantity: 1 }], "compra-0002")));
    expect(new Set(burst.map((res) => (res.json() as { receipt: { id: number } }).receipt.id)).size).toBe(1);
    const mochila = (await app.inject({ method: "GET", url: "/v1/me/items", headers: as(one.token) })).json() as { items: { item: string; quantity: number }[]; units: number; carryUnits: number; receipts: { id: number }[] };
    expect(mochila.items).toEqual([{ item: "pao", quantity: 2 }, { item: "sumo", quantity: 1 }, { item: "agua", quantity: 1 }]);
    // Standing at the cantina, the phone is told what it sells and at what price, and what each thing is.
    const looked = (await app.inject({ method: "GET", url: "/v1/me/items", headers: as(one.token) })).json() as { shop: { id: string; stock: { item: string; price: number }[] } | null; about: Record<string, { kind: string; size: number; use: string | null }> };
    expect(looked.shop?.id).toBe("cantina-largo");
    expect(looked.shop?.stock).toContainEqual({ item: "pao", price: 50 });
    expect(looked.about.pao).toEqual({ kind: "comida", size: 1, use: "comer" });
    expect(looked.about.carvao).toEqual({ kind: "casa", size: 6, use: null });
    expect(looked).toMatchObject({ cash: one.cash - 400, bank: 0 });
    expect(mochila.units).toBe(4);
    expect(mochila.receipts).toHaveLength(2);
    expect(await auditLedger(sql)).toMatchObject({ ok: true, sum: 0 });
  });

  test("what is not sold, more than is held, more than a Mochila holds, and a price the phone names are refused", async () => {
    const one = await born(1310);
    await presence.mark(one.playerId, "loja", "cantina-largo");
    expect((await shopping(one.token, [{ item: "carro", quantity: 1 }], "nada-00001")).json()).toEqual({ error: "not_sold" });
    expect((await post(one.token, "/v1/shop/buy", { shop: "cantina-largo", lines: [{ item: "pao", quantity: 1, price: 1 }], key: "preco-0001" })).statusCode).toBe(400);
    // More than the Carteira holds: nothing paid, nothing carried. (All but 100 Mk put in the bank first, whatever
    // the family dealt, so that one bottle of oil is more than is held.)
    await presence.mark(one.playerId, "caixa");
    await post(one.token, "/v1/bank/deposit", { amount: one.cash - 100, key: "caro-banco-01" });
    expect((await shopping(one.token, [{ item: "oleo", quantity: 1 }], "caro-00001")).json()).toEqual({ error: "insufficient" });
    // More than a Mochila holds: carvão is six units a bag.
    await presence.mark(one.playerId, "loja", "cantina-largo");
    expect((await shopping(one.token, [{ item: "carvao", quantity: 5 }], "pesado-001")).json()).toEqual({ error: "too_heavy" });
    expect((await app.inject({ method: "GET", url: "/v1/me/items", headers: as(one.token) })).json()).toMatchObject({ items: [], units: 0 });
  });

  test("eaten and drunk one at a time; given to someone beside you, never across a block, never more than they can carry", async () => {
    const one = await born(1320);
    const two = await born(1321);
    await presence.mark(one.playerId, "loja", "cantina-largo");
    await shopping(one.token, [{ item: "pao", quantity: 1 }, { item: "gasosa", quantity: 2 }, { item: "arroz", quantity: 1 }], "comer-0001");
    expect((await post(one.token, "/v1/items/use", { item: "pao" })).json()).toEqual({ used: "comer", items: [{ item: "gasosa", quantity: 2 }, { item: "arroz", quantity: 1 }] });
    expect((await post(one.token, "/v1/items/use", { item: "pao" })).json()).toEqual({ error: "none" });
    // Rice is cooked at home, not eaten in the street.
    expect((await post(one.token, "/v1/items/use", { item: "arroz" })).json()).toEqual({ error: "invalid" });
    // A gasosa to someone beside you.
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "gasosa", quantity: 1 })).json()).toEqual({ error: "not_together" });
    await presence.mark(one.playerId, "com", two.playerId);
    // (A gasosa given is the day's errand for two as well.)
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "gasosa", quantity: 1 })).json()).toEqual({ items: [{ item: "gasosa", quantity: 1 }, { item: "arroz", quantity: 1 }], aDois: true });
    expect((await app.inject({ method: "GET", url: "/v1/me/items", headers: as(two.token) })).json()).toMatchObject({ items: [{ item: "gasosa", quantity: 1 }] });
    // More than is held, and something that is not a thing.
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "gasosa", quantity: 5 })).json()).toEqual({ error: "none" });
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "unicornio", quantity: 1 })).json()).toEqual({ error: "invalid" });
    // Once the other has shut them out, nothing is given.
    await post(two.token, "/v1/blocks", { biNumber: one.biNumber });
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "gasosa", quantity: 1 })).json()).toEqual({ error: "not_found" });
  });
});

describe("os recados do dia, the family's money, the errand for two, the cantina's card", () => {
  const post = (token: string, url: string, payload: Record<string, unknown> = {}) => app.inject({ method: "POST", url, headers: as(token), payload });
  const get = (token: string, url: string) => app.inject({ method: "GET", url, headers: as(token) });
  const born = async (n: number) => {
    const guest = await newGuest(n);
    const cash = ((await post(guest.token, "/v1/me/origin", {})).json() as { wallet: { cash: number } }).wallet.cash;
    await presence.stand(guest.playerId, { districtId: "lda/recados", x: 0, y: 0, z: 0, yaw: 0 });
    return { ...guest, cash };
  };
  type Day = { day: string; recados: { n: number; kind: string; who: number; item?: string; place?: number; amount?: number; done: boolean }[]; next: number; aDois: { done: boolean; pay: number }; familia: { amount: number; done: boolean }; apagao: boolean; festa: { done: number; goal: number } };

  test("three a day, each done only when it really is, paid once from the neighbours, less for each after the first; the festa counts them", async () => {
    const one = await born(1400);
    // Enough in the Carteira for whatever errands the day draws (a deposit of 1 500 and the thing to bring may be more
    // than a family gave): given through the ledger, from the faucet, as all Makuta is (F-219).
    const [faucet] = await sql<{ id: string }[]>`SELECT id FROM ledger_accounts WHERE kind = 'system_faucet' LIMIT 1`;
    await sql`INSERT INTO ledger_transfers (debit_account, credit_account, amount, reason, action_id) VALUES (${faucet!.id}, ${`player_cash:${one.playerId}`}, 5000, 'starting_grant', ${`recados-test-${one.playerId}`})`;
    one.cash += 5000;
    const day = (await get(one.token, "/v1/recados")).json() as Day;
    expect(day.recados).toHaveLength(3);
    expect(day.recados.every((each) => !each.done)).toBe(true);
    expect(day.next).toBe(300);
    expect(typeof day.apagao).toBe("boolean");
    const festaBefore = day.festa.done;
    let cash = one.cash;
    let paid = 0;
    for (const each of day.recados) {
      if (each.kind === "traz" || each.kind === "vaiver") {
        // Not at the place: refused. At it (the zone says so): done.
        await presence.mark(one.playerId, "lugar", `${(each.place! + 1) % 10}/10`);
        expect((await post(one.token, "/v1/recados/feito", { n: each.n })).json()).toEqual({ error: "not_there" });
        await presence.mark(one.playerId, "lugar", `${each.place! % 10}/10`);
        if (each.kind === "traz") {
          // Without the thing in the Mochila, there is nothing to hand over.
          expect((await post(one.token, "/v1/recados/feito", { n: each.n })).json()).toEqual({ error: "none" });
          await presence.mark(one.playerId, "loja", "cantina-largo");
          const bought = await post(one.token, "/v1/shop/buy", { shop: "cantina-largo", lines: [{ item: each.item, quantity: 1 }], key: `recado-${each.n}-0001` });
          expect(bought.statusCode, bought.body).toBe(200);
          cash = (bought.json() as { cash: number }).cash;
          await presence.mark(one.playerId, "lugar", `${each.place! % 10}/10`);
        }
      } else if (each.kind === "guarda") {
        expect((await post(one.token, "/v1/recados/feito", { n: each.n })).json()).toEqual({ error: "not_yet" });
        // Asked by the phone itself, after a deposit that was not enough: an answer, not a refusal.
        expect((await post(one.token, "/v1/recados/feito", { n: each.n, tentativa: true })).json()).toEqual({ done: false, why: "not_yet" });
        await presence.mark(one.playerId, "caixa");
        const deposited = await post(one.token, "/v1/bank/deposit", { amount: each.amount, key: `guarda-${each.n}-0001` });
        expect(deposited.statusCode, deposited.body).toBe(200);
        cash = (deposited.json() as { cash: number }).cash;
      } else {
        expect((await post(one.token, "/v1/recados/feito", { n: each.n })).json()).toEqual({ error: "not_yet" });
        // Met someone new to the bairro: done.
        const newcomer = await born(1401);
        await presence.mark(one.playerId, "conheceu", `${one.playerId},${newcomer.playerId}`, 600);
      }
      const done = await post(one.token, "/v1/recados/feito", { n: each.n });
      expect(done.statusCode, `${each.kind}: ${done.body}`).toBe(200);
      const said = done.json() as { pay: number; cash: number };
      expect(said.pay).toBe([300, 250, 200][paid]);
      expect(said.cash).toBe(cash + said.pay);
      cash = said.cash;
      paid += 1;
      expect((await post(one.token, "/v1/recados/feito", { n: each.n })).json()).toEqual({ error: "done" });
    }
    const after = (await get(one.token, "/v1/recados")).json() as Day;
    expect(after.recados.every((each) => each.done)).toBe(true);
    expect(after.festa.done).toBe(festaBefore + 3);
    expect((await post(one.token, "/v1/recados/feito", { n: 5 })).json()).toEqual({ error: "not_found" });
    expect(await auditLedger(sql)).toMatchObject({ ok: true, sum: 0 });
  });

  test("the family gives for the taxi once a day, as much as it can", async () => {
    const one = await born(1410);
    const day = (await get(one.token, "/v1/recados")).json() as Day;
    expect(day.familia.amount).toBeGreaterThan(0);
    const given = (await post(one.token, "/v1/familia")).json() as { amount: number; cash: number };
    expect(given).toMatchObject({ amount: day.familia.amount, cash: one.cash + day.familia.amount });
    expect((await post(one.token, "/v1/familia")).json()).toEqual({ error: "done" });
    expect(((await get(one.token, "/v1/recados")).json() as Day).familia.done).toBe(true);
  });

  test("a gasosa given to someone beside you is the errand for two: paid once a day to both", async () => {
    const one = await born(1420);
    const two = await born(1421);
    await presence.mark(one.playerId, "loja", "cantina-largo");
    await post(one.token, "/v1/shop/buy", { shop: "cantina-largo", lines: [{ item: "gasosa", quantity: 2 }], key: "adois-0001" });
    const before = ((await get(two.token, "/v1/me/wallet")).json() as { cash: number }).cash;
    await presence.mark(one.playerId, "com", two.playerId);
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "gasosa", quantity: 1 })).json()).toMatchObject({ aDois: true });
    expect(((await get(two.token, "/v1/me/wallet")).json() as { cash: number }).cash).toBe(before + 100);
    expect(((await get(one.token, "/v1/recados")).json() as Day).aDois.done).toBe(true);
    // A second gasosa the same day is a kindness, and not paid for.
    expect((await post(one.token, "/v1/items/give", { biNumber: two.biNumber, item: "gasosa", quantity: 1 })).json()).toMatchObject({ aDois: false });
  });

  test("the cantina's card: a stamp a day, and on the seventh day the dona gives a loaf", async () => {
    const one = await born(1430);
    await presence.mark(one.playerId, "loja", "cantina-largo");
    const first = (await post(one.token, "/v1/shop/buy", { shop: "cantina-largo", lines: [{ item: "agua", quantity: 1 }], key: "cartao-0001" })).json() as { card: { stamps: number; filled: boolean }; receipt: { id: number } };
    expect(first.card).toMatchObject({ stamps: 1, filled: false });
    // Six days of buying there before today, as the receipts would have them.
    const [receipt] = await sql<{ transfer_id: string }[]>`SELECT transfer_id FROM receipts WHERE id = ${first.receipt.id}`;
    for (let d = 1; d <= 6; d++) await sql`INSERT INTO receipts (at, player_id, shop, lines, total, transfer_id, key) VALUES (now() - ${`${d} days`}::interval, ${one.playerId}, 'cantina-largo', '[]', 100, ${receipt!.transfer_id}, ${`passado-${d}`})`;
    // Today again: no new stamp for a second purchase on a day.
    const again = (await post(one.token, "/v1/shop/buy", { shop: "cantina-largo", lines: [{ item: "agua", quantity: 1 }], key: "cartao-0002" })).json() as { card: { stamps: number; filled: boolean } };
    expect(again.card).toMatchObject({ stamps: 7, filled: false });
    // Without today's purchases, the card shows six; the purchase that makes the seventh day fills it.
    await sql`DELETE FROM receipts WHERE player_id = ${one.playerId} AND at > now() - interval '12 hours'`;
    await presence.mark(one.playerId, "loja", "cantina-largo");
    const looked = (await get(one.token, "/v1/me/items")).json() as { shop: { card: { stamps: number; of: number } } };
    expect(looked.shop.card).toMatchObject({ stamps: 6, of: 7 });
    const seventh = (await post(one.token, "/v1/shop/buy", { shop: "cantina-largo", lines: [{ item: "agua", quantity: 1 }], key: "cartao-0003" })).json() as { card: { stamps: number; filled: boolean; gift: string | null }; items: { item: string; quantity: number }[] };
    expect(seventh.card).toEqual({ stamps: 7, of: 7, filled: true, gift: "pao" });
    expect(seventh.items).toContainEqual({ item: "pao", quantity: 1 });
    // A new card begins.
    await presence.mark(one.playerId, "loja", "cantina-largo");
    expect(((await get(one.token, "/v1/me/items")).json() as { shop: { card: { stamps: number } } }).shop.card.stamps).toBe(0);
  });
});
