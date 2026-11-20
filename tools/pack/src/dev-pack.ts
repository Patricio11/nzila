// pnpm pack:palette   writes the world's palette for Blender: art/palette.png and art/palette.json
// pnpm pack:dev       builds the development district and puts its pack where the client serves it
//
// The development district is a generated town of boxes (art/scripts/
// make_dev_district.py). It is what streaming, the controller and the camera
// are built against until the first real district exists, and it goes through
// the same road as a real one: Blender, export, build, check.

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { ATLAS_CELLS, ATLAS_CELL_PX, ATLAS_NAMES, atlasPixels, type Registry, type SourceManifest } from "@nzila/world";
import { blender, exportChunks, findBlender, findKtx, optimiseGlb, lightenGlb, packSkinned } from "./assets.ts";
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
  caixa: [number, number, number];
  cantina: [number, number, number];
  seats: { pos: [number, number, number]; facing: number }[];
  tables: { game: "xadrez" | "damas" | "ludo"; pos: [number, number, number]; facing: number; size: number; seats: { pos: [number, number, number]; facing: number }[] }[];
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
  const strings: Record<string, string> = { "world.zz-dev.d1.name": "Bairro de Ensaio", "dev.caixa.name": "Caixa de Ensaio", "dev.caixa.line": "Guarda aqui o que não queres perder na rua, e levanta quando precisares.", "dev.cantina.name": "Cantina de Ensaio", "dev.biscato.pratos.name": "Bacia de Ensaio", "dev.biscato.pratos.line": "Lavam-se pratos aqui. A tia paga na hora.", "dev.cantina.line": "Pão, gasosa, arroz, sabão, velas. Tudo pela grade." };
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
    pois: [
      ...layout.corners.slice(4, 9).map((pos, n) => {
        strings[`dev.poi.${n}.name`] = `Esquina ${n + 1}`;
        strings[`dev.poi.${n}.line`] = `A esquina número ${n + 1} do bairro de ensaio.`;
        return { id: `corner-${n + 1}`, pos, nameKey: `dev.poi.${n}.name`, lineKey: `dev.poi.${n}.line`, positive: true, stamp: false };
      }),
      // The town's one caixa: where money is put in the bank and taken out (Task 4.1).
      { id: "caixa-1", pos: layout.caixa, nameKey: "dev.caixa.name", lineKey: "dev.caixa.line", positive: true, stamp: false, glyph: "banco" },
      { id: "cantina-ensaio", pos: layout.cantina, nameKey: "dev.cantina.name", lineKey: "dev.cantina.line", positive: true, stamp: false, glyph: "cantina" },
      // Plates washed for pay (Task 4.5): five metres east of the cantina's grille, on the pavement kept open for it.
      { id: "biscato-pratos-ensaio", pos: [layout.cantina[0] + 5, layout.cantina[1], layout.cantina[2]], nameKey: "dev.biscato.pratos.name", lineKey: "dev.biscato.pratos.line", positive: true, stamp: false, glyph: "biscatos" },
    ],
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
    seats: layout.seats.map((seat, n) => ({ id: `seat-${n + 1}`, pos: seat.pos, facing: seat.facing })),
    tables: layout.tables.map((table, n) => ({ id: `mesa-${n + 1}`, ...table })),
    water: [{ id: "bay", rect: layout.water.rect, level: layout.water.level }],
    map: "mapa.json",
    strings: "strings.pt-AO.json",
  };
  await writeFile(join(src, "district.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(src, "strings.pt-AO.json"), JSON.stringify(strings));
  const built = await buildPack(src, outDir);
  const problems = await checkPack(outDir, { registry: DEV_REGISTRY, brandTerms: [] });
  if (problems.length > 0) throw new PackError(problems);
  return built;
}

/**
 * Builds a real district from the script that draws it. The script writes the models' source, the
 * walk grids, the routes, the district's words and everything of the manifest but its chunks.
 */
export async function buildDistrict(script: string, workDir: string, outDir: string, registry: Registry, brandTerms: readonly string[]) {
  await rm(workDir, { recursive: true, force: true });
  const src = join(workDir, "district");
  const palette = await writePalette(join(root, "art"));
  await blender(join(scripts, script), [src, palette.json, palette.png]);
  const chunks = await exportChunks(join(src, "district.blend"), src, join(scripts, "export_chunks.py"));
  const partial = JSON.parse(await readFile(join(src, "district.partial.json"), "utf8")) as Omit<SourceManifest, "chunks">;
  const manifest: SourceManifest = { ...partial, chunks: chunks.map((chunk) => ({ id: chunk.id, aabb: chunk.aabb, lods: chunk.lods, walkGrid: `chunks/${chunk.id}.walk.json` })) };
  await writeFile(join(src, "district.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const built = await buildPack(src, outDir);
  const problems = await checkPack(outDir, { registry, brandTerms });
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
  // Each person alone with a skeleton. Not put through the optimiser, which is written for the world's still
  // models (it would merge and move them): only made small where that cannot touch the skeleton (packSkinned).
  let light = 0;
  for (let i = 0; i < list.people.length; i++) {
    const full = await readFile(join(workDir, `pessoa-${i}.glb`));
    await writeFile(join(outDir, `pessoa-${i}.glb`), await packSkinned(full));
    // And the same person in a seventh of the triangles, for the far side of the street (D-0.30): the whole body
    // is fuller since 2026-11-19, the light one stays near what it was (F-215).
    const lighter = await lightenGlb(full, 0.15);
    await writeFile(join(outDir, `pessoa-${i}-leve.glb`), await packSkinned(lighter.bytes));
    light += lighter.triangles;
  }
  Object.assign(list, { light: Math.round(light / list.people.length) });
  await writeFile(join(outDir, "pessoas.json"), JSON.stringify(list));
  return { ...list, bytes: model.length };
}

/** Builds the wardrobe: every body and every head of hair a player may choose, each its own model. */
export async function buildWardrobe(workDir: string, outDir: string): Promise<{ pieces: number; bytes: number }> {
  await rm(workDir, { recursive: true, force: true });
  const palette = await writePalette(join(root, "art"));
  await blender(join(scripts, "make_wardrobe.py"), [workDir, palette.json, palette.png]);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  let bytes = 0;
  let pieces = 0;
  for (const name of await readdir(workDir)) {
    const file = await readFile(join(workDir, name));
    const sent = name.endsWith(".glb") ? await packSkinned(file) : file;
    await writeFile(join(outDir, name), sent);
    if (name.endsWith(".glb")) {
      bytes += sent.length;
      pieces += 1;
    }
  }
  return { pieces, bytes };
}

/** Builds the vehicles the game drives along its routes, each alone as one model. */
export async function buildVehicles(workDir: string, outDir: string): Promise<{ vehicles: { name: string; triangles: number }[]; bytes: number }> {
  await rm(workDir, { recursive: true, force: true });
  const palette = await writePalette(join(root, "art"));
  await blender(join(scripts, "make_vehicles.py"), [workDir, palette.json, palette.png]);
  const list = JSON.parse(await readFile(join(workDir, "veiculos.json"), "utf8")) as { vehicles: { name: string; model: string; triangles: number }[] };
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  let bytes = 0;
  for (const vehicle of list.vehicles) {
    const model = await optimiseGlb(await readFile(join(workDir, vehicle.model)));
    bytes += model.length;
    await writeFile(join(outDir, vehicle.model), model);
  }
  await writeFile(join(outDir, "veiculos.json"), JSON.stringify(list));
  return { ...list, bytes };
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
        const vehicles = await buildVehicles(join(root, "dist", "dev-vehicles"), join(root, "apps", "client", "public", "packs", "dev-vehicles"));
        console.log(`pack dev: ${vehicles.vehicles.map((v) => `${v.name} ${v.triangles} triangles`).join(", ")}, ${(vehicles.bytes / 1024).toFixed(0)} KB together.`);
        const wardrobe = await buildWardrobe(join(root, "dist", "dev-wardrobe"), join(root, "apps", "client", "public", "packs", "guarda-roupa"));
        console.log(`pack dev: a wardrobe of ${wardrobe.pieces} pieces, ${(wardrobe.bytes / 1024).toFixed(0)} KB on disk; a player fetches one body and one head of hair.`);
        console.log(`pack dev: ${people.people.length} people, about ${people.each} triangles each (${(people as { light?: number }).light ?? 0} in the light body), ${(people.bytes / 1024).toFixed(0)} KB together. Shown at /corpo.`);
        console.log(`pack dev: ${manifest.chunks.length} chunks, ${mb(manifest.sizes.total.poupanca)} MB at Poupança, ${mb(manifest.sizes.total.normal)} MB at Normal, at most ${draws} draw call(s) a chunk. Served at /packs/dev/.`);
      } catch (error) {
        if (!(error instanceof PackError)) throw error;
        console.error(`pack dev: ${error.problems.length} problem(s):`);
        for (const problem of error.problems) console.error(`  - ${problem}`);
        process.exitCode = 1;
      }
    }
  } else if (command === "l1") {
    if (!findBlender() || !findKtx()) {
      console.warn("pack l1: SKIPPED, Blender or KTX-Software not installed. Marginal e Baixa was not built.");
    } else {
      try {
        const registry = JSON.parse(await readFile(join(root, "content", "registry.json"), "utf8")) as Registry;
        const brands = (await readFile(join(root, "docs", "legal", "BRAND_TERMS.txt"), "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
        const manifest = await buildDistrict("make_l1.py", join(root, "dist", "l1"), join(root, "apps", "client", "public", "packs", "l1"), registry, brands);
        const mb = (bytes: number): string => (bytes / 1_000_000).toFixed(2);
        const heaviest = Math.max(...manifest.chunks.map((chunk) => chunk.stats.near.tris));
        // The front door states what the first visit costs before a byte of it is fetched (Rule 2): the first
        // view of the district at each tier, with the people and the vehicles a player meets there.
        const extra = async (dir: string): Promise<number> => {
          const folder = join(root, "apps", "client", "public", "packs", dir);
          const names = await readdir(folder).catch(() => [] as string[]);
          let sum = 0;
          for (const name of names) sum += (await stat(join(folder, name))).size;
          return sum;
        };
        const company = (await extra("dev-people")) * 0.6 + (await extra("dev-vehicles"));
        const share = manifest.sizes.total.poupanca / manifest.sizes.total.normal;
        await writeFile(
          join(root, "apps", "client", "public", "packs", "front.json"),
          `${JSON.stringify({ pack: "l1", nameKey: manifest.nameKey, firstView: { normal: Math.round(manifest.sizes.firstView + company), poupanca: Math.round(manifest.sizes.firstView * share + company) } })}\n`,
        );
        console.log(`pack l1: ${manifest.chunks.length} chunks, ${mb(manifest.sizes.total.poupanca)} MB at Poupança, ${mb(manifest.sizes.total.normal)} MB at Normal (budget 8), the heaviest chunk ${heaviest} triangles, ${manifest.pois.length} points of interest. Served at /packs/l1/.`);
      } catch (error) {
        if (!(error instanceof PackError)) throw error;
        console.error(`pack l1: ${error.problems.length} problem(s):`);
        for (const problem of error.problems.slice(0, 40)) console.error(`  - ${problem}`);
        process.exitCode = 1;
      }
    }
  } else {
    console.error("usage: dev-pack.ts palette | dev | l1");
    process.exitCode = 1;
  }
}
