// `pack build`: turns a district's source directory into an immutable pack.
//
// In:  content/<province>/<district>/district.json and the files it names.
// Out: a flat directory of content-hashed files and a manifest.json that
//      records what each one costs to download and to draw.
//
// The whole road from a Blender file to a pack has two steps:
//
//   pack export   Blender cuts the district into chunks, makes two levels of
//                 detail of each and writes them as .glb (assets.ts,
//                 art/scripts/export_chunks.py).
//   pack build    this file: compresses every model (Meshopt for geometry,
//                 KTX2 for textures), converts hand-written walk grids,
//                 hashes and copies every file, measures sizes per tier and
//                 drawing costs per chunk, and writes the manifest.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  STREAM,
  distanceToChunk,
  encodeWalkGrid,
  manifestSchema,
  schemaProblems,
  sourceManifestSchema,
  walkGridFromSource,
  type Manifest,
  type TierBytes,
  type WalkGridSource,
} from "@nzila/world";
import { optimiseGlb } from "./assets.ts";
import { glbStats, hashedName, packWalkGrid, transferBytes, type DrawStats } from "./files.ts";

export class PackError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "PackError";
    this.problems = problems;
  }
}

export interface BuildOptions {
  /**
   * Compress every model before it is hashed. On by default: a pack is never
   * published with uncompressed models. Tests that use stand-in files turn it off.
   */
  readonly optimise?: boolean;
}

export async function buildPack(sourceDir: string, outDir: string, options: BuildOptions = {}): Promise<Manifest> {
  const optimise = options.optimise ?? true;
  const parsed = sourceManifestSchema.safeParse(JSON.parse(await readFile(join(sourceDir, "district.json"), "utf8")));
  if (!parsed.success) throw new PackError(schemaProblems(parsed.error));
  const source = parsed.data;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  /** Copies one source file into the pack under its hashed name. Returns the name and what it costs. */
  const emit = async (path: string, transform?: (bytes: Uint8Array) => Uint8Array, extension?: string) => {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(join(sourceDir, path));
    } catch {
      throw new PackError([`${path}: named in district.json but not found`]);
    }
    if (transform) bytes = transform(bytes);
    if (optimise && path.endsWith(".glb")) {
      try {
        bytes = await optimiseGlb(bytes);
      } catch (error) {
        throw new PackError([`${path}: could not be compressed: ${(error as Error).message}`]);
      }
    }
    const name = hashedName(path, bytes, extension);
    await writeFile(join(outDir, name), bytes);
    return { name, bytes, cost: transferBytes(name, bytes) };
  };
  const emitOptional = async (path: string | null) => (path === null ? null : await emit(path));

  const walkFromSource = (bytes: Uint8Array): Uint8Array =>
    packWalkGrid(encodeWalkGrid(walkGridFromSource(JSON.parse(new TextDecoder().decode(bytes)) as WalkGridSource)));

  const total: TierBytes = { poupanca: 0, normal: 0, alta: 0 };
  const addToAll = (cost: number): void => {
    total.poupanca += cost;
    total.normal += cost;
    total.alta += cost;
  };

  const chunks: Manifest["chunks"] = [];
  for (const chunk of source.chunks) {
    const lods = [];
    for (const lod of chunk.lods) lods.push(await emit(lod));
    // A hand-written grid (.json) is compiled and packed; a compiled one (.bin) is packed; a packed one is taken as it is.
    const walk = chunk.walkGrid.endsWith(".json")
      ? await emit(chunk.walkGrid, walkFromSource, ".walkz")
      : chunk.walkGrid.endsWith(".bin")
        ? await emit(chunk.walkGrid, packWalkGrid, ".walkz")
        : await emit(chunk.walkGrid);

    const models = lods.filter((lod) => lod.name.endsWith(".glb"));
    const near: DrawStats = models[0] ? glbStats(models[0].bytes) : { tris: 0, draws: 0 };
    const far: DrawStats = models[1] ? glbStats(models[1].bytes) : near;
    // Tiers, until the renderer defines them in Task 1.1: Poupança loads the
    // least detailed model only, Normal and Alta load every level.
    const everything = lods.reduce((sum, lod) => sum + lod.cost, 0) + walk.cost;
    const least = (models[models.length - 1]?.cost ?? 0) + walk.cost;
    const bytes: TierBytes = { poupanca: least, normal: everything, alta: everything };
    total.poupanca += bytes.poupanca;
    total.normal += bytes.normal;
    total.alta += bytes.alta;
    chunks.push({ id: chunk.id, aabb: chunk.aabb, lods: lods.map((lod) => lod.name), walkGrid: walk.name, bytes, stats: { near, far } });
  }

  const strings = await emit(source.strings);
  addToAll(strings.cost);

  const routes: Manifest["routes"] = [];
  let routeCost = 0;
  for (const route of source.routes) {
    const spline = await emit(route.spline);
    routeCost += spline.cost;
    routes.push({ ...route, spline: spline.name });
  }
  addToAll(routeCost);

  const npcFiles = { crowd: await emitOptional(source.npc.crowd), vendors: await emitOptional(source.npc.vendors), police: await emitOptional(source.npc.police) };
  const lighting = await emitOptional(source.heat.lighting);
  for (const extra of [npcFiles.crowd, npcFiles.vendors, npcFiles.police, lighting]) addToAll(extra?.cost ?? 0);

  // Interiors are downloaded when a player goes in, so they are not part of the district's total.
  const interiors: Manifest["interiors"] = [];
  for (const interior of source.interiors) {
    const built = await emit(interior.file);
    interiors.push({ id: interior.id, file: built.name, bytes: built.cost });
  }

  // First view: what a new player downloads before standing in the world, at the Normal
  // tier: every chunk inside the haze round the first spawn.
  const arrival = source.spawns.find((spawn) => spawn.kind === "first_arrival") ?? source.spawns[0]!;
  const firstView =
    strings.cost +
    routeCost +
    chunks.filter((c) => distanceToChunk(c.aabb, arrival.pos[0], arrival.pos[2]) <= STREAM.normal.farM).reduce((sum, c) => sum + c.bytes.normal, 0);

  const manifest = manifestSchema.parse({
    ...source,
    chunks,
    routes,
    interiors,
    npc: { crowd: npcFiles.crowd?.name ?? null, vendors: npcFiles.vendors?.name ?? null, police: npcFiles.police?.name ?? null },
    heat: { ...source.heat, lighting: lighting?.name ?? null },
    strings: strings.name,
    sizes: { firstView, total },
  });
  await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
