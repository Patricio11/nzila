// A person on foot. Kinematic: the stick says where to go and the ground and
// the obstacles say how far the body gets. No momentum, no physics engine.
// The client runs this to predict its own avatar and the zone runs the same
// code to decide where the avatar really is.

import { clamp, idiv, length2, yawFromDir } from "./fixed.ts";
import { CELL_LOW, CELL_WALK, bodyFits, groundHeight, type Ground } from "./grid.ts";
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
  /** Steps a jump stays in the air. */
  readonly jumpSteps: number;
  /** How high the feet come off the ground at the top of a jump. */
  readonly jumpHeightMm: number;
  /** The highest ledge a jump lands on. */
  readonly jumpUpMm: number;
  /** A jump with the stick pushed goes forward at least this fast, so one from a walk still clears a kerbed strip. */
  readonly jumpMmPerS: number;
}

export const DEFAULT_CHARACTER: CharacterParams = {
  radiusMm: 300,
  // A brisk walk and a good run: a real person's 1,5 m/s felt slow in the street (the founder, 2026-11-18).
  walkMmPerS: 2300,
  runMmPerS: 5200,
  stepUpMm: 350,
  maxDropMm: 1000,
  jumpSteps: 12,
  jumpHeightMm: 550,
  jumpUpMm: 700,
  jumpMmPerS: 3600,
};

export interface CharacterState {
  x: number;
  y: number;
  z: number;
  /** Centidegrees, 0..35999. */
  yaw: number;
  /** Steps left in the air; absent or 0 on the ground. */
  air?: number;
  /** A jump over something low is committed: where each step of it goes, whatever the stick says meanwhile. */
  airX?: number;
  airZ?: number;
}

/** One step of stick input: each axis in -127..127. */
export interface MoveInput {
  readonly dx: number;
  readonly dz: number;
  readonly run: boolean;
  /** Asks to jump. Only heard with both feet on the ground. */
  readonly jump?: boolean;
}

export const NO_MOVE: MoveInput = { dx: 0, dz: 0, run: false };

const push: Push = { x: 0, z: 0 };

/** How far off the ground the feet are, in millimetres: 0 standing, the arc of the jump in the air. */
export function jumpLiftMm(state: CharacterState, params: CharacterParams = DEFAULT_CHARACTER): number {
  const left = state.air ?? 0;
  if (left <= 0) return 0;
  const done = params.jumpSteps - left;
  return idiv(4 * params.jumpHeightMm * done * left, params.jumpSteps * params.jumpSteps);
}

/**
 * Moves the body by (moveX, moveZ) in short hops against the ground and the obstacles.
 * `mask` is what it may be over and `stepUpMm` how high a ledge it gets onto.
 */
function travel(
  state: CharacterState,
  moveX: number,
  moveZ: number,
  ground: Ground,
  obstacles: readonly Obstacle[],
  params: CharacterParams,
  mask: number,
  stepUpMm: number,
): void {
  const r = params.radiusMm;
  const fits = (x: number, z: number): boolean => bodyFits(ground, x, z, r, mask, state.y, stepUpMm, params.maxDropMm);

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
    // Over something low the body keeps the height it left the ground at; it has no floor of its own.
    if ((ground.flagsAt(Math.floor(state.x / ground.cellMm), Math.floor(state.z / ground.cellMm)) & CELL_WALK) !== 0) {
      state.y = groundHeight(ground, state.x, state.z, CELL_WALK, stepUpMm);
    }
  }
}

/**
 * Whether a jump of `steps` steps of (moveX, moveZ) from where the body stands would cross
 * something low and come down on ground it can stand on. Tried on a copy: nothing is changed.
 */
function clearsLow(
  state: CharacterState,
  moveX: number,
  moveZ: number,
  ground: Ground,
  obstacles: readonly Obstacle[],
  params: CharacterParams,
): boolean {
  const trial: CharacterState = { x: state.x, y: state.y, z: state.z, yaw: state.yaw };
  let crossed = false;
  for (let i = 0; i < params.jumpSteps; i++) {
    const fromX = trial.x;
    const fromZ = trial.z;
    travel(trial, moveX, moveZ, ground, obstacles, params, CELL_WALK | CELL_LOW, params.jumpUpMm);
    // Stopped short by a wall: this is not a jump to be held to.
    if (trial.x - fromX !== moveX || trial.z - fromZ !== moveZ) return false;
    if (!bodyFits(ground, trial.x, trial.z, params.radiusMm, CELL_WALK, trial.y, params.jumpUpMm, params.maxDropMm)) crossed = true;
  }
  return crossed && bodyFits(ground, trial.x, trial.z, params.radiusMm, CELL_WALK, trial.y, params.jumpUpMm, params.maxDropMm);
}

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
  if (len > 127) {
    // A stick pushed into a corner must not be faster than one pushed straight.
    dx = idiv(dx * 127, len);
    dz = idiv(dz * 127, len);
  }
  const speed = input.run ? params.runMmPerS : params.walkMmPerS;
  let moveX = idiv(dx * speed * SIM_STEP_MS, 127 * 1000);
  let moveZ = idiv(dz * speed * SIM_STEP_MS, 127 * 1000);

  let air = state.air ?? 0;
  if (air <= 0 && input.jump === true) {
    // Leaving the ground. With the stick pushed, the jump goes that way at no less than a jump's own pace;
    // if that would carry the body over something low and down on the far side, it is held to it.
    air = params.jumpSteps;
    delete state.airX;
    delete state.airZ;
    if (len > 0) {
      const pace = Math.max(speed, params.jumpMmPerS);
      const whole = length2(dx, dz);
      const jumpX = idiv(dx * pace * SIM_STEP_MS, whole * 1000);
      const jumpZ = idiv(dz * pace * SIM_STEP_MS, whole * 1000);
      if (clearsLow(state, jumpX, jumpZ, ground, obstacles, params)) {
        state.airX = jumpX;
        state.airZ = jumpZ;
      }
    }
  }

  if (air > 0) {
    const held = state.airX !== undefined && state.airZ !== undefined;
    if (held) {
      moveX = state.airX!;
      moveZ = state.airZ!;
    }
    if (moveX !== 0 || moveZ !== 0) {
      state.yaw = yawFromDir(moveX, moveZ);
      // A held jump was tried against the obstacles before the feet left the ground. It is not tried again
      // in the air: something that moved meanwhile must not leave a body standing where nobody can stand.
      if (held) travel(state, moveX, moveZ, ground, [], params, CELL_WALK | CELL_LOW, params.jumpUpMm);
      else travel(state, moveX, moveZ, ground, obstacles, params, CELL_WALK, params.jumpUpMm);
    }
    air -= 1;
    state.air = air;
    if (air === 0) {
      delete state.air;
      delete state.airX;
      delete state.airZ;
    }
    return;
  }

  if (len === 0) return;
  state.yaw = yawFromDir(dx, dz);
  travel(state, moveX, moveZ, ground, obstacles, params, CELL_WALK, params.stepUpMm);
}
