// Os recados do dia, the family's money for the taxi, and the cantina's card, as the books keep them
// (migration 0011). What a player's errands are follows by rule (packages/economy/src/recados.ts); what is
// written here is what was done, once each, with the transfer that paid for it, all in one transaction.

import { accountId, faucet, type Mk } from "@nzila/economy";
import { type Sql } from "postgres";
import { recordTransfer } from "./ledger.ts";

export type FeitoKind = "traz" | "vaiver" | "guarda" | "cumprimenta" | "adois" | "recebeu" | "familia";

/** The errands a player has done on a day, by their place in it. */
export async function doneOn(sql: Sql, playerId: string, day: string): Promise<{ n: number; kind: FeitoKind }[]> {
  return sql<{ n: number; kind: FeitoKind }[]>`SELECT n, kind FROM recados_feitos WHERE player_id = ${playerId} AND day = ${day} ORDER BY n`;
}

/**
 * Writes an errand down as done and pays for it from the errands' faucet (or the family's), together or not at
 * all. Done before: "done", and nothing is paid twice. `before` runs inside the same transaction, after the
 * player is held: a thing taken from the Mochila goes with the errand, or stays with it. It answers false to
 * refuse ("none").
 */
export async function markDone(
  sql: Sql,
  feito: { playerId: string; day: string; n: number; kind: FeitoKind; pay: Mk; districtId?: string | null },
  before?: (t: Sql) => Promise<boolean>,
): Promise<"ok" | "done" | "none"> {
  try {
    return (await sql.begin(async (tx) => {
      const t = tx as unknown as Sql;
      await t`SELECT id FROM players WHERE id = ${feito.playerId} FOR UPDATE`;
      const [had] = await t`SELECT 1 FROM recados_feitos WHERE player_id = ${feito.playerId} AND day = ${feito.day} AND n = ${feito.n}`;
      if (had) return "done" as const;
      if (before && !(await before(t))) return "none" as const;
      let transferId: string | null = null;
      if (feito.pay > 0) {
        const paid = await recordTransfer(t, {
          debitAccount: faucet(feito.kind === "familia" ? "family" : "errand"),
          creditAccount: accountId("player_cash", feito.playerId),
          amount: feito.pay,
          reason: feito.kind === "familia" ? "family" : "errand",
          ref: feito.kind,
          actionId: `recado:${feito.playerId}:${feito.day}:${feito.n}`,
        });
        if (!paid.ok) throw new Error(`recado not paid: ${paid.error}`);
        transferId = paid.transfer.id;
      }
      await t`INSERT INTO recados_feitos (player_id, day, n, kind, district_id, transfer_id) VALUES (${feito.playerId}, ${feito.day}, ${feito.n}, ${feito.kind}, ${feito.districtId ?? null}, ${transferId})`;
      return "ok" as const;
    })) as "ok" | "done" | "none";
  } catch (error) {
    // The same errand done twice at the same instant: the other one wrote it.
    if ((error as { code?: string }).code === "23505") return "done";
    throw error;
  }
}

/** How much a player put in the Banco on a day (Luanda's), from the books. */
export async function bankedOn(sql: Sql, playerId: string, day: string): Promise<Mk> {
  const [row] = await sql<{ total: string | null }[]>`
    SELECT sum(amount) AS total FROM ledger_transfers
    WHERE reason = 'bank_in' AND debit_account = ${accountId("player_cash", playerId)}
      AND (created_at AT TIME ZONE 'Africa/Luanda')::date = ${day}::date`;
  return Number(row?.total ?? 0);
}

/** The errands done in a district between two days, both included: the festa's count. */
export async function doneInDistrict(sql: Sql, districtId: string, from: string, to: string): Promise<number> {
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*) AS count FROM recados_feitos
    WHERE district_id = ${districtId} AND day BETWEEN ${from}::date AND ${to}::date AND n <= 2`;
  return Number(row?.count ?? 0);
}

/** Of these players, those whose account is younger than so many days: newcomers to greet. */
export async function newcomersAmong(sql: Sql, playerIds: readonly string[], days: number): Promise<string[]> {
  const ids = playerIds.filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string }[]>`SELECT id FROM players WHERE id IN ${sql(ids)} AND created_at > now() - ${`${days} days`}::interval`;
  return rows.map((row) => row.id);
}

/** The days (Luanda's) a player bought at a shop since their last full card there. */
export async function cardDays(sql: Sql, playerId: string, shop: string): Promise<string[]> {
  const rows = await sql<{ day: string }[]>`
    SELECT DISTINCT to_char(at AT TIME ZONE 'Africa/Luanda', 'YYYY-MM-DD') AS day FROM receipts
    WHERE player_id = ${playerId} AND shop = ${shop}
      AND at > coalesce((SELECT max(at) FROM cartoes_cheios WHERE player_id = ${playerId} AND shop = ${shop}), '-infinity')`;
  return rows.map((row) => row.day);
}

/** A card filled: a new one begins after this. */
export async function fillCard(sql: Sql, playerId: string, shop: string): Promise<void> {
  await sql`INSERT INTO cartoes_cheios (player_id, shop) VALUES (${playerId}, ${shop})`;
}
