// pnpm test:quick ["<what changed>"]
//
// The quick gate (the founder, 2026-11-21): what is run before every commit, in a few minutes. The full gate
// (`pnpm test:all`, about half an hour) is run when a whole piece of work is done (a bairro, a phase) and always
// before anything reaches players.
//
// In order, the cheap first, stopping at the first that fails:
//   the types, the lint, the unit tests with their coverage and the house rules, the integration tests (API, zone,
//   database), the build and the size of the way in, and then the browser tests on the Android phone's profile:
//   always the three every player passes through (the door, two phones in one street, the crossing between
//   bairros), and those whose names match what was given.
//
//   pnpm test:quick                         the three, and nothing else in the browser
//   pnpm test:quick "a gift|Convidar"       the three, and every browser test whose name matches
//
// It does not rebuild the packs (Blender, minutes): after a change to art/scripts, run the pack's own command
// first (`pnpm pack:zango`), as the memory of the packs says. It does not run the other browsers' engines or the
// iPhone's profile: those are the full gate's.

import { spawnSync } from "node:child_process";

/** The browser tests that are always run: every player passes through these. */
const ALWAYS = ["the door states what the first visit costs", "each sees the other as a body in the street", "from the Marginal to Zango and back"];

const asked = process.argv.slice(2).join("|");
const names = [...ALWAYS, ...(asked ? [asked] : [])].join("|");
const steps = [
  ["the types", "pnpm typecheck"],
  ["the lint", "pnpm lint"],
  ["the unit tests, their coverage and the house rules", "pnpm test"],
  ["the integration tests", "pnpm test:integration"],
  ["the build", "pnpm build"],
  ["the size of the way in", "pnpm budget"],
  ["the browser tests (Android profile)", `pnpm exec playwright test -c tests/e2e/playwright.config.ts --project phone -g "${names.replaceAll('"', "")}"`],
];

const started = Date.now();
for (const [what, command] of steps) {
  const from = Date.now();
  console.log(`\nquick gate: ${what}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\nquick gate: FAILED at ${what}, after ${Math.round((Date.now() - started) / 1000)} s.`);
    process.exit(result.status ?? 1);
  }
  console.log(`quick gate: ${what}: ${Math.round((Date.now() - from) / 1000)} s`);
}
console.log(`\nquick gate: passed in ${Math.round((Date.now() - started) / 1000)} s. The full gate (pnpm test:all) is owed when this piece of work is done.`);
