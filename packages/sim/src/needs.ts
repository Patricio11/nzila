// Fome and Energia (Task 4.4): they fall with time and never below empty,
// going hungry costs Energia, effort costs Energia (D-0.46), eating and
// drinking give back, and too little Energia stops the run and the jump. The
// zone keeps them for each player with these rules; rates come from tunables.

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
  /** More Energia lost per real hour spent with Fome empty (founder, 2026-11-15: "if they don't eat for too long they lose energy"). */
  readonly energiaPerHungryHour?: number;
}

/** The needs after a number of simulation steps (20 a second) have passed. */
export function decayNeeds(state: NeedsState, steps: number, rates: NeedsRates): NeedsState {
  const stepsPerHour = 72000;
  // The steps of these that are spent with nothing left of Fome: going hungry costs Energia on top of time.
  const fed = rates.fomePerHour > 0 ? Math.ceil((Math.max(0, state.fome) * stepsPerHour) / rates.fomePerHour) : steps;
  const hungry = Math.max(0, steps - fed);
  const lost = idiv(rates.energiaPerHour * steps, stepsPerHour) + idiv((rates.energiaPerHungryHour ?? 0) * hungry, stepsPerHour);
  return {
    fome: clamp(state.fome - idiv(rates.fomePerHour * steps, stepsPerHour), 0, NEED_FULL),
    energia: clamp(state.energia - lost, 0, NEED_FULL),
  };
}

/** Energia won back by resting: points per real hour sitting (a bench, a stool at a table) or riding a van. */
export interface RestRates {
  readonly energiaPerRestHour: number;
}

/** The needs after `restSteps` steps (20 a second) spent sitting or riding (Task 4.4): Energia comes back, never past full. */
export function restNeeds(state: NeedsState, restSteps: number, rates: RestRates): NeedsState {
  const stepsPerHour = 72000;
  return { fome: state.fome, energia: clamp(state.energia + idiv(rates.energiaPerRestHour * Math.max(0, restSteps), stepsPerHour), 0, NEED_FULL) };
}

/** What eating or drinking something gives back (Task 4.4): its points added to each bar, never past full. */
export function eatNeeds(state: NeedsState, gives: { readonly fome: number; readonly energia: number }): NeedsState {
  return { fome: clamp(state.fome + Math.max(0, gives.fome), 0, NEED_FULL), energia: clamp(state.energia + Math.max(0, gives.energia), 0, NEED_FULL) };
}

/** Too tired to go fast or to jump (D-0.46): Energia under the line. The zone refuses both, and the phone does not ask. */
export function tooTired(state: NeedsState, below: number): boolean {
  return state.energia < below;
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
