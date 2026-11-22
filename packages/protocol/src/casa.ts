// The door of the family's house (Phase 5, D-5.9). A door is opened and shut by a hand, as in life: the player says
// so standing at their own door, the zone decides, and everyone near sees it swing. Kept apart from messages.ts so
// that it travels with the code that hangs the doors, not with every phone from the first byte.

import { MSG } from "./messages.ts";
import { Writer } from "./wire.ts";

/** Client to zone: open the door of my house, or shut it. */
export function encodePorta(open: boolean): Uint8Array {
  return new Writer().u8(MSG.PORTA).u8(open ? 1 : 0).finish();
}
