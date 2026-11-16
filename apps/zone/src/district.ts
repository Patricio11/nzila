// A district as the zone knows it: its ground, and where someone who has
// never been there arrives. Read from the very pack the phones download, so
// that the zone and every phone agree what is solid without a byte being sent
// about it (D-0.53).

import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { type Ground } from "@nzila/sim";
import { decodeWalkGrid, groundOf } from "@nzila/world";
import { type Place } from "./channel.ts";

export interface District {
  readonly id: string;
  readonly provinceId: string;
  readonly ground: Ground;
  /** Where a first arrival stands. */
  readonly arrival: Place;
}

/** What the zone reads of a pack's manifest. The rest is the phone's business. */
interface ManifestRead {
  readonly id: string;
  readonly province: string;
  readonly chunks: readonly { readonly walkGrid?: string }[];
  readonly spawns: readonly { readonly pos: readonly [number, number, number]; readonly facing?: number; readonly kind: string }[];
}

/** The name a district's rooms go by: its id, without the stroke a web address would trip on. */
export const roomNameOf = (districtId: string): string => districtId.replaceAll("/", ".");

/** Loads a district from a built pack: the folder that holds its manifest.json. */
export async function loadDistrict(packDir: URL): Promise<District> {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", packDir), "utf8")) as ManifestRead;
  const files = manifest.chunks.flatMap((chunk) => (chunk.walkGrid ? [chunk.walkGrid] : []));
  if (files.length === 0) throw new Error(`pack ${manifest.id} has no walk grid: nobody could stand anywhere`);
  // A pack carries each grid deflated (tools/pack: packWalkGrid).
  const grids = await Promise.all(files.map(async (file) => decodeWalkGrid(new Uint8Array(inflateRawSync(await readFile(new URL(file, packDir)))))));
  const spawn = manifest.spawns.find((one) => one.kind === "first_arrival") ?? manifest.spawns[0];
  if (!spawn) throw new Error(`pack ${manifest.id} has nowhere to arrive`);
  const arrival: Place = {
    x: Math.round(spawn.pos[0] * 1000),
    y: Math.round(spawn.pos[1] * 1000),
    z: Math.round(spawn.pos[2] * 1000),
    yaw: Math.round((spawn.facing ?? 0) * 100),
  };
  return { id: manifest.id, provinceId: manifest.province, ground: groundOf(grids), arrival };
}
