// pnpm swarm --district l1 --players 80 --seconds 30
//
// Fills a channel of a running zone with headless players and says what it
// cost: the zone's step time (from its /health) and what each bot was sent.
// Exits with an error when a budget is broken (docs/BUDGETS.md).
//
//   --district   a district of the registry by the last part of its id,
//                or a room name as the zone prints it             (the first open district)
//   --players    how many                                        (80)
//   --seconds    how long the count runs                         (30)
//   --zone       the zone's address                              (http://127.0.0.1:2567)
//
// It needs the zone running (`pnpm dev:zone`) and the database it uses (DATABASE_URL).

import { connect, loadWorldSeed } from "@nzila/db";
import { runSwarm } from "./bots.ts";
import { BUDGET, verdict, type ZoneHealth } from "./budget.ts";
import { makeGuests } from "./guests.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1] ?? "");
// The districts are the registry's to name, never this file's (Rule 9).
const registry = (await loadWorldSeed()).districts;
const asked = args.get("district");
const known = asked ? registry.find((one) => one.id.endsWith(`/${asked}`)) : registry.find((one) => one.open);
const room = known ? known.id.replaceAll("/", ".") : (asked ?? "");
const players = Number(args.get("players") ?? 80);
const seconds = Number(args.get("seconds") ?? 30);
const zone = (args.get("zone") ?? "http://127.0.0.1:2567").replace(/\/$/, "");

const sql = connect();
const guests = await makeGuests(sql, players);
const run = async (): Promise<boolean> => {
  console.log(`swarm: ${players} players into ${room} at ${zone}, counting for ${seconds} s`);
  // The zone is asked how it did while everyone is still in: a channel nobody is in is closed and forgotten.
  let health: ZoneHealth = { ok: false, rooms: [] };
  const report = await runSwarm({
    url: `${zone.replace(/^http/, "ws")}/${room}`,
    tokens: guests.tokens,
    seconds,
    staggerMs: 25,
    whileFull: async () => {
      health = (await (await fetch(`${zone}/health`)).json()) as ZoneHealth;
    },
  });
  if (report.joined === 0) console.log(`swarm: nobody was let in. Is "${room}" a room this zone runs (it prints them when it starts), and does it let sessions in (ZONE_SESSIONS=on)?`);
  const said = verdict(report, health, room);
  for (const line of said.lines) console.log(line);
  const failed = !said.ok;
  console.log(failed ? `swarm: over budget (${BUDGET.downBytesPerSecond} B/s down, ${BUDGET.stepMeanMs} ms a step on the mean, ${BUDGET.stepWorstMs} ms at the worst)` : "swarm: inside every budget");
  return failed;
};
// The bots' accounts are taken away whether the run ended well or not.
const failed = await run().finally(async () => {
  await guests.remove();
  await sql.end();
});
process.exit(failed ? 1 : 0);
