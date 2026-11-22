// What is set down in a house (Task 5.3, D-5.11). A thing is in the Mochila or on the floor of its owner's house,
// never both and never neither: setting it down and taking it up are each one transaction. Where it may stand is
// not decided here: the zone knows the house and who is in it, and decides before it asks for this.

import { type Sql } from "postgres";
import { type Held } from "./items.ts";

/** A thing set down: the cell of the house's own plan it begins at, and how many quarters it is turned. */
export interface HomeThing {
  readonly id: number;
  readonly item: string;
  readonly cx: number;
  readonly cz: number;
  readonly rot: number;
}

const read = (row: { id: string; item: string; cx: number; cz: number; rot: number }): HomeThing => ({ id: Number(row.id), item: row.item, cx: row.cx, cz: row.cz, rot: row.rot });

/** Everything a player has set down in their house, in the order it was set down. */
export async function thingsOf(sql: Sql, ownerId: string): Promise<HomeThing[]> {
  return (await sql<{ id: string; item: string; cx: number; cz: number; rot: number }[]>`SELECT id, item, cx, cz, rot FROM home_things WHERE owner_id = ${ownerId} ORDER BY id`).map(read);
}

/** Sets one thing down out of the Mochila. Null when the player carries none of it. */
export async function setDown(sql: Sql, ownerId: string, thing: { item: string; cx: number; cz: number; rot: number }): Promise<HomeThing | null> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const [carried] = await t<{ quantity: number }[]>`SELECT quantity FROM items WHERE owner_id = ${ownerId} AND place = 'mochila' AND item = ${thing.item} FOR UPDATE`;
    if (!carried) return null;
    if (carried.quantity === 1) await t`DELETE FROM items WHERE owner_id = ${ownerId} AND place = 'mochila' AND item = ${thing.item}`;
    else await t`UPDATE items SET quantity = quantity - 1, updated_at = now() WHERE owner_id = ${ownerId} AND place = 'mochila' AND item = ${thing.item}`;
    const [row] = await t<{ id: string; item: string; cx: number; cz: number; rot: number }[]>`
      INSERT INTO home_things (owner_id, item, cx, cz, rot) VALUES (${ownerId}, ${thing.item}, ${thing.cx}, ${thing.cz}, ${thing.rot}) RETURNING id, item, cx, cz, rot`;
    return read(row!);
  });
}

/**
 * Takes a thing up into the Mochila. `fits` says whether the Mochila has room for it, asked with the Mochila as it
 * is inside the taking. "gone": it is not theirs, or is no longer there; "full": no room to carry it.
 */
export async function takeUp(sql: Sql, ownerId: string, id: number, fits: (held: readonly Held[], item: string) => boolean): Promise<"taken" | "gone" | "full"> {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Sql;
    await t`SELECT id FROM players WHERE id = ${ownerId} FOR UPDATE`;
    const [thing] = await t<{ item: string }[]>`SELECT item FROM home_things WHERE id = ${id} AND owner_id = ${ownerId} FOR UPDATE`;
    if (!thing) return "gone";
    const held = await t<{ item: string; quantity: number }[]>`SELECT item, quantity FROM items WHERE owner_id = ${ownerId} AND place = 'mochila' ORDER BY id`;
    if (!fits(held, thing.item)) return "full";
    await t`DELETE FROM home_things WHERE id = ${id}`;
    await t`
      INSERT INTO items (owner_id, place, item, quantity) VALUES (${ownerId}, 'mochila', ${thing.item}, 1)
      ON CONFLICT (owner_id, place, item) DO UPDATE SET quantity = items.quantity + 1, updated_at = now()`;
    return "taken";
  });
}

/** Puts a thing that is set down somewhere else in the house, or turns it. False when it is not theirs, or not there. */
export async function moveThing(sql: Sql, ownerId: string, id: number, to: { cx: number; cz: number; rot: number }): Promise<boolean> {
  const rows = await sql`UPDATE home_things SET cx = ${to.cx}, cz = ${to.cz}, rot = ${to.rot} WHERE id = ${id} AND owner_id = ${ownerId} RETURNING id`;
  return rows.length === 1;
}
