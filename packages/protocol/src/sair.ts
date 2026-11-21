// Convidar para sair (Task 10.13, D-10.3 to D-10.5), on the wire: what a phone asks about an outing. Kept apart
// from messages.ts so that the code that writes it is fetched with the outing's own screens, not carried by every
// phone from the first byte.

import { MSG } from "./messages.ts";
import type { SairPedido } from "./messages.ts";
import { Writer } from "./wire.ts";

/**
 * What the zone says of an outing (an Event of kind SAIR): its place in this list is args[0]. Never reordered.
 *
 *   convite    subject asks this player out; args[1] the place; args[2] is 1 when it answers this player's own ask
 *              with another place ("Prefiro o Miradouro")
 *   nao        subject said "Agora não" to this player's ask
 *   combinado  this player and subject are going out; args[1] the place
 *   chegaram   both stand at the place; args[1] the place
 *   fim        the outing with subject is over; args[1] why, its place in SAIR_FINS
 *   recusado   what this player asked was not done; args[1] why, its place in SAIR_RECUSAS
 */
export const SAIR_DITOS = ["convite", "nao", "combinado", "chegaram", "fim", "recusado"] as const;
export type SairDito = (typeof SAIR_DITOS)[number];

/** Why an outing ended: one of them ended it, they were apart a long while, it grew late, or one of them left the street. Never reordered. */
export const SAIR_FINS = ["terminou", "longe", "tarde", "saiu"] as const;

/**
 * Why an ask was not made or an answer not taken: it cannot be (said the same whatever the reason: an age, a block),
 * too many asks this hour, this one said no a little while ago, one of the two is out with someone already, or the
 * ask being answered is not there any more. Never reordered.
 */
export const SAIR_RECUSAS = ["nao_pode", "muitos", "cedo", "ocupado", "convite"] as const;
export type SairRecusa = (typeof SAIR_RECUSAS)[number];

export function encodeSair(m: SairPedido): Uint8Array {
  const w = new Writer().u8(MSG.SAIR);
  if (m.op === "convidar") return w.u8(1).uint(m.entidade).u8(m.lugar).finish();
  if (m.op === "aceitar") return w.u8(2).uint(m.entidade).finish();
  if (m.op === "recusar") return w.u8(3).uint(m.entidade).finish();
  if (m.op === "outro") return w.u8(4).uint(m.entidade).u8(m.lugar).finish();
  return w.u8(5).finish();
}
