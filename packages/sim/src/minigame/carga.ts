// Levar carga (Task 4.5, D-4.22): the roboteiro at the paragem. A carrinho stacked with what came off the vans
// (sacks of fuba, crates of tomato, bidões of oil) is pushed from the paragem to the market stall. The road bumps the
// stack, and a stack that leans leans further; a tap on the left or the right pushes it back. Over the edge, it
// falls: the trip is lost and begun again. Each load delivered, the next is a box higher.
//
// All in whole numbers, in steps of 50 ms, from a seed: the phone draws it as it goes and the zone replays the same
// taps through the same steps. Taps closer together than a hand can tap count once.

import { idiv } from "../fixed.ts";
import { createRng, rngRange } from "../rng.ts";
import { SCORE_MAX } from "./timing.ts";

/** A tap: on the left, pushing the stack to the left; on the right, to the right. */
export const CARGA_LEFT = 0;
export const CARGA_RIGHT = 1;

export interface CargaInput {
  readonly t: number;
  readonly what: typeof CARGA_LEFT | typeof CARGA_RIGHT;
}

/** One step of the world, in milliseconds. */
export const CARGA_STEP_MS = 50;
/** The stack falls past this lean, in hundredths of a degree. */
export const CARGA_EDGE = 2500;
/** A trip from the paragem to the stall, in millimetres, and the carrinho's pace in millimetres a step. */
export const CARGA_TRIP_MM = 18_000;
const PACE_MM = 75;
/** How hard a tap pushes, in hundredths of a degree a step. */
const TAP = 60;
/** Taps closer together than this are one. */
export const TAP_GAP_MS = 80;
/** Steps lost when the stack falls (gathering it up again), and when a load is set down at the stall. */
const FALL_STEPS = 40;
const UNLOAD_STEPS = 20;
/** The stack's height: the first load, and the most. */
const FIRST_BOXES = 3;
const MOST_BOXES = 7;
/** The most inputs a round may have. */
export const CARGA_INPUTS_MAX = 2000;

/** A bump of the road: at which step, and how hard it shoves the stack (either way). */
export interface Solavanco {
  readonly step: number;
  readonly push: number;
}

/** The road's bumps for a round: one every 0,6 to 1,6 s, each shoving 30 to 90 either way. */
export function cargaRoad(seed: number, lengthMs: number): Solavanco[] {
  const rng = createRng(seed);
  const steps = idiv(lengthMs, CARGA_STEP_MS);
  const bumps: Solavanco[] = [];
  let step = rngRange(rng, 12, 32);
  while (step < steps) {
    const push = rngRange(rng, 30, 90);
    bumps.push({ step, push: rngRange(rng, 0, 1) === 0 ? -push : push });
    step += rngRange(rng, 12, 32);
  }
  return bumps;
}

/** The carrinho and its stack at a step. */
export interface Carga {
  step: number;
  /** The lean, and how fast it is changing, in hundredths of a degree. */
  lean: number;
  swing: number;
  /** How far along this trip, in millimetres; and how many boxes are on the stack. */
  along: number;
  boxes: number;
  delivered: number;
  fallen: number;
  /** Steps left of setting down or gathering up, when nothing moves. */
  still: number;
  /** Whether the last thing that happened was a fall (for drawing it). */
  justFell: boolean;
  lastTap: number;
  next: number;
}

export function cargaStart(): Carga {
  return { step: 0, lean: 0, swing: 0, along: 0, boxes: FIRST_BOXES, delivered: 0, fallen: 0, still: 0, justFell: false, lastTap: -TAP_GAP_MS, next: 0 };
}

/**
 * One step: the taps of this step push the stack, a bump of the road shoves it, a lean grows by itself (the more the
 * higher the stack), the swing dies away a little, and the carrinho goes on. Over the edge, the stack falls and the
 * trip begins again; at the stall, the load is set down and the next is a box higher.
 */
export function cargaStep(state: Carga, road: readonly Solavanco[], inputs: readonly CargaInput[]): void {
  const s = state;
  const from = s.step * CARGA_STEP_MS;
  while (s.next < inputs.length && inputs[s.next]!.t < from + CARGA_STEP_MS) {
    const input = inputs[s.next]!;
    s.next += 1;
    if (input.t < from || s.still > 0 || input.t - s.lastTap < TAP_GAP_MS) continue;
    s.lastTap = input.t;
    s.swing += input.what === CARGA_LEFT ? -TAP : TAP;
  }
  s.step += 1;
  if (s.still > 0) {
    s.still -= 1;
    return;
  }
  s.justFell = false;
  for (const bump of road) if (bump.step === s.step) s.swing += bump.push + idiv(bump.push * (s.boxes - FIRST_BOXES), 6);
  s.swing += idiv(s.lean * (2 + s.boxes), 1000);
  s.swing -= idiv(s.swing * 80, 1000);
  s.lean += s.swing;
  if (Math.abs(s.lean) > CARGA_EDGE) {
    s.fallen += 1;
    s.justFell = true;
    s.lean = s.swing = s.along = 0;
    s.still = FALL_STEPS;
    return;
  }
  s.along += PACE_MM;
  if (s.along >= CARGA_TRIP_MM) {
    s.delivered += 1;
    s.boxes = Math.min(MOST_BOXES, s.boxes + 1);
    s.lean = s.swing = s.along = 0;
    s.still = UNLOAD_STEPS;
  }
}

/** How many loads a round could deliver with none falling: a trip, then the setting down, again and again (the last setting down may run past the end). */
export function cargaMost(lengthMs: number): number {
  const trip = Math.ceil(CARGA_TRIP_MM / PACE_MM);
  return Math.max(1, idiv(idiv(lengthMs, CARGA_STEP_MS) + UNLOAD_STEPS, trip + UNLOAD_STEPS));
}

export interface CargaScore {
  /** 0 to 1 000: the loads delivered, out of what the round could deliver. */
  readonly score: number;
  readonly delivered: number;
  readonly fallen: number;
  readonly most: number;
}

/**
 * Replays a round from its taps, up to when it was played (a player who left early is not made to drop the stack for
 * the rest of the round); what was delivered is scored against what the whole round could deliver. Taps out of
 * order, after the round's end, or past a hand's count, count for nothing.
 */
export function scoreCarga(seed: number, lengthMs: number, inputs: readonly CargaInput[], playedMs = lengthMs): CargaScore {
  const road = cargaRoad(seed, lengthMs);
  const kept: CargaInput[] = [];
  for (const input of inputs.slice(0, CARGA_INPUTS_MAX)) {
    if (input.t < (kept.at(-1)?.t ?? 0) || input.t > lengthMs) break;
    kept.push(input);
  }
  const state = cargaStart();
  const steps = idiv(Math.max(0, Math.min(playedMs, lengthMs)), CARGA_STEP_MS);
  while (state.step < steps) cargaStep(state, road, kept);
  const most = cargaMost(lengthMs);
  return { score: Math.min(SCORE_MAX, idiv(state.delivered * SCORE_MAX, most)), delivered: state.delivered, fallen: state.fallen, most };
}
