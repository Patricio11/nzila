// Lavar pratos (Task 4.5, D-4.22): a biscato at a kiosk. The plates pile up beside the bacia, faster as the round
// goes on; each has its dirt, a number of rubs; the thumb rubs the plate in the water and flicks it, clean, onto the
// escorredor. A plate put up dirty is sent back by the dona: it costs one that was clean.
//
// The round is made from a seed, the same on the phone and on the zone; the phone sends only the times of its rubs
// and flicks, and the zone replays them here. A rub faster than a hand can rub counts for nothing, so tapping
// wildly is no better than rubbing well.

import { idiv } from "../fixed.ts";
import { createRng, rngRange } from "../rng.ts";
import { SCORE_MAX } from "./timing.ts";

/** What the thumb did: a rub of the plate in the water, or a flick of it onto the escorredor. */
export const PRATOS_RUB = 0;
export const PRATOS_FLICK = 1;

/** One thing the thumb did, at a time from the round's start in milliseconds. */
export interface PratosInput {
  readonly t: number;
  readonly what: typeof PRATOS_RUB | typeof PRATOS_FLICK;
}

/** One plate: when it lands on the pile, and how many rubs its dirt takes. */
export interface Prato {
  readonly at: number;
  readonly dirt: number;
}

/** Rubs closer together than this are one rub: a hand goes back and forth at most about eight times a second. */
export const RUB_GAP_MS = 120;
/** The most inputs a round may have: more is not a hand. */
export const PRATOS_INPUTS_MAX = 2000;

/**
 * The round's plates, from its seed and length: the first at once, then one every 3,4 s at the start down to every
 * 1,6 s at the end, each needing 3 to 8 rubs (more as the round goes on).
 */
export function pratosRound(seed: number, lengthMs: number): Prato[] {
  const rng = createRng(seed);
  const plates: Prato[] = [];
  let at = 0;
  while (at < lengthMs) {
    const late = idiv(at * 100, lengthMs);
    plates.push({ at, dirt: rngRange(rng, 3 + idiv(late * 2, 100), 6 + idiv(late * 2, 100)) });
    at += 3400 - idiv(1800 * late, 100) + rngRange(rng, -300, 300);
  }
  return plates;
}

/** How a round went, as the zone scores it. */
export interface PratosScore {
  /** 0 to 1 000: the clean plates on the escorredor, less one for each put up dirty, out of every plate of the round. */
  readonly score: number;
  readonly clean: number;
  readonly dirty: number;
  readonly plates: number;
}

/**
 * Replays what the thumb did. The plate in the water is the first one landed and not yet put up; a rub takes one
 * from its dirt (none before it lands, none faster than RUB_GAP_MS); a flick puts it up, clean or not. Inputs after
 * the round's end, out of order or too many, are not a hand's: they count for nothing.
 */
export function scorePratos(plates: readonly Prato[], inputs: readonly PratosInput[], lengthMs: number): PratosScore {
  let next = 0;
  let dirtLeft = plates[0]?.dirt ?? 0;
  let clean = 0;
  let dirty = 0;
  let lastRub = -RUB_GAP_MS;
  let lastT = 0;
  for (const input of inputs.slice(0, PRATOS_INPUTS_MAX)) {
    if (input.t < lastT || input.t > lengthMs) break;
    lastT = input.t;
    const plate = plates[next];
    if (!plate || plate.at > input.t) continue;
    if (input.what === PRATOS_RUB) {
      if (input.t - lastRub < RUB_GAP_MS) continue;
      lastRub = input.t;
      if (dirtLeft > 0) dirtLeft -= 1;
    } else {
      if (dirtLeft === 0) clean += 1;
      else dirty += 1;
      next += 1;
      dirtLeft = plates[next]?.dirt ?? 0;
    }
  }
  const plateCount = plates.length;
  const score = plateCount === 0 ? 0 : Math.max(0, idiv((clean - dirty) * SCORE_MAX, plateCount));
  return { score, clean, dirty, plates: plateCount };
}
