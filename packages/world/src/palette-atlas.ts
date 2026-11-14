// The palette atlas: every colour of the world as one small picture, a grid
// of flat squares. A model is coloured by pointing each of its faces at a
// square, so the whole world shares one material and one texture, and
// neighbouring meshes can be drawn together. It is why a district fits in
// megabytes: there are no painted textures to download.
//
// The grid is 16 by 16 squares of 4 pixels (it was 8 by 8 until people needed their colours). Square 0 is the top left. A model
// made in Blender uses the same picture: `pnpm pack:palette` writes it, and
// the list of squares by name, into art/ from this file, so a square means
// the same colour in both places.

import { GLOW, WORLD, type Rgb } from "./palette.ts";

export const ATLAS_CELLS = 16;
export const ATLAS_CELL_PX = 4;

const NO_GLOW: Rgb = [0, 0, 0];

interface Square {
  readonly name: string;
  readonly colour: Rgb;
  /** The light it gives off at night, or none. */
  readonly glow: Rgb;
}

const square = (name: string, colour: Rgb, glow: Rgb = NO_GLOW): Square => ({ name, colour, glow });
const NAMED_GLOW: Readonly<Record<string, Rgb>> = GLOW;

/** The squares in order. New ones are added at the end: once a pack is published, a square never changes its meaning. */
const SQUARES: readonly Square[] = [
  ...Object.entries(WORLD)
    .filter((entry): entry is [string, Rgb] => typeof entry[1][0] === "number")
    .map(([name, colour]) => square(name, colour, NAMED_GLOW[name])),
  ...WORLD.walls.map((colour, i) => square(`wall${i}`, colour)),
  ...WORLD.person.map((colour, i) => square(`person${i}`, colour)),
  ...WORLD.skin.map((colour, i) => square(`skin${i}`, colour)),
  ...WORLD.lip.map((colour, i) => square(`lip${i}`, colour)),
  ...WORLD.lipDark.map((colour, i) => square(`lipDark${i}`, colour)),
];

/** The colours in the order of their squares. */
export const ATLAS: readonly Rgb[] = SQUARES.map((s) => s.colour);

/** The name of each square, in the same order: what a Blender script or a world builder calls it. */
export const ATLAS_NAMES: readonly string[] = SQUARES.map((s) => s.name);

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

function picture(of: (s: Square) => Rgb, empty: Rgb): Uint8Array {
  const size = ATLAS_CELLS * ATLAS_CELL_PX;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const found = SQUARES[Math.floor(y / ATLAS_CELL_PX) * ATLAS_CELLS + Math.floor(x / ATLAS_CELL_PX)];
      const colour = found ? of(found) : empty;
      pixels.set([colour[0], colour[1], colour[2], 255], (y * size + x) * 4);
    }
  }
  return pixels;
}

/** The picture itself, as rows of pixels from the top down, four bytes a pixel: the first row holds squares 0 to 15. */
export function atlasPixels(): Uint8Array {
  return picture((s) => s.colour, WORLD.line);
}

/** The same picture, of what each square gives off at night: black everywhere but the windows and the lamps. */
export function atlasGlowPixels(): Uint8Array {
  return picture((s) => s.glow, NO_GLOW);
}
