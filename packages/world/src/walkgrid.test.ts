import { CELL_DRIVE, CELL_WALK, CELL_WATER, createWalkGrid, fillCells, setCell } from "@nzila/sim";
import { describe, expect, test } from "vitest";
import { decodeWalkGrid, encodeWalkGrid, groundOf, walkGridFromSource } from "./walkgrid.ts";

describe("the walk grid file", () => {
  test("round trips every field, with negative origins and heights", () => {
    const grid = createWalkGrid(500, -40, 12, 7, 5, -2000);
    fillCells(grid, -40, 12, -34, 16, CELL_WALK, -2000);
    setCell(grid, -38, 14, CELL_WALK | CELL_DRIVE, 1250);
    setCell(grid, -34, 16, CELL_WATER, -2400);
    const decoded = decodeWalkGrid(encodeWalkGrid(grid));
    expect(decoded).toEqual(grid);
  });

  test("three bytes a cell and a short header", () => {
    expect(encodeWalkGrid(createWalkGrid(500, 0, 0, 128, 128)).length).toBe(23 + 128 * 128 * 3);
  });

  test("decodes from the middle of a larger buffer", () => {
    const bytes = encodeWalkGrid(createWalkGrid(500, 3, 4, 2, 2));
    const padded = new Uint8Array(bytes.length + 10);
    padded.set(bytes, 5);
    expect(decodeWalkGrid(padded.subarray(5, 5 + bytes.length)).cellX0).toBe(3);
  });

  test("refuses what is not a walk grid", () => {
    const good = encodeWalkGrid(createWalkGrid(500, 0, 0, 2, 2));
    expect(() => decodeWalkGrid(new Uint8Array(4))).toThrow(/not a walk grid/);
    expect(() => decodeWalkGrid(good.map((b, i) => (i === 0 ? 0 : b)))).toThrow(/not a walk grid/);
    expect(() => decodeWalkGrid(good.map((b, i) => (i === 4 ? 9 : b)))).toThrow(/version 9/);
    expect(() => decodeWalkGrid(good.subarray(0, good.length - 1))).toThrow(/wrong length/);
  });
});

describe("a walk grid written by hand", () => {
  test("reads the four kinds of cell and the heights", () => {
    const grid = walkGridFromSource({
      cellMm: 500,
      cellX0: 10,
      cellZ0: 20,
      baseYMm: 1000,
      rows: ["#.=~", "...."],
      heightsCm: [[0, 0, -10, -50], [0, 15, 15, 0]],
    });
    expect([...grid.flags]).toEqual([0, CELL_WALK, CELL_WALK | CELL_DRIVE, CELL_WATER, CELL_WALK, CELL_WALK, CELL_WALK, CELL_WALK]);
    expect([...grid.heightsCm]).toEqual([0, 0, -10, -50, 0, 15, 15, 0]);
    expect([grid.cellX0, grid.cellZ0, grid.width, grid.depth, grid.baseYMm]).toEqual([10, 20, 4, 2, 1000]);
  });

  test("is flat at the base height when no heights are given", () => {
    const grid = walkGridFromSource({ cellMm: 500, cellX0: 0, cellZ0: 0, rows: ["..", ".."] });
    expect([...grid.heightsCm]).toEqual([0, 0, 0, 0]);
    expect(grid.baseYMm).toBe(0);
  });

  test("says what is wrong with a bad one", () => {
    const base = { cellMm: 500, cellX0: 0, cellZ0: 0 };
    expect(() => walkGridFromSource({ ...base, rows: [] })).toThrow();
    expect(() => walkGridFromSource({ ...base, rows: ["...", ".."] })).toThrow(/row 1 has 2 cells/);
    expect(() => walkGridFromSource({ ...base, rows: [".x."] })).toThrow(/"x" is not one of/);
    expect(() => walkGridFromSource({ ...base, rows: ["..", ".."], heightsCm: [[0, 0]] })).toThrow(/heights row 1/);
    expect(() => walkGridFromSource({ ...base, rows: [".."], heightsCm: [[0]] })).toThrow(/heights row 0/);
  });
});

describe("the ground of several chunks", () => {
  const west = walkGridFromSource({ cellMm: 500, cellX0: 0, cellZ0: 0, rows: ["..", ".."], baseYMm: 100 });
  const east = walkGridFromSource({ cellMm: 500, cellX0: 2, cellZ0: 0, rows: ["==", "=="], baseYMm: 300 });

  test("answers from whichever chunk covers the cell, and with nothing outside them", () => {
    const ground = groundOf([west, east]);
    expect(ground.cellMm).toBe(500);
    expect([ground.flagsAt(1, 1), ground.heightAt(1, 1)]).toEqual([CELL_WALK, 100]);
    expect([ground.flagsAt(2, 0), ground.heightAt(2, 0)]).toEqual([CELL_WALK | CELL_DRIVE, 300]);
    expect([ground.flagsAt(4, 0), ground.heightAt(4, 0)]).toEqual([0, 0]);
    expect(ground.flagsAt(0, -1)).toBe(0);
    expect(ground.flagsAt(0, 2)).toBe(0);
    expect(ground.flagsAt(-1, 0)).toBe(0);
  });

  test("refuses no grids, or grids with different cell sizes", () => {
    expect(() => groundOf([])).toThrow();
    expect(() => groundOf([west, createWalkGrid(250, 0, 0, 2, 2)])).toThrow(/cell size/);
  });
});
