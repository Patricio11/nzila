// The economy at a glance, for the Estúdio (Task 4.6): what the faucets paid in and the sinks took out each day (by
// the day in Luanda), how much money players hold in their Carteiras and in the Banco, the median of what one holds,
// and who gained most in the last day, the first sign of something paying that should not.

import { type Sql } from "postgres";

export interface Economia {
  /** Each day (oldest first): what each faucet paid in and each sink took out, by name. */
  readonly days: readonly { readonly day: string; readonly faucets: Readonly<Record<string, number>>; readonly sinks: Readonly<Record<string, number>> }[];
  /** All the money in players' hands and banks, and how many players hold any. */
  readonly supply: { readonly cash: number; readonly bank: number; readonly players: number };
  /** The median of what a player holds, Carteira and Banco together, among players who hold anything. */
  readonly medianWealth: number;
  /** The players whose holdings grew most in the last 24 hours from outside themselves (the Banco is not a gain). */
  readonly topGainers: readonly { readonly biNumber: string | null; readonly name: string | null; readonly gained: number }[];
}

export async function economia(sql: Sql, days = 14): Promise<Economia> {
  const flows = await sql<{ day: string; side: "faucet" | "sink"; name: string; total: string }[]>`
    SELECT to_char((created_at AT TIME ZONE 'Africa/Luanda')::date, 'YYYY-MM-DD') AS day,
           CASE WHEN debit_account LIKE 'system_faucet:%' THEN 'faucet' ELSE 'sink' END AS side,
           CASE WHEN debit_account LIKE 'system_faucet:%' THEN split_part(debit_account, ':', 2) ELSE split_part(credit_account, ':', 2) END AS name,
           sum(amount) AS total
    FROM ledger_transfers
    WHERE created_at >= now() - make_interval(days => ${days}) AND (debit_account LIKE 'system_faucet:%' OR credit_account LIKE 'system_sink:%')
    GROUP BY 1, 2, 3 ORDER BY 1`;
  const byDay = new Map<string, { faucets: Record<string, number>; sinks: Record<string, number> }>();
  for (const row of flows) {
    const day = byDay.get(row.day) ?? { faucets: {}, sinks: {} };
    (row.side === "faucet" ? day.faucets : day.sinks)[row.name] = Number(row.total);
    byDay.set(row.day, day);
  }
  const [supply] = await sql<{ cash: string; bank: string; players: string }[]>`
    SELECT coalesce(sum(balance) FILTER (WHERE account_id LIKE 'player_cash:%'), 0) AS cash,
           coalesce(sum(balance) FILTER (WHERE account_id LIKE 'player_bank:%'), 0) AS bank,
           count(DISTINCT split_part(account_id, ':', 2)) FILTER (WHERE balance > 0 AND (account_id LIKE 'player_cash:%' OR account_id LIKE 'player_bank:%')) AS players
    FROM balances`;
  const [median] = await sql<{ median: string | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY held) AS median FROM (
      SELECT split_part(account_id, ':', 2) AS player, sum(balance) AS held FROM balances
      WHERE account_id LIKE 'player_cash:%' OR account_id LIKE 'player_bank:%' GROUP BY 1 HAVING sum(balance) > 0) AS each`;
  const gainers = await sql<{ bi_number: string | null; name: string | null; gained: string }[]>`
    WITH moved AS (
      SELECT split_part(credit_account, ':', 2) AS player, amount AS delta FROM ledger_transfers
      WHERE created_at >= now() - interval '24 hours' AND (credit_account LIKE 'player_cash:%' OR credit_account LIKE 'player_bank:%') AND split_part(debit_account, ':', 2) <> split_part(credit_account, ':', 2)
      UNION ALL
      SELECT split_part(debit_account, ':', 2), -amount FROM ledger_transfers
      WHERE created_at >= now() - interval '24 hours' AND (debit_account LIKE 'player_cash:%' OR debit_account LIKE 'player_bank:%') AND split_part(debit_account, ':', 2) <> split_part(credit_account, ':', 2)
    )
    SELECT p.bi_number, p.name, sum(m.delta) AS gained FROM moved m JOIN players p ON p.id::text = m.player
    GROUP BY p.id, p.bi_number, p.name HAVING sum(m.delta) > 0 ORDER BY gained DESC LIMIT 10`;
  return {
    days: [...byDay.entries()].map(([day, flowsOf]) => ({ day, ...flowsOf })),
    supply: { cash: Number(supply!.cash), bank: Number(supply!.bank), players: Number(supply!.players) },
    medianWealth: Math.round(Number(median?.median ?? 0)),
    topGainers: gainers.map((row) => ({ biNumber: row.bi_number, name: row.name, gained: Number(row.gained) })),
  };
}
