import { describe, expect, test } from "vitest";
import { type Obstacle } from "./collision.ts";
import { CELL_DRIVE, CELL_WALK, createWalkGrid, fillCells, gridGround, setCell } from "./grid.ts";
import { DEFAULT_CHARACTER, NO_MOVE, stepCharacter, type CharacterState, type MoveInput } from "./movement.ts";

// A 20 m by 20 m square of pavement, cells of half a metre.
function square() {
  const grid = createWalkGrid(500, 0, 0, 40, 40);
  fillCells(grid, 0, 0, 39, 39, CELL_WALK, 0);
  return grid;
}

const at = (x: number, z: number): CharacterState => ({ x, y: 0, z, yaw: 0 });

function walk(state: CharacterState, input: MoveInput, steps: number, ground = gridGround(square()), obstacles: Obstacle[] = []) {
  for (let i = 0; i < steps; i++) stepCharacter(state, input, ground, obstacles);
  return state;
}

describe("on open ground", () => {
  test("no input, no movement, and the facing is kept", () => {
    const state = { ...at(5000, 5000), yaw: 1234 };
    walk(state, NO_MOVE, 20);
    expect(state).toEqual({ x: 5000, y: 0, z: 5000, yaw: 1234 });
  });

  test("walks at walking speed and faces where it goes", () => {
    const state = walk(at(5000, 5000), { dx: 127, dz: 0, run: false }, 20);
    expect(state.x).toBe(5000 + DEFAULT_CHARACTER.walkMmPerS);
    expect(state.z).toBe(5000);
    expect(state.yaw).toBe(9000);
  });

  test("runs at running speed", () => {
    const state = walk(at(5000, 5000), { dx: 0, dz: -127, run: true }, 20);
    expect(state.z).toBe(5000 - DEFAULT_CHARACTER.runMmPerS);
    expect(state.yaw).toBe(18000);
  });

  test("a half-pushed stick walks at half speed", () => {
    const state = walk(at(5000, 5000), { dx: 0, dz: 64, run: false }, 20);
    expect(state.z - 5000).toBeGreaterThanOrEqual(740);
    expect(state.z - 5000).toBeLessThanOrEqual(760);
  });

  test("a stick in the corner is no faster than a stick pushed straight", () => {
    const state = walk(at(5000, 5000), { dx: 127, dz: 127, run: false }, 20);
    const travelled = Math.hypot(state.x - 5000, state.z - 5000);
    expect(travelled).toBeLessThanOrEqual(DEFAULT_CHARACTER.walkMmPerS);
    expect(travelled).toBeGreaterThan(DEFAULT_CHARACTER.walkMmPerS - 60);
    expect(state.yaw).toBe(4500);
  });

  test("input beyond the stick's range is clamped, not trusted", () => {
    const honest = walk(at(5000, 5000), { dx: 127, dz: 0, run: true }, 10);
    const cheat = walk(at(5000, 5000), { dx: 100_000, dz: 0, run: true }, 10);
    expect(cheat).toEqual(honest);
  });
});

describe("against the ground", () => {
  test("stops at the edge of the world, a body's width from it", () => {
    const state = walk(at(18000, 5000), { dx: 127, dz: 0, run: true }, 40);
    expect(state.x).toBeLessThanOrEqual(20000 - DEFAULT_CHARACTER.radiusMm);
    expect(state.x).toBeGreaterThan(20000 - DEFAULT_CHARACTER.radiusMm - 80);
  });

  test("slides along a wall when pushed into it at an angle", () => {
    const state = walk(at(19000, 5000), { dx: 127, dz: 127, run: false }, 40);
    expect(state.x).toBeLessThanOrEqual(20000 - DEFAULT_CHARACTER.radiusMm);
    expect(state.z).toBeGreaterThan(6500);
  });

  test("does not walk onto the road-only cells or into a building", () => {
    const grid = square();
    fillCells(grid, 20, 0, 23, 39, CELL_DRIVE, 0);
    fillCells(grid, 0, 20, 19, 23, 0, 0);
    const ground = gridGround(grid);
    const east = walk(at(8000, 5000), { dx: 127, dz: 0, run: true }, 40, ground);
    expect(east.x).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
    const north = walk(at(5000, 8000), { dx: 0, dz: 127, run: true }, 40, ground);
    expect(north.z).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("climbs a kerb, refuses a wall", () => {
    const grid = square();
    fillCells(grid, 20, 0, 39, 39, CELL_WALK, 200);
    fillCells(grid, 30, 0, 39, 39, CELL_WALK, 1200);
    const ground = gridGround(grid);
    const state = walk(at(8000, 5000), { dx: 127, dz: 0, run: false }, 200, ground);
    expect(state.y).toBe(200);
    expect(state.x).toBeGreaterThan(14000);
    expect(state.x).toBeLessThanOrEqual(15000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("walks up a slope and its height follows smoothly", () => {
    const grid = square();
    for (let cx = 10; cx < 40; cx++) fillCells(grid, cx, 0, cx, 39, CELL_WALK, (cx - 10) * 150);
    const ground = gridGround(grid);
    const state = at(4000, 5000);
    let last = 0;
    let biggestRise = 0;
    for (let i = 0; i < 160; i++) {
      stepCharacter(state, { dx: 127, dz: 0, run: false }, ground, []);
      biggestRise = Math.max(biggestRise, state.y - last);
      expect(state.y).toBeGreaterThanOrEqual(last);
      last = state.y;
    }
    expect(state.y).toBeGreaterThan(2000);
    expect(biggestRise).toBeLessThan(40);
  });

  test("steps off a low wall, stops at the edge of a high one", () => {
    const low = square();
    fillCells(low, 0, 0, 19, 39, CELL_WALK, 800);
    const down = walk({ ...at(8000, 5000), y: 800 }, { dx: 127, dz: 0, run: false }, 80, gridGround(low));
    expect(down.y).toBe(0);
    expect(down.x).toBeGreaterThan(10000);

    const high = square();
    fillCells(high, 0, 0, 19, 39, CELL_WALK, 3000);
    const held = walk({ ...at(8000, 5000), y: 3000 }, { dx: 127, dz: 0, run: false }, 80, gridGround(high));
    expect(held.y).toBe(3000);
    expect(held.x).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("a running body does not pass through a wall one cell thick", () => {
    const grid = square();
    fillCells(grid, 20, 0, 20, 39, 0, 0);
    const fast = { ...DEFAULT_CHARACTER, runMmPerS: 30_000 };
    const state = at(8000, 5000);
    for (let i = 0; i < 20; i++) stepCharacter(state, { dx: 127, dz: 0, run: true }, gridGround(grid), [], fast);
    expect(state.x).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
  });
});

describe("against obstacles", () => {
  const post: Obstacle = { kind: "circle", x: 10000, z: 5000, radiusMm: 300 };

  test("slides round a post instead of stopping dead", () => {
    const state = walk(at(8000, 5100), { dx: 127, dz: 0, run: false }, 80, undefined, [post]);
    expect(state.x).toBeGreaterThan(11000);
    expect(state.z).toBeGreaterThan(5100);
  });

  test("slides along a slanted wall", () => {
    const wall: Obstacle = { kind: "box", x: 10000, z: 8000, halfWidthMm: 200, halfLengthMm: 4000, yaw: 4500 };
    const state = walk(at(6000, 6000), { dx: 127, dz: 0, run: false }, 60, undefined, [wall]);
    // Walking east into a wall that runs diagonally: it is carried along the wall.
    expect(state.z).toBeGreaterThan(7000);
    expect(state.x).toBeGreaterThan(8500);
  });

  test("stays put when a push would put it through a wall", () => {
    // A post against the north edge: squeezing between them is not possible.
    const tight: Obstacle = { kind: "circle", x: 10000, z: 19400, radiusMm: 300 };
    const state = walk(at(8000, 19650), { dx: 127, dz: 0, run: false }, 80, undefined, [tight]);
    expect(state.x).toBeLessThan(10000);
    expect(state.z).toBeLessThanOrEqual(20000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("stays put when a push would put it into a second obstacle", () => {
    const a: Obstacle = { kind: "circle", x: 10000, z: 4650, radiusMm: 300 };
    const b: Obstacle = { kind: "circle", x: 10000, z: 5350, radiusMm: 300 };
    const state = walk(at(8000, 5000), { dx: 127, dz: 0, run: false }, 80, undefined, [a, b]);
    expect(state.x).toBeLessThan(10000);
    expect(Math.abs(state.z - 5000)).toBeLessThan(300);
  });
});

test("golden: a fixed walk ends in a fixed place", () => {
  const grid = square();
  setCell(grid, 12, 12, 0);
  fillCells(grid, 25, 0, 39, 39, CELL_WALK, 150);
  const ground = gridGround(grid);
  const obstacles: Obstacle[] = [
    { kind: "circle", x: 9000, z: 7000, radiusMm: 400 },
    { kind: "box", x: 14000, z: 9000, halfWidthMm: 900, halfLengthMm: 400, yaw: 3000 },
  ];
  const state = at(5000, 5000);
  const legs: [MoveInput, number][] = [
    [{ dx: 127, dz: 40, run: false }, 60],
    [{ dx: 90, dz: 90, run: true }, 30],
    [{ dx: -20, dz: 127, run: false }, 50],
    [{ dx: 127, dz: -127, run: true }, 40],
  ];
  for (const [input, steps] of legs) walk(state, input, steps, ground, obstacles);
  expect(state).toEqual({ x: 19093, y: 150, z: 8509, yaw: 13500 });
});
