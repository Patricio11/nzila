// A channel holds eighty (Task 3.7): a real zone, a real database, eighty
// lines, everyone walking about. What each is sent stays under the budget for
// a phone on foot, and the zone's steps stay a small part of the time they
// have. `pnpm swarm` asks the same of a zone that is already running.

import { connect, databaseUrl, loadMigrations, loadWorldSeed, migrate, seed } from "@nzila/db";
import { type Ground } from "@nzila/sim";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type District } from "../../../apps/zone/src/district.ts";
import { CHANNEL_HOLDS } from "../../../apps/zone/src/room.ts";
import { startZone, type Zone } from "../../../apps/zone/src/server.ts";
import { runSwarm } from "./bots.ts";
import { BUDGET, verdict, type ZoneHealth } from "./budget.ts";
import { makeGuests, type SwarmGuests } from "./guests.ts";

const name = `nzila_swarm_test_${process.pid}_${Date.now()}`;
const port = 23_000 + (process.pid % 20_000);
// A square 300 m across, open: the crowd has room to spread, and nobody is held at a wall.
const ground: Ground = { cellMm: 500, flagsAt: (cx, cz) => (Math.abs(cx) > 300 || Math.abs(cz) > 300 ? 0 : 1), heightAt: () => 0 };
const district: District = { id: "ao-lua/l1", provinceId: "ao-lua", ground, obstacles: [], paragens: new Map(), arrival: { x: 0, y: 0, z: 0, yaw: 0 } };
const said: string[] = [];
let admin: Sql;
let sql: Sql;
let zone: Zone;
let guests: SwarmGuests;

beforeAll(async () => {
  admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(databaseUrl());
  url.pathname = `/${name}`;
  sql = connect(url.toString(), 10);
  await migrate(sql, await loadMigrations());
  await seed(sql, await loadWorldSeed());
  zone = await startZone({ sql, districts: [{ district }], sessions: true, log: (line) => void said.push(line) }, port);
  guests = await makeGuests(sql, CHANNEL_HOLDS + 5);
}, 60_000);

afterAll(async () => {
  await zone?.close();
  await sql?.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}, 60_000);

describe("a full channel", () => {
  test("eighty come in at one door and walk about: each is sent less than a phone on foot may be, the zone's steps are short, and the eighty-first opens a second channel", async () => {
    let health: ZoneHealth = { ok: false, rooms: [] };
    const report = await runSwarm({
      url: `ws://127.0.0.1:${port}/ao-lua.l1`,
      tokens: guests.tokens,
      seconds: 8,
      staggerMs: 10,
      whileFull: async () => {
        health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as ZoneHealth;
      },
    });
    const result = verdict(report, health, "ao-lua.l1");
    console.log(result.lines.join("\n"));

    // Everyone was let in and nobody was put out for doing what a phone does.
    expect(report.joined).toBe(CHANNEL_HOLDS + 5);
    expect(report.stayed).toBe(CHANNEL_HOLDS + 5);
    // One channel filled to its eighty, and the rest in a second.
    expect(health.rooms.map((room) => room.players).sort((a, b) => b - a)).toEqual([CHANNEL_HOLDS, 5]);
    // The budget of docs/BUDGETS.md: a phone on foot, in the thick of a full channel.
    expect(report.downBytesPerSecond.worst).toBeLessThan(BUDGET.downBytesPerSecond);
    expect(report.snapshotsPerSecond).toBeGreaterThan(8.5);
    expect(report.snapshotsPerSecond).toBeLessThan(11.5);
    // Nobody is told of more than the nearest thirty, whoever is about.
    expect(report.seen.most).toBeLessThanOrEqual(29);
    // The zone's step: here it shares one thread with eighty-five clients and the test itself, so the
    // line is drawn at what would still be comfortable (`pnpm swarm` holds a zone of its own to 5 ms).
    const full = health.rooms.find((room) => room.players === CHANNEL_HOLDS)!;
    expect(full.meanMs).toBeLessThan(BUDGET.stepMeanMs * 3);
    expect(said).toEqual([]);
  }, 60_000);

  test("the bots' accounts are taken away again", async () => {
    await guests.remove();
    const [left] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM players WHERE name LIKE 'Enxame %'`;
    expect(left!.n).toBe(0);
  });
});
