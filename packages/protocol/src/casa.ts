// The door of the family's house (Phase 5, D-5.9). A door is opened and shut by a hand, as in life: the player says
// so standing at their own door, the zone decides, and everyone near sees it swing. Kept apart from messages.ts so
// that it travels with the code that hangs the doors, not with every phone from the first byte.

import { MSG } from "./messages.ts";
import { Writer } from "./wire.ts";

/** Client to zone: open the door of my house, or shut it. */
export function encodePorta(open: boolean): Uint8Array {
  return new Writer().u8(MSG.PORTA).u8(open ? 1 : 0).finish();
}

/** What is asked of a thing in the player's own house (Task 5.3): set it down out of the Mochila, take it up into it, or put it elsewhere (turned, or moved). */
export const MOVEL_OPS = ["por", "guardar", "mudar"] as const;
/**
 * Why the zone did not do it, as EVENT.MOVEIS says it (0: it did): not in one's own house; it cannot stand there
 * (a wall, the doorway, another thing, somebody); none of it in the Mochila; no room in the Mochila to take it up;
 * it is not there any more.
 */
export const MOVEL_RECUSAS = ["", "fora", "lugar", "nao_tens", "cheia", "foi"] as const;

/** The most things a house holds set down: a list said whole must stay a short one. */
export const MOVEIS_AT_MOST = 60;

/** Client to zone. `id`: the thing, for one already set down (0 to set one down); `item`: what it is. Cells are those of the house's own plan, from 64 before its middle. */
export function encodeMovel(m: { op: (typeof MOVEL_OPS)[number]; id: number; item: string; cx: number; cz: number; rot: number }): Uint8Array {
  return new Writer()
    .u8(MSG.MOVEL)
    .u8(MOVEL_OPS.indexOf(m.op))
    .uint(m.id)
    .text(m.item)
    .u8(m.cx + 64)
    .u8(m.cz + 64)
    .u8(m.rot)
    .finish();
}
