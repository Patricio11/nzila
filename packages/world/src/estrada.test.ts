import { CELL_DRIVE, CELL_WALK, type Ground } from "@nzila/sim";
import { describe, expect, test } from "vitest";
import { alongPath, nearestPavement, nearestRoad, pathLength, roadAround, roadField, roadPath } from "./estrada.ts";

/**
 * A town drawn for the test, in half-metre cells: a road along z from 10 to 14 m for x from 0 to 100 m, turning up
 * along x from 90 to 94 m to z = 80 m; a separate stub of road at x 20 to 24, z 40 to 60, joined to nothing; the
 * rest pavement.
 */
const town: Ground = {
  cellMm: 500,
  heightAt: () => 0,
  flagsAt: (cx, cz) => {
    const x = cx / 2;
    const z = cz / 2;
    const along = x >= 0 && x < 100 && z >= 10 && z < 14;
    const up = x >= 90 && x < 94 && z >= 10 && z < 80;
    const stub = x >= 20 && x < 24 && z >= 40 && z < 60;
    return along || up || stub ? CELL_WALK | CELL_DRIVE : CELL_WALK;
  },
};

describe("roads for a ride that was asked for (Task 6.2)", () => {
  test("the nearest road to someone on the pavement, and none when it is too far", () => {
    expect(nearestRoad(town, { x: 50_200, z: 20_000 })).toEqual({ x: 50_500, z: 13_500 });
    expect(nearestRoad(town, { x: 50_200, z: 12_100 })).toEqual({ x: 50_500, z: 12_500 });
    expect(nearestRoad(town, { x: 50_000, z: 120_000 }, 20_000)).toBeNull();
  });

  test("set down off a ride: the pavement nearest the side of the road one gets off on, never the road", () => {
    // The road runs from z 10 to 14 m: from 1 m short of its south edge, the pavement just south of it.
    expect(nearestPavement(town, { x: 50_200, z: 13_000 })).toEqual({ x: 50_500, z: 14_500 });
    expect(nearestPavement(town, { x: 50_200, z: 11_000 })).toEqual({ x: 50_500, z: 9_500 });
    // Out in a road wider than the reach, nowhere.
    const wide: Ground = { ...town, flagsAt: () => CELL_WALK | CELL_DRIVE };
    expect(nearestPavement(wide, { x: 0, z: 0 }, 5000)).toBeNull();
  });

  test("the way along the road turns where the road turns, in as few legs as stay on it", () => {
    const to = nearestRoad(town, { x: 92_000, z: 75_000 })!;
    const field = roadField(town, to);
    const path = roadPath(town, field, nearestRoad(town, { x: 5_000, z: 12_000 })!)!;
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.length).toBeLessThanOrEqual(4);
    expect(path.at(-1)).toEqual(to);
    // Never off the road: every metre of every leg is road.
    for (let i = 1; i < path.length; i++) {
      for (let t = 0; t <= 1; t += 0.02) {
        const x = path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * t;
        const z = path[i - 1]!.z + (path[i]!.z - path[i - 1]!.z) * t;
        expect(town.flagsAt(Math.floor(x / 500), Math.floor(z / 500)) & CELL_DRIVE, `${x}, ${z}`).toBe(CELL_DRIVE);
      }
    }
    // About the length of the road from one end to the other: along, then up.
    expect(pathLength(path)).toBeGreaterThan(140_000);
    expect(pathLength(path)).toBeLessThan(160_000);
  });

  test("a road not joined to the other is no way there; a ride sets out about as far along the road as asked", () => {
    const field = roadField(town, nearestRoad(town, { x: 92_000, z: 75_000 })!);
    expect(roadPath(town, field, nearestRoad(town, { x: 22_000, z: 50_000 })!)).toBeNull();
    const start = roadAround(field, 60_000);
    const back = roadPath(town, field, start)!;
    expect(Math.abs(pathLength(back) - 60_000)).toBeLessThan(4000);
  });

  test("a town either side of the origin plans the same: a way from the negative side to the positive, straightened", () => {
    // The same L, moved 60 m west and 60 m south of the origin.
    const moved: Ground = { ...town, flagsAt: (cx, cz) => town.flagsAt(cx + 120, cz + 120) };
    const to = nearestRoad(moved, { x: 32_000, z: 15_000 })!;
    const path = roadPath(moved, roadField(moved, to), nearestRoad(moved, { x: -55_000, z: -48_000 })!)!;
    expect(path.length).toBeLessThanOrEqual(4);
    expect(path[0]!.z).toBeLessThan(0);
    expect(path.at(-1)).toEqual(to);
  });

  test("along a path: where one is after so far, which way one faces, and the end once past it", () => {
    const path = [{ x: 0, z: 0 }, { x: 0, z: 10_000 }, { x: 10_000, z: 10_000 }];
    expect(alongPath(path, 5000)).toEqual({ x: 0, z: 5000, heading: 0 });
    expect(alongPath(path, 15_000)).toEqual({ x: 5000, z: 10_000, heading: Math.PI / 2 });
    expect(alongPath(path, 99_000)).toMatchObject({ x: 10_000, z: 10_000 });
    expect(alongPath(path, -5)).toMatchObject({ x: 0, z: 0 });
    expect(alongPath([], 10)).toEqual({ x: 0, z: 0, heading: 0 });
    expect(pathLength(path)).toBe(20_000);
  });
});
