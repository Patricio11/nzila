// Builds a small made-up district in a temporary directory and checks it,
// then breaks it one way at a time to see that each problem is caught and
// named. The place and its names are fixtures, not content.

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeWalkGrid, distanceToChunk, manifestSchema, type Registry, type SourceManifest } from "@nzila/world";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PackError, buildPack } from "./build.ts";
import { checkPack, parseBrandTerms } from "./check.ts";
import { contentHash, glbStats, hashInName, hashedName, packWalkGrid, transferBytes, unpackWalkGrid } from "./files.ts";

/** A minimal .glb: `meshes` meshes, each drawn once, of `tris` triangles, padded to roughly `padBytes`. */
function glb(meshes: number, tris: number, padBytes = 0, indexed = true): Uint8Array {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    nodes: [...Array.from({ length: meshes }, (_, i) => ({ mesh: i })), { name: "empty" }],
    meshes: Array.from({ length: meshes }, () => ({
      primitives: [indexed ? { indices: 0, attributes: { POSITION: 1 } } : { attributes: { POSITION: 0 } }, { mode: 1, attributes: { POSITION: 1 } }],
    })),
    accessors: [{ count: tris * 3 }, { count: tris * 2 }],
  });
  const text = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4));
  const bytes = new Uint8Array(20 + text.length + padBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(text, 20);
  // Padding that does not compress, standing in for geometry.
  for (let i = 20 + text.length; i < bytes.length; i++) bytes[i] = (i * 2654435761) >>> 24;
  return bytes;
}

const registry: Registry = {
  provinces: [{ id: "zz-tst", nameKey: "world.zz-tst.name", open: true }],
  districts: [
    { id: "zz-tst/d1", provinceId: "zz-tst", nameKey: "world.zz-tst.d1.name", open: true },
    { id: "zz-tst/d2", provinceId: "zz-tst", nameKey: "world.zz-tst.d2.name", open: false },
  ],
};
const context = { registry, brandTerms: parseBrandTerms("# a comment\nMegaCola\nBanco Real # trailing\n\n") };

// Two chunks side by side, 16 m each, a road through both, and a walled yard nobody can reach.
const WEST = { cellMm: 500, cellX0: 0, cellZ0: 0, rows: Array.from({ length: 32 }, (_, z) => (z === 15 || z === 16 ? "=".repeat(32) : ".".repeat(32))) };
const EAST = {
  cellMm: 500,
  cellX0: 32,
  cellZ0: 0,
  rows: Array.from({ length: 32 }, (_, z) => {
    if (z === 15 || z === 16) return "=".repeat(32);
    if (z >= 2 && z <= 8) return `${".".repeat(20)}#${z === 2 || z === 8 ? "#####" : "....#".replace(/^\./, ".")}${".".repeat(6)}`;
    return ".".repeat(32);
  }),
};

function district(): SourceManifest {
  const poi = (n: number, positive = true) => ({ id: `poi-${n}`, pos: [2 + n, 0, 4] as [number, number, number], nameKey: `d1.poi.${n}.name`, lineKey: `d1.poi.${n}.line`, positive, stamp: false });
  return {
    id: "zz-tst/d1",
    province: "zz-tst",
    version: 3,
    nameKey: "world.zz-tst.d1.name",
    artPass: 0,
    bounds: { minX: 0, minZ: 0, maxX: 32, maxZ: 16 },
    ambient: { set: "coast-test", soundBeds: ["sea"] },
    chunks: [
      { id: "c-00-00", aabb: [0, 0, 0, 16, 10, 16], lods: ["chunks/c-00-00.l0.glb", "chunks/c-00-00.l1.glb", "chunks/c-00-00.imp.ktx2"], walkGrid: "chunks/c-00-00.walk.json" },
      { id: "c-01-00", aabb: [16, 0, 0, 32, 10, 16], lods: ["chunks/c-01-00.l0.glb"], walkGrid: "chunks/c-01-00.walk.json" },
    ],
    spawns: [{ id: "arrival", pos: [3, 0, 3], facing: 90, kind: "first_arrival" }, { id: "back", pos: [30, 0, 12], facing: 0, kind: "respawn" }],
    gateways: [{ id: "bridge", pos: [31, 0, 8], to: "zz-tst/d2", arrive: "bridge", mode: "walk", openFlag: "district.zz-tst.d2.open" }],
    pois: [1, 2, 3, 4, 5].map((n) => poi(n)).concat(poi(6, false)),
    routes: [{ id: "r-loop", kind: "candongueiro", spline: "routes/r-loop.json", stops: ["p-square"], stopPoints: [0], headwaySeconds: 90, fareKey: "fares.candongueiroLocal" }],
    paragens: [{ id: "p-square", pos: [8, 0, 7], nameKey: "d1.paragem.square" }],
    lots: [{ id: "lot-1", pos: [12, 0, 4], front: "shopfront-a", interior: "int-shop", kinds: ["cantina"], rentKey: "rent.lot.d1.a", adSlots: ["window"] }],
    residences: [{ id: "res-1", pos: [14, 0, 12], units: 20, layouts: ["quarto", "t1"], rentKey: "rent.home.d1.a" }],
    interiors: [{ id: "int-shop", file: "interiors/int-shop.glb" }],
    npc: { crowd: "npc/crowd.json", vendors: null, police: null },
    heat: { lighting: null, policePosts: [[10, 0, 10]], override: null },
    adSlots: [{ id: "outdoor-1", kind: "outdoor", pos: [5, 6, 5], size: [6, 3] }],
    strings: "strings.pt-AO.json",
  };
}

function strings(): Record<string, string> {
  const s: Record<string, string> = { "world.zz-tst.d1.name": "Bairro de Teste", "d1.paragem.square": "Largo" };
  for (let n = 1; n <= 6; n++) {
    s[`d1.poi.${n}.name`] = `Lugar ${n}`;
    s[`d1.poi.${n}.line`] = `Uma linha sobre o lugar ${n}.`;
  }
  return s;
}

/** The models in this file are stand-ins with no geometry in them, so they are not compressed. */
const RAW = { optimise: false };

let tmp: string;
let serial = 0;

/** Writes a district to disk with optional changes, builds it, and returns where it went. */
async function make(change: { manifest?: (m: SourceManifest) => void; files?: Record<string, Uint8Array | string | null> } = {}) {
  const dir = join(tmp, `case-${++serial}`);
  const src = join(dir, "src");
  const out = join(dir, "out");
  const manifest = district();
  change.manifest?.(manifest);
  const files: Record<string, Uint8Array | string | null> = {
    "district.json": JSON.stringify(manifest),
    "chunks/c-00-00.l0.glb": glb(12, 2000, 60_000),
    "chunks/c-00-00.l1.glb": glb(3, 400, 9000),
    "chunks/c-00-00.imp.ktx2": new Uint8Array(3000).fill(7),
    "chunks/c-00-00.walk.json": JSON.stringify(WEST),
    "chunks/c-01-00.l0.glb": glb(10, 1500, 40_000),
    "chunks/c-01-00.walk.json": JSON.stringify(EAST),
    "routes/r-loop.json": JSON.stringify({ points: [[8, 0, 7.75], [24, 0, 7.75], [24, 0, 8.25], [8, 0, 8.25]] }),
    "interiors/int-shop.glb": glb(4, 300, 5000),
    "npc/crowd.json": JSON.stringify({ hours: {} }),
    "strings.pt-AO.json": JSON.stringify(strings()),
    ...change.files,
  };
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    await mkdir(join(src, path, ".."), { recursive: true });
    await writeFile(join(src, path), content);
  }
  return { src, out };
}
async function problemsOf(change: Parameters<typeof make>[0]): Promise<string[]> {
  const { src, out } = await make(change);
  await buildPack(src, out, RAW);
  return checkPack(out, context);
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "nzila-pack-"));
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("file helpers", () => {
  test("a hashed name carries the hash of the content and keeps the extension", () => {
    const bytes = new TextEncoder().encode("olá");
    expect(hashedName("chunks/c-01.l0.glb", bytes)).toBe(`c-01.l0.${contentHash(bytes)}.glb`);
    expect(hashedName("c.walk.json", bytes, ".bin")).toBe(`c.walk.${contentHash(bytes)}.bin`);
    expect(hashedName("LICENSE", bytes)).toBe(`LICENSE.${contentHash(bytes)}`);
    expect(hashInName(`c-01.l0.${contentHash(bytes)}.glb`)).toBe(contentHash(bytes));
    expect(hashInName(`LICENSE.${contentHash(bytes)}`)).toBe(contentHash(bytes));
    expect(hashInName("c-01.l0.glb")).toBeNull();
  });

  test("text counts at its gzipped size, models and textures as they are", () => {
    const repetitive = new TextEncoder().encode("a".repeat(10_000));
    expect(transferBytes("x.json", repetitive)).toBeLessThan(200);
    expect(transferBytes("x.glb", repetitive)).toBe(10_000);
    expect(transferBytes("x.ktx2", repetitive)).toBe(10_000);
  });

  test("triangles and draw calls are read from a .glb", () => {
    expect(glbStats(glb(12, 2000))).toEqual({ tris: 24_000, draws: 12 });
    expect(glbStats(glb(2, 50, 0, false))).toEqual({ tris: 100, draws: 2 });
    expect(glbStats(glb(0, 0))).toEqual({ tris: 0, draws: 0 });
    expect(() => glbStats(new Uint8Array(30))).toThrow(/not a .glb/);
    const broken = glb(1, 1);
    new DataView(broken.buffer).setUint32(16, 0, true);
    expect(() => glbStats(broken)).toThrow(/scene description/);
    const empty = new TextEncoder().encode("{}  ");
    const bare = new Uint8Array(20 + empty.length);
    const view = new DataView(bare.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(12, empty.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    bare.set(empty, 20);
    expect(glbStats(bare)).toEqual({ tris: 0, draws: 0 });
  });

  test("distance from a point to a chunk", () => {
    const aabb = [16, 0, 0, 32, 10, 16];
    expect(distanceToChunk(aabb, 20, 5)).toBe(0);
    expect(distanceToChunk(aabb, 10, 5)).toBe(6);
    expect(distanceToChunk(aabb, 35, 20)).toBe(5);
  });

  test("a walk grid packs small and unpacks to itself, the same on every machine", () => {
    const grid = new Uint8Array(23 + 128 * 128 * 3).fill(1);
    const packed = packWalkGrid(grid);
    expect(packed.length).toBeLessThan(grid.length / 30);
    expect([...unpackWalkGrid(packed)]).toEqual([...grid]);
    // No header with a date or a system in it: the bytes depend on the grid alone.
    expect([...packWalkGrid(grid)]).toEqual([...packed]);
    expect(transferBytes("c.walk.abc.walkz", packed)).toBe(packed.length);
  });

  test("brand terms: comments and blank lines are skipped", () => {
    expect(context.brandTerms).toEqual(["MegaCola", "Banco Real"]);
  });
});

describe("pack build", () => {
  test("writes a flat directory of hashed files and a manifest that measures them", async () => {
    const { src, out } = await make();
    const manifest = await buildPack(src, out, RAW);
    const names = await readdir(out);
    expect(names).toContain("manifest.json");
    expect(names.length).toBe(11);
    for (const name of names.filter((n) => n !== "manifest.json")) {
      expect(hashInName(name)).toBe(contentHash(await readFile(join(out, name))));
    }
    expect(manifestSchema.parse(JSON.parse(await readFile(join(out, "manifest.json"), "utf8")))).toEqual(manifest);

    const [west, east] = manifest.chunks;
    expect(west!.stats).toEqual({ near: { tris: 24_000, draws: 12 }, far: { tris: 1200, draws: 3 } });
    // With one level of detail, far is the same as near.
    expect(east!.stats.far).toEqual(east!.stats.near);
    // Poupança loads only the least detailed model; Normal loads all of it.
    expect(west!.bytes.poupanca).toBeLessThan(west!.bytes.normal / 4);
    expect(west!.bytes.normal).toBeGreaterThan(72_000);
    expect(manifest.sizes.total.normal).toBeGreaterThan(west!.bytes.normal + east!.bytes.normal);
    expect(manifest.sizes.total.poupanca).toBeLessThan(manifest.sizes.total.normal);
    // The interior is downloaded at the door, so it is not in the total.
    expect(manifest.interiors[0]!.bytes).toBeGreaterThan(5000);
    expect(manifest.sizes.total.normal).toBeLessThan(west!.bytes.normal + east!.bytes.normal + 2000);
    expect(manifest.sizes.firstView).toBeLessThanOrEqual(manifest.sizes.total.normal);

    // The hand-written walk grid was compiled and packed: a thousand cells in well under a hundred bytes.
    expect(west!.walkGrid).toMatch(/\.walk\.[0-9a-f]{12}\.walkz$/);
    const packed = await readFile(join(out, west!.walkGrid));
    expect(packed.length).toBeLessThan(100);
    expect(decodeWalkGrid(unpackWalkGrid(packed)).width).toBe(32);
  });

  test("the same source builds the same pack, byte for byte", async () => {
    const a = await make();
    const b = await make();
    expect(await buildPack(a.src, a.out, RAW)).toEqual(await buildPack(b.src, b.out, RAW));
  });

  test("a compiled walk grid is taken as it is, and missing optional files are null", async () => {
    const first = await make();
    const built = await buildPack(first.src, first.out, RAW);
    const compiled = unpackWalkGrid(await readFile(join(first.out, built.chunks[0]!.walkGrid)));
    const { src, out } = await make({
      manifest: (m) => {
        m.chunks[0]!.walkGrid = "chunks/c-00-00.walk.bin";
        m.npc.crowd = null;
        m.heat.lighting = "light.bin";
        m.spawns[0]!.kind = "respawn";
      },
      files: { "chunks/c-00-00.walk.bin": compiled, "light.bin": new Uint8Array(64) },
    });
    const manifest = await buildPack(src, out, RAW);
    // The same grid, given already compiled, packs to the same file.
    expect(manifest.chunks[0]!.walkGrid).toBe(built.chunks[0]!.walkGrid);
    expect(manifest.npc.crowd).toBeNull();
    expect(manifest.heat.lighting).toMatch(/^light\.[0-9a-f]{12}\.bin$/);
    expect(await checkPack(out, context)).toEqual([]);
  });

  test("a chunk with no model at all still builds, and costs nothing to draw", async () => {
    const { src, out } = await make({ manifest: (m) => void (m.chunks[1]!.lods = ["chunks/c-00-00.imp.ktx2"]) });
    const manifest = await buildPack(src, out, RAW);
    expect(manifest.chunks[1]!.stats.near).toEqual({ tris: 0, draws: 0 });
  });

  test("a source manifest with mistakes is refused with every mistake named", async () => {
    const { src, out } = await make({
      manifest: (m) => {
        (m as Record<string, unknown>).danger = "high";
        m.id = "Luanda 1";
        m.pois[0]!.nameKey = "Um nome escrito aqui";
      },
    });
    const error = await buildPack(src, out, RAW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackError);
    const problems = (error as PackError).problems.join("\n");
    expect(problems).toMatch(/^id: /m);
    expect(problems).toMatch(/pois\.0\.nameKey: /);
    expect(problems).toMatch(/danger/);
  });

  test("a file that is named but missing is refused by name", async () => {
    const { src, out } = await make({ files: { "chunks/c-01-00.l0.glb": null } });
    await expect(buildPack(src, out, RAW)).rejects.toThrow("chunks/c-01-00.l0.glb: named in district.json but not found");
  });
});

describe("pack check", () => {
  test("a good pack may be published", async () => {
    expect(await problemsOf({})).toEqual([]);
  });

  test("no manifest, or one that does not fit the schema", async () => {
    const { src, out } = await make();
    expect(await checkPack(join(out, "nowhere"), context)).toEqual(["manifest.json: missing or not JSON. Run `pack build` first."]);
    const manifest = await buildPack(src, out, RAW);
    await writeFile(join(out, "manifest.json"), JSON.stringify({ ...manifest, version: 0 }));
    expect(await checkPack(out, context)).toEqual([expect.stringMatching(/^version: /)]);
  });

  test("a file changed or removed after the build", async () => {
    const { src, out } = await make();
    const manifest = await buildPack(src, out, RAW);
    await writeFile(join(out, manifest.strings), "{}");
    await rm(join(out, manifest.chunks[1]!.lods[0]!));
    expect(await checkPack(out, context)).toEqual([
      `${manifest.chunks[1]!.lods[0]}: named in the manifest but not in the pack`,
      `${manifest.strings}: its content does not match the hash in its name`,
    ]);
  });

  test("a manifest edited by hand to hide a size", async () => {
    const { src, out } = await make();
    const manifest = await buildPack(src, out, RAW);
    manifest.chunks[0]!.bytes.normal = 10;
    manifest.chunks[0]!.bytes.poupanca = 20;
    manifest.sizes.total.normal = 30;
    await writeFile(join(out, "manifest.json"), JSON.stringify(manifest));
    const problems = await checkPack(out, context);
    expect(problems).toContainEqual(expect.stringMatching(/chunks\.c-00-00: the manifest says 10 bytes at Normal, the files are \d+/));
    expect(problems).toContain("chunks.c-00-00: a lower tier may not cost more than a higher one");
    expect(problems).toContain("sizes.total.normal: smaller than the chunks it must contain");
  });

  test("the data budgets: a chunk, the district, the first view", async () => {
    expect(await problemsOf({ files: { "chunks/c-01-00.l0.glb": glb(10, 1500, 450_000) } })).toEqual([
      expect.stringMatching(/^chunks\.c-01-00: \d+ bytes at Normal, over the 400000 of one chunk$/),
    ]);

    // Twenty-four full chunks: each within its budget, together over the district's and the first view's.
    const many: Record<string, Uint8Array | string> = {};
    const problems = await problemsOf({
      manifest: (m) => {
        for (let i = 2; i < 26; i++) {
          m.chunks.push({ id: `c-big-${i}`, aabb: [0, 0, 16, 16, 10, 32], lods: [`chunks/big-${i}.glb`], walkGrid: `chunks/big-${i}.walk.json` });
        }
      },
      files: Object.assign(many, ...Array.from({ length: 24 }, (_, k) => ({
        [`chunks/big-${k + 2}.glb`]: glb(1, 10, 380_000 + k),
        [`chunks/big-${k + 2}.walk.json`]: JSON.stringify({ cellMm: 500, cellX0: 0, cellZ0: 32 + k * 2, rows: ["..", ".."] }),
      }))),
    });
    expect(problems).toEqual([
      expect.stringMatching(/^sizes\.total\.normal: \d+ bytes, over the 8000000 of a district$/),
      expect.stringMatching(/^sizes\.firstView: \d+ bytes, over the 5700000 left for a first play$/),
    ]);
  });

  test("the drawing budgets, estimated from where players stand, as the reference phone streams", async () => {
    // The reference phone only ever draws a chunk's reduced model, so that is the one that must be light.
    const problems = await problemsOf({ files: { "chunks/c-00-00.l1.glb": glb(70, 2000, 9000) } });
    expect(problems).toEqual([
      "spawns.arrival: about 155000 triangles in view, over 120000",
      "spawns.arrival: about 80 draw calls in view, over 60",
      "spawns.back: about 155000 triangles in view, over 120000",
      "spawns.back: about 80 draw calls in view, over 60",
      "paragens.p-square: about 155000 triangles in view, over 120000",
      "paragens.p-square: about 80 draw calls in view, over 60",
    ]);
    // A heavy full-detail model is not held against the reference phone, which never downloads it.
    expect(await problemsOf({ files: { "chunks/c-00-00.l0.glb": glb(70, 2000, 60_000) } })).toEqual([]);
  });

  test("a chunk lost in the haze is not counted", async () => {
    const heavy = { "chunks/c-00-00.l1.glb": glb(70, 2000, 9000) };
    const moved = (metres: number) => (m: SourceManifest) => {
      m.chunks[0]!.aabb = [0, 0, metres, 16, 10, metres + 16];
      m.chunks[0]!.walkGrid = "chunks/far.walk.json";
      for (const list of [m.spawns, m.pois, m.paragens, m.lots, m.residences, m.gateways]) for (const item of list) item.pos = [20, 0, 12];
    };
    const farWalk = (metres: number) => JSON.stringify({ ...WEST, cellZ0: metres * 2 });
    // 60 m away it is inside the reference phone's 90 m and counts; 150 m away it is in the haze.
    expect((await problemsOf({ manifest: moved(76), files: { ...heavy, "chunks/far.walk.json": farWalk(76) } })).length).toBeGreaterThan(0);
    expect(await problemsOf({ manifest: moved(150), files: { ...heavy, "chunks/far.walk.json": farWalk(150) } })).toEqual([]);
  });

  test("places nobody can walk to", async () => {
    const problems = await problemsOf({
      manifest: (m) => {
        m.pois[1]!.pos = [28, 0, 2.5]; // inside the walled yard
        m.lots[0]!.pos = [60, 0, 4]; // off the map
        m.paragens[0]!.pos = [28.2, 0, 2.2]; // also in the yard
      },
    });
    expect(problems).toEqual([
      "paragens.p-square: cannot be walked to from spawns.arrival",
      "lots.lot-1: cannot be walked to from spawns.arrival",
      "pois.poi-2: cannot be walked to from spawns.arrival",
    ]);
  });

  test("a wall too high to climb cuts the district in two", async () => {
    const heights = WEST.rows.map(() => Array.from({ length: 32 }, (_, x) => (x >= 16 ? 200 : 0)));
    const problems = await problemsOf({ files: { "chunks/c-00-00.walk.json": JSON.stringify({ ...WEST, heightsCm: heights }) } });
    expect(problems.length).toBeGreaterThan(3);
    expect(problems).toContain("spawns.back: cannot be walked to from spawns.arrival");
  });

  test("a first spawn that is not on the ground", async () => {
    expect(await problemsOf({ manifest: (m) => void (m.spawns[0]!.pos = [200, 0, 200]) })).toContain("spawns.arrival: is not on walkable ground");
  });

  test("walk grids that do not belong together", async () => {
    const problems = await problemsOf({ files: { "chunks/c-01-00.walk.json": JSON.stringify({ ...EAST, cellMm: 250 }) } });
    expect(problems).toContain("walk grids: walk grids of one district must share a cell size");
  });

  test("the registry: the district itself, its province, and where its gateways lead", async () => {
    const elsewhere = await problemsOf({ manifest: (m) => void (m.gateways[0]!.to = "zz-tst/d9") });
    expect(elsewhere).toEqual(["gateways.bridge: leads to zz-tst/d9, which is not in the registry"]);
    const { src, out } = await make();
    await buildPack(src, out, RAW);
    const moved = { ...registry, districts: [{ ...registry.districts[0]!, provinceId: "zz-oth" }, registry.districts[1]!] };
    expect(await checkPack(out, { ...context, registry: moved })).toEqual(["province: the registry places zz-tst/d1 in zz-oth"]);
    expect(await checkPack(out, { ...context, registry: { ...registry, districts: [registry.districts[1]!] } })).toEqual(["id: zz-tst/d1 is not in the registry"]);
  });

  test("routes and lots that point at things the pack does not have", async () => {
    const problems = await problemsOf({
      manifest: (m) => {
        m.routes[0]!.stops = ["p-square", "p-ghost"];
        m.lots[0]!.interior = "int-ghost";
      },
    });
    expect(problems).toEqual([
      "routes.r-loop: stops and stopPoints must be the same length",
      "routes.r-loop: stops at p-ghost, which is not a paragem of this pack",
      "lots.lot-1: its interior int-ghost is not in this pack",
    ]);
  });

  test("copy: a key with no line, an empty line, strings that are not JSON", async () => {
    const s = strings();
    delete s["d1.poi.3.line"];
    s["d1.paragem.square"] = "  ";
    expect(await problemsOf({ files: { "strings.pt-AO.json": JSON.stringify(s) } })).toEqual([
      expect.stringMatching(/^strings: "d1\.poi\.3\.line" is used by the manifest and missing from strings\.pt-AO\./),
      expect.stringMatching(/^strings: "d1\.paragem\.square" is used by the manifest and missing/),
    ]);
    const broken = await problemsOf({ files: { "strings.pt-AO.json": "isto não é JSON" } });
    expect(broken[0]).toMatch(/^strings\.pt-AO\.[0-9a-f]{12}\.json: not JSON$/);
  });

  test("a district must be loved for something: five positive points of interest", async () => {
    expect(await problemsOf({ manifest: (m) => void (m.pois[4]!.positive = false) })).toEqual([
      "pois: 4 positive points of interest; a district needs at least 5",
    ]);
  });

  test("a real brand in the copy or in a file name, but not inside another word", async () => {
    const s = strings();
    s["d1.poi.1.line"] = "Uma megacola bem gelada no Banco  Real."; // one brand, case ignored; the second has two spaces and is not the term
    s["d1.poi.2.line"] = "As megacolas e o superbanco real-mente."; // inside other words: fine
    s["d1.poi.3.line"] = "Levanta dinheiro no Banco Real, ali.";
    const problems = await problemsOf({
      manifest: (m) => void (m.interiors[0]!.file = "interiors/megacola_kiosk.glb"),
      files: { "strings.pt-AO.json": JSON.stringify({ ...s, extra: 7 }), "interiors/megacola_kiosk.glb": glb(1, 10) },
    });
    expect(problems).toEqual([
      'strings: "d1.poi.1.line" names "MegaCola", which needs a signed agreement (docs/legal)',
      'strings: "d1.poi.3.line" names "Banco Real", which needs a signed agreement (docs/legal)',
      expect.stringMatching(/^megacola_kiosk\.[0-9a-f]{12}\.glb: the file name contains "MegaCola"/),
    ]);
  });
});
