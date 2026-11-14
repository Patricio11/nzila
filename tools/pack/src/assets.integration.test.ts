// The whole road from a Blender file to a pack that may be published, run for
// real: Blender builds a small test scene, exports it as chunks with two
// levels of detail, and `pack build` compresses, measures and hashes them.
//
// It needs Blender and KTX-Software on the machine. Where either is missing
// (CI, today) every test here is skipped and the reason is printed, so a green
// run on such a machine does not claim the asset pipeline was checked.

import { PACK_BUDGETS } from "@nzila/world";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { type Registry, type SourceManifest } from "@nzila/world";
import { MeshoptDecoder } from "meshoptimizer";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { blender, exportChunks, findBlender, findKtx, optimiseGlb, type ExportedChunk } from "./assets.ts";
import { buildPack } from "./build.ts";
import { checkPack } from "./check.ts";
import { buildDevPack } from "./dev-pack.ts";
import { glbStats } from "./files.ts";

const scripts = fileURLToPath(new URL("../../../art/scripts/", import.meta.url));
const missing = [findBlender() ? null : "Blender", findKtx() ? null : "KTX-Software"].filter(Boolean);
if (missing.length > 0) console.warn(`assets: SKIPPED, ${missing.join(" and ")} not installed. The asset pipeline was not checked on this machine.`);

const registry: Registry = {
  provinces: [{ id: "zz-tst", nameKey: "world.zz-tst.name", open: true }],
  districts: [{ id: "zz-tst/d1", provinceId: "zz-tst", nameKey: "world.zz-tst.d1.name", open: true }],
};

describe.skipIf(missing.length > 0)("from Blender to a pack", () => {
  let dir: string;
  let src: string;
  let chunks: ExportedChunk[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nzila-assets-"));
    src = join(dir, "district");
    await blender(join(scripts, "make_test_block.py"), [join(dir, "block.blend")]);
    chunks = await exportChunks(join(dir, "block.blend"), src, join(scripts, "export_chunks.py"));
  }, 180_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("Blender cuts the scene into chunks, each with its box in the game's coordinates", () => {
    expect(chunks.map((c) => c.id)).toEqual(["c-00-00", "c-01-00"]);
    // Blender (x, y, z) is the game's (x, z, -y): the scene runs toward +X and -Y, so the game's Z is positive.
    const [west, east] = chunks;
    expect(west!.aabb[0]).toBeGreaterThanOrEqual(0);
    expect(west!.aabb[3]).toBeLessThanOrEqual(64);
    expect(east!.aabb[0]).toBeGreaterThanOrEqual(64);
    expect(east!.aabb[3]).toBeLessThanOrEqual(128);
    for (const chunk of chunks) {
      expect(chunk.aabb[2]).toBeGreaterThanOrEqual(0);
      expect(chunk.aabb[5]).toBeLessThanOrEqual(64);
      // The tallest block is 15 m.
      expect(chunk.aabb[1]).toBeCloseTo(0, 1);
      expect(chunk.aabb[4]).toBeCloseTo(15, 1);
      expect(chunk.lods).toEqual([`chunks/${chunk.id}.l0.glb`, `chunks/${chunk.id}.l1.glb`]);
    }
  });

  test("each chunk has two levels of detail, the second with far fewer triangles", async () => {
    for (const chunk of chunks) {
      const near = glbStats(await readFile(join(src, chunk.lods[0]!)));
      const far = glbStats(await readFile(join(src, chunk.lods[1]!)));
      // A ground plane, four boxes and three round trees.
      expect(near.draws).toBe(8);
      expect(near.tris).toBeGreaterThan(2500);
      expect(far.draws).toBe(8);
      expect(far.tris).toBeLessThan(near.tris * 0.5);
      // The ground and the four boxes are left whole in the reduced model: 2 + 4 x 12 triangles.
      // Only the round trees had anything to give up. A box "simplified" is a box wrecked.
      expect(far.tris).toBeGreaterThan(50 + 3 * 100);
    }
  });

  test("compression: geometry with Meshopt, textures as KTX2, smaller, and still the same model", async () => {
    const raw = await readFile(join(src, chunks[0]!.lods[0]!));
    const small = await optimiseGlb(raw);
    expect(small.length).toBeLessThan(raw.length * 0.6);

    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const document = await io.readBinary(small);
    const used = document.getRoot().listExtensionsUsed().map((extension) => extension.extensionName);
    expect(used).toContain("EXT_meshopt_compression");
    expect(used).toContain("KHR_texture_basisu");
    // One texture is left: the painted ground's. The palette's own picture is gone, because the game already has it.
    const textures = document.getRoot().listTextures();
    expect(textures.length).toBe(1);
    expect(document.getRoot().listMaterials().map((m) => [m.getName(), m.getBaseColorTexture() !== null]).sort()).toEqual([["detail-ground", true], ["palette", false]]);
    for (const texture of textures) {
      expect(texture.getMimeType()).toBe("image/ktx2");
      // KTX2 files begin with these bytes.
      expect([...texture.getImage()!.subarray(0, 8)]).toEqual([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb]);
    }
    // Eight objects have become two draw calls, one a material, with every triangle still there.
    expect(glbStats(raw).draws).toBe(8);
    expect(glbStats(small)).toEqual({ tris: glbStats(raw).tris, draws: 2 });
    // Doing it again changes nothing more: the same pack builds from an already compressed file.
    const again = await optimiseGlb(small);
    expect(glbStats(again)).toEqual(glbStats(small));
    expect(again.length).toBeLessThanOrEqual(small.length * 1.02);
  }, 120_000);

  test("the exported chunks build into a pack that may be published, inside every budget", async () => {
    const walk = (cellX0: number) => JSON.stringify({ cellMm: 500, cellX0, cellZ0: 0, rows: Array.from({ length: 128 }, () => ".".repeat(128)) });
    const strings: Record<string, string> = { "world.zz-tst.d1.name": "Bairro de Teste" };
    const manifest: SourceManifest = {
      id: "zz-tst/d1",
      province: "zz-tst",
      version: 1,
      nameKey: "world.zz-tst.d1.name",
      artPass: 0,
      bounds: { minX: 0, minZ: 0, maxX: 128, maxZ: 64 },
      ambient: { set: "coast-test", soundBeds: [] },
      chunks: chunks.map((chunk) => ({ id: chunk.id, aabb: chunk.aabb, lods: chunk.lods, walkGrid: `chunks/${chunk.id}.walk.json` })),
      spawns: [{ id: "arrival", pos: [5, 0, 5], facing: 0, kind: "first_arrival" }],
      gateways: [],
      pois: [1, 2, 3, 4, 5].map((n) => {
        strings[`d1.poi.${n}.name`] = `Lugar ${n}`;
        strings[`d1.poi.${n}.line`] = `Uma linha sobre o lugar ${n}.`;
        return { id: `poi-${n}`, pos: [10 * n, 0, 30], nameKey: `d1.poi.${n}.name`, lineKey: `d1.poi.${n}.line`, positive: true, stamp: false };
      }),
      routes: [],
      paragens: [],
      lots: [],
      residences: [],
      interiors: [],
      npc: { crowd: null, vendors: null, police: null },
      heat: { lighting: null, policePosts: [], override: null },
      adSlots: [],
      water: [],
      strings: "strings.pt-AO.json",
    };
    await writeFile(join(src, "district.json"), JSON.stringify(manifest));
    await writeFile(join(src, "strings.pt-AO.json"), JSON.stringify(strings));
    await writeFile(join(src, "chunks/c-00-00.walk.json"), walk(0));
    await writeFile(join(src, "chunks/c-01-00.walk.json"), walk(128));

    const out = join(dir, "pack");
    const built = await buildPack(src, out);
    // What the build measured, from the compressed files it wrote.
    for (const chunk of built.chunks) {
      expect(chunk.stats.near.tris).toBeGreaterThan(2500);
      expect(chunk.stats.near.draws).toBe(2);
      expect(chunk.stats.far.draws).toBe(2);
      expect(chunk.stats.far.tris).toBeLessThan(chunk.stats.near.tris * 0.5);
      const rawBytes = (await stat(join(src, `chunks/${chunk.id}.l0.glb`))).size + (await stat(join(src, `chunks/${chunk.id}.l1.glb`))).size;
      expect(chunk.bytes.normal).toBeLessThan(rawBytes * 0.7);
      // Poupança downloads only the reduced model.
      expect(chunk.bytes.poupanca).toBeLessThan(chunk.bytes.normal * 0.6);
    }
    expect(await checkPack(out, { registry, brandTerms: [] })).toEqual([]);

    // The same source builds the same pack, byte for byte: compression is deterministic.
    const twice = await buildPack(src, join(dir, "pack-again"));
    expect(twice).toEqual(built);
  }, 180_000);
});

describe.skipIf(missing.length > 0)("the development district", () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("builds from nothing into a pack that may be published: twelve chunks, one draw call each, inside the reference phone's budgets", async () => {
    dir = await mkdtemp(join(tmpdir(), "nzila-dev-"));
    const manifest = await buildDevPack(join(dir, "work"), join(dir, "pack"));
    expect(manifest.chunks.map((chunk) => chunk.id)).toEqual(["c-00-00", "c-00-01", "c-00-02", "c-01-00", "c-01-01", "c-01-02", "c-02-00", "c-02-01", "c-02-02", "c-03-00", "c-03-01", "c-03-02"]);
    for (const chunk of manifest.chunks) {
      // Everything in a chunk shares the palette, so the whole chunk is one draw call at either level of detail.
      expect(chunk.stats.near.draws).toBe(1);
      expect(chunk.stats.far.draws).toBe(1);
      expect(chunk.stats.far.tris).toBeLessThan(chunk.stats.near.tris);
      // The reduced model is made on purpose by the kit (simpler trees, no sills or parapets), not by
      // crushing the full one: it is well under half the triangles and still a street.
      expect(chunk.stats.far.tris).toBeGreaterThan(800);
      expect(chunk.stats.far.tris).toBeLessThan(chunk.stats.near.tris * 0.5);
      // Rule 1: a chunk up close is a small share of the 120 000 triangles in view.
      expect(chunk.stats.near.tris).toBeLessThan(12_000);
      // No texture travels with it. The budget for a chunk at Normal is 400 KB; this is a full street of
      // buildings and trees in well under that.
      expect(chunk.bytes.normal).toBeLessThan(PACK_BUDGETS.chunkNormalBytes * 0.7);
      // Every face still knows its square of the palette.
      expect(Buffer.from(await readFile(join(dir, "pack", chunk.lods[0]!))).includes("TEXCOORD_0")).toBe(true);
      expect(chunk.walkGrid).toMatch(/\.walk\.[0-9a-f]{12}\.walkz$/);
    }
    // The whole district is under a third of a district's budget, and the reference phone downloads a third of that.
    expect(manifest.sizes.total.normal).toBeLessThan(PACK_BUDGETS.districtNormalBytes / 3);
    expect(manifest.sizes.total.poupanca).toBeLessThan(manifest.sizes.total.normal * 0.4);
    // The bay is in the manifest, and the paragens can be walked to (pack check passed inside buildDevPack).
    expect(manifest.water.map((sheet) => sheet.id)).toEqual(["bay"]);
    expect(manifest.paragens.length).toBe(4);
    const files = await readdir(join(dir, "pack"));
    expect(files.filter((name) => name.endsWith(".ktx2"))).toEqual([]);
  }, 300_000);
});
