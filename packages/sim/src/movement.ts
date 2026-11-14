// A person on foot. Kinematic: the stick says where to go and the ground and
// the obstacles say how far the body gets. No momentum, no physics engine.
// The client runs this to predict its own avatar and the zone runs the same
// code to decide where the avatar really is.

import { clamp, idiv, length2, yawFromDir } from "./fixed.ts";
import { CELL_WALK, bodyFits, groundHeight, type Ground } from "./grid.ts";
import { pushOut, touchesAny, type Obstacle, type Push } from "./collision.ts";
import { SIM_STEP_MS } from "./step.ts";

export interface CharacterParams {
  readonly radiusMm: number;
  readonly walkMmPerS: number;
  readonly runMmPerS: number;
  /** Highest kerb or stair the body climbs without a ramp. Also bounds the steepest slope. */
  readonly stepUpMm: number;
  /** Deepest drop the body walks off. Anything deeper is an edge it stops at. */
  readonly maxDropMm: number;
}

export const DEFAULT_CHARACTER: CharacterParams = {
  radiusMm: 300,
  walkMmPerS: 1500,
  runMmPerS: 4200,
  stepUpMm: 350,
  maxDropMm: 1000,
};

export interface CharacterState {
  x: number;
  y: number;
  z: number;
  /** Centidegrees, 0..35999. */
  yaw: number;
}

/** One step of stick input: each axis in -127..127. */
export interface MoveInput {
  readonly dx: number;
  readonly dz: number;
  readonly run: boolean;
}

export const NO_MOVE: MoveInput = { dx: 0, dz: 0, run: false };

const push: Push = { x: 0, z: 0 };

/** Advances one character by one simulation step. Changes state in place. */
export function stepCharacter(
  state: CharacterState,
  input: MoveInput,
  ground: Ground,
  obstacles: readonly Obstacle[],
  params: CharacterParams = DEFAULT_CHARACTER,
): void {
  let dx = clamp(input.dx, -127, 127);
  let dz = clamp(input.dz, -127, 127);
  const len = length2(dx, dz);
  if (len === 0) return;
  if (len > 127) {
    // A stick pushed into a corner must not be faster than one pushed straight.
    dx = idiv(dx * 127, len);
    dz = idiv(dz * 127, len);
  }
  state.yaw = yawFromDir(dx, dz);

  const speed = input.run ? params.runMmPerS : params.walkMmPerS;
  const moveX = idiv(dx * speed * SIM_STEP_MS, 127 * 1000);
  const moveZ = idiv(dz * speed * SIM_STEP_MS, 127 * 1000);
  const r = params.radiusMm;
  const fits = (x: number, z: number): boolean =>
    bodyFits(ground, x, z, r, CELL_WALK, state.y, params.stepUpMm, params.maxDropMm);

  // Short hops, so a fast body cannot pass through a thin wall.
  const hop = Math.max(1, idiv(r, 4));
  const hops = Math.max(1, Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveZ)) / hop));
  for (let i = 1; i <= hops; i++) {
    const startX = state.x;
    const startZ = state.z;
    const stepX = idiv(moveX * i, hops) - idiv(moveX * (i - 1), hops);
    const stepZ = idiv(moveZ * i, hops) - idiv(moveZ * (i - 1), hops);
    // One axis at a time: blocked on one, the body still slides on the other.
    if (stepX !== 0 && fits(state.x + stepX, state.z)) state.x += stepX;
    if (stepZ !== 0 && fits(state.x, state.z + stepZ)) state.z += stepZ;

    let pushed = false;
    for (const obstacle of obstacles) {
      if (pushOut(state.x, state.z, r, obstacle, push)) {
        state.x += push.x;
        state.z += push.z;
        pushed = true;
      }
    }
    if (pushed && (!fits(state.x, state.z) || touchesAny(state.x, state.z, r, obstacles))) {
      // Pushed into a wall or into a second obstacle: stay where the hop began.
      state.x = startX;
      state.z = startZ;
    }
    state.y = groundHeight(ground, state.x, state.z, CELL_WALK, params.stepUpMm);
  }
}
