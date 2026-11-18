// The promise the whole netcode rests on: the same inputs give the same world
// on every machine. This file runs in Node and again in real browser engines
// (see vitest.config.ts); each must reach the same numbers, which are written
// here as literals. If a change to the simulation moves a golden number, that
// is a protocol change: old clients would predict a different world from the
// one the zone decides.

import { expect, test } from "vitest";
import { DEFAULT_CLOCK, compileClock, gameTimeAt } from "./clock.ts";
import { type Obstacle } from "./collision.ts";
import { FULL_TURN, cosCdeg, isqrt, sinCdeg, yawFromDir } from "./fixed.ts";
import { CELL_DRIVE, CELL_WALK, CELL_WATER, createWalkGrid, fillCells, gridGround, setCell } from "./grid.ts";
import { type MoveInput } from "./movement.ts";
import { createRng, hashInts, rngChance, rngInt, rngRange } from "./rng.ts";
import { compileRoute, routeVehiclesAt } from "./route.ts";
import { type DriveInput, type VehicleKind } from "./vehicle.ts";
import { addCharacter, addVehicle, createWorld, hashWorld, stepWorld, type SimMap } from "./world.ts";

// A small town drawn from a seed: pavement, a grid of roads, raised blocks,
// holes, a strip of sea, and things standing about.
function town(seed: number): SimMap {
  const rng = createRng(seed);
  const grid = createWalkGrid(500, -20, -20, 240, 240);
  fillCells(grid, -20, -20, 219, 179, CELL_WALK, 0);
  fillCells(grid, -20, 180, 219, 219, CELL_WATER, -400);
  for (let i = 0; i < 6; i++) {
    const c = i * 40 - 10;
    fillCells(grid, c, -20, c + 7, 179, CELL_WALK | CELL_DRIVE, -100);
    fillCells(grid, -20, c, 219, c + 7, CELL_WALK | CELL_DRIVE, -100);
  }
  for (let i = 0; i < 60; i++) {
    const cx = rngRange(rng, -18, 210);
    const cz = rngRange(rng, -18, 170);
    const height = rngChance(rng, 500) ? rngRange(rng, 1, 6) * 100 : 3000;
    fillCells(grid, cx, cz, cx + rngInt(rng, 5), cz + rngInt(rng, 5), CELL_WALK, height);
  }
  for (let i = 0; i < 40; i++) setCell(grid, rngRange(rng, -18, 210), rngRange(rng, -18, 170), 0);
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < 80; i++) {
    const x = rngRange(rng, -8000, 105_000);
    const z = rngRange(rng, -8000, 85_000);
    obstacles.push(
      rngChance(rng, 500)
        ? { kind: "circle", x, z, radiusMm: rngRange(rng, 150, 900) }
        : { kind: "box", x, z, halfWidthMm: rngRange(rng, 300, 2500), halfLengthMm: rngRange(rng, 300, 2500), yaw: rngInt(rng, FULL_TURN) },
    );
  }
  return { ground: gridGround(grid), obstacles };
}

test("golden: integer maths", () => {
  const values: number[] = [];
  for (let a = -FULL_TURN; a < 2 * FULL_TURN; a += 13) values.push(sinCdeg(a), cosCdeg(a));
  for (let i = -300; i <= 300; i += 7) for (let j = -300; j <= 300; j += 11) values.push(yawFromDir(i, j));
  for (let n = 0; n < 4_000_000_000_000; n = n * 3 + 7) values.push(isqrt(n));
  expect(hashInts(0, values)).toBe(889559214);
});

test("golden: 80 people and 24 vehicles in a town for a simulated minute", () => {
  const map = town(2026);
  const world = createWorld(14);
  const rng = createRng(11);
  const kinds: VehicleKind[] = ["bicycle", "motorizada", "car", "van"];
  for (let id = 1; id <= 80; id++) {
    addCharacter(world, id, { x: rngRange(rng, 0, 100_000), y: 0, z: rngRange(rng, 0, 80_000), yaw: 0 });
  }
  for (let i = 0; i < 20; i++) {
    const lane = (i % 6) * 20_000 - 3000;
    addVehicle(world, 100 + i, kinds[i % 4]!, { x: lane, y: -100, z: i * 4000, yaw: 0, speed: 0 });
  }
  for (let i = 0; i < 4; i++) {
    addVehicle(world, 200 + i, i % 2 ? "boat" : "jetski", { x: 20_000 + i * 20_000, y: -400, z: 100_000, yaw: 9000, speed: 0 });
  }

  const far = (list: readonly { state: { x: number; z: number } }[], starts: readonly number[][]) =>
    list.filter((e, i) => Math.abs(e.state.x - starts[i]![0]!) + Math.abs(e.state.z - starts[i]![1]!) > 3000).length;
  const peopleStart = world.characters.map((c) => [c.state.x, c.state.z]);
  const vehiclesStart = world.vehicles.map((v) => [v.state.x, v.state.z]);

  const moves = new Map<number, MoveInput>();
  const drives = new Map<number, DriveInput>();
  const checkpoints: number[] = [];
  let impacts = 0;
  for (let tick = 0; tick < 1200; tick++) {
    // Everyone changes their mind now and then, as people at a stick do.
    for (const person of world.characters) {
      if (tick === 0 || rngChance(rng, 60)) {
        moves.set(person.id, { dx: rngRange(rng, -127, 127), dz: rngRange(rng, -127, 127), run: rngChance(rng, 300) });
      }
    }
    for (const vehicle of world.vehicles) {
      if (tick === 0 || rngChance(rng, 40)) {
        drives.set(vehicle.id, { throttle: rngRange(rng, -60, 127), steer: rngRange(rng, -127, 127), brake: rngChance(rng, 100) });
      }
    }
    const before = world.vehicles.map((v) => v.state.speed);
    stepWorld(world, map, { moves, drives });
    world.vehicles.forEach((v, i) => {
      if (Math.abs(v.state.speed) < Math.abs(before[i]!) - 1000) impacts++;
    });
    if (tick % 200 === 199) checkpoints.push(hashWorld(world));
  }

  // The scenario really exercises the model: most people and vehicles got
  // somewhere, and vehicles hit things on the way.
  expect(far(world.characters, peopleStart)).toBeGreaterThan(40);
  expect(far(world.vehicles, vehiclesStart)).toBeGreaterThan(12);
  expect(impacts).toBeGreaterThan(10);
  expect(checkpoints).toEqual([1131274224, 2572268622, 4031354217, 995247579, 3856680571, 3105769859]);
  // Under a second on its own; given room for a busy machine measuring coverage.
}, 60_000);

test("golden: the clock and the vans of a route across a game day", () => {
  const clock = compileClock(DEFAULT_CLOCK);
  const route = compileRoute({
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 91_300, y: 700, z: 12_100 },
      { x: 143_700, y: 2100, z: 88_800 },
      { x: 60_200, y: 900, z: 131_900 },
      { x: -22_500, y: 0, z: 70_300 },
    ],
    stops: [{ pointIndex: 0, dwellMs: 9000 }, { pointIndex: 2, dwellMs: 6000 }, { pointIndex: 3, dwellMs: 6000 }],
    cruiseMmPerS: 8300,
    rampMs: 2700,
    headwayMs: 23_000,
    serviceStartGameS: 5 * 3600,
    serviceEndGameS: 19 * 3600,
  });
  const values: number[] = [route.lapMs, route.loopMm, route.vehicleCount];
  // Start from a real-looking Unix time, to exercise large numbers.
  const start = 1_794_000_000_000;
  for (let ms = 0; ms < 3_600_000; ms += 7919) {
    const time = gameTimeAt(clock, start + ms);
    values.push(time.day, time.secondOfDay, time.daylight ? 1 : 0);
    for (const van of routeVehiclesAt(route, clock, start + ms)) {
      values.push(van.index, van.x, van.y, van.z, van.yaw, van.dwelling ? 1 : 0, van.stop, van.msToStop);
    }
  }
  expect(hashInts(0, values)).toBe(1584328458);
});
