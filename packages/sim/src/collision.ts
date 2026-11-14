// Simple shapes that stand on the ground: a round one (a lamp post, a tree,
// a table) and a box at any angle (a kiosk, a bench, a parked or moving van).
// Bodies that move are circles. A collision is answered with the shortest
// push that takes the circle out of the shape, which is what makes a body
// slide along a wall instead of sticking to it.

import { cosCdeg, divAway, isqrt, mulTrig, sinCdeg } from "./fixed.ts";

export interface CircleObstacle {
  readonly kind: "circle";
  readonly x: number;
  readonly z: number;
  readonly radiusMm: number;
}

export interface BoxObstacle {
  readonly kind: "box";
  readonly x: number;
  readonly z: number;
  /** Half the size across the box's own right-hand axis. */
  readonly halfWidthMm: number;
  /** Half the size along the box's own forward axis. */
  readonly halfLengthMm: number;
  /** Centidegrees; forward is (sin yaw, cos yaw). */
  readonly yaw: number;
}

export type Obstacle = CircleObstacle | BoxObstacle;

/** A push in millimetres. Reused by callers to avoid allocating every step. */
export interface Push {
  x: number;
  z: number;
}

/**
 * Overlaps smaller than this are ignored when asking "does it touch?".
 * A push is rounded to whole millimetres through a rotation, so a body that
 * was just pushed clear may still graze the shape by a millimetre or two.
 */
export const TOUCH_SLACK_MM = 4;

function pushFromCircle(px: number, pz: number, radiusMm: number, o: CircleObstacle, out: Push): boolean {
  const dx = px - o.x;
  const dz = pz - o.z;
  const reach = radiusMm + o.radiusMm;
  const d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return false;
  const d = isqrt(d2);
  if (d === 0) {
    out.x = reach + 1;
    out.z = 0;
    return true;
  }
  const depth = reach - d + 1;
  out.x = divAway(dx * depth, d);
  out.z = divAway(dz * depth, d);
  return true;
}

function pushFromBox(px: number, pz: number, radiusMm: number, o: BoxObstacle, out: Push): boolean {
  const dx = px - o.x;
  const dz = pz - o.z;
  // Most obstacles are nowhere near: rule those out before any trigonometry.
  const far = o.halfWidthMm + o.halfLengthMm + radiusMm;
  if (Math.abs(dx) > far || Math.abs(dz) > far) return false;
  const sin = sinCdeg(o.yaw);
  const cos = cosCdeg(o.yaw);
  // The circle's centre in the box's own axes: lx to its right, lz ahead.
  const lx = mulTrig(dx, cos) - mulTrig(dz, sin);
  const lz = mulTrig(dx, sin) + mulTrig(dz, cos);
  const ex = lx - Math.max(-o.halfWidthMm, Math.min(o.halfWidthMm, lx));
  const ez = lz - Math.max(-o.halfLengthMm, Math.min(o.halfLengthMm, lz));
  let outX = 0;
  let outZ = 0;
  if (ex === 0 && ez === 0) {
    // The centre is inside the box: leave through the nearest face.
    const depthX = o.halfWidthMm - Math.abs(lx) + radiusMm + 2;
    const depthZ = o.halfLengthMm - Math.abs(lz) + radiusMm + 2;
    if (depthX <= depthZ) outX = lx < 0 ? -depthX : depthX;
    else outZ = lz < 0 ? -depthZ : depthZ;
  } else {
    const d2 = ex * ex + ez * ez;
    if (d2 >= radiusMm * radiusMm) return false;
    const d = isqrt(d2);
    const depth = radiusMm - d + 2;
    outX = divAway(ex * depth, d);
    outZ = divAway(ez * depth, d);
  }
  out.x = mulTrig(outX, cos) + mulTrig(outZ, sin);
  out.z = mulTrig(outZ, cos) - mulTrig(outX, sin);
  return true;
}

/**
 * If a circle at (px, pz) overlaps the obstacle, writes the push that frees
 * it into out and returns true.
 */
export function pushOut(px: number, pz: number, radiusMm: number, obstacle: Obstacle, out: Push): boolean {
  return obstacle.kind === "circle"
    ? pushFromCircle(px, pz, radiusMm, obstacle, out)
    : pushFromBox(px, pz, radiusMm, obstacle, out);
}

const scratch: Push = { x: 0, z: 0 };

/** Whether a circle touches any obstacle, ignoring grazes within the slack. */
export function touchesAny(px: number, pz: number, radiusMm: number, obstacles: readonly Obstacle[]): boolean {
  const r = Math.max(1, radiusMm - TOUCH_SLACK_MM);
  for (const obstacle of obstacles) {
    if (pushOut(px, pz, r, obstacle, scratch)) return true;
  }
  return false;
}
