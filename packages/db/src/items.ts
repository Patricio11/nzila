// What a player holds, and buying (Tasks 4.2 and 4.3). A purchase is three
// things that happen together or not at all: the Makuta leaves the Carteira
// through the ledger, the things go into the Mochila, and a receipt is written
// that says so. The same purchase sent twice (a phone on a bad line) is the
// first one, answered again.

import { accountId, sink, type Mk } from "@nzila/economy";
import { type Sql } from "postgres";
import { recordTransfer } from "./ledger.ts";

export interface Held {
  readonly item: string;
  readonly quantity: number;
}

/** What a player has in a place, in the order it came. */
export async function heldBy(sql: Sql, playerId: string, place: "mochila" | "casa" = "mochila"): Promise<Held[]> {
  const rows = await sql<{ item: string; quantity: number }[]>`SELECT item, quantity FROM items WHERE owner_id = ${playerId} AND place = ${place} ORDER BY id`;
  return rows.map((row) => ({ item: row.item, quantity: row.quantity }));
}

export interface Receipt {
  readonly id: number;
  readonly at: string;
  readonly shop: string;
  readonly lines: readonly { readonly item: string; readonly quantity: number; readonly price: Mk; readonly amount: Mk }[];
  readonly total: Mk;
}

type Bought = { readonly ok: true; readonly receipt: Receipt; readonly replay: boolean } | { readonly ok: false; readonly error: "insufficient_funds" | "too_heavy" | "conflict" };

const readReceipt = (row: { id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }): Receipt => ({ id: Number(row.id), at: row.at.toISOString(), shop: row.shop, lines: row.lines, total: Number(row.total) });

/**
 * Buys a priced basket at a shop: paid to the sink of NPC shops, the things into the Mochila, a receipt. `fits`
 * says whether what the player holds and what they buy go together in a Mochila; it is asked with the Mochila as
 * it is inside the purchase, so two purchases at once cannot both squeeze in.
 */
export async function buy(
  sql: Sql,
  purchase: { playerId: string; shop: string; key: string; lines: Receipt["lines"]; total: Mk; districtId?: string | null },
  fits: (held: readonly Held[]) => boolean,
): Promise<Bought> {
  const [had] = await sql<{ id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }[]>`SELECT id, at, shop, lines, total FROM receipts WHERE player_id = ${purchase.playerId} AND key = ${purchase.key}`;
  if (had) return { ok: true, receipt: readReceipt(had), replay: true };
  try {
    return await sql.begin(async (tx) => {
      const t = tx as unknown as Sql;
      // The player's Mochila is held while it is looked at, and filled.
      await t`SELECT id FROM players WHERE id = ${purchase.playerId} FOR UPDATE`;
      if (!fits(await heldBy(t, purchase.playerId))) return { ok: false as const, error: "too_heavy" as const };
      const paid = await recordTransfer(t, { debitAccount: accountId("player_cash", purchase.playerId), creditAccount: sink("npc_shop"), amount: purchase.total, reason: "purchase", ref: purchase.shop, actionId: `buy:${purchase.playerId}:${purchase.key}`, districtId: purchase.districtId ?? null });
      if (!paid.ok) throw new Refused(paid.error === "insufficient_funds" ? "insufficient_funds" : "conflict");
      for (const line of purchase.lines) {
        await t`
          INSERT INTO items (owner_id, place, item, quantity) VALUES (${purchase.playerId}, 'mochila', ${line.item}, ${line.quantity})
          ON CONFLICT (owner_id, place, item) DO UPDATE SET quantity = items.quantity + EXCLUDED.quantity, updated_at = now()`;
      }
      const [row] = await t<{ id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }[]>`
        INSERT INTO receipts (player_id, shop, lines, total, transfer_id, key)
        VALUES (${purchase.playerId}, ${purchase.shop}, ${t.json(purchase.lines as never)}, ${purchase.total}, ${paid.transfer.id}, ${purchase.key})
        RETURNING id, at, shop, lines, total`;
      return { ok: true as const, receipt: readReceipt(row!), replay: false };
    });
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.why };
    // The same key at the same instant: the other one bought it; this is answered with its receipt.
    if ((error as { code?: string }).code === "23505") {
      const [now] = await sql<{ id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }[]>`SELECT id, at, shop, lines, total FROM receipts WHERE player_id = ${purchase.playerId} AND key = ${purchase.key}`;
      if (now) return { ok: true, receipt: readReceipt(now), replay: true };
    }
    throw error;
  }
}

class Refused extends Error {
  readonly why: "insufficient_funds" | "conflict";
  constructor(why: "insufficient_funds" | "conflict") {
    super(why);
    this.why = why;
  }
}

/** Takes some of a thing out of a Mochila: the row goes with the last of it (a row never holds none). False when there is not that much. */
export async function take(t: Sql, owner: string, item: string, quantity: number): Promise<boolean> {
  const [row] = await t<{ quantity: number }[]>`SELECT quantity FROM items WHERE owner_id = ${owner} AND place = 'mochila' AND item = ${item} FOR UPDATE`;
  if (!row || row.quantity < quantity) return false;
  if (row.quantity === quantity) await t`DELETE FROM items WHERE owner_id = ${owner} AND place = 'mochila' AND item = ${item}`;
  else await t`UPDATE items SET quantity = quantity - ${quantity}, updated_at = now() WHERE owner_id = ${owner} AND place = 'mochila' AND item = ${item}`;
  return true;
}

/** Takes one of a thing from the Mochila (eaten, drunk). False when there is none. */
export async function useOne(sql: Sql, playerId: string, item: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    return take(t, playerId, item, 1);
  }) as Promise<boolean>;
}

/**
 * Hands things from one Mochila to another. Both are held in the order of their ids, so that two handing to each
 * other at once never wait on each other. `fits` is asked of the receiver's Mochila as it would be.
 */
export async function giveThings(sql: Sql, from: string, to: string, item: string, quantity: number, fits: (held: readonly Held[]) => boolean): Promise<"ok" | "none" | "too_heavy"> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`SELECT id FROM players WHERE id IN ${t([from, to])} ORDER BY id FOR UPDATE`;
    const theirs = await heldBy(t, to);
    if (!fits([...theirs, { item, quantity }])) return "too_heavy" as const;
    if (!(await take(t, from, item, quantity))) return "none" as const;
    await t`
      INSERT INTO items (owner_id, place, item, quantity) VALUES (${to}, 'mochila', ${item}, ${quantity})
      ON CONFLICT (owner_id, place, item) DO UPDATE SET quantity = items.quantity + EXCLUDED.quantity, updated_at = now()`;
    return "ok" as const;
  }) as Promise<"ok" | "none" | "too_heavy">;
}

/** A player's receipts, newest first. */
export async function receiptsOf(sql: Sql, playerId: string, limit = 30): Promise<Receipt[]> {
  const rows = await sql<{ id: string; at: Date; shop: string; lines: Receipt["lines"]; total: string }[]>`SELECT id, at, shop, lines, total FROM receipts WHERE player_id = ${playerId} ORDER BY at DESC, id DESC LIMIT ${limit}`;
  return rows.map(readReceipt);
}

/** Puts a thing in a Mochila as a gift (the cantina's full card): only when it fits. True when it went in. */
export async function giveGift(sql: Sql, playerId: string, item: string, fits: (held: readonly Held[]) => boolean): Promise<boolean> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`SELECT id FROM players WHERE id = ${playerId} FOR UPDATE`;
    if (!fits(await heldBy(t, playerId))) return false;
    await t`
      INSERT INTO items (owner_id, place, item, quantity) VALUES (${playerId}, 'mochila', ${item}, 1)
      ON CONFLICT (owner_id, place, item) DO UPDATE SET quantity = items.quantity + 1, updated_at = now()`;
    return true;
  }) as Promise<boolean>;
}

/** Whether two players have ever played from the same phone: what one gives the other is not paid for as an errand. */
export async function samePhone(sql: Sql, one: string, other: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM devices a JOIN devices b ON a.device_hash = b.device_hash WHERE a.player_id = ${one} AND b.player_id = ${other} LIMIT 1`;
  return rows.length > 0;
}
