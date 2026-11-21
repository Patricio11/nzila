// The ball on a campo (Zango's second pass, 2026-11-21): where it is, worked out the same way by the zone and by
// every phone. The zone says where the ball was and how it was moving at a moment (after each kick, each bounce,
// each goal); between those words it rolls in a straight line and slows evenly until it stops. Nothing here is
// drawn or sent: it is the rule both sides keep. Kept apart from messages.ts so that it travels with the code
// that draws the ball, not with every phone from the first byte.

import { MSG } from "./messages.ts";
import { Writer } from "./wire.ts";

/** A ball as it was said: millimetres, millimetres a second, and the moment (any clock, in milliseconds). */
export interface Bola {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly atMs: number;
}

/** How quickly a rolling ball slows, in millimetres a second each second: on beaten earth it does not go far. */
export const BOLA_SLOWS = 2600;

/** Where a ball is at a moment, and how it is moving then. Before the moment it was said, it is where it was said. */
export function bolaAt(ball: Bola, nowMs: number): { x: number; z: number; vx: number; vz: number } {
  const speed = Math.hypot(ball.vx, ball.vz);
  const t = Math.max(0, nowMs - ball.atMs) / 1000;
  if (speed === 0 || t === 0) return { x: ball.x, z: ball.z, vx: ball.vx, vz: ball.vz };
  const stops = speed / BOLA_SLOWS;
  const rolled = Math.min(t, stops);
  // Slowing evenly: the ground covered is the mean of the speed it began with and the speed it has now.
  const far = speed * rolled - (BOLA_SLOWS * rolled * rolled) / 2;
  const left = t >= stops ? 0 : (speed - BOLA_SLOWS * t) / speed;
  return { x: ball.x + (ball.vx / speed) * far, z: ball.z + (ball.vz / speed) * far, vx: ball.vx * left, vz: ball.vz * left };
}

/** Client to zone: go over to the other side of the match on a campo (its number in the pack). */
export function encodeLado(campo: number): Uint8Array {
  return new Writer().u8(MSG.LADO).u8(campo).finish();
}
