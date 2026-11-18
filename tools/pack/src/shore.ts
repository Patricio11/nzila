// How far each part of a district's water is from land (the founder, 2026-11-18: "the water must really look like
// water"). Worked out once, when the pack is built, from the walk grid the district already has, and shipped as a
// small greyscale picture: the water drawn over it is clear and turquoise near the wall and the sand, deep further
// out, and foams where the waves meet the land.

import { deflateSync } from "node:zlib";
import { CELL_WATER, type Ground } from "@nzila/sim";

/** Metres of distance each grey level stands for, and the most that is told apart (out at sea it is all deep). */
export const SHORE_M_PER_LEVEL = 0.1;
export const SHORE_MOST_M = 25.5;

export interface ShoreField {
  readonly width: number;
  readonly height: number;
  /** One byte a pixel, rows from the water's least Z: distance to land in tenths of a metre, 255 for "far". */
  readonly levels: Uint8Array;
}

/**
 * The distance to land over a stretch of water, `metresPerPixel` apart, from a ground that knows which cells are
 * water. Land is whatever is not water: the sea wall, the sand, a pier's posts. Measured by a two-pass chamfer (a
 * step across is one pixel, a step on the diagonal the square root of two), which is near enough for a colour.
 */
export function shoreField(ground: Ground, rect: readonly [number, number, number, number], metresPerPixel = 1): ShoreField {
  const [minX, minZ, maxX, maxZ] = rect;
  const width = Math.max(1, Math.ceil((maxX - minX) / metresPerPixel));
  const height = Math.max(1, Math.ceil((maxZ - minZ) / metresPerPixel));
  const far = 1e9;
  const distance = new Float64Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = Math.round((minX + (i + 0.5) * metresPerPixel) * 1000);
      const z = Math.round((minZ + (j + 0.5) * metresPerPixel) * 1000);
      const water = (ground.flagsAt(Math.floor(x / ground.cellMm), Math.floor(z / ground.cellMm)) & CELL_WATER) !== 0;
      distance[j * width + i] = water ? far : 0;
    }
  }
  const diagonal = Math.SQRT2;
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= width || j >= height ? far : distance[j * width + i]!);
  // Forward, then back: each pixel takes the least of its neighbours already seen, plus the step to them.
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const here = j * width + i;
      distance[here] = Math.min(distance[here]!, at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + diagonal, at(i + 1, j - 1) + diagonal);
    }
  }
  for (let j = height - 1; j >= 0; j--) {
    for (let i = width - 1; i >= 0; i--) {
      const here = j * width + i;
      distance[here] = Math.min(distance[here]!, at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + diagonal, at(i - 1, j + 1) + diagonal);
    }
  }
  const levels = new Uint8Array(width * height);
  for (let n = 0; n < levels.length; n++) levels[n] = Math.min(255, Math.round((distance[n]! * metresPerPixel) / SHORE_M_PER_LEVEL));
  return { width, height, levels };
}

/** The field as a greyscale PNG: what the pack ships and the phone reads as a texture. */
export function shorePng(field: ShoreField): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(field.width, 0);
  header.writeUInt32BE(field.height, 4);
  // Eight bits, greyscale, no interlace.
  header.set([8, 0, 0, 0, 0], 8);
  const rows = Buffer.alloc(field.height * (field.width + 1));
  for (let j = 0; j < field.height; j++) rows.set(field.levels.subarray(j * field.width, (j + 1) * field.width), j * (field.width + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", new Uint8Array())]);
}
