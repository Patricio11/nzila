// Small helpers shared by build and check: hashing, transfer sizes, and
// reading how much a model costs to draw.

import { createHash } from "node:crypto";
import { deflateRawSync, gzipSync, inflateRawSync } from "node:zlib";

/** The first 12 hex characters of the SHA-256: enough to name a file for ever. */
export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

/** "chunks/c-01.l0.glb" with hash "ab12" becomes "c-01.l0.ab12.glb": flat, and safe to cache for ever. */
export function hashedName(sourcePath: string, bytes: Uint8Array, extension?: string): string {
  const base = sourcePath.split("/").pop()!;
  const dot = base.lastIndexOf(".");
  const stem = dot < 0 ? base : base.slice(0, dot);
  const ext = extension ?? (dot < 0 ? "" : base.slice(dot));
  return `${stem}.${contentHash(bytes)}${ext}`;
}

/** The hash a built file claims in its name, or null. */
export function hashInName(name: string): string | null {
  return /\.([0-9a-f]{12})(\.[a-z0-9]+)?$/.exec(name)?.[1] ?? null;
}

const ALREADY_COMPRESSED = [".glb", ".ktx2", ".opus", ".m4a", ".walkz"];

/**
 * What a file costs a player to download. Models, textures and audio are
 * compressed by their own formats; everything else is served gzipped, so its
 * gzipped size is what counts against a data budget.
 */
export function transferBytes(name: string, bytes: Uint8Array): number {
  return ALREADY_COMPRESSED.some((ext) => name.endsWith(ext)) ? bytes.length : gzipSync(bytes).length;
}

export interface DrawStats {
  tris: number;
  draws: number;
}

interface Gltf {
  nodes?: { mesh?: number }[];
  meshes?: { primitives: { indices?: number; mode?: number; attributes: { POSITION?: number } }[] }[];
  accessors?: { count: number }[];
}

/** Triangles and draw calls of a .glb, counted from its scene description. */
export function glbStats(bytes: Uint8Array): DrawStats {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error("not a .glb file");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLength > bytes.length) throw new Error("a .glb without a scene description");
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  const stats: DrawStats = { tris: 0, draws: 0 };
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
      // Only triangle lists are counted; the art pipeline exports nothing else.
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessor = primitive.indices ?? primitive.attributes.POSITION;
      stats.tris += Math.floor((gltf.accessors?.[accessor ?? -1]?.count ?? 0) / 3);
      stats.draws += 1;
    }
  }
  return stats;
}

/**
 * A walk grid as a pack carries it (.walkz): the grid's bytes, deflated. A
 * grid is mostly the same value over and over, so it shrinks thirty times,
 * and it is shrunk here so that its size does not depend on how a server is
 * set up. Plain deflate has no header, so the same grid gives the same bytes
 * on every machine.
 */
export function packWalkGrid(grid: Uint8Array): Uint8Array {
  return deflateRawSync(grid, { level: 9 });
}

export function unpackWalkGrid(packed: Uint8Array): Uint8Array {
  return inflateRawSync(packed);
}
