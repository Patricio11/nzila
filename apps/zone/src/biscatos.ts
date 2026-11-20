// Biscatos in the street (Task 4.5, D-4.22): the zone's side of a round. A round is begun only by someone standing
// at the place of its kind; the phone sends what the thumb does in batches as it goes, and the zone keeps them in
// order, never ahead of its own clock (a phone cannot send a round played somewhere else, faster); at the end, or
// when the player says they are done, the zone replays them with `packages/sim` and scores them. The pay is the
// API's, on the zone's note.

import { type BiscatoKind } from "@nzila/economy/biscatos";
import { scoreCarga } from "@nzila/sim/carga";
import { pratosRound, scorePratos } from "@nzila/sim/pratos";

/** How near a biscato's place a player must stand to begin it, in millimetres. */
export const BISCATO_REACH_MM = 2500;
/** How far ahead of the zone's clock the phone's times may run: its clock started a little later, and the line's delay. */
export const AHEAD_SLACK_MS = 2000;
/** How long after its end a round nobody said was done is scored by itself. */
export const BISCATO_GRACE_MS = 10_000;
/** How long the zone's note of a scored round lasts for the API to pay it, in seconds. */
export const BISCATO_NOTE_S = 600;

/** A round being played. */
export interface Ronda {
  readonly kind: BiscatoKind;
  readonly seed: number;
  /** When it began, on the zone's clock (milliseconds). */
  readonly startedAt: number;
  readonly lengthMs: number;
  readonly inputs: { t: number; what: 0 | 1 }[];
}

/** The most inputs a round keeps: more is not a hand. */
const INPUTS_MAX = 2000;

/** A round's score, as the zone tells it: 0 to 1 000; what was done, what went wrong, and the most there was to do. */
export interface Feito {
  readonly score: number;
  readonly done: number;
  readonly failed: number;
  readonly most: number;
}

/** The place of a biscato of this kind within reach of where the player stands, if there is one. */
export function spotNear(spots: readonly { readonly kind: string; readonly x: number; readonly z: number }[] | undefined, kind: string, here: { readonly x: number; readonly z: number }): boolean {
  return (spots ?? []).some((spot) => spot.kind === kind && Math.hypot(spot.x - here.x, spot.z - here.z) <= BISCATO_REACH_MM);
}

/**
 * Takes a batch of what the thumb did. A batch that goes back in time, or runs ahead of the zone's clock, is not a
 * hand's: none of it is kept. Past the most a round may have, the rest is dropped.
 */
export function takeInputs(ronda: Ronda, inputs: readonly { readonly t: number; readonly what: number }[], now: number): boolean {
  const last = ronda.inputs.at(-1)?.t ?? 0;
  const first = inputs[0]?.t ?? last;
  const latest = inputs.at(-1)?.t ?? last;
  if (first < last || latest > now - ronda.startedAt + AHEAD_SLACK_MS) return false;
  for (const input of inputs) {
    if (ronda.inputs.length >= INPUTS_MAX) break;
    ronda.inputs.push({ t: input.t, what: input.what === 1 ? 1 : 0 });
  }
  return true;
}

/**
 * The round's score, from its seed and what the thumb did, by its biscato's rules, as far as it was played: what was
 * done is scored against the whole round.
 */
export function scoreRonda(ronda: Ronda, playedMs: number): Feito {
  if (ronda.kind === "carga") {
    const carga = scoreCarga(ronda.seed, ronda.lengthMs, ronda.inputs, playedMs + AHEAD_SLACK_MS);
    return { score: carga.score, done: carga.delivered, failed: carga.fallen, most: carga.most };
  }
  const pratos = scorePratos(pratosRound(ronda.seed, ronda.lengthMs), ronda.inputs, ronda.lengthMs);
  return { score: pratos.score, done: pratos.clean, failed: pratos.dirty, most: pratos.plates };
}
