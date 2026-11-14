// Fome and Energia. A typed stub: the shape and the one rule that is certain
// (needs fall with time and never below empty). Phase 4 (Task 4.4) fills in
// eating, resting, the slow-down and the hospital. Rates come from tunables.

import { clamp, idiv } from "./fixed.ts";

/** A full bar. Needs are whole numbers from 0 (empty) to this. */
export const NEED_FULL = 10000;

export interface NeedsState {
  fome: number;
  energia: number;
}

export interface NeedsRates {
  /** Points lost per real hour of play. */
  readonly fomePerHour: number;
  readonly energiaPerHour: number;
}

/** The needs after a number of simulation steps (20 a second) have passed. */
export function decayNeeds(state: NeedsState, steps: number, rates: NeedsRates): NeedsState {
  const stepsPerHour = 72000;
  return {
    fome: clamp(state.fome - idiv(rates.fomePerHour * steps, stepsPerHour), 0, NEED_FULL),
    energia: clamp(state.energia - idiv(rates.energiaPerHour * steps, stepsPerHour), 0, NEED_FULL),
  };
}
