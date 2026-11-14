// Things you drive. One arcade model, six parameter sets. It is meant to feel
// right under a thumb on a phone and to cost almost nothing to run on the
// server, not to be a driving simulator: no tyres, no suspension, no gears.

import { approach, clamp, cosCdeg, idiv, mulTrig, normCdeg, sinCdeg } from "./fixed.ts";
import { CELL_DRIVE, CELL_WATER, bodyFits, groundHeight, type Ground } from "./grid.ts";
import { touchesAny, type BoxObstacle, type Obstacle } from "./collision.ts";
import { SIM_STEP_MS } from "./step.ts";

export type VehicleKind = "bicycle" | "motorizada" | "car" | "van" | "boat" | "jetski";

export interface VehicleParams {
  /** CELL_DRIVE for the road, CELL_WATER for the sea. */
  readonly surface: number;
  readonly halfWidthMm: number;
  readonly halfLengthMm: number;
  readonly maxForwardMmPerS: number;
  readonly maxReverseMmPerS: number;
  readonly accelMmPerS2: number;
  readonly brakeMmPerS2: number;
  /** How fast it slows with no throttle. Low for a boat, which keeps gliding. */
  readonly dragMmPerS2: number;
  /** Turn rate at full lock once moving at turnFullSpeedMmPerS or faster. */
  readonly turnCdegPerS: number;
  readonly turnFullSpeedMmPerS: number;
  readonly stepUpMm: number;
  readonly maxDropMm: number;
}

// Starting values. They are tuned on the road in Phase 6, at postcard scale.
export const VEHICLES: Readonly<Record<VehicleKind, VehicleParams>> = {
  bicycle: {
    surface: CELL_DRIVE,
    halfWidthMm: 300,
    halfLengthMm: 850,
    maxForwardMmPerS: 6000,
    maxReverseMmPerS: 0,
    accelMmPerS2: 2500,
    brakeMmPerS2: 6000,
    dragMmPerS2: 1200,
    turnCdegPerS: 16000,
    turnFullSpeedMmPerS: 1500,
    stepUpMm: 150,
    maxDropMm: 300,
  },
  motorizada: {
    surface: CELL_DRIVE,
    halfWidthMm: 400,
    halfLengthMm: 1000,
    maxForwardMmPerS: 14000,
    maxReverseMmPerS: 0,
    accelMmPerS2: 5000,
    brakeMmPerS2: 9000,
    dragMmPerS2: 1500,
    turnCdegPerS: 13000,
    turnFullSpeedMmPerS: 2500,
    stepUpMm: 150,
    maxDropMm: 300,
  },
  car: {
    surface: CELL_DRIVE,
    halfWidthMm: 900,
    halfLengthMm: 2100,
    maxForwardMmPerS: 18000,
    maxReverseMmPerS: 5000,
    accelMmPerS2: 4500,
    brakeMmPerS2: 10000,
    dragMmPerS2: 1800,
    turnCdegPerS: 9000,
    turnFullSpeedMmPerS: 4000,
    stepUpMm: 120,
    maxDropMm: 250,
  },
  van: {
    surface: CELL_DRIVE,
    halfWidthMm: 950,
    halfLengthMm: 2500,
    maxForwardMmPerS: 14000,
    maxReverseMmPerS: 4000,
    accelMmPerS2: 3200,
    brakeMmPerS2: 8000,
    dragMmPerS2: 1800,
    turnCdegPerS: 7000,
    turnFullSpeedMmPerS: 4000,
    stepUpMm: 120,
    maxDropMm: 250,
  },
  boat: {
    surface: CELL_WATER,
    halfWidthMm: 1100,
    halfLengthMm: 3200,
    maxForwardMmPerS: 9000,
    maxReverseMmPerS: 2000,
    accelMmPerS2: 1800,
    brakeMmPerS2: 2200,
    dragMmPerS2: 500,
    turnCdegPerS: 4500,
    turnFullSpeedMmPerS: 3000,
    stepUpMm: 0,
    maxDropMm: 0,
  },
  jetski: {
    surface: CELL_WATER,
    halfWidthMm: 500,
    halfLengthMm: 1500,
    maxForwardMmPerS: 15000,
    maxReverseMmPerS: 0,
    accelMmPerS2: 6000,
    brakeMmPerS2: 4000,
    dragMmPerS2: 1500,
    turnCdegPerS: 11000,
    turnFullSpeedMmPerS: 3000,
    stepUpMm: 0,
    maxDropMm: 0,
  },
};

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  /** Centidegrees, 0..35999. */
  yaw: number;
  /** Millimetres per second along the nose. Negative in reverse. */
  speed: number;
}

/**
 * One step of driving input. Throttle and steer are -127..127.
 * Positive steer turns right, which lowers the yaw.
 */
export interface DriveInput {
  readonly throttle: number;
  readonly steer: number;
  readonly brake: boolean;
}

export const NO_DRIVE: DriveInput = { throttle: 0, steer: 0, brake: false };

function fitsAt(x: number, z: number, yaw: number, ground: Ground, obstacles: readonly Obstacle[], p: VehicleParams): boolean {
  // The body is two circles, one over each axle, as wide as the vehicle.
  const reach = Math.max(0, p.halfLengthMm - p.halfWidthMm);
  const ox = mulTrig(reach, sinCdeg(yaw));
  const oz = mulTrig(reach, cosCdeg(yaw));
  return axleFits(x + ox, z + oz, ground, obstacles, p) && axleFits(x - ox, z - oz, ground, obstacles, p);
}

// Each axle is judged against the ground under itself, not under the middle
// of the vehicle, so a long van can climb a hill a kerb's height at a time.
function axleFits(x: number, z: number, ground: Ground, obstacles: readonly Obstacle[], p: VehicleParams): boolean {
  const y = groundHeight(ground, x, z, p.surface, p.stepUpMm);
  return (
    bodyFits(ground, x, z, p.halfWidthMm, p.surface, y, p.stepUpMm, p.maxDropMm) &&
    !touchesAny(x, z, p.halfWidthMm, obstacles)
  );
}

/**
 * Advances one vehicle by one simulation step, changing state in place.
 * Returns the speed it hit something at, or 0 when the way was clear.
 */
export function stepVehicle(
  state: VehicleState,
  input: DriveInput,
  ground: Ground,
  obstacles: readonly Obstacle[],
  p: VehicleParams,
): number {
  const throttle = clamp(input.throttle, -127, 127);
  const steer = clamp(input.steer, -127, 127);
  const perStep = (perSecond: number): number => idiv(perSecond * SIM_STEP_MS, 1000);

  let speed = state.speed;
  const against = (throttle > 0 && speed < 0) || (throttle < 0 && speed > 0);
  if (input.brake || against) {
    speed = approach(speed, 0, perStep(p.brakeMmPerS2));
  } else if (throttle > 0) {
    speed = Math.min(speed + perStep(idiv(p.accelMmPerS2 * throttle, 127)), p.maxForwardMmPerS);
  } else if (throttle < 0) {
    speed = Math.max(speed + perStep(idiv(p.accelMmPerS2 * throttle, 127)), 0 - p.maxReverseMmPerS);
  } else {
    speed = approach(speed, 0, perStep(p.dragMmPerS2));
  }

  // Steering bites in proportion to speed up to a point: nothing turns on the spot.
  const grip = Math.min(Math.abs(speed), p.turnFullSpeedMmPerS);
  const turn = idiv(steer * p.turnCdegPerS * grip * SIM_STEP_MS, 127 * p.turnFullSpeedMmPerS * 1000);
  const yaw = normCdeg(state.yaw - (speed < 0 ? -turn : turn));
  if (yaw !== state.yaw && fitsAt(state.x, state.z, yaw, ground, obstacles, p)) state.yaw = yaw;

  const distance = perStep(speed);
  const sin = sinCdeg(state.yaw);
  const cos = cosCdeg(state.yaw);
  const hops = Math.max(1, Math.ceil(Math.abs(distance) / Math.max(1, p.halfWidthMm)));
  const startX = state.x;
  const startZ = state.z;
  let impact = 0;
  for (let i = 1; i <= hops; i++) {
    const along = idiv(distance * i, hops);
    const x = startX + mulTrig(along, sin);
    const z = startZ + mulTrig(along, cos);
    if (!fitsAt(x, z, state.yaw, ground, obstacles, p)) {
      impact = Math.abs(speed);
      speed = 0 - idiv(speed, 4);
      break;
    }
    state.x = x;
    state.z = z;
    state.y = groundHeight(ground, x, z, p.surface, p.stepUpMm);
  }
  state.speed = speed;
  return impact;
}

/** The vehicle as something others collide with. */
export function vehicleObstacle(state: VehicleState, p: VehicleParams): BoxObstacle {
  return {
    kind: "box",
    x: state.x,
    z: state.z,
    halfWidthMm: p.halfWidthMm,
    halfLengthMm: p.halfLengthMm,
    yaw: state.yaw,
  };
}
