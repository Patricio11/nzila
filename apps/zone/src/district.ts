// A district as the zone knows it: its ground, and where someone who has
// never been there arrives. Read from the very pack the phones download, so
// that the zone and every phone agree what is solid without a byte being sent
// about it (D-0.53).

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { type Ground, type Obstacle } from "@nzila/sim";
import { zoneRoomOf } from "@nzila/protocol";
import { decodeWalkGrid, groundOf, seatObstacles, tableObstacles, vanRoute, type CrowdActor, type CrowdFile, type RoamerPlan, type SeatPlace } from "@nzila/world";
import { type Route } from "@nzila/sim";
import { type Place } from "./channel.ts";
import { type TablePlace } from "./mesas.ts";

export interface District {
  readonly id: string;
  readonly provinceId: string;
  readonly ground: Ground;
  /** What stands on it that the walk grid does not hold: the benches and the tables, as every phone has them too. */
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
  readonly traffic?: {
    readonly lines: readonly { readonly id: string; readonly route: Route }[];
    readonly roamers: readonly RoamerPlan[];
    readonly crowd: readonly CrowdActor[];
    /** A van's seats a player may take, by their place in the van's list of seats: the player's own first, then the passengers'. */
    readonly vanSeats: readonly number[];
  };
  /** The caixas: where money is put in the bank and taken out. Millimetres. */
  readonly caixas?: readonly { readonly x: number; readonly z: number }[];
  /** The shops, by the pack's name for each: where things are bought. Millimetres. */
  readonly shops?: readonly { readonly id: string; readonly x: number; readonly z: number }[];
  /** Every place of the district in the pack's order: an errand names one by its number, which every phone counts the same way. */
  readonly places?: readonly { readonly x: number; readonly z: number }[];
  /** The tables where the bairro plays, in the pack's order: a phone names one by its number. Millimetres. */
  readonly tables?: readonly TablePlace[];
  /** The places two may go out to (Task 10.13), in the pack's order: a phone names one by its number. Millimetres. */
  readonly outings?: readonly { readonly x: number; readonly z: number }[];
  /** The pitches with a ball on them, in the pack's order. Millimetres. */
  readonly campos?: readonly { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number; readonly goal: number }[];
  /** The ways out to other bairros (Task 11.2): where each is, where it leads, and the spawn one arrives at there. Millimetres. */
  readonly gateways?: readonly { readonly id: string; readonly x: number; readonly z: number; readonly to: string; readonly arrive: string }[];
  /** The benches' seats, in the pack's order: a phone names one by its number to sit on it (F-205). Millimetres. */
  readonly benches?: readonly Place[];
  /** Where a player whose Energia runs out wakes (Task 4.4): the district's hospital or centro médico, from its places. */
  readonly hospital?: Place;
  /** Where something is done for the player and paid for (a barbearia's cut, D-11.10): each place named `servico-<kind>-<where>`. Millimetres. */
  readonly servicos?: readonly { readonly kind: string; readonly x: number; readonly z: number }[];
  /** Where biscatos are taken on the spot (Task 4.5): each place named `biscato-<kind>-<where>`, by its kind. Millimetres. */
  readonly biscatos?: readonly { readonly kind: string; readonly x: number; readonly z: number }[];
}

/** What the zone reads of a pack's manifest. The rest is the phone's business. */
interface ManifestRead {
  readonly id: string;
  readonly province: string;
  readonly chunks: readonly { readonly walkGrid?: string }[];
  readonly seats?: readonly SeatPlace[];
  readonly paragens?: readonly { readonly id: string; readonly pos: readonly [number, number, number] }[];
  readonly pois?: readonly { readonly id: string; readonly pos: readonly [number, number, number]; readonly glyph?: string; readonly outing?: boolean }[];
  readonly routes?: readonly { readonly id: string; readonly kind: string; readonly spline: string; readonly stopPoints: readonly number[]; readonly headwaySeconds: number }[];
  readonly npc?: { readonly crowd: string | null };
  readonly spawns: readonly { readonly id?: string; readonly pos: readonly [number, number, number]; readonly facing?: number; readonly kind: string }[];
  readonly gateways?: readonly { readonly id: string; readonly pos: readonly [number, number, number]; readonly to: string; readonly arrive: string }[];
  readonly campos?: readonly { readonly rect: readonly [number, number, number, number]; readonly goal: number }[];
  readonly tables?: readonly { readonly game: "xadrez" | "damas" | "ludo"; readonly pos: readonly [number, number, number]; readonly facing: number; readonly seats: readonly { readonly pos: readonly [number, number, number]; readonly facing: number }[] }[];
}

/** The sign over a caixa, as a pack's manifest names it; and how near one a player must stand to use it, in millimetres. */
export const CAIXA_GLYPH = "banco";
export const CAIXA_REACH_MM = 3500;
/** The packs of the bairros the registry knows (content/registry.json), in its order: what a zone runs when it is not told otherwise. */
export function registryPacks(): string[] {
  const registry = JSON.parse(readFileSync(new URL("../../../content/registry.json", import.meta.url), "utf8")) as { districts: { pack?: string }[] };
  return registry.districts.flatMap((one) => (one.pack ? [one.pack] : []));
}

/** The signs of shops; and how near a shop's place a player must stand to buy (at its grille or its counter). */
export const SHOP_GLYPHS = ["cantina", "flores", "gelado"];
export const SHOP_REACH_MM = 3500;
/** How near a place a player must stand for an errand there to be done. */
export const PLACE_REACH_MM = 4500;
/** How near a way out to another bairro a player must stand to take it. */
export const GATEWAY_REACH_MM = 7000;
/** That a player met someone is believed this long, in seconds: long enough to be told "chegou gente nova" and go. */
export const MET_TTL_S = 1800;

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
  // Where someone from another bairro arrives (a spawn of kind "gateway") is come in at as a paragem is, by its name.
  for (const one of manifest.spawns) {
    if (one.kind === "gateway" && one.id && !paragens.has(one.id)) paragens.set(one.id, { x: Math.round(one.pos[0] * 1000), y: Math.round(one.pos[1] * 1000), z: Math.round(one.pos[2] * 1000), yaw: Math.round((one.facing ?? 0) * 100) });
  }
  const gateways = (manifest.gateways ?? []).map((one) => ({ id: one.id, x: Math.round(one.pos[0] * 1000), z: Math.round(one.pos[2] * 1000), to: one.to, arrive: one.arrive }));
  const campos = (manifest.campos ?? []).map((one) => ({ x0: Math.round(one.rect[0] * 1000), z0: Math.round(one.rect[1] * 1000), x1: Math.round(one.rect[2] * 1000), z1: Math.round(one.rect[3] * 1000), goal: Math.round(one.goal * 1000) }));
  // A place whose sign is the bank's is a caixa.
  const caixas = (manifest.pois ?? []).filter((one) => one.glyph === CAIXA_GLYPH).map((one) => ({ x: Math.round(one.pos[0] * 1000), z: Math.round(one.pos[2] * 1000) }));
  // A place whose sign is a shop's is one: a player standing at it may buy what it sells.
  const shops = (manifest.pois ?? []).filter((one) => SHOP_GLYPHS.includes(one.glyph ?? "")).map((one) => ({ id: one.id, x: Math.round(one.pos[0] * 1000), z: Math.round(one.pos[2] * 1000) }));
  // A biscato's place is no errand's: adding work to a street does not move the errands.
  const places = (manifest.pois ?? []).filter((one) => !/^(biscato|servico)-/.test(one.id)).map((one) => ({ x: Math.round(one.pos[0] * 1000), z: Math.round(one.pos[2] * 1000) }));
  // A seat at a table is where the body sits: its height is the seat's, and the sitter faces the table.
  const mm = (metres: number): number => Math.round(metres * 1000);
  const tables = (manifest.tables ?? []).map((one): TablePlace => ({
    jogo: one.game,
    x: mm(one.pos[0]),
    z: mm(one.pos[2]),
    seats: one.seats.map((seat) => ({ x: mm(seat.pos[0]), y: mm(seat.pos[1]), z: mm(seat.pos[2]), yaw: Math.round((((seat.facing % 360) + 360) % 360) * 100) })),
  }));
  const outings = (manifest.pois ?? []).filter((one) => one.outing === true).map((one) => ({ x: Math.round(one.pos[0] * 1000), z: Math.round(one.pos[2] * 1000) }));
  const benches = (manifest.seats ?? []).map((seat): Place => ({ x: mm(seat.pos[0]), y: mm(seat.pos[1]), z: mm(seat.pos[2]), yaw: Math.round((((seat.facing % 360) + 360) % 360) * 100) }));
  // The hospital or the centro médico, by its name among the district's places (WORLD_ATLAS.md §5.1, step 7).
  const clinic = (manifest.pois ?? []).find((one) => /^(hospital|centro-medico)/.test(one.id));
  const hospital = clinic ? { x: mm(clinic.pos[0]), y: mm(clinic.pos[1]), z: mm(clinic.pos[2]), yaw: 0 } : undefined;
  const servicos = (manifest.pois ?? []).flatMap((one) => {
    const kind = /^servico-([a-z]+)-/.exec(one.id)?.[1];
    return kind ? [{ kind, x: mm(one.pos[0]), z: mm(one.pos[2]) }] : [];
  });
  const biscatos = (manifest.pois ?? []).flatMap((one) => {
    const kind = /^biscato-([a-z]+)-/.exec(one.id)?.[1];
    return kind ? [{ kind, x: mm(one.pos[0]), z: mm(one.pos[2]) }] : [];
  });
  return { id: manifest.id, provinceId: manifest.province, ground: groundOf(grids), obstacles: [...seatObstacles(manifest.seats ?? []), ...tableObstacles(manifest.tables ?? [])], arrival, paragens, caixas, shops, places, outings, gateways, campos, servicos, tables, benches, ...(hospital ? { hospital } : {}), ...(biscatos.length > 0 ? { biscatos } : {}), ...(await trafficOf(manifest, packDir)) };
}

/** The district's traffic, read exactly as the phone reads it (apps/client/src/render/traffic.ts), so that both name the same vehicles the same way. */
async function trafficOf(manifest: ManifestRead, packDir: URL): Promise<{ traffic?: NonNullable<District["traffic"]> }> {
  const routes = (manifest.routes ?? []).filter((route) => route.kind === "candongueiro");
  if (routes.length === 0) return {};
  const json = async <T>(where: URL): Promise<T | null> => (existsSync(where) ? (JSON.parse(await readFile(where, "utf8")) as T) : null);
  // The vehicles belong to the game, not to a district: served beside the districts' packs.
  const listed = await json<{ vehicles: { name: string; halfWidth: number; halfLength: number; seats?: { who: string }[] }[] }>(new URL("../dev-vehicles/veiculos.json", packDir));
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
  const seats = listed.vehicles.find((vehicle) => vehicle.name === "candongueiro")?.seats ?? [];
  const vanSeats = [...seats.entries()].filter(([, seat]) => seat.who === "jogador").map(([n]) => n).concat([...seats.entries()].filter(([, seat]) => seat.who === "passageiro").map(([n]) => n));
  return { traffic: { lines, roamers, crowd: crowd?.actors ?? [], vanSeats } };
}
