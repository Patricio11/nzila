import { inflateSync } from "node:zlib";
import { CELL_WALK, CELL_WATER, createWalkGrid, fillCells, gridGround } from "@nzila/sim";
import { describe, expect, test } from "vitest";
import { SHORE_MOST_M, shoreField, shorePng } from "./shore.ts";

// Forty metres of sea south of a straight wall, the wall at z = 10 m; one-metre cells.
const grid = createWalkGrid(1000, 0, 0, 40, 60);
fillCells(grid, 0, 0, 39, 9, CELL_WALK, 0);
fillCells(grid, 0, 10, 39, 59, CELL_WATER, -1000);
const ground = gridGround(grid);

describe("how far the water is from land", () => {
  test("zero on land, rising a metre a metre out to sea, and no further than it can say", () => {
    const field = shoreField(ground, [0, 0, 40, 60]);
    expect([field.width, field.height]).toEqual([40, 60]);
    const at = (i: number, j: number): number => field.levels[j * field.width + i]! / 10;
    // On the wall: land.
    expect(at(20, 5)).toBe(0);
    // The first metre of water is a metre from the wall; ten out, ten metres.
    expect(at(20, 10)).toBe(1);
    expect(at(20, 19)).toBe(10);
    // Far out, as far as it is told apart.
    expect(at(20, 59)).toBe(SHORE_MOST_M);
  });

  test("a coarser picture measures in metres all the same", () => {
    const field = shoreField(ground, [0, 0, 40, 60], 2);
    expect([field.width, field.height]).toEqual([20, 30]);
    // The pixel whose middle is 21 m down (11 m out from the wall) is six two-metre pixels from land.
    expect(field.levels[10 * field.width + 10]! / 10).toBe(12);
  });

  test("a pier's post in the water is land: the water round it is shallow", () => {
    const withPost = createWalkGrid(1000, 0, 0, 40, 60);
    fillCells(withPost, 0, 0, 39, 9, CELL_WALK, 0);
    fillCells(withPost, 0, 10, 39, 59, CELL_WATER, -1000);
    fillCells(withPost, 20, 40, 20, 40, CELL_WALK, 0);
    const field = shoreField(gridGround(withPost), [0, 0, 40, 60]);
    expect(field.levels[40 * field.width + 21]! / 10).toBe(1);
  });

  test("beyond the district's grids is open sea, never a shore", () => {
    const field = shoreField(ground, [0, 0, 40, 120]);
    // Sixty metres past the grid's edge, still as far from land as can be told.
    expect(field.levels[110 * field.width + 20]! / 10).toBe(SHORE_MOST_M);
  });

  test("written as a greyscale PNG whose pixels are the field", () => {
    const field = shoreField(ground, [0, 0, 40, 60]);
    const bytes = shorePng(field);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // The image data, inflated: each row a filter byte (none) and its pixels.
    const view = Buffer.from(bytes);
    const idat = view.indexOf("IDAT");
    const length = view.readUInt32BE(idat - 4);
    const rows = inflateSync(view.subarray(idat + 4, idat + 4 + length));
    expect(rows.length).toBe(60 * 41);
    expect(rows[19 * 41 + 1 + 20]).toBe(100);
  });
});
