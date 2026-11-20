// A biscato's pay (Task 4.5, D-4.22): the zone scored a round and left a note of it; the pay comes from the `wage`
// faucet into the Carteira, by the score and the day's taper (what biscatos have paid that day already, read from
// the receipts), and is written as a receipt from the place it was earned at. Asked twice for one round, it is paid
// once. A round that pays nothing writes nothing.

import { accountId, faucet } from "@nzila/economy";
import { BASE_BISCATOS, biscatoPay, type BiscatoKind, type BiscatoRules } from "@nzila/economy/biscatos";
import { type Sql } from "postgres";
import { type Receipt } from "./items.ts";
import { recordTransfer } from "./ledger.ts";

type Row = { id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string };
const read = (row: Row): Receipt => ({ id: Number(row.id), at: row.at.toISOString(), shop: row.shop, lines: row.lines, total: Number(row.total) });

/** What a day's biscatos have paid a player, from the start of the day in Luanda (UTC+1, no summer time). */
export async function biscatosPaidToday(sql: Sql, playerId: string, now = Date.now()): Promise<number> {
  const day = new Date(now + 3_600_000).toISOString().slice(0, 10);
  const from = new Date(`${day}T00:00:00+01:00`);
  const [row] = await sql<{ paid: string }[]>`SELECT coalesce(sum(total), 0) AS paid FROM receipts WHERE player_id = ${playerId} AND shop LIKE 'biscato-%' AND at >= ${from}`;
  return Number(row!.paid);
}

/** Pays a scored round, once a `note` (the zone's). The receipt, the one already written for it, or one of nothing. */
export async function payBiscato(sql: Sql, round: { playerId: string; note: string; kind: BiscatoKind; score: number; districtId: string | null }, rules: BiscatoRules = BASE_BISCATOS): Promise<Receipt> {
  const key = `biscato:${round.note}`.slice(0, 64);
  const shop = `biscato-${round.kind}`;
  const [had] = await sql<Row[]>`SELECT id, at, shop, lines, total FROM receipts WHERE player_id = ${round.playerId} AND key = ${key}`;
  if (had) return read(had);
  return (await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    // One round paid at a time for a player: the day's taper is read and added to in the same breath.
    await t`SELECT id FROM players WHERE id = ${round.playerId} FOR UPDATE`;
    const pay = biscatoPay(rules, round.kind, round.score, await biscatosPaidToday(t, round.playerId));
    const lines = [{ item: round.kind, quantity: 1, price: pay, amount: pay }];
    if (pay === 0) return { id: 0, at: new Date().toISOString(), shop, lines, total: 0 };
    // The district it was earned in, when the books know it (a rehearsal town is not in them).
    const [known] = round.districtId ? await t<{ id: string }[]>`SELECT id FROM districts WHERE id = ${round.districtId}` : [];
    const paid = await recordTransfer(t, { debitAccount: faucet("wage"), creditAccount: accountId("player_cash", round.playerId), amount: pay, reason: "wage", ref: "biscato", actionId: key, districtId: known?.id ?? null });
    if (!paid.ok) throw new Error(`biscato: ${paid.error}`);
    const [row] = await t<Row[]>`
      INSERT INTO receipts (player_id, shop, lines, total, transfer_id, key)
      VALUES (${round.playerId}, ${shop}, ${t.json(lines as never)}, ${pay}, ${String(paid.transfer.id)}, ${key})
      RETURNING id, at, shop, lines, total`;
    return read(row!);
  })) as Receipt;
}
