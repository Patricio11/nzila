// pnpm pack:build <province>/<district>    builds content/<...> into dist/packs/<...>
// pnpm pack:check <province>/<district>    checks the built pack
// pnpm pack:check                          checks every district that has a district.json

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registrySchema } from "@nzila/world";
import { PackError, buildPack } from "./build.ts";
import { checkPack, parseBrandTerms } from "./check.ts";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const sourceOf = (district: string): string => join(root, "content", ...district.split("/"));
const outOf = (district: string): string => join(root, "dist", "packs", ...district.split("/"));

const [command, only] = process.argv.slice(2);
const registry = registrySchema.parse(JSON.parse(await readFile(join(root, "content", "registry.json"), "utf8")));
const districts = only ? [only] : registry.districts.map((d) => d.id).filter((id) => existsSync(join(sourceOf(id), "district.json")));

if (command !== "build" && command !== "check") {
  console.error("usage: pack build|check [<province>/<district>]");
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
