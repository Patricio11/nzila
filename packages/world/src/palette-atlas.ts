// The palette atlas: every colour of the world as one small picture, a grid
// of flat squares. A model is coloured by pointing each of its faces at a
// square, so the whole world shares one material and one texture, and
// neighbouring meshes can be drawn together. It is why a district fits in
// megabytes: there are no painted textures to download.
//
// The grid is 8 by 8 squares of 4 pixels. Square 0 is the top left. A model
// made in Blender uses the same picture: `pnpm pack:palette` writes it, and
// the list of squares by name, into art/ from this file, so a square means
// the same colour in both places.

import { WORLD, type Rgb } from "./palette.ts";

export const ATLAS_CELLS = 8;
export const ATLAS_CELL_PX = 4;

/** The colours in the order of their squares. New colours are added at the end: a square, once used, never changes its meaning. */
export const ATLAS: readonly Rgb[] = [
  WORLD.pavement,
  WORLD.tar,
  WORLD.earth,
  WORLD.line,
  WORLD.seaDeep,
  WORLD.seaShallow,
  WORLD.palmTrunk,
  WORLD.palmLeaf,
  WORLD.vanWhite,
  WORLD.vanBlue,
  WORLD.window,
  WORLD.windowLit,
  ...WORLD.walls,
  ...WORLD.person,
];

/** The name of each square, in the same order: what a Blender script or a world builder calls it. */
export const ATLAS_NAMES: readonly string[] = [
  "pavement",
  "tar",
  "earth",
  "line",
  "seaDeep",
  "seaShallow",
  "palmTrunk",
  "palmLeaf",
  "vanWhite",
  "vanBlue",
  "window",
  "windowLit",
  ...WORLD.walls.map((_, i) => `wall${i}`),
  ...WORLD.person.map((_, i) => `person${i}`),
];

/** Which square holds a colour of the palette. Throws for a colour that is not in it. */
export function atlasIndex(colour: Rgb): number {
  const index = ATLAS.indexOf(colour);
  if (index < 0) throw new Error("that colour is not in the world's palette");
  return index;
}

/**
 * The point of the picture a face should use for a square: its centre, as
 * (u, v) counted from the top left. That is how a glTF model counts, and
 * every model in a pack is one; counting the same way here is what makes a
 * square mean the same colour in a Blender file and in the game.
 */
export function atlasUv(index: number): readonly [number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= ATLAS_CELLS * ATLAS_CELLS) throw new Error(`no square ${index} in the palette atlas`);
  const column = index % ATLAS_CELLS;
  const row = Math.floor(index / ATLAS_CELLS);
  return [(column + 0.5) / ATLAS_CELLS, (row + 0.5) / ATLAS_CELLS];
}

/** The picture itself, as rows of pixels from the top down, four bytes a pixel: the first row holds squares 0 to 7. */
export function atlasPixels(): Uint8Array {
  const size = ATLAS_CELLS * ATLAS_CELL_PX;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / ATLAS_CELL_PX);
      const colour = ATLAS[row * ATLAS_CELLS + Math.floor(x / ATLAS_CELL_PX)] ?? WORLD.line;
      pixels.set([colour[0], colour[1], colour[2], 255], (y * size + x) * 4);
    }
  }
  return pixels;
}
