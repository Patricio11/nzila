// The database, for real: these tests run against PostgreSQL (`pnpm services`
// starts it). Each run creates its own database and drops it afterwards, so
// development data is never touched. Every Makuta figure is a fixture.

import { getTableColumns, getTableName } from "drizzle-orm";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { connect, databaseUrl, loadMigrations, loadWorldSeed, migrate, seed, tables } from "./index.ts";
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
});

afterAll(async () => {
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

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
    expect(await migrate(sql)).toEqual(["0001_core"]);
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
    expect(columns.map((c) => c.column_name).filter((c) => /birth|phone|email|real_name/.test(c))).toEqual([]);
  });
});
