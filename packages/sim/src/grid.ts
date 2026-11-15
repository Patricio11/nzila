// The ground. A district is covered by square cells; each cell says who may
// stand on it (people, road vehicles, boats) and how high its floor is.
// Slopes are neighbouring cells whose heights differ a little, steps and
// kerbs are neighbours that differ by up to a body's step height, and walls
// and ledges are neighbours that differ by more.

import { floorDiv } from "./fixed.ts";

export const CELL_WALK = 1;
export const CELL_DRIVE = 2;
export const CELL_WATER = 4;
/** Nobody stands here, but it is low: a planted strip, a low wall, a ditch. A jump carries a body over it. */
export const CELL_LOW = 8;

/**
 * What movement asks of the ground. Cells are addressed in world cell
 * coordinates (cell cx covers x from cx * cellMm up to the next cell), so
 * grids of neighbouring chunks line up and a streamed world can answer from
 * whichever chunks are loaded. Cells nobody knows about report flags 0.
 */
export interface Ground {
  /** Cell edge in millimetres. Must be even. */
  readonly cellMm: number;
  flagsAt(cx: number, cz: number): number;
  /** Floor height of the cell in millimetres. */
  heightAt(cx: number, cz: number): number;
}

/** One rectangular grid, as shipped per chunk in a pack. */
export interface WalkGrid {
  readonly cellMm: number;
  /** World cell coordinates of the grid's first cell. */
  readonly cellX0: number;
  readonly cellZ0: number;
  readonly width: number;
  readonly depth: number;
  /** CELL_* bits, one byte per cell, row by row along X. */
  readonly flags: Uint8Array;
  /** Floor height per cell in centimetres above baseYMm. */
  readonly heightsCm: Int16Array;
  readonly baseYMm: number;
}

export function createWalkGrid(
  cellMm: number,
  cellX0: number,
  cellZ0: number,
  width: number,
  depth: number,
  baseYMm = 0,
): WalkGrid {
  if (cellMm <= 0 || cellMm % 2 !== 0) throw new Error("cellMm must be a positive even number");
  if (width <= 0 || depth <= 0) throw new Error("a grid needs at least one cell");
  return {
    cellMm,
    cellX0,
    cellZ0,
    width,
    depth,
    flags: new Uint8Array(width * depth),
    heightsCm: new Int16Array(width * depth),
    baseYMm,
  };
}

/** Index of a world cell inside the grid, or -1 when it is outside. */
export function gridIndex(grid: WalkGrid, cx: number, cz: number): number {
  const lx = cx - grid.cellX0;
  const lz = cz - grid.cellZ0;
  if (lx < 0 || lz < 0 || lx >= grid.width || lz >= grid.depth) return -1;
  return lz * grid.width + lx;
}

/** Sets one cell. Used by pack tooling and by tests. */
export function setCell(grid: WalkGrid, cx: number, cz: number, flags: number, heightMm = 0): void {
  const i = gridIndex(grid, cx, cz);
  if (i < 0) throw new Error("cell outside the grid");
  grid.flags[i] = flags;
  grid.heightsCm[i] = floorDiv(heightMm - grid.baseYMm, 10);
}

/** A Ground backed by a single grid. */
export function gridGround(grid: WalkGrid): Ground {
  return {
    cellMm: grid.cellMm,
    flagsAt(cx, cz) {
      const i = gridIndex(grid, cx, cz);
      return i < 0 ? 0 : grid.flags[i]!;
    },
    heightAt(cx, cz) {
      const i = gridIndex(grid, cx, cz);
      return i < 0 ? grid.baseYMm : grid.baseYMm + grid.heightsCm[i]! * 10;
    },
  };
}

/**
 * Height of the ground under a point. Heights are blended between the centres
 * of the four nearest cells so a slope is smooth underfoot. A neighbour that
 * the body could not step onto (wrong surface, or more than stepMm away in
 * height) is left out of the blend, so the top of a wall never leans toward
 * the street below it.
 */
export function groundHeight(ground: Ground, x: number, z: number, mask: number, stepMm: number): number {
  const c = ground.cellMm;
  const half = c / 2;
  const home = ground.heightAt(floorDiv(x, c), floorDiv(z, c));
  const cx0 = floorDiv(x - half, c);
  const cz0 = floorDiv(z - half, c);
  const tx = x - half - cx0 * c;
  const tz = z - half - cz0 * c;
  const sample = (cx: number, cz: number): number => {
    if ((ground.flagsAt(cx, cz) & mask) === 0) return home;
    const h = ground.heightAt(cx, cz);
    return Math.abs(h - home) > stepMm ? home : h;
  };
  const near = sample(cx0, cz0) * (c - tx) + sample(cx0 + 1, cz0) * tx;
  const far = sample(cx0, cz0 + 1) * (c - tx) + sample(cx0 + 1, cz0 + 1) * tx;
  return Math.floor((near * (c - tz) + far * tz + (c * c) / 2) / (c * c));
}

/**
 * Whether a body of the given radius may rest at (x, z), coming from ground
 * at height fromY. Every cell the body touches must carry the surface in mask
 * and be no more than stepUpMm above and maxDropMm below fromY.
 */
export function bodyFits(
  ground: Ground,
  x: number,
  z: number,
  radiusMm: number,
  mask: number,
  fromY: number,
  stepUpMm: number,
  maxDropMm: number,
): boolean {
  const c = ground.cellMm;
  const cx1 = floorDiv(x + radiusMm, c);
  const cz1 = floorDiv(z + radiusMm, c);
  for (let cz = floorDiv(z - radiusMm, c); cz <= cz1; cz++) {
    for (let cx = floorDiv(x - radiusMm, c); cx <= cx1; cx++) {
      if ((ground.flagsAt(cx, cz) & mask) === 0) return false;
      const h = ground.heightAt(cx, cz);
      if (h - fromY > stepUpMm || fromY - h > maxDropMm) return false;
    }
  }
  return true;
}

/** Sets a rectangle of cells, corners included. */
export function fillCells(
  grid: WalkGrid,
  cx0: number,
  cz0: number,
  cx1: number,
  cz1: number,
  flags: number,
  heightMm = 0,
): void {
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) setCell(grid, cx, cz, flags, heightMm);
  }
}
