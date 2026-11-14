import { describe, expect, test } from "vitest";
import { type Obstacle } from "./collision.ts";
import { CELL_DRIVE, CELL_WALK, CELL_WATER, createWalkGrid, fillCells, gridGround } from "./grid.ts";
import { NO_DRIVE, VEHICLES, stepVehicle, vehicleObstacle, type DriveInput, type VehicleKind, type VehicleState } from "./vehicle.ts";

// A 100 m by 100 m lot: road everywhere, with the sea along the far side.
function lot() {
  const grid = createWalkGrid(500, 0, 0, 200, 200);
  fillCells(grid, 0, 0, 199, 159, CELL_DRIVE | CELL_WALK, 0);
  fillCells(grid, 0, 160, 199, 199, CELL_WATER, -500);
  return grid;
}
const road = gridGround(lot());

const parked = (x = 50_000, z = 20_000, yaw = 0): VehicleState => ({ x, y: 0, z, yaw, speed: 0 });
const GAS: DriveInput = { throttle: 127, steer: 0, brake: false };

function drive(kind: VehicleKind, state: VehicleState, input: DriveInput, steps: number, obstacles: Obstacle[] = [], ground = road) {
  let hardest = 0;
  for (let i = 0; i < steps; i++) hardest = Math.max(hardest, stepVehicle(state, input, ground, obstacles, VEHICLES[kind]));
  return hardest;
}

describe("speed", () => {
  test("every kind pulls away and tops out at its own maximum", () => {
    for (const kind of ["bicycle", "motorizada", "car", "van"] as const) {
      const state = parked(50_000, 5000);
      drive(kind, state, GAS, 20);
      expect(state.speed).toBeGreaterThan(0);
      expect(state.z).toBeGreaterThan(5000);
      for (let lap = 0; lap < 10; lap++) {
        state.z = 5000;
        drive(kind, state, GAS, 20);
      }
      expect(state.speed).toBe(VEHICLES[kind].maxForwardMmPerS);
    }
  });

  test("half throttle pulls half as hard", () => {
    const full = parked();
    const half = parked();
    drive("car", full, GAS, 10);
    drive("car", half, { ...GAS, throttle: 64 }, 10);
    expect(half.speed * 2).toBeGreaterThan(full.speed - 100);
    expect(half.speed * 2).toBeLessThanOrEqual(full.speed + 100);
  });

  test("coasts to a stop with no input, and stays stopped", () => {
    const state = parked();
    drive("car", state, GAS, 20);
    drive("car", state, NO_DRIVE, 200);
    expect(state.speed).toBe(0);
    const rest = { ...state };
    drive("car", state, NO_DRIVE, 5);
    expect(state).toEqual(rest);
  });

  test("the brake stops it sooner than coasting", () => {
    const braked = parked();
    const coasted = parked();
    drive("car", braked, GAS, 30);
    drive("car", coasted, GAS, 30);
    drive("car", braked, { throttle: 0, steer: 0, brake: true }, 200);
    drive("car", coasted, NO_DRIVE, 200);
    expect(braked.speed).toBe(0);
    expect(braked.z).toBeLessThan(coasted.z);
  });

  test("pulling the stick back brakes first, then reverses up to the reverse limit", () => {
    const state = parked(50_000, 40_000);
    drive("car", state, GAS, 20);
    const forward = state.speed;
    drive("car", state, { throttle: -127, steer: 0, brake: false }, 1);
    expect(state.speed).toBe(forward - 500);
    drive("car", state, { throttle: -127, steer: 0, brake: false }, 120);
    expect(state.speed).toBe(-VEHICLES.car.maxReverseMmPerS);
    // And pushing forward from reverse brakes too.
    drive("car", state, GAS, 1);
    expect(state.speed).toBe(-VEHICLES.car.maxReverseMmPerS + 500);
  });

  test("a motorizada does not reverse", () => {
    const state = parked();
    drive("motorizada", state, { throttle: -127, steer: 0, brake: false }, 40);
    expect(state.speed).toBe(0);
    expect(Object.is(state.speed, 0)).toBe(true);
    expect(state.z).toBe(20_000);
  });

  test("input beyond the stick's range is clamped, not trusted", () => {
    const honest = parked();
    const cheat = parked();
    drive("car", honest, { throttle: 127, steer: 127, brake: false }, 30);
    drive("car", cheat, { throttle: 9999, steer: 9999, brake: false }, 30);
    expect(cheat).toEqual(honest);
  });
});

describe("steering", () => {
  test("nothing turns on the spot", () => {
    const state = parked();
    drive("car", state, { throttle: 0, steer: 127, brake: false }, 20);
    expect(state.yaw).toBe(0);
  });

  test("steering right lowers the yaw, left raises it", () => {
    const right = parked();
    drive("car", right, { throttle: 127, steer: 127, brake: false }, 20);
    expect(right.yaw).toBeGreaterThan(18000);
    expect(right.x).toBeLessThan(50_000);
    const left = parked();
    drive("car", left, { throttle: 127, steer: -127, brake: false }, 20);
    expect(left.yaw).toBeGreaterThan(0);
    expect(left.yaw).toBeLessThan(18000);
    expect(left.x).toBeGreaterThan(50_000);
  });

  test("in reverse the tail swings the other way", () => {
    const state = parked(50_000, 40_000);
    drive("car", state, { throttle: -127, steer: 127, brake: false }, 30);
    expect(state.speed).toBeLessThan(0);
    expect(state.yaw).toBeGreaterThan(0);
    expect(state.yaw).toBeLessThan(18000);
  });

  test("a van turns a wider circle than a motorizada", () => {
    const van = parked();
    const moto = parked();
    drive("van", van, { throttle: 127, steer: -127, brake: false }, 30);
    drive("motorizada", moto, { throttle: 127, steer: -127, brake: false }, 30);
    expect(moto.yaw).toBeGreaterThan(van.yaw);
  });
});

describe("collisions", () => {
  test("hitting the edge of the road stops it, reports the impact and bounces it back a little", () => {
    const state = parked(50_000, 60_000);
    const impact = drive("car", state, GAS, 200);
    expect(impact).toBeGreaterThan(10_000);
    expect(state.z + VEHICLES.car.halfLengthMm).toBeLessThanOrEqual(80_000);
    expect(state.z).toBeGreaterThan(75_000);
  });

  test("a clear road reports no impact", () => {
    expect(drive("car", parked(), GAS, 20)).toBe(0);
  });

  test("a road vehicle cannot enter the sea, a boat cannot leave it", () => {
    const boat: VehicleState = { x: 50_000, y: -500, z: 95_000, yaw: 18000, speed: 0 };
    const impact = drive("boat", boat, GAS, 400);
    expect(impact).toBeGreaterThan(0);
    expect(boat.z - VEHICLES.boat.halfLengthMm).toBeGreaterThanOrEqual(80_000);
    expect(boat.y).toBe(-500);
  });

  test("a boat keeps gliding long after a car has stopped", () => {
    const sea = createWalkGrid(500, 0, 0, 400, 40);
    fillCells(sea, 0, 0, 399, 39, CELL_WATER | CELL_DRIVE, 0);
    const water = gridGround(sea);
    const boat: VehicleState = { x: 10_000, y: 0, z: 10_000, yaw: 9000, speed: 9000 };
    const car: VehicleState = { x: 10_000, y: 0, z: 10_000, yaw: 9000, speed: 9000 };
    drive("boat", boat, NO_DRIVE, 100, [], water);
    drive("car", car, NO_DRIVE, 100, [], water);
    expect(car.speed).toBe(0);
    expect(boat.speed).toBeGreaterThan(0);
    expect(boat.x).toBeGreaterThan(car.x + 10_000);
  });

  test("stops against an obstacle in the road", () => {
    const bollard: Obstacle = { kind: "circle", x: 50_000, z: 40_000, radiusMm: 300 };
    const state = parked();
    const impact = drive("van", state, GAS, 100, [bollard]);
    expect(impact).toBeGreaterThan(0);
    expect(state.z + VEHICLES.van.halfLengthMm).toBeLessThan(40_000);
  });

  test("cannot swing its nose into a wall beside it", () => {
    // A wall close along the left side of a slowly rolling van.
    const wall: Obstacle = { kind: "box", x: 51_070, z: 20_000, halfWidthMm: 100, halfLengthMm: 20_000, yaw: 0 };
    const state: VehicleState = { ...parked(), speed: 3000 };
    stepVehicle(state, { throttle: 0, steer: -127, brake: false }, road, [wall], VEHICLES.van);
    expect(state.yaw).toBe(0);
    expect(state.z).toBeGreaterThan(20_000);
  });

  test("a fast vehicle does not pass through a thin barrier", () => {
    const barrier: Obstacle = { kind: "box", x: 50_000, z: 30_000, halfWidthMm: 5000, halfLengthMm: 50, yaw: 0 };
    const state: VehicleState = { ...parked(50_000, 28_000), speed: 60_000 };
    const fast = { ...VEHICLES.motorizada, maxForwardMmPerS: 60_000 };
    const impact = stepVehicle(state, GAS, road, [barrier], fast);
    expect(impact).toBe(60_000);
    expect(state.z).toBeLessThan(30_000);
  });

  test("follows the height of the road", () => {
    const hill = createWalkGrid(500, 0, 0, 200, 20);
    for (let cx = 0; cx < 200; cx++) fillCells(hill, cx, 0, cx, 19, CELL_DRIVE, cx * 50);
    const state: VehicleState = { x: 10_000, y: 1000, z: 5000, yaw: 9000, speed: 0 };
    drive("car", state, GAS, 60, [], gridGround(hill));
    expect(state.x).toBeGreaterThan(30_000);
    expect(Math.abs(state.y - (state.x / 10 - 25))).toBeLessThan(30);
  });
});

test("a vehicle is a box to everything else", () => {
  expect(vehicleObstacle({ x: 1, y: 2, z: 3, yaw: 4500, speed: 99 }, VEHICLES.van)).toEqual({
    kind: "box",
    x: 1,
    z: 3,
    halfWidthMm: VEHICLES.van.halfWidthMm,
    halfLengthMm: VEHICLES.van.halfLengthMm,
    yaw: 4500,
  });
});

test("golden: a fixed drive ends in a fixed place", () => {
  const state = parked(30_000, 10_000);
  const legs: [DriveInput, number][] = [
    [{ throttle: 127, steer: 0, brake: false }, 40],
    [{ throttle: 100, steer: -80, brake: false }, 30],
    [{ throttle: 0, steer: 60, brake: false }, 25],
    [{ throttle: -127, steer: 0, brake: false }, 30],
    [{ throttle: 0, steer: 0, brake: true }, 10],
  ];
  for (const [input, steps] of legs) drive("van", state, input, steps);
  expect(state).toEqual({ x: 46194, y: 0, z: 36617, yaw: 2475, speed: 0 });
});
