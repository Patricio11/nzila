// The walk grid as a file: what a pack ships for each chunk, and how a
// builder writes one by hand for a greybox. No dependencies beyond the
// simulation, so the client can load it.
//
// Binary layout, little-endian: "NZWG", version (u8), cellMm (u16),
// cellX0 (i32), cellZ0 (i32), width (u16), depth (u16), baseYMm (i32), then
// one byte of flags per cell, then one int16 height in centimetres per cell.

import { CELL_DRIVE, CELL_LOW, CELL_WALK, CELL_WATER, createWalkGrid, gridGround, type Ground, type WalkGrid } from "@nzila/sim";

const MAGIC = [0x4e, 0x5a, 0x57, 0x47];
const VERSION = 1;
const HEADER = 23;

export function encodeWalkGrid(grid: WalkGrid): Uint8Array {
  const cells = grid.width * grid.depth;
  const bytes = new Uint8Array(HEADER + cells * 3);
  const view = new DataView(bytes.buffer);
  bytes.set(MAGIC);
  view.setUint8(4, VERSION);
  view.setUint16(5, grid.cellMm, true);
  view.setInt32(7, grid.cellX0, true);
  view.setInt32(11, grid.cellZ0, true);
  view.setUint16(15, grid.width, true);
  view.setUint16(17, grid.depth, true);
  view.setInt32(19, grid.baseYMm, true);
  bytes.set(grid.flags, HEADER);
  for (let i = 0; i < cells; i++) view.setInt16(HEADER + cells + i * 2, grid.heightsCm[i]!, true);
  return bytes;
}

export function decodeWalkGrid(bytes: Uint8Array): WalkGrid {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < HEADER || MAGIC.some((byte, i) => bytes[i] !== byte)) throw new Error("not a walk grid file");
  if (view.getUint8(4) !== VERSION) throw new Error(`walk grid version ${view.getUint8(4)} is not supported`);
  const width = view.getUint16(15, true);
  const depth = view.getUint16(17, true);
  const cells = width * depth;
  if (bytes.length !== HEADER + cells * 3) throw new Error("walk grid file has the wrong length");
  const grid = createWalkGrid(view.getUint16(5, true), view.getInt32(7, true), view.getInt32(11, true), width, depth, view.getInt32(19, true));
  grid.flags.set(bytes.subarray(HEADER, HEADER + cells));
  for (let i = 0; i < cells; i++) grid.heightsCm[i] = view.getInt16(HEADER + cells + i * 2, true);
  return grid;
}

/**
 * A walk grid written by hand, for greybox districts. One string per row
 * along Z, one character per cell along X:
 *   "#" nothing may stand here    "." pavement (walk)
 *   "=" road (walk and drive)     "~" water
 *   "^" low: nobody stands here, a jump clears it
 * `heightsCm`, when given, has the same rows of numbers: centimetres above baseYMm.
 */
export interface WalkGridSource {
  readonly cellMm: number;
  readonly cellX0: number;
  readonly cellZ0: number;
  readonly baseYMm?: number;
  readonly rows: readonly string[];
  readonly heightsCm?: readonly (readonly number[])[];
}

const LEGEND: Readonly<Record<string, number>> = {
  "#": 0,
  ".": CELL_WALK,
  "=": CELL_WALK | CELL_DRIVE,
  "~": CELL_WATER,
  "^": CELL_LOW,
};

export function walkGridFromSource(source: WalkGridSource): WalkGrid {
  const depth = source.rows.length;
  const width = source.rows[0]?.length ?? 0;
  const grid = createWalkGrid(source.cellMm, source.cellX0, source.cellZ0, width, depth, source.baseYMm ?? 0);
  for (let z = 0; z < depth; z++) {
    const row = source.rows[z]!;
    if (row.length !== width) throw new Error(`walk grid row ${z} has ${row.length} cells, the first has ${width}`);
    const heights = source.heightsCm?.[z];
    if (source.heightsCm && heights?.length !== width) throw new Error(`walk grid heights row ${z} does not match the grid`);
    for (let x = 0; x < width; x++) {
      const flags = LEGEND[row[x]!];
      if (flags === undefined) throw new Error(`walk grid row ${z}: "${row[x]}" is not one of # . = ~ ^`);
      grid.flags[z * width + x] = flags;
      grid.heightsCm[z * width + x] = heights?.[x] ?? 0;
    }
  }
  return grid;
}

/** The ground of several chunks at once. A cell no grid covers is not walkable. */
export function groundOf(grids: readonly WalkGrid[]): Ground {
  const first = grids[0];
  if (!first) throw new Error("no walk grids");
  if (grids.some((grid) => grid.cellMm !== first.cellMm)) throw new Error("walk grids of one district must share a cell size");
  const grounds = grids.map((grid) => ({ grid, ground: gridGround(grid) }));
  const find = (cx: number, cz: number): Ground | undefined =>
    grounds.find(
      ({ grid }) => cx >= grid.cellX0 && cz >= grid.cellZ0 && cx < grid.cellX0 + grid.width && cz < grid.cellZ0 + grid.depth,
    )?.ground;
  return {
    cellMm: first.cellMm,
    flagsAt: (cx, cz) => find(cx, cz)?.flagsAt(cx, cz) ?? 0,
    heightAt: (cx, cz) => find(cx, cz)?.heightAt(cx, cz) ?? 0,
  };
}
