// pnpm pack:export <province>/<district>   runs Blender on art/<...>/district.blend and writes its
//                                          chunks into content/<...>/chunks, and chunks.json beside them
// pnpm pack:build <province>/<district>    builds content/<...> into dist/packs/<...>
// pnpm pack:check <province>/<district>    checks the built pack
// pnpm pack:check                          checks every district that has a district.json

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registrySchema } from "@nzila/world";
import { exportChunks } from "./assets.ts";
import { PackError, buildPack } from "./build.ts";
import { checkPack, parseBrandTerms } from "./check.ts";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const sourceOf = (district: string): string => join(root, "content", ...district.split("/"));
const outOf = (district: string): string => join(root, "dist", "packs", ...district.split("/"));

const [command, only] = process.argv.slice(2);
const registry = registrySchema.parse(JSON.parse(await readFile(join(root, "content", "registry.json"), "utf8")));
const districts = only ? [only] : registry.districts.map((d) => d.id).filter((id) => existsSync(join(sourceOf(id), "district.json")));

if (command === "export") {
  if (!only) {
    console.error("usage: pack export <province>/<district>");
    process.exitCode = 1;
  } else {
    const blend = join(root, "art", ...only.split("/"), "district.blend");
    if (!existsSync(blend)) {
      console.error(`pack export: ${blend} does not exist.`);
      process.exitCode = 1;
    } else {
      const chunks = await exportChunks(blend, sourceOf(only), join(root, "art", "scripts", "export_chunks.py"));
      console.log(`pack export: ${only}, ${chunks.length} chunk(s) written to content/${only}/chunks.`);
      // Keep district.json in step, so nobody copies boxes by hand: a chunk already listed keeps
      // its walk grid and any impostor; a new one is added with the walk grid's usual name.
      const manifestPath = join(sourceOf(only), "district.json");
      if (existsSync(manifestPath)) {
        interface Listed {
          id: string;
          aabb: number[];
          lods: string[];
          walkGrid: string;
        }
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { chunks?: Listed[] };
        const listed = new Map<string, Listed>((manifest.chunks ?? []).map((chunk) => [chunk.id, chunk]));
        for (const chunk of chunks) {
          const before = listed.get(chunk.id);
          const kept = (before?.lods ?? []).filter((lod) => !lod.endsWith(".glb"));
          listed.set(chunk.id, { id: chunk.id, aabb: chunk.aabb, lods: [...chunk.lods, ...kept], walkGrid: before?.walkGrid ?? `chunks/${chunk.id}.walk.json` });
        }
        const gone = [...listed.keys()].filter((id) => !chunks.some((chunk) => chunk.id === id));
        manifest.chunks = [...listed.values()].sort((a, b) => a.id.localeCompare(b.id));
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(`pack export: district.json now lists ${manifest.chunks.length} chunk(s).`);
        if (gone.length > 0) console.log(`pack export: no longer in the Blender file, left in district.json for you to remove: ${gone.join(", ")}`);
      } else {
        console.log("pack export: there is no district.json yet; chunks.json has the entries for it.");
      }
    }
  }
} else if (command !== "build" && command !== "check") {
  console.error("usage: pack export|build|check [<province>/<district>]");
  process.exitCode = 1;
} else if (districts.length === 0) {
  console.log(`pack ${command}: no district has a district.json yet.`);
} else {
  const brandTerms = parseBrandTerms(await readFile(join(root, "docs", "legal", "BRAND_TERMS.txt"), "utf8"));
  for (const district of districts) {
    try {
      // A check always builds first, so it never passes on a stale pack.
      const manifest = await buildPack(sourceOf(district), outOf(district));
      const mb = (bytes: number): string => (bytes / 1_000_000).toFixed(2);
      console.log(`pack build: ${district} v${manifest.version}, ${manifest.chunks.length} chunks, ${mb(manifest.sizes.total.normal)} MB at Normal, first view ${mb(manifest.sizes.firstView)} MB`);
      if (command === "check") {
        const problems = await checkPack(outOf(district), { registry, brandTerms });
        if (problems.length > 0) throw new PackError(problems);
        console.log(`pack check: ${district} may be published.`);
      }
    } catch (error) {
      if (!(error instanceof PackError)) throw error;
      console.error(`pack ${command}: ${district} has ${error.problems.length} problem(s):`);
      for (const problem of error.problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
    }
  }
}
