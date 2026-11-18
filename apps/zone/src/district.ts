// A district as the zone knows it: its ground, and where someone who has
// never been there arrives. Read from the very pack the phones download, so
// that the zone and every phone agree what is solid without a byte being sent
// about it (D-0.53).

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { type Ground, type Obstacle } from "@nzila/sim";
import { zoneRoomOf } from "@nzila/protocol";
import { decodeWalkGrid, groundOf, seatObstacles, vanRoute, type CrowdActor, type CrowdFile, type RoamerPlan, type SeatPlace } from "@nzila/world";
import { type Route } from "@nzila/sim";
import { type Place } from "./channel.ts";

export interface District {
  readonly id: string;
  readonly provinceId: string;
  readonly ground: Ground;
  /** What stands on it that the walk grid does not hold: the benches, as every phone has them too. */
  readonly obstacles: readonly Obstacle[];
  /** Where a first arrival stands. */
  readonly arrival: Place;
  /** The paragens, by id: where someone who got off a van comes back into the street. */
  readonly paragens: ReadonlyMap<string, Place>;
  /**
   * The street's traffic, as the phones load it, in the same order (F-152): the linhas' vans and the other
   * vehicles; and the people of the street, who the traffic gives way to too. Absent when the pack has no linhas,
   * or when the vehicles are not built: the phones then decide for themselves.
   */
  readonly traffic?: { readonly lines: readonly { readonly id: string; readonly route: Route }[]; readonly roamers: readonly RoamerPlan[]; readonly crowd: readonly CrowdActor[] };
  /** The caixas: where money is put in the bank and taken out. Millimetres. */
  readonly caixas?: readonly { readonly x: number; readonly z: number }[];
}

/** What the zone reads of a pack's manifest. The rest is the phone's business. */
interface ManifestRead {
  readonly id: string;
  readonly province: string;
  readonly chunks: readonly { readonly walkGrid?: string }[];
  readonly seats?: readonly SeatPlace[];
  readonly paragens?: readonly { readonly id: string; readonly pos: readonly [number, number, number] }[];
  readonly pois?: readonly { readonly pos: readonly [number, number, number]; readonly glyph?: string }[];
  readonly routes?: readonly { readonly id: string; readonly kind: string; readonly spline: string; readonly stopPoints: readonly number[]; readonly headwaySeconds: number }[];
  readonly npc?: { readonly crowd: string | null };
  readonly spawns: readonly { readonly pos: readonly [number, number, number]; readonly facing?: number; readonly kind: string }[];
}

/** The sign over a caixa, as a pack's manifest names it; and how near one a player must stand to use it, in millimetres. */
export const CAIXA_GLYPH = "banco";
export const CAIXA_REACH_MM = 3500;

/** The name a district's rooms go by (the phones ask for it by the same function). */
export const roomNameOf = zoneRoomOf;

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
  const paragens = new Map((manifest.paragens ?? []).map((one) => [one.id, { x: Math.round(one.pos[0] * 1000), y: Math.round(one.pos[1] * 1000), z: Math.round(one.pos[2] * 1000), yaw: 0 }]));
  // A place whose sign is the bank's is a caixa.
  const caixas = (manifest.pois ?? []).filter((one) => one.glyph === CAIXA_GLYPH).map((one) => ({ x: Math.round(one.pos[0] * 1000), z: Math.round(one.pos[2] * 1000) }));
  return { id: manifest.id, provinceId: manifest.province, ground: groundOf(grids), obstacles: seatObstacles(manifest.seats ?? []), arrival, paragens, caixas, ...(await trafficOf(manifest, packDir)) };
}

/** The district's traffic, read exactly as the phone reads it (apps/client/src/render/traffic.ts), so that both name the same vehicles the same way. */
async function trafficOf(manifest: ManifestRead, packDir: URL): Promise<{ traffic?: NonNullable<District["traffic"]> }> {
  const routes = (manifest.routes ?? []).filter((route) => route.kind === "candongueiro");
  if (routes.length === 0) return {};
  const json = async <T>(where: URL): Promise<T | null> => (existsSync(where) ? (JSON.parse(await readFile(where, "utf8")) as T) : null);
  // The vehicles belong to the game, not to a district: served beside the districts' packs.
  const listed = await json<{ vehicles: { name: string; halfWidth: number; halfLength: number }[] }>(new URL("../dev-vehicles/veiculos.json", packDir));
  if (!listed) return {};
  const lines = [];
  for (const route of routes) {
    const spline = await json<{ points: [number, number, number][] }>(new URL(route.spline, packDir));
    if (!spline) return {};
    lines.push({ id: route.id, route: vanRoute(spline.points, route.stopPoints, route.headwaySeconds) });
  }
  const crowd = manifest.npc?.crowd ? await json<CrowdFile>(new URL(manifest.npc.crowd, packDir)) : null;
  const roamers: RoamerPlan[] = [];
  for (const plan of crowd?.vehicles ?? []) {
    const kind = listed.vehicles.find((vehicle) => vehicle.name === plan.model);
    if (kind) roamers.push({ plan, halfWidthMm: kind.halfWidth * 1000, halfLengthMm: kind.halfLength * 1000 });
  }
  return { traffic: { lines, roamers, crowd: crowd?.actors ?? [] } };
}
