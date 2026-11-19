// Fome and Energia (migration 0014, Task 4.4). The zone is their only writer: it reads them as a player comes in,
// keeps them as they play (packages/sim/src/needs.ts), and writes them back every half minute and as they leave.
// Eating is the zone's too: the thing leaves the Mochila and what it gives is written in one transaction.

import { type Sql } from "postgres";
import { take } from "./items.ts";

export interface Necessidades {
  readonly fome: number;
  readonly energia: number;
}

/** A player's needs as last written; full for a player the database does not have. */
export async function needsOf(sql: Sql, playerId: string): Promise<Necessidades> {
  const [row] = await sql<{ fome: number; energia: number }[]>`SELECT fome, energia FROM players WHERE id = ${playerId}`;
  return row ? { fome: row.fome, energia: row.energia } : { fome: 10_000, energia: 10_000 };
}

/** Writes a player's needs as the zone has them. */
export async function keepNeeds(sql: Sql, playerId: string, needs: Necessidades): Promise<void> {
  await sql`UPDATE players SET fome = ${needs.fome}, energia = ${needs.energia} WHERE id = ${playerId}`;
}

/** Eats or drinks one of a thing carried: it leaves the Mochila and `after` is written, together or not at all. False when there is none. */
export async function eatOne(sql: Sql, playerId: string, item: string, after: Necessidades): Promise<boolean> {
  return (await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    if (!(await take(t, playerId, item, 1))) return false;
    await t`UPDATE players SET fome = ${after.fome}, energia = ${after.energia} WHERE id = ${playerId}`;
    return true;
  })) as boolean;
}
