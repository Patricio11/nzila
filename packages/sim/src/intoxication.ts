// Drink. A player who has had too many is hard to steer: the body wanders
// off the line the thumb asks for, lurches now and then, and cannot run.
// (Founder, 2026-11-14; the design is Task 10.16 in the roadmap.)
//
// The wandering is applied to the stick, here, in the shared simulation. So
// the zone applies it too, and a modified client cannot walk straight when
// its player is drunk. What the player sees (the swaying camera, the doubled
// lights) is the renderer's business and is not decided here.
//
// Rates and thresholds below are starting values; they move to tunables with
// the task that builds the feature.

import { clamp, cosCdeg, idiv, mulTrig, sinCdeg } from "./fixed.ts";
import { type MoveInput } from "./movement.ts";
import { hashInts } from "./rng.ts";
import { type DriveInput } from "./vehicle.ts";

/** As drunk as the game lets anyone get. Levels are whole numbers from 0 (sober) to this. */
export const DRUNK_MAX = 1000;

/** 0 sober, 1 merry (no effect on control yet), 2 unsteady, 3 drunk. */
export type DrunkBand = 0 | 1 | 2 | 3;

export function drunkBand(level: number): DrunkBand {
  if (level < 150) return 0;
  if (level < 400) return 1;
  if (level < 750) return 2;
  return 3;
}

/** The level after a drink of the given strength. It never passes the maximum: there is no passing out, no harm. */
export function afterDrink(level: number, strength: number): number {
  return clamp(level + Math.max(0, strength), 0, DRUNK_MAX);
}

/** The level after some simulation steps of sobering up, at a rate in points per real hour. */
export function soberUp(level: number, steps: number, pointsPerHour: number): number {
  return clamp(level - idiv(pointsPerHour * steps, 72_000), 0, DRUNK_MAX);
}

// How far off course, in centidegrees, the body is pulled at this moment.
// Two slow swings that never line up twice the same way, plus now and then a
// lurch to one side that lasts half a second. `seed` is the player's own, so
// two drunks do not sway in step.
function drift(level: number, tick: number, seed: number): number {
  if (drunkBand(level) < 2) return 0;
  // Nothing at 400, up to 40 degrees each way at the maximum.
  const reach = idiv((level - 400) * 4000, DRUNK_MAX - 400);
  const swing = idiv(sinCdeg(tick * 173 + seed * 7919) + sinCdeg(tick * 71 + seed * 104_729), 2);
  let angle = mulTrig(reach, swing);
  const moment = idiv(tick, 10);
  const roll = hashInts(seed, [moment]) % 1000;
  // A lurch: rarer when merely unsteady, about one half-second in six when drunk.
  if (roll < idiv((level - 400) * 170, DRUNK_MAX - 400)) angle += roll % 2 === 0 ? reach : -reach;
  return angle;
}

/**
 * The stick as the body obeys it. Sober and merry, exactly as given. Beyond
 * that the direction wanders, and a drunk cannot run.
 */
export function swayMove(input: MoveInput, level: number, tick: number, seed: number): MoveInput {
  const angle = drift(level, tick, seed);
  if (drunkBand(level) < 2) return input;
  const dx = clamp(input.dx, -127, 127);
  const dz = clamp(input.dz, -127, 127);
  const sin = sinCdeg(angle);
  const cos = cosCdeg(angle);
  return {
    dx: clamp(mulTrig(dx, cos) + mulTrig(dz, sin), -127, 127),
    dz: clamp(mulTrig(dz, cos) - mulTrig(dx, sin), -127, 127),
    run: input.run && drunkBand(level) < 3,
  };
}

/**
 * The wheel as a vehicle obeys it: the steering wanders the same way. Driving
 * like this is an offence the police can see (Task 7.2); the game never makes
 * it pay.
 */
export function swayDrive(input: DriveInput, level: number, tick: number, seed: number): DriveInput {
  if (drunkBand(level) < 2) return input;
  // 40 degrees of drift is the whole of the wheel one way.
  const pull = idiv(drift(level, tick, seed) * 127, 4000);
  return { throttle: input.throttle, steer: clamp(clamp(input.steer, -127, 127) + pull, -127, 127), brake: input.brake };
}
