// Offences. A typed stub: the kinds, and the two protections of Rule 6 that
// are already certain (the novato shield and the cap on what an assalto can
// take). Phase 7 (Task 7.2) fills in how each offence is resolved. Every
// number comes from tunables; none is written here.

import { idiv } from "./fixed.ts";

export type OffenceKind = "furto" | "carteirista" | "assalto" | "arrombamento" | "roubo_viatura";

export interface ShieldRules {
  /** A player is shielded until they have played this long... */
  readonly playSeconds: number;
  /** ...or until their account is this old, whichever comes later. */
  readonly accountAgeSeconds: number;
}

/** A shielded player can be neither the victim nor the offender. */
export function isShielded(playedSeconds: number, accountAgeSeconds: number, rules: ShieldRules): boolean {
  return playedSeconds < rules.playSeconds || accountAgeSeconds < rules.accountAgeSeconds;
}

export interface AssaltoCap {
  /** The most an assalto takes, in thousandths of the cash the victim carries. */
  readonly permilleOfCash: number;
  /** And never more than this many Makuta, however much they carry. */
  readonly ceiling: number;
}

/** The most Makuta an assalto may take from a victim carrying cashOnHand. Bank money is never counted. */
export function assaltoLossCap(cashOnHand: number, cap: AssaltoCap): number {
  return Math.min(idiv(Math.max(0, cashOnHand) * cap.permilleOfCash, 1000), cap.ceiling);
}
