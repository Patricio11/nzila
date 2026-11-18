// The database, for real: these tests run against PostgreSQL (`pnpm services`
// starts it). Each run creates its own database and drops it afterwards, so
// development data is never touched. Every Makuta figure is a fixture.

import { getTableColumns, getTableName } from "drizzle-orm";
import { expireTalk, keepChatLines, reportPlayer } from "./talk.ts";
import { auditLedger, balanceOf, grantOrigin, lastLedgerAudit, nightlyLedgerAudit, recordTransfer, statementOf, walletOf } from "./ledger.ts";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  CONSENT_PURPOSES,
  audit as auditLog,
  connect,
  consentsOf,
  databaseUrl,
  decryptField,
  loadMigrations,
  loadWorldSeed,
  migrate,
  parseKeyring,
  parsePepper,
  protectPhone,
  recordConsent,
  seed,
  tables,
} from "./index.ts";
import { audit, faucet, sink, systemAccountIds, type Transfer } from "@nzila/economy";

const name = `nzila_test_${process.pid}_${Date.now()}`;
let admin: Sql;
let sql: Sql;

beforeAll(async () => {
  admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(databaseUrl());
  url.pathname = `/${name}`;
  sql = connect(url.toString(), 30);
}, 60_000);

afterAll(async () => {
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  // Three suites drop their databases at the same moment: more than the ten seconds a hook is given.
}, 60_000);

const refusal = async (query: Promise<unknown>): Promise<string> => {
  try {
    await query;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return "accepted";
};
const APPEND_ONLY = "23001"; // restrict_violation, raised by the triggers
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

let action = 0;
function transfer(debit: string, credit: string, amount: number, extra: { reverses?: string; actionId?: string } = {}) {
  return sql<{ id: string }[]>`
    INSERT INTO ledger_transfers (debit_account, credit_account, amount, reason, action_id, province_id, district_id, reverses)
    VALUES (${debit}, ${credit}, ${amount}, 'p2p', ${extra.actionId ?? `it-${++action}`}, 'ao-lua', 'ao-lua/l1', ${extra.reverses ?? null})
    RETURNING id`;
}
async function account(id: string): Promise<string> {
  const [kind, ref] = id.split(":") as [string, string];
  await sql`INSERT INTO ledger_accounts (id, kind, ref) VALUES (${id}, ${kind}, ${ref}) ON CONFLICT DO NOTHING`;
  return id;
}
async function balance(id: string): Promise<number> {
  const rows = await sql<{ balance: string }[]>`SELECT balance FROM balances WHERE account_id = ${id}`;
  return Number(rows[0]?.balance ?? 0);
}

describe("migrations", () => {
  test("apply once, and a second run applies nothing", async () => {
    expect(await migrate(sql)).toEqual(["0001_core", "0002_player_contact", "0003_player_origins", "0004_player_names", "0005_login_codes", "0006_player_email", "0007_email_verified", "0008_talk", "0009_studio"]);
    expect(await migrate(sql)).toEqual([]);
  });

  test("every migration can be run again as it is and changes nothing (the guards)", async () => {
    const before = await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`;
    for (const m of await loadMigrations()) await sql.unsafe(m.sql);
    const after = await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`;
    expect(after).toEqual(before);
  });

  test("an applied migration that was edited afterwards stops the migrator", async () => {
    const [first] = await loadMigrations();
    await expect(migrate(sql, [{ ...first!, sha256: "0".repeat(64) }])).rejects.toThrow(/never edited/);
  });

  test("a migration that fails leaves nothing behind", async () => {
    const broken = { id: "9999_broken", sha256: "x", sql: "CREATE TABLE half_made (id int); SELECT 1 / 0;" };
    await expect(migrate(sql, [broken])).rejects.toThrow();
    expect(await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'half_made'`).toEqual([]);
    expect(await sql`SELECT 1 FROM schema_migrations WHERE id = '9999_broken'`).toEqual([]);
  });
});

describe("the schema", () => {
  test("the Drizzle tables and the database agree, column for column", async () => {
    const rows = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
      SELECT table_name, column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> 'schema_migrations'`;
    const inDatabase = rows.map((r) => `${r.table_name}.${r.column_name} ${r.is_nullable === "YES" ? "null" : "not null"}`).sort();
    const inCode = Object.values(tables)
      .flatMap((table) => Object.values(getTableColumns(table)).map((c) => `${getTableName(table)}.${c.name} ${c.notNull ? "not null" : "null"}`))
      .sort();
    expect(inCode).toEqual(inDatabase);
  });

  test("every world-scoped table carries province_id and district_id (seam 1)", async () => {
    for (const table of ["packs", "players", "audit_log", "feature_flags", "ledger_transfers"]) {
      const rows = await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${table} AND column_name IN ('province_id', 'district_id') ORDER BY 1`;
      expect(rows.map((r) => r.column_name), table).toEqual(["district_id", "province_id"]);
    }
  });
});

describe("the seed", () => {
  test("creates the system accounts and the first province and district, and can be run again", async () => {
    await seed(sql);
    await seed(sql);
    const accounts = await sql<{ id: string }[]>`SELECT id FROM ledger_accounts ORDER BY id`;
    expect(accounts.map((a) => a.id)).toEqual(systemAccountIds().sort());
    const world = await loadWorldSeed();
    expect((await sql`SELECT id FROM provinces`).map((r) => r.id)).toEqual(world.provinces.map((p) => p.id));
    expect((await sql`SELECT id, province_id FROM districts`).map((r) => [r.id, r.province_id])).toEqual(
      world.districts.map((d) => [d.id, d.provinceId]),
    );
  });

  test("an account id must be its kind and its reference", async () => {
    expect(await refusal(sql`INSERT INTO ledger_accounts (id, kind, ref) VALUES ('player_cash:x', 'player_bank', 'x')`)).toBe(CHECK);
    expect(await refusal(sql`INSERT INTO ledger_accounts (id, kind, ref) VALUES ('wallet:x', 'wallet', 'x')`)).toBe(CHECK);
  });
});

describe("the ledger in the database", () => {
  let ana: string;
  let beto: string;

  beforeAll(async () => {
    ana = await account("player_cash:ana");
    beto = await account("player_cash:beto");
    await transfer(faucet("wage"), ana, 1000);
  });

  test("a transfer moves both balances; a faucet runs negative", async () => {
    await transfer(ana, beto, 300);
    expect(await balance(ana)).toBe(700);
    expect(await balance(beto)).toBe(300);
    expect(await balance(faucet("wage"))).toBe(-1000);
  });

  test("an overdraw is refused by the database itself, and nothing is recorded", async () => {
    const before = await sql`SELECT count(*) FROM ledger_transfers`;
    expect(await refusal(transfer(ana, beto, 701))).toBe(CHECK);
    expect(await refusal(transfer(beto, sink("fare"), 301))).toBe(CHECK);
    expect(await sql`SELECT count(*) FROM ledger_transfers`).toEqual(before);
    expect(await balance(ana)).toBe(700);
  });

  test("an amount must be positive and the two accounts different and known", async () => {
    expect(await refusal(transfer(ana, beto, 0))).toBe(CHECK);
    expect(await refusal(transfer(ana, beto, -5))).toBe(CHECK);
    expect(await refusal(transfer(ana, ana, 5))).toBe(CHECK);
    expect(await refusal(transfer(ana, "player_cash:nobody", 5))).toBe(FOREIGN_KEY);
  });

  test("the same action cannot be recorded twice", async () => {
    await transfer(ana, beto, 10, { actionId: "fare-once" });
    expect(await refusal(transfer(ana, beto, 10, { actionId: "fare-once" }))).toBe(UNIQUE);
    expect(await balance(ana)).toBe(690);
  });

  test("a transfer can be reversed once, by a new row that points at it", async () => {
    const [original] = await transfer(ana, beto, 100);
    await transfer(beto, ana, 100, { reverses: original!.id });
    expect(await balance(ana)).toBe(690);
    expect(await refusal(transfer(beto, ana, 100, { reverses: original!.id }))).toBe(UNIQUE);
  });

  test("a transfer is never changed, never removed", async () => {
    expect(await refusal(sql`UPDATE ledger_transfers SET amount = 1`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`DELETE FROM ledger_transfers`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`TRUNCATE ledger_transfers CASCADE`)).toBe(APPEND_ONLY);
  });

  test("no Makuta moves outside the ledger: a balance cannot be written directly", async () => {
    expect(await refusal(sql`UPDATE balances SET balance = 999999 WHERE account_id = ${ana}`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`DELETE FROM balances WHERE account_id = ${ana}`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`INSERT INTO balances (account_id, balance) VALUES (${await account("player_bank:ana")}, 500)`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`TRUNCATE balances`)).toBe(APPEND_ONLY);
    expect(await balance(ana)).toBe(690);
  });

  test("forty transfers at the same instant cannot spend the same Makuta twice", async () => {
    const carla = await account("player_cash:carla");
    await transfer(faucet("wage"), carla, 1000);
    const results = await Promise.all(Array.from({ length: 40 }, () => refusal(transfer(carla, sink("fare"), 100))));
    expect(results.filter((r) => r === "accepted").length).toBe(10);
    expect(results.filter((r) => r === CHECK).length).toBe(30);
    expect(await balance(carla)).toBe(0);
  });

  test("transfers both ways between the same two accounts at once do not deadlock", async () => {
    const dino = await account("player_cash:dino");
    const eva = await account("player_cash:eva");
    await transfer(faucet("wage"), dino, 5000);
    await transfer(faucet("wage"), eva, 5000);
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => refusal(i % 2 ? transfer(dino, eva, 10) : transfer(eva, dino, 10))),
    );
    expect(results.every((r) => r === "accepted")).toBe(true);
    expect((await balance(dino)) + (await balance(eva))).toBe(10_000);
  });

  test("after all of the above the books sum to zero and every balance equals its transfers", async () => {
    const rows = await sql<Record<string, string>[]>`SELECT id, debit_account, credit_account, amount FROM ledger_transfers`;
    const transfers = rows.map((r) => ({ id: r.id, debitAccount: r.debit_account, creditAccount: r.credit_account, amount: Number(r.amount) }) as Transfer);
    const cached = new Map<string, number>();
    for (const row of await sql<{ account_id: string; balance: string }[]>`SELECT account_id, balance FROM balances`) {
      cached.set(row.account_id, Number(row.balance));
    }
    expect(transfers.length).toBeGreaterThan(70);
    expect(audit(transfers, cached)).toEqual({ sum: 0, mismatched: [] });
  });
});

describe("the audit log", () => {
  test("takes rows with a reason, and never lets one be changed or removed", async () => {
    const row = (reason: string | null) => sql`
      INSERT INTO audit_log (actor_kind, actor_id, kind, subject_kind, subject_id, reason)
      VALUES ('staff', 's1', 'player.read', 'player', 'p1', ${reason})`;
    await row("ticket 42: lost progress");
    expect(await refusal(row(""))).toBe(CHECK);
    expect(await refusal(row(null))).toBe("23502");
    expect(await refusal(sql`UPDATE audit_log SET reason = 'x'`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`DELETE FROM audit_log`)).toBe(APPEND_ONLY);
    expect(await refusal(sql`TRUNCATE audit_log`)).toBe(APPEND_ONLY);
  });
});

describe("players", () => {
  test("a guest needs nothing at all, and only an age band is ever stored", async () => {
    const [guest] = await sql<{ id: string; kind: string; status: string }[]>`INSERT INTO players DEFAULT VALUES RETURNING id, kind, status`;
    expect(guest).toMatchObject({ kind: "guest", status: "active" });
    await sql`UPDATE players SET age_band = '15_17' WHERE id = ${guest!.id}`;
    expect(await refusal(sql`UPDATE players SET age_band = '2011' WHERE id = ${guest!.id}`)).toBe(CHECK);
    const columns = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'players'`;
    // The only trace of a phone number or an email address is its encrypted copy and its keyed hash (and the day an address was proved).
    expect(columns.map((c) => c.column_name).filter((c) => /birth|phone|email|real_name/.test(c)).sort()).toEqual(["email_enc", "email_hash", "email_verified_at", "phone_enc", "phone_hash"]);
  });

  test("a phone number is stored encrypted and hashed, found by its hash, and belongs to one account", async () => {
    const keyring = parseKeyring(`1:${Buffer.alloc(32, 1).toString("base64")}`);
    const pepper = parsePepper(Buffer.alloc(32, 2).toString("base64"));
    const stored = protectPhone("923 456 789", keyring, pepper)!;
    const [player] = await sql<{ id: string }[]>`
      INSERT INTO players (kind, phone_enc, phone_hash) VALUES ('linked', ${stored.phoneEnc}, ${stored.phoneHash}) RETURNING id`;
    // Typed another way at sign-in, the same number finds the same account.
    const again = protectPhone("+244 923-456-789", keyring, pepper)!;
    const found = await sql<{ id: string; phone_enc: Uint8Array }[]>`SELECT id, phone_enc FROM players WHERE phone_hash = ${again.phoneHash}`;
    expect(found.map((r) => r.id)).toEqual([player!.id]);
    expect(decryptField(found[0]!.phone_enc, "players.phone", keyring)).toBe("+244923456789");
    // Nothing in the row contains the number.
    const [raw] = await sql<{ row: string }[]>`SELECT players::text AS row FROM players WHERE id = ${player!.id}`;
    expect(raw!.row).not.toContain("923456789");
    expect(await refusal(sql`INSERT INTO players (phone_hash) VALUES (${again.phoneHash})`)).toBe(UNIQUE);
  });
});

describe("audit.log and consents", () => {
  test("audit.log writes who, what, whom and why, and refuses to write without a why", async () => {
    await auditLog.log(sql, { actorKind: "staff", actorId: "s-7", kind: "player.read", subjectKind: "player", subjectId: "p-1", reason: " ticket 77 ", meta: { fields: ["phone"] }, provinceId: "ao-lua", districtId: "ao-lua/l1" });
    const [row] = await sql`SELECT actor_kind, actor_id, kind, subject_id, reason, meta, district_id FROM audit_log WHERE actor_id = 's-7'`;
    expect(row).toEqual({ actor_kind: "staff", actor_id: "s-7", kind: "player.read", subject_id: "p-1", reason: "ticket 77", meta: { fields: ["phone"] }, district_id: "ao-lua/l1" });
    await auditLog.log(sql, { actorKind: "system", actorId: "worker", kind: "ledger.note", subjectKind: "ledger", subjectId: "all", reason: "nightly" });
    await expect(auditLog.log(sql, { actorKind: "staff", actorId: "s-7", kind: "player.read", subjectKind: "player", subjectId: "p-1", reason: "  " })).rejects.toThrow(/needs a reason/);
    expect((await sql`SELECT 1 FROM audit_log WHERE actor_id = 's-7'`).length).toBe(1);
  });

  test("a consent is a history: the latest answer for the current wording is the one that counts", async () => {
    const [player] = await sql<{ id: string }[]>`INSERT INTO players DEFAULT VALUES RETURNING id`;
    const id = player!.id;
    // Never asked: everything is a no.
    expect(await consentsOf(sql, id)).toEqual({ play: false, analytics: false, notifications: false });
    await recordConsent(sql, id, "play", true);
    await recordConsent(sql, id, "analytics", true);
    expect(await consentsOf(sql, id)).toEqual({ play: true, analytics: true, notifications: false });
    await recordConsent(sql, id, "analytics", false);
    expect(await consentsOf(sql, id)).toEqual({ play: true, analytics: false, notifications: false });
    expect((await sql`SELECT 1 FROM consents WHERE player_id = ${id}`).length).toBe(3);
    // Playing cannot be un-agreed to; the account is deleted instead.
    await expect(recordConsent(sql, id, "play", false)).rejects.toThrow(/cannot be withdrawn/);
    // A yes given to older wording no longer counts: the player is asked again.
    await sql`INSERT INTO consents (player_id, purpose, version, granted) VALUES (${id}, 'notifications', ${CONSENT_PURPOSES.notifications.version + 1}, true)`;
    expect((await consentsOf(sql, id)).notifications).toBe(false);
    expect(await refusal(sql`INSERT INTO consents (player_id, purpose, version, granted) VALUES (${id}, 'marketing', 1, true)`)).toBe(CHECK);
  });
});

describe("what was said is not kept for ever", () => {
  test("lines older than thirty days go, and reports closed more than ninety days ago; everything younger, and every open report, stays", async () => {
    const [a] = await sql<{ id: string }[]>`INSERT INTO players (age_band) VALUES ('18_plus') RETURNING id`;
    const [b] = await sql<{ id: string }[]>`INSERT INTO players (age_band) VALUES ('18_plus') RETURNING id`;
    await keepChatLines(sql, [{ playerId: a!.id, districtId: "ao-lua/l1", channel: 1, text: "de hoje", said: true, heardBy: 1 }]);
    await sql`INSERT INTO chat_lines (at, player_id, district_id, channel, text, said) VALUES (now() - interval '31 days', ${a!.id}, 'ao-lua/l1', 1, 'de há um mês', true), (now() - interval '29 days', ${a!.id}, 'ao-lua/l1', 1, 'de há quatro semanas', true)`;
    const fresh = await reportPlayer(sql, b!.id, a!.id, "insults", null);
    await sql`INSERT INTO reports (reporter_id, reported_id, reason, status, closed_at, at) VALUES
      (${b!.id}, ${a!.id}, 'other', 'closed', now() - interval '91 days', now() - interval '100 days'),
      (${b!.id}, ${a!.id}, 'other', 'closed', now() - interval '10 days', now() - interval '100 days'),
      (${b!.id}, ${a!.id}, 'other', 'open', NULL, now() - interval '200 days')`;
    expect(await expireTalk(sql)).toEqual({ lines: 1, reports: 1 });
    expect((await sql<{ text: string }[]>`SELECT text FROM chat_lines WHERE player_id = ${a!.id} ORDER BY at`).map((row) => row.text)).toEqual(["de há quatro semanas", "de hoje"]);
    expect((await sql`SELECT 1 FROM reports WHERE reported_id = ${a!.id}`).length).toBe(3);
    // The report made today carries the line said today, copied: it will outlive it.
    const [kept] = await sql<{ lines: { text: string }[] }[]>`SELECT lines FROM reports WHERE id = ${fresh}`;
    expect(kept!.lines.map((line) => line.text)).toEqual(["de hoje"]);
    expect(await expireTalk(sql)).toEqual({ lines: 0, reports: 0 });
  });
});

describe("the ledger, live (Task 4.1)", () => {
  const cash = (who: string): string => `player_cash:live-${who}`;
  const pay = (who: string, amount: number, key: string) => recordTransfer(sql, { debitAccount: faucet("wage"), creditAccount: cash(who), amount, reason: "wage", actionId: key });

  test("a transfer is recorded once: asked again with the same key it moves nothing and answers with what was recorded; the same key on another transfer is refused", async () => {
    const first = await pay("rita", 500, "live-1");
    expect(first).toMatchObject({ ok: true, replay: false, transfer: { amount: 500, reason: "wage", actionId: "live-1", ref: null, reverses: null } });
    const again = await pay("rita", 500, "live-1");
    expect(again).toMatchObject({ ok: true, replay: true });
    expect(again.ok && first.ok && again.transfer.id).toBe(first.ok && first.transfer.id);
    expect(await balanceOf(sql, cash("rita"))).toBe(500);
    expect(await pay("rita", 501, "live-1")).toEqual({ ok: false, error: "action_id_conflict" });
    expect(await pay("zeca", 500, "live-1")).toEqual({ ok: false, error: "action_id_conflict" });
    expect(await balanceOf(sql, cash("zeca"))).toBe(0);
  });

  test("twenty of the same transfer at the same instant are one transfer", async () => {
    const all = await Promise.all(Array.from({ length: 20 }, () => pay("dino", 100, "live-burst")));
    expect(all.every((one) => one.ok)).toBe(true);
    expect(all.filter((one) => one.ok && !one.replay)).toHaveLength(1);
    expect(await balanceOf(sql, cash("dino"))).toBe(100);
  });

  test("nobody spends what they do not have: by the rule, and by the database when two spend at the same instant", async () => {
    await pay("lena", 1000, "live-lena");
    const spend = (amount: number, key: string) => recordTransfer(sql, { debitAccount: cash("lena"), creditAccount: sink("npc_shop"), amount, reason: "purchase", actionId: key });
    expect(await spend(1001, "live-too-much")).toEqual({ ok: false, error: "insufficient_funds" });
    const both = await Promise.all([spend(700, "live-a"), spend(700, "live-b")]);
    expect(both.filter((one) => one.ok)).toHaveLength(1);
    expect(both.find((one) => !one.ok)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(await balanceOf(sql, cash("lena"))).toBe(300);
    // And what the rules refuse never reaches the table: an amount that is not one, a sink paying out, a faucet paid into.
    expect(await spend(0, "live-zero")).toEqual({ ok: false, error: "amount_invalid" });
    expect(await spend(1.5, "live-half")).toEqual({ ok: false, error: "amount_invalid" });
    expect(await recordTransfer(sql, { debitAccount: sink("npc_shop"), creditAccount: cash("lena"), amount: 5, reason: "purchase", actionId: "live-back" })).toEqual({ ok: false, error: "sink_debit" });
    expect(await recordTransfer(sql, { debitAccount: cash("lena"), creditAccount: faucet("wage"), amount: 5, reason: "wage", actionId: "live-in" })).toEqual({ ok: false, error: "faucet_credit" });
    expect(await recordTransfer(sql, { debitAccount: cash("lena"), creditAccount: "wallet:lena", amount: 5, reason: "p2p", actionId: "live-bad" })).toEqual({ ok: false, error: "account_invalid" });
  });

  test("a wallet is the Carteira and the Banco; a statement is its transfers, newest first, each with its sign and its other side", async () => {
    const id = "live-wallet";
    await recordTransfer(sql, { debitAccount: faucet("grant"), creditAccount: `player_cash:${id}`, amount: 900, reason: "grant", actionId: "live-w1", ref: "origin" });
    await recordTransfer(sql, { debitAccount: `player_cash:${id}`, creditAccount: `player_bank:${id}`, amount: 400, reason: "bank_in", actionId: "live-w2" });
    expect(await walletOf(sql, id)).toEqual({ cash: 500, bank: 400 });
    expect(await walletOf(sql, "live-nobody")).toEqual({ cash: 0, bank: 0 });
    expect((await statementOf(sql, `player_cash:${id}`)).map((line) => [line.amount, line.reason, line.ref, line.other])).toEqual([
      [-400, "bank_in", null, `player_bank:${id}`],
      [900, "grant", "origin", "system_faucet:grant"],
    ]);
    expect((await statementOf(sql, `player_bank:${id}`)).map((line) => line.amount)).toEqual([400]);
  });

  test("the first Makuta is granted once, by the player's own key", async () => {
    const [player] = await sql<{ id: string }[]>`INSERT INTO players (age_band) VALUES ('18_plus') RETURNING id`;
    expect(await grantOrigin(sql, player!.id, 2500)).toMatchObject({ ok: true, replay: false });
    expect(await grantOrigin(sql, player!.id, 2500)).toMatchObject({ ok: true, replay: true });
    // A different amount under the same player's key is not a second grant: it is refused.
    expect(await grantOrigin(sql, player!.id, 99_000)).toEqual({ ok: false, error: "action_id_conflict" });
    expect(await walletOf(sql, player!.id)).toEqual({ cash: 2500, bank: 0 });
  });

  test("the audit proves the books: everything adds up to zero, every kept balance is what its rows say, nothing but a faucet is below zero", async () => {
    const audit = await auditLedger(sql);
    expect(audit).toMatchObject({ ok: true, sum: 0, wrong: [], overdrawn: [] });
    expect(audit.transfers).toBeGreaterThan(5);
  });

  test("the nightly audit is done once a day, whoever asks, and written where it cannot be changed", async () => {
    const first = await Promise.all([nightlyLedgerAudit(sql), nightlyLedgerAudit(sql), nightlyLedgerAudit(sql)]);
    // Three asked at once: one did it.
    expect(first.filter((one) => one !== null)).toHaveLength(1);
    expect(first.find((one) => one !== null)).toMatchObject({ ok: true, sum: 0 });
    expect(await nightlyLedgerAudit(sql)).toBeNull();
    const last = await lastLedgerAudit(sql);
    expect(last).toMatchObject({ ok: true, sum: 0, wrong: 0, overdrawn: 0 });
    expect(last!.transfers).toBeGreaterThan(5);
    await expect(sql`DELETE FROM audit_log WHERE kind = 'ledger.audit'`).rejects.toThrow();
    // A day on, it is due again.
    expect(await sql`SELECT count(*)::int AS n FROM audit_log WHERE kind = 'ledger.audit'`).toEqual([{ n: 1 }]);
  });

  test("ten thousand transfers between twenty players, some refused, some sent twice: the books still balance and nobody is below zero", async () => {
    let seed = 20261118;
    const random = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const people = Array.from({ length: 20 }, (_, n) => cash(`fuzz-${n}`));
    for (const [n, one] of people.entries()) await recordTransfer(sql, { debitAccount: faucet("wage"), creditAccount: one, amount: 5000, reason: "wage", actionId: `fuzz-start-${n}` });
    let recorded = 0;
    let refused = 0;
    let replays = 0;
    const one = async (n: number): Promise<void> => {
      const from = people[Math.floor(random() * people.length)]!;
      const roll = random();
      const to = roll < 0.15 ? sink("npc_shop") : people[Math.floor(random() * people.length)]!;
      const request = { debitAccount: roll > 0.9 ? faucet("wage") : from, creditAccount: to, amount: 1 + Math.floor(random() * 4000), reason: "p2p" as const, actionId: `fuzz-${n}` };
      const result = await recordTransfer(sql, request);
      if (!result.ok) return void refused++;
      recorded++;
      // One in ten is sent a second time, as a phone on a bad line would.
      if (random() < 0.1) {
        const again = await recordTransfer(sql, request);
        if (again.ok && again.replay) replays++;
      }
    };
    // Eight at a time, so that transfers on the same accounts really do meet.
    for (let n = 0; n < 10_000; n += 8) await Promise.all(Array.from({ length: 8 }, (_, k) => one(n + k)));
    expect(recorded).toBeGreaterThan(5000);
    expect(refused).toBeGreaterThan(100);
    expect(replays).toBeGreaterThan(300);
    const audit = await auditLedger(sql);
    expect(audit).toMatchObject({ ok: true, sum: 0, wrong: [], overdrawn: [] });
    for (const person of people) expect(await balanceOf(sql, person)).toBeGreaterThanOrEqual(0);
  }, 180_000);
});

