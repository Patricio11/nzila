// The hospital's bill (Task 4.4): a player whose Energia ran out woke at the hospital (the zone took them there and
// left a note for this); the bill is a small one, paid from the Carteira and then the Banco, never more than they have
// (no player is put in debt by being tired), written as a receipt. Asked twice for one stay, it is paid once.

import { accountId, sink, type Mk } from "@nzila/economy";
import { type Sql } from "postgres";
import { type Receipt } from "./items.ts";
import { recordTransfer } from "./ledger.ts";

/** Pays a stay at the hospital, once a `stay` (the zone's note). The receipt, or the one already written for it. */
export async function payHospital(sql: Sql, stay: { playerId: string; stay: string; bill: Mk; districtId: string | null }): Promise<Receipt> {
  const key = `hospital:${stay.stay}`.slice(0, 64);
  const read = (row: { id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }): Receipt => ({ id: Number(row.id), at: row.at.toISOString(), shop: row.shop, lines: row.lines, total: Number(row.total) });
  const [had] = await sql<{ id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }[]>`SELECT id, at, shop, lines, total FROM receipts WHERE player_id = ${stay.playerId} AND key = ${key}`;
  if (had) return read(had);
  return (await sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`SELECT id FROM players WHERE id = ${stay.playerId} FOR UPDATE`;
    const [cash] = await t<{ amount: string }[]>`SELECT coalesce((SELECT balance FROM balances WHERE account_id = ${accountId("player_cash", stay.playerId)}), 0) AS amount`;
    const [bank] = await t<{ amount: string }[]>`SELECT coalesce((SELECT balance FROM balances WHERE account_id = ${accountId("player_bank", stay.playerId)}), 0) AS amount`;
    const fromCash = Math.min(stay.bill, Math.max(0, Number(cash!.amount)));
    const fromBank = Math.min(stay.bill - fromCash, Math.max(0, Number(bank!.amount)));
    let transferId: string | null = null;
    for (const [from, amount] of [["player_cash", fromCash], ["player_bank", fromBank]] as const) {
      if (amount <= 0) continue;
      const paid = await recordTransfer(t, { debitAccount: accountId(from, stay.playerId), creditAccount: sink("hospital"), amount, reason: "hospital", ref: "hospital", actionId: `${key}:${from}`, districtId: stay.districtId });
      if (!paid.ok) throw new Error(`hospital: ${paid.error}`);
      transferId ??= String(paid.transfer.id);
    }
    const total = fromCash + fromBank;
    const lines = [{ item: "consulta", quantity: 1, price: total, amount: total }];
    // Nothing to pay with: nothing is taken, and nothing written (a receipt is of a transfer).
    if (transferId === null) return { id: 0, at: new Date().toISOString(), shop: "hospital", lines, total: 0 };
    const [row] = await t<{ id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }[]>`
      INSERT INTO receipts (player_id, shop, lines, total, transfer_id, key)
      VALUES (${stay.playerId}, 'hospital', ${t.json(lines as never)}, ${total}, ${transferId}, ${key})
      RETURNING id, at, shop, lines, total`;
    return read(row!);
  })) as Receipt;
}
