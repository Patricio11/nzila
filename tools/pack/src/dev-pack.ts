// pnpm pack:palette   writes the world's palette for Blender: art/palette.png and art/palette.json
// pnpm pack:dev       builds the development district and puts its pack where the client serves it
//
// The development district is a generated town of boxes (art/scripts/
// make_dev_district.py). It is what streaming, the controller and the camera
// are built against until the first real district exists, and it goes through
// the same road as a real one: Blender, export, build, check.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { ATLAS_CELLS, ATLAS_CELL_PX, ATLAS_NAMES, atlasPixels, type Registry, type SourceManifest } from "@nzila/world";
import { blender, exportChunks, findBlender, findKtx, optimiseGlb } from "./assets.ts";
import { PackError, buildPack } from "./build.ts";
import { checkPack } from "./check.ts";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const scripts = join(root, "art", "scripts");

/** A PNG file from rows of RGBA pixels given top row first, as the atlas is. */
export function png(pixels: Uint8Array, size: number): Uint8Array {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc = (bytes: Uint8Array): number => {
    let r = 0xffffffff;
    for (const byte of bytes) r = table[(r ^ byte) & 255]! ^ (r >>> 8);
    return (r ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  // PNG rows run from the top; each begins with a byte saying it is not filtered.
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rows.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array())]);
}

/** Writes the palette for the people and scripts that model in Blender. */
export async function writePalette(dir: string): Promise<{ png: string; json: string }> {
  await mkdir(dir, { recursive: true });
  const picture = join(dir, "palette.png");
  const list = join(dir, "palette.json");
  await writeFile(picture, png(atlasPixels(), ATLAS_CELLS * ATLAS_CELL_PX));
  const squares = Object.fromEntries(ATLAS_NAMES.map((name, index) => [name, index]));
  await writeFile(list, `${JSON.stringify({ cells: ATLAS_CELLS, squares }, null, 2)}\n`);
  return { png: picture, json: list };
}

/** What art/scripts/make_dev_district.py says about the town it made. */
interface DevLayout {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  spawn: [number, number, number];
  corners: [number, number, number][];
  paragens: [number, number, number][];
  water: { rect: [number, number, number, number]; level: number };
}

export const DEV_REGISTRY: Registry = {
  provinces: [{ id: "zz-dev", nameKey: "world.zz-dev.name", open: false }],
  districts: [{ id: "zz-dev/d1", provinceId: "zz-dev", nameKey: "world.zz-dev.d1.name", open: false }],
};

/** Builds the development district from nothing into `outDir`. Returns its manifest. */
export async function buildDevPack(workDir: string, outDir: string) {
  await rm(workDir, { recursive: true, force: true });
  const src = join(workDir, "district");
  const palette = await writePalette(join(root, "art"));
  await blender(join(scripts, "make_dev_district.py"), [src, palette.json, palette.png]);
  const chunks = await exportChunks(join(src, "district.blend"), src, join(scripts, "export_chunks.py"));

  const layout = JSON.parse(await readFile(join(src, "layout.json"), "utf8")) as DevLayout;
  const strings: Record<string, string> = { "world.zz-dev.d1.name": "Bairro de Ensaio" };
  const manifest: SourceManifest = {
    id: "zz-dev/d1",
    province: "zz-dev",
    version: 2,
    nameKey: "world.zz-dev.d1.name",
    artPass: 0,
    bounds: layout.bounds,
    ambient: { set: "dev", soundBeds: [] },
    chunks: chunks.map((chunk) => ({ id: chunk.id, aabb: chunk.aabb, lods: chunk.lods, walkGrid: `chunks/${chunk.id}.walk.json` })),
    spawns: [{ id: "arrival", pos: layout.spawn, facing: 90, kind: "first_arrival" }],
    gateways: [],
    pois: layout.corners.slice(4, 9).map((pos, n) => {
      strings[`dev.poi.${n}.name`] = `Esquina ${n + 1}`;
      strings[`dev.poi.${n}.line`] = `A esquina número ${n + 1} do bairro de ensaio.`;
      return { id: `corner-${n + 1}`, pos, nameKey: `dev.poi.${n}.name`, lineKey: `dev.poi.${n}.line`, positive: true, stamp: false };
    }),
    routes: [],
    paragens: layout.paragens.map((pos, n) => {
      strings[`dev.paragem.${n}`] = `Paragem ${n + 1}`;
      return { id: `p-${n + 1}`, pos, nameKey: `dev.paragem.${n}` };
    }),
    lots: [],
    residences: [],
    interiors: [],
    npc: { crowd: null, vendors: null, police: null },
    heat: { lighting: null, policePosts: [], override: null },
    adSlots: [],
    water: [{ id: "bay", rect: layout.water.rect, level: layout.water.level }],
    strings: "strings.pt-AO.json",
  };
  await writeFile(join(src, "district.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(src, "strings.pt-AO.json"), JSON.stringify(strings));
  const built = await buildPack(src, outDir);
  const problems = await checkPack(outDir, { registry: DEV_REGISTRY, brandTerms: [] });
  if (problems.length > 0) throw new PackError(problems);
  return built;
}

/** Builds the line of people the /corpo page shows (art/scripts/make_people.py) into `outDir`. */
export async function buildPeople(workDir: string, outDir: string): Promise<{ people: unknown[]; triangles: number; each: number; bytes: number }> {
  await rm(workDir, { recursive: true, force: true });
  const palette = await writePalette(join(root, "art"));
  await blender(join(scripts, "make_people.py"), [workDir, palette.json, palette.png]);
  const model = await optimiseGlb(await readFile(join(workDir, "pessoas.glb")));
  const list = JSON.parse(await readFile(join(workDir, "pessoas.json"), "utf8")) as { people: unknown[]; triangles: number; each: number };
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "pessoas.glb"), model);
  await writeFile(join(outDir, "pessoas.json"), JSON.stringify(list));
  return { ...list, bytes: model.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "palette") {
    const written = await writePalette(join(root, "art"));
    console.log(`pack palette: ${written.png} and ${written.json}`);
  } else if (command === "dev") {
    const missing = [findBlender() ? null : "Blender", findKtx() ? null : "KTX-Software"].filter(Boolean);
    if (missing.length > 0) {
      // Not an error: the client runs without the development district, and the tests that need it say they were skipped.
      console.warn(`pack dev: SKIPPED, ${missing.join(" and ")} not installed. The development district was not built.`);
    } else {
      try {
        const out = join(root, "apps", "client", "public", "packs", "dev");
        const manifest = await buildDevPack(join(root, "dist", "dev-district"), out);
        const mb = (bytes: number): string => (bytes / 1_000_000).toFixed(2);
        const draws = Math.max(...manifest.chunks.map((chunk) => chunk.stats.far.draws));
        const people = await buildPeople(join(root, "dist", "dev-people"), join(root, "apps", "client", "public", "packs", "dev-people"));
        console.log(`pack dev: ${people.people.length} people, about ${people.each} triangles each, ${(people.bytes / 1024).toFixed(0)} KB together. Shown at /corpo.`);
        console.log(`pack dev: ${manifest.chunks.length} chunks, ${mb(manifest.sizes.total.poupanca)} MB at Poupança, ${mb(manifest.sizes.total.normal)} MB at Normal, at most ${draws} draw call(s) a chunk. Served at /packs/dev/.`);
      } catch (error) {
        if (!(error instanceof PackError)) throw error;
        console.error(`pack dev: ${error.problems.length} problem(s):`);
        for (const problem of error.problems) console.error(`  - ${problem}`);
        process.exitCode = 1;
      }
    }
  } else {
    console.error("usage: dev-pack.ts palette | dev");
    process.exitCode = 1;
  }
}
