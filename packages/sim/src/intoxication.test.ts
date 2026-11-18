import { describe, expect, test } from "vitest";
import { yawFromDir, normCdeg } from "./fixed.ts";
import { CELL_WALK, createWalkGrid, fillCells, gridGround } from "./grid.ts";
import { DRUNK_MAX, afterDrink, drunkBand, soberUp, swayDrive, swayMove } from "./intoxication.ts";
import { stepCharacter, type MoveInput } from "./movement.ts";

const AHEAD: MoveInput = { dx: 0, dz: 127, run: true };

/** How far off straight ahead, in degrees, the body is pulled over a stretch of time. */
function wander(level: number, seed = 5, ticks = 2400): { worst: number; changed: number } {
  let worst = 0;
  let changed = 0;
  for (let tick = 0; tick < ticks; tick++) {
    const out = swayMove(AHEAD, level, tick, seed);
    const yaw = yawFromDir(out.dx, out.dz);
    worst = Math.max(worst, Math.min(yaw, normCdeg(-yaw)) / 100);
    if (out.dx !== 0) changed++;
  }
  return { worst, changed };
}

describe("levels", () => {
  test("the four bands", () => {
    expect([0, 149, 150, 399, 400, 749, 750, 1000].map(drunkBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  test("drinks add up and stop at the maximum", () => {
    expect(afterDrink(0, 180)).toBe(180);
    expect(afterDrink(900, 180)).toBe(DRUNK_MAX);
    expect(afterDrink(300, -50)).toBe(300);
  });

  test("golden: sobering up with time", () => {
    // At 400 points an hour, a quarter of an hour clears 100.
    expect(soberUp(800, 20 * 60 * 15, 400)).toBe(700);
    expect(soberUp(50, 72_000, 400)).toBe(0);
    expect(soberUp(800, 0, 400)).toBe(800);
  });
});

describe("on foot", () => {
  test("sober or merry, the stick is obeyed exactly", () => {
    for (const level of [0, 149, 150, 399]) {
      for (let tick = 0; tick < 200; tick++) expect(swayMove(AHEAD, level, tick, 5)).toBe(AHEAD);
    }
  });

  test("unsteady: the body wanders, more the more was drunk", () => {
    const light = wander(450);
    const heavy = wander(700);
    const drunk = wander(1000);
    expect(light.worst).toBeGreaterThan(1);
    expect(light.worst).toBeLessThan(heavy.worst);
    expect(heavy.worst).toBeLessThan(drunk.worst);
    expect(drunk.worst).toBeGreaterThan(40);
    // Even at the worst the player is never turned round: still playable, only hard.
    expect(drunk.worst).toBeLessThanOrEqual(81);
    expect(drunk.changed).toBeGreaterThan(2000);
  });

  test("a drunk cannot run; someone merely unsteady still can", () => {
    expect(swayMove(AHEAD, 700, 3, 5).run).toBe(true);
    expect(swayMove(AHEAD, 800, 3, 5).run).toBe(false);
    expect(swayMove({ ...AHEAD, run: false }, 700, 3, 5).run).toBe(false);
  });

  test("nor jump", () => {
    expect(swayMove({ ...AHEAD, jump: true }, 700, 3, 5).jump).toBe(true);
    expect(swayMove({ ...AHEAD, jump: true }, 800, 3, 5).jump).toBeUndefined();
    expect(swayMove(AHEAD, 700, 3, 5).jump).toBeUndefined();
  });

  test("standing still is standing still however much was drunk", () => {
    expect(swayMove({ dx: 0, dz: 0, run: false }, 1000, 77, 5)).toEqual({ dx: 0, dz: 0, run: false });
  });

  test("the stick never leaves its range, whatever comes in", () => {
    for (let tick = 0; tick < 500; tick++) {
      const out = swayMove({ dx: 9999, dz: -9999, run: true }, 1000, tick, 9);
      expect(Math.abs(out.dx)).toBeLessThanOrEqual(127);
      expect(Math.abs(out.dz)).toBeLessThanOrEqual(127);
    }
  });

  test("the same player at the same moment sways the same way; two players do not sway in step", () => {
    const a = Array.from({ length: 300 }, (_, tick) => swayMove(AHEAD, 900, tick, 5));
    const again = Array.from({ length: 300 }, (_, tick) => swayMove(AHEAD, 900, tick, 5));
    const other = Array.from({ length: 300 }, (_, tick) => swayMove(AHEAD, 900, tick, 6));
    expect(again).toEqual(a);
    expect(other).not.toEqual(a);
  });

  test("golden: walking a straight street drunk ends well off the line, and in a fixed place", () => {
    const grid = createWalkGrid(500, -200, 0, 400, 400);
    fillCells(grid, -200, 0, 199, 399, CELL_WALK, 0);
    const ground = gridGround(grid);
    const sober = { x: 0, y: 0, z: 1000, yaw: 0 };
    const drunk = { x: 0, y: 0, z: 1000, yaw: 0 };
    let farthest = 0;
    for (let tick = 0; tick < 400; tick++) {
      stepCharacter(sober, { dx: 0, dz: 127, run: false }, ground, []);
      stepCharacter(drunk, swayMove({ dx: 0, dz: 127, run: false }, 900, tick, 5), ground, []);
      farthest = Math.max(farthest, Math.abs(drunk.x));
    }
    // Four hundred steps of a walk's 115 mm.
    expect(sober).toMatchObject({ x: 0, z: 47_000 });
    // The drunk zig-zags metres to either side and gets less far down the street.
    expect(farthest).toBeGreaterThan(1500);
    expect(drunk.z).toBeLessThan(sober.z - 1000);
    expect(drunk.z).toBeGreaterThan(20_000);
    expect([drunk.x, drunk.z]).toEqual([-2617, 44_469]);
  });
});

describe("at the wheel", () => {
  const straight = { throttle: 100, steer: 0, brake: false };

  test("sober or merry, the wheel is obeyed exactly", () => {
    expect(swayDrive(straight, 399, 10, 5)).toBe(straight);
  });

  test("drunk, the steering wanders both ways and stays inside its range", () => {
    const pulls = Array.from({ length: 2400 }, (_, tick) => swayDrive(straight, 1000, tick, 5).steer);
    expect(Math.min(...pulls)).toBeLessThan(-60);
    expect(Math.max(...pulls)).toBeGreaterThan(60);
    for (let tick = 0; tick < 300; tick++) {
      const out = swayDrive({ throttle: 100, steer: 9999, brake: true }, 1000, tick, 5);
      expect(out.steer).toBeLessThanOrEqual(127);
      expect(out.steer).toBeGreaterThanOrEqual(-127);
      expect(out).toMatchObject({ throttle: 100, brake: true });
    }
  });
});
