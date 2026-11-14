// Megabytes-Are-Money Rule: the shell (HTML, CSS, JS and fonts) must stay under 300 KB compressed.
// Fails the build when it does not. Pack budgets join this tool in Task 0.9.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";

const SHELL_BUDGET_BYTES = 300 * 1024;
const dist = join(process.cwd(), "apps", "client", "dist");
const counted = new Set([".html", ".css", ".js", ".woff2"]);
// A font file is already compressed: it costs what it weighs.
const asIs = new Set([".woff2"]);

if (!existsSync(dist)) {
  console.error("budget: apps/client/dist not found. Run the build first.");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let total = 0;
for (const file of walk(dist)) {
  if (!counted.has(extname(file))) continue;
  const size = asIs.has(extname(file)) ? statSync(file).size : gzipSync(readFileSync(file)).length;
  total += size;
  console.log("  " + (size / 1024).toFixed(1).padStart(7) + " KB  " + file.slice(dist.length + 1));
}
const kb = (total / 1024).toFixed(1);
const limit = (SHELL_BUDGET_BYTES / 1024).toFixed(0);
if (total > SHELL_BUDGET_BYTES) {
  console.error("budget: shell is " + kb + " KB gzipped, over the " + limit + " KB budget.");
  process.exit(1);
}
console.log("budget: shell is " + kb + " KB gzipped of " + limit + " KB.");
