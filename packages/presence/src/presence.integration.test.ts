// Presence kept in a real Redis (`pnpm services` starts it): the same questions as are asked of memory,
// with keys of this run's own so that nothing of a developer's is touched.

import { createClient } from "redis";
import { afterAll, describe, expect, test } from "vitest";
import { behavesAsPresence } from "./contract.ts";
import { redisPresence, redisUrl } from "./redis.ts";

const prefix = `nzila-test-${process.pid}-${Date.now()}`;

afterAll(async () => {
  const client = createClient({ url: redisUrl() });
  await client.connect();
  for await (const keys of client.scanIterator({ MATCH: `${prefix}:*` })) if (keys.length > 0) await client.del(keys);
  await client.close();
});

describe("presence kept in Redis", () => {
  test("zones are forgotten when they stop speaking, a seat is taken once, a place is the newest written", async () => {
    const said: string[] = [];
    const presence = await redisPresence(redisUrl(), prefix, (line) => void said.push(line));
    // Time cannot be given to Redis: its keys are made to run out at once, which is what time passing is to it.
    const admin = createClient({ url: redisUrl() });
    await admin.connect();
    await behavesAsPresence(presence, async () => {
      for await (const keys of admin.scanIterator({ MATCH: `${prefix}:*` })) {
        for (const key of keys) if (key !== `${prefix}:zones`) await admin.del(key);
      }
    });
    await admin.close();
    expect(said).toEqual([]);
  }, 30_000);

  test("two processes read the same thing: a seat reserved by one is taken by the other, and by nobody after", async () => {
    const api = await redisPresence(redisUrl(), prefix);
    const zone = await redisPresence(redisUrl(), prefix);
    await zone.announce({ id: "zone-x", address: "", rooms: [{ name: "room.one", channels: [] }] });
    expect((await api.zones()).map((card) => card.id)).toEqual(["zone-x"]);
    const ticket = await api.reserve({ playerId: "player-9", zoneId: "zone-x", room: "room.one", channel: 1 });
    // Twenty at once ask for the same ticket: one gets the seat.
    const taken = await Promise.all(Array.from({ length: 20 }, () => zone.claim(ticket)));
    expect(taken.filter((seat) => seat !== null)).toHaveLength(1);
    await zone.retire("zone-x");
    await api.close();
    await zone.close();
  }, 30_000);
});
