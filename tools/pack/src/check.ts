// `pack check`: the gate a pack must pass before it can be published
// (WORLD_ATLAS.md §4). It reads a built pack and returns every problem it
// finds, in plain words, so a world builder can fix them all in one go.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { CELL_WALK, DEFAULT_CHARACTER, floorDiv, type Ground } from "@nzila/sim";
import {
  PACK_BUDGETS,
  STREAM,
  distanceToChunk,
  decodeWalkGrid,
  groundOf,
  manifestSchema,
  schemaProblems,
  type Manifest,
  type Registry,
} from "@nzila/world";
import { contentHash, hashInName, transferBytes, unpackWalkGrid } from "./files.ts";

export interface CheckContext {
  /** Which places exist (content/registry.json). */
  readonly registry: Registry;
  /** Terms that may not appear without a signed agreement (docs/legal/BRAND_TERMS.txt), one per entry. */
  readonly brandTerms: readonly string[];
}

/** Reads a brand terms file: one term per line, "#" starts a comment. */
export function parseBrandTerms(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function findBrand(text: string, terms: readonly string[]): string | null {
  const plain = text.toLowerCase();
  for (const term of terms) {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Whole words only: "bai" must not be found in "bairro".
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(plain)) return term;
  }
  return null;
}

/** Every cell a person can walk to from a starting point. */
function reachable(ground: Ground, startX: number, startZ: number): Set<string> {
  const c = ground.cellMm;
  const seen = new Set<string>();
  const start: [number, number] = [floorDiv(startX, c), floorDiv(startZ, c)];
  if ((ground.flagsAt(start[0], start[1]) & CELL_WALK) === 0) return seen;
  const queue: [number, number][] = [start];
  seen.add(start.join());
  while (queue.length > 0) {
    const [cx, cz] = queue.pop()!;
    const here = ground.heightAt(cx, cz);
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]] as const) {
      const cell = `${nx},${nz}`;
      if (seen.has(cell) || (ground.flagsAt(nx, nz) & CELL_WALK) === 0) continue;
      const rise = ground.heightAt(nx, nz) - here;
      // The same limits the character controller walks by.
      if (rise > DEFAULT_CHARACTER.stepUpMm || -rise > DEFAULT_CHARACTER.maxDropMm) continue;
      seen.add(cell);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

/** Checks a built pack. Returns the problems found; an empty list means it may be published. */
export async function checkPack(packDir: string, context: CheckContext): Promise<string[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(packDir, "manifest.json"), "utf8"));
  } catch {
    return ["manifest.json: missing or not JSON. Run `pack build` first."];
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return schemaProblems(parsed.error);
  const manifest: Manifest = parsed.data;
  const problems: string[] = [];

  // --- Files: present, untouched since the build, and the size the manifest says.
  const files = new Map<string, Uint8Array>();
  for (const name of await readdir(packDir)) {
    if (name !== "manifest.json") files.set(name, await readFile(join(packDir, name)));
  }
  const named = [
    ...manifest.chunks.flatMap((chunk) => [...chunk.lods, chunk.walkGrid]),
    ...manifest.routes.map((route) => route.spline),
    ...manifest.interiors.map((interior) => interior.file),
    manifest.strings,
    ...[manifest.npc.crowd, manifest.npc.vendors, manifest.npc.police, manifest.heat.lighting].filter((f) => f !== null),
  ];
  for (const name of named) {
    const bytes = files.get(name);
    if (!bytes) problems.push(`${name}: named in the manifest but not in the pack`);
    else if (hashInName(name) !== contentHash(bytes)) problems.push(`${name}: its content does not match the hash in its name`);
  }
  if (problems.length > 0) return problems;
  const cost = (name: string): number => transferBytes(name, files.get(name)!);

  // --- Identity.
  const district = context.registry.districts.find((d) => d.id === manifest.id);
  if (!district) problems.push(`id: ${manifest.id} is not in the registry`);
  else if (district.provinceId !== manifest.province) problems.push(`province: the registry places ${manifest.id} in ${district.provinceId}`);
  for (const gateway of manifest.gateways) {
    if (!context.registry.districts.some((d) => d.id === gateway.to)) {
      problems.push(`gateways.${gateway.id}: leads to ${gateway.to}, which is not in the registry`);
    }
  }

  // --- Megabytes are money (Rule 2).
  let normalTotal = 0;
  for (const chunk of manifest.chunks) {
    const actual = chunk.lods.reduce((sum, lod) => sum + cost(lod), 0) + cost(chunk.walkGrid);
    normalTotal += actual;
    if (actual !== chunk.bytes.normal) problems.push(`chunks.${chunk.id}: the manifest says ${chunk.bytes.normal} bytes at Normal, the files are ${actual}`);
    if (actual > PACK_BUDGETS.chunkNormalBytes) {
      problems.push(`chunks.${chunk.id}: ${actual} bytes at Normal, over the ${PACK_BUDGETS.chunkNormalBytes} of one chunk`);
    }
    if (chunk.bytes.poupanca > chunk.bytes.normal || chunk.bytes.normal > chunk.bytes.alta) {
      problems.push(`chunks.${chunk.id}: a lower tier may not cost more than a higher one`);
    }
  }
  if (manifest.sizes.total.normal < normalTotal) problems.push(`sizes.total.normal: smaller than the chunks it must contain`);
  if (manifest.sizes.total.normal > PACK_BUDGETS.districtNormalBytes) {
    problems.push(`sizes.total.normal: ${manifest.sizes.total.normal} bytes, over the ${PACK_BUDGETS.districtNormalBytes} of a district`);
  }
  if (manifest.sizes.firstView > PACK_BUDGETS.firstViewBytes) {
    problems.push(`sizes.firstView: ${manifest.sizes.firstView} bytes, over the ${PACK_BUDGETS.firstViewBytes} left for a first play`);
  }

  // --- The reference phone (Rule 1): an estimate of what is in view from where players stand.
  // It follows the streaming rule of the lowest tier, because that is the phone the budgets
  // are for: every chunk inside the haze, at its reduced model; nothing beyond it.
  const viewpoints = [...manifest.spawns.map((s) => ({ what: `spawns.${s.id}`, pos: s.pos })), ...manifest.paragens.map((p) => ({ what: `paragens.${p.id}`, pos: p.pos }))];
  for (const { what, pos } of viewpoints) {
    let tris = 0;
    let draws = 0;
    for (const chunk of manifest.chunks) {
      if (distanceToChunk(chunk.aabb, pos[0], pos[2]) > STREAM.poupanca.farM) continue;
      tris += chunk.stats.far.tris;
      draws += chunk.stats.far.draws;
    }
    if (tris > PACK_BUDGETS.trisInView) problems.push(`${what}: about ${tris} triangles in view, over ${PACK_BUDGETS.trisInView}`);
    if (draws > PACK_BUDGETS.worldDrawsInView) problems.push(`${what}: about ${draws} draw calls in view, over ${PACK_BUDGETS.worldDrawsInView}`);
  }

  // --- Everything a player must get to can be walked to.
  let ground: Ground | null = null;
  try {
    ground = groundOf(manifest.chunks.map((chunk) => decodeWalkGrid(unpackWalkGrid(files.get(chunk.walkGrid)!))));
  } catch (error) {
    problems.push(`walk grids: ${(error as Error).message}`);
  }
  if (ground) {
    const arrival = manifest.spawns.find((spawn) => spawn.kind === "first_arrival") ?? manifest.spawns[0]!;
    const cells = reachable(ground, arrival.pos[0] * 1000, arrival.pos[2] * 1000);
    if (cells.size === 0) problems.push(`spawns.${arrival.id}: is not on walkable ground`);
    else {
      const places = [
        ...manifest.spawns.map((s) => ({ what: `spawns.${s.id}`, pos: s.pos })),
        ...manifest.paragens.map((p) => ({ what: `paragens.${p.id}`, pos: p.pos })),
        ...manifest.gateways.map((g) => ({ what: `gateways.${g.id}`, pos: g.pos })),
        ...manifest.lots.map((l) => ({ what: `lots.${l.id}`, pos: l.pos })),
        ...manifest.residences.map((r) => ({ what: `residences.${r.id}`, pos: r.pos })),
        ...manifest.pois.map((p) => ({ what: `pois.${p.id}`, pos: p.pos })),
      ];
      for (const { what, pos } of places) {
        const cell = `${floorDiv(pos[0] * 1000, ground.cellMm)},${floorDiv(pos[2] * 1000, ground.cellMm)}`;
        if (!cells.has(cell)) problems.push(`${what}: cannot be walked to from spawns.${arrival.id}`);
      }
    }
  }

  // --- Routes stop at paragens that exist.
  for (const route of manifest.routes) {
    if (route.stops.length !== route.stopPoints.length) problems.push(`routes.${route.id}: stops and stopPoints must be the same length`);
    for (const stop of route.stops) {
      if (!manifest.paragens.some((p) => p.id === stop)) problems.push(`routes.${route.id}: stops at ${stop}, which is not a paragem of this pack`);
    }
  }
  for (const lot of manifest.lots) {
    if (!manifest.interiors.some((i) => i.id === lot.interior)) problems.push(`lots.${lot.id}: its interior ${lot.interior} is not in this pack`);
  }

  // --- Copy: every key is in the pack's strings, in Portuguese of Angola (Rule 10).
  let strings: Record<string, unknown> = {};
  try {
    strings = JSON.parse(new TextDecoder().decode(files.get(manifest.strings)!)) as Record<string, unknown>;
  } catch {
    problems.push(`${manifest.strings}: not JSON`);
  }
  const keys = [
    manifest.nameKey,
    ...manifest.pois.flatMap((p) => [p.nameKey, p.lineKey]),
    ...manifest.paragens.map((p) => p.nameKey),
  ];
  for (const k of new Set(keys)) {
    const value = strings[k];
    if (typeof value !== "string" || value.trim() === "") problems.push(`strings: "${k}" is used by the manifest and missing from ${manifest.strings}`);
  }

  // --- A district is loved for something (Rule 7).
  const positive = manifest.pois.filter((p) => p.positive).length;
  if (positive < PACK_BUDGETS.positivePois) {
    problems.push(`pois: ${positive} positive points of interest; a district needs at least ${PACK_BUDGETS.positivePois}`);
  }

  // --- No real brand without a signed agreement (Rule 8).
  for (const [k, value] of Object.entries(strings)) {
    const brand = typeof value === "string" ? findBrand(value, context.brandTerms) : null;
    if (brand) problems.push(`strings: "${k}" names "${brand}", which needs a signed agreement (docs/legal)`);
  }
  for (const name of files.keys()) {
    const brand = findBrand(name.replace(/[._-]/g, " "), context.brandTerms);
    if (brand) problems.push(`${name}: the file name contains "${brand}", which needs a signed agreement (docs/legal)`);
  }

  return problems;
}
