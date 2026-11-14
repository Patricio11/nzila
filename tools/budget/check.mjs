// pnpm budget
//
// Megabytes-Are-Money Rule: fails the build when what a player downloads is
// over its budget. Two things are weighed:
//
//   the shell   everything the first visit downloads before any world
//               (HTML, CSS, JS, fonts), as compressed as the network carries it
//   the packs   every district that has been built into dist/packs, against
//               the budgets in packages/world (a chunk, a district, a first view)
//
// docs/BUDGETS.md lists every budget and where each is enforced.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { PACK_BUDGETS } from "../../packages/world/src/budgets.ts";

const SHELL_BUDGET_BYTES = 300 * 1024;
const root = process.cwd();
const dist = join(root, "apps", "client", "dist");
const counted = new Set([".html", ".css", ".js", ".woff2"]);
// A font file is already compressed: it costs what it weighs.
const asIs = new Set([".woff2"]);
const kb = (bytes) => (bytes / 1024).toFixed(1);
let failed = false;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// ------------------------------------------------------------------ the shell
if (!existsSync(dist)) {
  console.error("budget: apps/client/dist not found. Run the build first.");
  process.exit(1);
}

// The team's own pages are not part of what a player downloads to play.
const teamOnly = /(^|[\\/])(styleguide|bench)[\w-]*\.(js|css)$/;
let shell = 0;
let team = 0;
for (const file of walk(dist)) {
  if (!counted.has(extname(file))) continue;
  const size = asIs.has(extname(file)) ? statSync(file).size : gzipSync(readFileSync(file)).length;
  const name = relative(dist, file);
  if (teamOnly.test(name)) {
    team += size;
    console.log("  " + kb(size).padStart(7) + " KB  " + name + "  (team page, not counted)");
  } else {
    shell += size;
    console.log("  " + kb(size).padStart(7) + " KB  " + name);
  }
}
if (shell > SHELL_BUDGET_BYTES) {
  console.error(`budget: shell is ${kb(shell)} KB, over the ${kb(SHELL_BUDGET_BYTES)} KB budget.`);
  failed = true;
} else {
  console.log(`budget: shell is ${kb(shell)} KB of ${kb(SHELL_BUDGET_BYTES)} KB (team pages add ${kb(team)} KB that players never download).`);
}

// ------------------------------------------------------------------ the packs
const packs = join(root, "dist", "packs");
const manifests = existsSync(packs) ? walk(packs).filter((file) => file.endsWith("manifest.json")) : [];
if (manifests.length === 0) console.log("budget: no packs built yet.");
for (const file of manifests) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  const total = manifest.sizes.total.normal;
  const biggest = Math.max(...manifest.chunks.map((chunk) => chunk.bytes.normal));
  const over = [
    total > PACK_BUDGETS.districtNormalBytes && `the district is ${kb(total)} KB of ${kb(PACK_BUDGETS.districtNormalBytes)}`,
    biggest > PACK_BUDGETS.chunkNormalBytes && `its largest chunk is ${kb(biggest)} KB of ${kb(PACK_BUDGETS.chunkNormalBytes)}`,
    manifest.sizes.firstView > PACK_BUDGETS.firstViewBytes && `its first view is ${kb(manifest.sizes.firstView)} KB of ${kb(PACK_BUDGETS.firstViewBytes)}`,
  ].filter(Boolean);
  if (over.length > 0) {
    console.error(`budget: pack ${manifest.id} is over: ${over.join("; ")}.`);
    failed = true;
  } else {
    console.log(`budget: pack ${manifest.id} v${manifest.version} is ${kb(total)} KB at Normal, first view ${kb(manifest.sizes.firstView)} KB.`);
  }
}

if (failed) process.exit(1);
