// Flat pieces of ground in the palette's colours, as one mesh: under the provador's mirror, the body pages, and the
// test scene. A small module of its own, so that a page needing a floor does not fetch the whole test scene.

import { BufferAttribute, BufferGeometry, Mesh } from "three";
import { atlasIndex, atlasUv, type Rgb } from "@nzila/world/client";
import { type WorldRenderer } from "./world-renderer.ts";

export interface Flat {
  readonly colour: Rgb;
  readonly width: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Flat pieces of ground as one mesh. Each piece takes its colour from its
 * square of the palette atlas, so however many there are they are one draw
 * call: this is how the models of a real district are coloured too.
 */
export function ground(renderer: WorldRenderer, pieces: readonly Flat[]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const piece of pieces) {
    const first = positions.length / 3;
    const [u, v] = atlasUv(atlasIndex(piece.colour));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      positions.push(piece.x + (sx * piece.width) / 2, piece.y, piece.z + (sz * piece.depth) / 2);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
    indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry, renderer.paletteMaterial);
  mesh.receiveShadow = true;
  return mesh;
}
