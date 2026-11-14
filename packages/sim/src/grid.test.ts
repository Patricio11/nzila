import { describe, expect, test } from "vitest";
import {
  CELL_DRIVE,
  CELL_WALK,
  bodyFits,
  createWalkGrid,
  fillCells,
  gridGround,
  gridIndex,
  groundHeight,
  setCell,
} from "./grid.ts";

describe("the walk grid", () => {
  test("refuses a cell size that cannot be halved, or no cells", () => {
    expect(() => createWalkGrid(501, 0, 0, 4, 4)).toThrow();
    expect(() => createWalkGrid(0, 0, 0, 4, 4)).toThrow();
    expect(() => createWalkGrid(500, 0, 0, 0, 4)).toThrow();
    expect(() => createWalkGrid(500, 0, 0, 4, 0)).toThrow();
  });

  test("addresses cells in world cell coordinates", () => {
    const grid = createWalkGrid(500, -2, 10, 4, 3);
    expect(gridIndex(grid, -2, 10)).toBe(0);
    expect(gridIndex(grid, 1, 12)).toBe(11);
    expect(gridIndex(grid, -3, 10)).toBe(-1);
    expect(gridIndex(grid, 2, 10)).toBe(-1);
    expect(gridIndex(grid, 0, 9)).toBe(-1);
    expect(gridIndex(grid, 0, 13)).toBe(-1);
    expect(() => setCell(grid, 5, 5, CELL_WALK)).toThrow();
  });

  test("stores heights in centimetres above its base, and reports nothing outside", () => {
    const grid = createWalkGrid(500, 0, 0, 2, 2, 40_000);
    setCell(grid, 1, 1, CELL_WALK | CELL_DRIVE, 41_250);
    const ground = gridGround(grid);
    expect(ground.cellMm).toBe(500);
    expect(ground.flagsAt(1, 1)).toBe(CELL_WALK | CELL_DRIVE);
    expect(ground.heightAt(1, 1)).toBe(41_250);
    expect(ground.flagsAt(0, 0)).toBe(0);
    expect(ground.flagsAt(9, 9)).toBe(0);
    expect(ground.heightAt(9, 9)).toBe(40_000);
  });
});

describe("groundHeight", () => {
  // A ramp rising 100 mm per cell along X, with a 2 m wall-top beside it.
  const grid = createWalkGrid(500, 0, 0, 8, 4);
  for (let cx = 0; cx < 8; cx++) fillCells(grid, cx, 0, cx, 2, CELL_WALK, cx * 100);
  fillCells(grid, 0, 3, 7, 3, CELL_WALK, 2000);
  setCell(grid, 4, 0, 0, 400);
  const ground = gridGround(grid);

  test("is the cell's height at its centre", () => {
    expect(groundHeight(ground, 1250, 750, CELL_WALK, 350)).toBe(200);
  });

  test("blends smoothly up a slope", () => {
    expect(groundHeight(ground, 1500, 750, CELL_WALK, 350)).toBe(250);
    expect(groundHeight(ground, 1375, 750, CELL_WALK, 350)).toBe(225);
  });

  test("does not lean toward a ledge it could not step onto", () => {
    // Standing on the ramp right beside the 2 m wall-top: still ramp height.
    expect(groundHeight(ground, 1250, 1490, CELL_WALK, 350)).toBe(200);
    // Standing on the wall-top beside the ramp: still 2 m.
    expect(groundHeight(ground, 1250, 1510, CELL_WALK, 350)).toBe(2000);
  });

  test("does not lean toward a cell of another surface", () => {
    expect(groundHeight(ground, 1990, 250, CELL_WALK, 350)).toBe(300);
  });
});

describe("bodyFits", () => {
  const grid = createWalkGrid(500, 0, 0, 6, 3);
  fillCells(grid, 0, 0, 5, 2, CELL_WALK, 0);
  setCell(grid, 2, 1, CELL_WALK, 300);
  setCell(grid, 3, 1, CELL_WALK, 900);
  setCell(grid, 4, 1, CELL_DRIVE, 0);
  setCell(grid, 5, 1, CELL_WALK, -1500);
  const ground = gridGround(grid);
  const fits = (x: number, fromY = 0) => bodyFits(ground, x, 750, 200, CELL_WALK, fromY, 350, 1000);

  test("open ground fits, and so does a kerb within the step height", () => {
    expect(fits(750)).toBe(true);
    expect(fits(1250)).toBe(true);
  });

  test("a wall higher than the step does not, until you are high enough", () => {
    expect(fits(1750)).toBe(false);
    expect(bodyFits(ground, 1750, 750, 200, CELL_WALK, 600, 350, 1000)).toBe(true);
  });

  test("a cell of the wrong surface does not", () => {
    expect(fits(2250)).toBe(false);
  });

  test("a drop deeper than the limit does not", () => {
    expect(fits(2750)).toBe(false);
    expect(bodyFits(ground, 2750, 750, 200, CELL_WALK, 0, 350, 2000)).toBe(true);
  });

  test("the edge of the known world does not", () => {
    expect(fits(100)).toBe(false);
  });
});
