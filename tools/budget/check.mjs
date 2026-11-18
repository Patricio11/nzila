// pnpm budget
//
// Megabytes-Are-Money Rule: fails the build when what a player downloads is
// over its budget. Two things are weighed:
//
//   the shell   everything the way in downloads, from the door to walking in
//               the street (HTML, CSS, JS, fonts), as compressed as the network
//               carries it
//   on demand   what is fetched only when a player opens it (an app of the
//               Telemóvel): each piece against a budget of its own, and never
//               counted as nothing
//   the packs   every district that has been built into dist/packs, against
//               the budgets in packages/world (a chunk, a district, a first view)
//
// docs/BUDGETS.md lists every budget and where each is enforced.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { PACK_BUDGETS } from "../../packages/world/src/budgets.ts";

const SHELL_BUDGET_BYTES = 300 * 1024;
// One thing opened later (an app of the Telemóvel) may cost this much, with everything only it needs.
const ON_DEMAND_BUDGET_BYTES = 20 * 1024;
// What is opened later: the apps of the Telemóvel, each its own file, the sheet of someone tapped, and the cantina's
// grille with the Mochila. The shell that lists them is part of the way in.
const ON_DEMAND = /src\/(telemovel\/(?!telemovel\.tsx$)[\w-]+|conversa\/sheet|cantina\/loja|recados\/rua)\.tsx?$/;
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

// What is fetched only when opened, from the build's own account of who imports whom: a file is "on demand" when
// nothing on the way in reaches it except through one of the apps.
const onDemand = new Map();
const manifestPath = join(dist, ".vite", "manifest.json");
// The team's pages, by where their source is: the styleguide, the bench, the scenes and the body pages (/corpo, /pose).
const TEAM_PAGES = /src\/(styleguide|bench|cena|corpo)\//;
/** Every file a player's pages reach, the on-demand ones included; null when the build kept no account of it. */
let playerFiles = null;
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const filesOf = (key) => [manifest[key].file, ...(manifest[key].css ?? [])];
  const reach = (from, stopAt) => {
    const seen = new Set();
    const walkFrom = (key) => {
      if (seen.has(key) || !manifest[key] || stopAt(key)) return;
      seen.add(key);
      for (const next of [...(manifest[key].imports ?? []), ...(manifest[key].dynamicImports ?? [])]) walkFrom(next);
    };
    for (const key of from) walkFrom(key);
    return seen;
  };
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  // The team's own pages are reached from the same entry, and a player never opens them: nor anything that only they use.
  const wayInKeys = reach(entries, (key) => ON_DEMAND.test(key) || TEAM_PAGES.test(key));
  playerFiles = new Set([...reach(entries, (key) => TEAM_PAGES.test(key))].flatMap(filesOf));
  const wayIn = new Set([...wayInKeys].flatMap(filesOf));
  // What each app brings that the way in did not: itself and whatever it alone imports outright.
  const alone = (app) => {
    const seen = new Set();
    const walkFrom = (key) => {
      if (seen.has(key) || !manifest[key] || wayInKeys.has(key)) return;
      seen.add(key);
      for (const next of manifest[key].imports ?? []) walkFrom(next);
    };
    walkFrom(app);
    return seen;
  };
  for (const app of Object.keys(manifest).filter((key) => ON_DEMAND.test(key) && !wayInKeys.has(key))) {
    for (const key of alone(app)) for (const file of filesOf(key)) if (!wayIn.has(file) && !onDemand.has(join(dist, file))) onDemand.set(join(dist, file), app.replace(/^.*\//, ""));
  }
}

// The team's own pages are not part of what a player downloads to play.
const teamOnly = /(^|[\\/])(styleguide|bench|cena)[\w-]*\.(js|css)$/;
let shell = 0;
let team = 0;
const later = new Map();
for (const file of walk(dist)) {
  if (!counted.has(extname(file))) continue;
  const size = asIs.has(extname(file)) ? statSync(file).size : gzipSync(readFileSync(file)).length;
  const name = relative(dist, file);
  if (onDemand.has(file)) {
    const app = onDemand.get(file);
    later.set(app, (later.get(app) ?? 0) + size);
    console.log("  " + kb(size).padStart(7) + " KB  " + name + `  (on demand: ${app})`);
  } else if (teamOnly.test(name) || (playerFiles && /^assets[\\/]/.test(name) && !name.endsWith(".woff2") && !playerFiles.has(name.replaceAll("\\", "/")))) {
    team += size;
    console.log("  " + kb(size).padStart(7) + " KB  " + name + "  (team page, not counted)");
  } else {
    shell += size;
    console.log("  " + kb(size).padStart(7) + " KB  " + name);
  }
}
for (const [app, size] of later) {
  if (size > ON_DEMAND_BUDGET_BYTES) {
    console.error(`budget: ${app} is ${kb(size)} KB when opened, over the ${kb(ON_DEMAND_BUDGET_BYTES)} KB an app may cost.`);
    failed = true;
  }
}
if (later.size > 0) console.log(`budget: opened later, each paid for once: ${[...later].map(([app, size]) => `${app} ${kb(size)} KB`).join(", ")} (budget ${kb(ON_DEMAND_BUDGET_BYTES)} KB each).`);
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
