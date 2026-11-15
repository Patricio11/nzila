import { describe, expect, test } from "vitest";
import { type Obstacle } from "./collision.ts";
import { CELL_DRIVE, CELL_LOW, CELL_WALK, createWalkGrid, fillCells, gridGround, setCell } from "./grid.ts";
import { DEFAULT_CHARACTER, NO_MOVE, jumpLiftMm, stepCharacter, type CharacterState, type MoveInput } from "./movement.ts";

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

describe("jumping", () => {
  // A planted strip 1.5 m wide across the square at x = 10 m to 11.5 m: low, nobody stands on it.
  function strip(flags = CELL_LOW) {
    const grid = square();
    fillCells(grid, 20, 0, 22, 39, flags, 0);
    return gridGround(grid);
  }
  const east: MoveInput = { dx: 127, dz: 0, run: false };

  test("on the spot: up and down in the same place, and the feet are off the ground between", () => {
    const state = at(5000, 5000);
    const ground = gridGround(square());
    stepCharacter(state, { ...NO_MOVE, jump: true }, ground, []);
    let highest = 0;
    for (let i = 0; i < DEFAULT_CHARACTER.jumpSteps; i++) {
      highest = Math.max(highest, jumpLiftMm(state));
      stepCharacter(state, NO_MOVE, ground, []);
    }
    expect(highest).toBe(DEFAULT_CHARACTER.jumpHeightMm);
    expect(jumpLiftMm(state)).toBe(0);
    expect(state).toEqual({ x: 5000, y: 0, z: 5000, yaw: 0 });
  });

  test("walking does not cross something low", () => {
    const state = walk(at(8000, 5000), east, 200, strip());
    expect(state.x).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("a jump from a walk clears it and lands on the far side", () => {
    const ground = strip();
    const state = walk(at(8000, 5000), east, 200, ground);
    stepCharacter(state, { ...east, jump: true }, ground, []);
    // Letting go of the stick in the air changes nothing: the jump is held to where it was going.
    walk(state, NO_MOVE, DEFAULT_CHARACTER.jumpSteps, ground);
    expect(state.x).toBeGreaterThanOrEqual(11500 + DEFAULT_CHARACTER.radiusMm);
    expect(state.air).toBeUndefined();
    expect(state.airX).toBeUndefined();
  });

  test("a jump never comes down on the low thing, however it is steered", () => {
    const ground = strip();
    for (let from = 7000; from <= 9700; from += 150) {
      for (const turn of [NO_MOVE, { dx: -127, dz: 0, run: true }, { dx: 0, dz: 127, run: false }]) {
        const state = at(from, 5000);
        stepCharacter(state, { ...east, jump: true }, ground, []);
        walk(state, turn, DEFAULT_CHARACTER.jumpSteps + 2, ground);
        const cell = Math.floor(state.x / 500);
        expect(cell < 20 || cell > 22).toBe(true);
      }
    }
  });

  test("a wall is not jumped", () => {
    const ground = strip(0);
    const state = walk(at(8000, 5000), east, 200, ground);
    stepCharacter(state, { ...east, jump: true }, ground, []);
    walk(state, east, 40, ground);
    expect(state.x).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("something low that is too wide is not jumped", () => {
    const grid = square();
    fillCells(grid, 20, 0, 27, 39, CELL_LOW, 0);
    const ground = gridGround(grid);
    const state = walk(at(8000, 5000), { ...east, run: true }, 200, ground);
    stepCharacter(state, { ...east, run: true, jump: true }, ground, []);
    walk(state, { ...east, run: true }, 40, ground);
    expect(state.x).toBeLessThanOrEqual(10000 - DEFAULT_CHARACTER.radiusMm);
  });

  test("a jump gets onto a ledge a step cannot", () => {
    const grid = square();
    fillCells(grid, 20, 0, 39, 39, CELL_WALK, 600);
    const ground = gridGround(grid);
    const state = walk(at(8000, 5000), east, 200, ground);
    expect(state.y).toBe(0);
    stepCharacter(state, { ...east, jump: true }, ground, []);
    walk(state, east, DEFAULT_CHARACTER.jumpSteps, ground);
    expect(state.y).toBe(600);
    expect(state.x).toBeGreaterThan(10000);
  });

  test("asking again in the air does nothing", () => {
    const ground = gridGround(square());
    const once = at(5000, 5000);
    const twice = at(5000, 5000);
    stepCharacter(once, { ...east, jump: true }, ground, []);
    stepCharacter(twice, { ...east, jump: true }, ground, []);
    for (let i = 0; i < 30; i++) {
      stepCharacter(once, east, ground, []);
      stepCharacter(twice, i < 5 ? { ...east, jump: true } : east, ground, []);
    }
    expect(twice).toEqual(once);
  });
});
