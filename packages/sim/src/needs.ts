// Fome and Energia. A typed stub: the shape and the one rule that is certain
// (needs fall with time and never below empty). Phase 4 (Task 4.4) fills in
// eating, resting, the slow-down and the hospital. Rates come from tunables.
// Effort is here already: going fast and jumping cost Energia (D-0.46).

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

/** What effort costs (founder, 2026-11-15: "jump, jogging or walking fast will cost Energia"). */
export interface EffortRates {
  /** Points of Energia lost per real hour of going fast, over and above what time alone takes. */
  readonly energiaPerRunHour: number;
  /** Points of Energia one jump costs. */
  readonly energiaPerJump: number;
}

/**
 * The needs after effort: `runSteps` simulation steps spent going fast (the run of movement.ts,
 * which is a jog and a fast walk as much as a sprint) and `jumps` jumps made. Walking costs nothing more.
 */
export function spendEffort(state: NeedsState, runSteps: number, jumps: number, rates: EffortRates): NeedsState {
  const stepsPerHour = 72000;
  const cost = idiv(rates.energiaPerRunHour * Math.max(0, runSteps), stepsPerHour) + rates.energiaPerJump * Math.max(0, jumps);
  return { fome: state.fome, energia: clamp(state.energia - cost, 0, NEED_FULL) };
}
