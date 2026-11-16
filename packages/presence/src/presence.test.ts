// Presence from memory, and the choosing of a channel. The same questions are asked of Redis in presence.integration.test.ts.

import { describe, expect, test } from "vitest";
import { memoryPresence } from "./memory.ts";
import { pickChannel, type ChannelRules } from "./pick.ts";
import { behavesAsPresence } from "./contract.ts";
import { PLACE_TTL_S, type ZoneCard } from "./presence.ts";

describe("presence kept in memory", () => {
  test("zones are forgotten when they stop speaking, a seat is taken once, a place is the newest written", async () => {
    let now = 1_000_000;
    await behavesAsPresence(
      memoryPresence(() => now),
      async (seconds) => void (now += seconds * 1000),
    );
  });

  test("a place is not kept for ever, and a ticket never taken does not stay in memory", async () => {
    let now = 0;
    const presence = memoryPresence(() => now);
    await presence.stand("player-1", { districtId: "d/1", x: 1, y: 2, z: 3, yaw: 0 });
    const never = await presence.reserve({ playerId: "p", zoneId: "z", room: "r", channel: 1 });
    now += (PLACE_TTL_S + 1) * 1000;
    expect(await presence.standing("player-1")).toBeNull();
    // Taking any ticket sweeps the old ones away.
    await presence.claim(await presence.reserve({ playerId: "q", zoneId: "z", room: "r", channel: 1 }));
    expect(await presence.claim(never)).toBeNull();
  });
});

describe("which channel someone is put in", () => {
  const rules: ChannelRules = { fillTo: 60, cap: 80 };
  const zone = (id: string, channels: [number, number][], room = "room.one"): ZoneCard => ({ id, address: `wss://${id}`, rooms: [{ name: room, channels: channels.map(([number, players]) => ({ number, players })) }] });

  test("nobody is sent where no zone runs the district", () => {
    expect(pickChannel([], "room.one", rules)).toBeNull();
    expect(pickChannel([zone("a", [[1, 3]], "room.two")], "room.one", rules)).toBeNull();
  });

  test("the first player opens channel 1, and people are put together: the fullest channel that is not yet comfortably full", () => {
    expect(pickChannel([zone("a", [])], "room.one", rules)).toEqual({ zoneId: "a", address: "wss://a", channel: 1 });
    expect(pickChannel([zone("a", [[1, 59], [2, 12], [3, 40]])], "room.one", rules)).toMatchObject({ channel: 1 });
    expect(pickChannel([zone("a", [[1, 60], [2, 12], [3, 40]])], "room.one", rules)).toMatchObject({ channel: 3 });
    // Equally full: the lower number, so that every process says the same.
    expect(pickChannel([zone("a", [[2, 12], [1, 12]])], "room.one", rules)).toMatchObject({ channel: 1 });
  });

  test("when every channel is comfortably full a new one is opened, with the lowest number nobody has, on the zone with the fewest people", () => {
    const zones = [zone("b", [[1, 60], [3, 70]]), zone("a", [[2, 65], [4, 80], [5, 61]])];
    expect(pickChannel(zones, "room.one", rules)).toEqual({ zoneId: "b", address: "wss://b", channel: 6 });
    expect(pickChannel([zone("a", [[2, 60]])], "room.one", rules)).toMatchObject({ channel: 1 });
    // Whatever order the zones were read in.
    expect(pickChannel([...zones].reverse(), "room.one", rules)).toEqual(pickChannel(zones, "room.one", rules));
  });

  test("an invitation goes to that channel while it has any room at all, opens it when it is not open, and is refused when it is full", () => {
    const zones = [zone("a", [[1, 79], [2, 80]]), zone("b", [[3, 5]])];
    expect(pickChannel(zones, "room.one", rules, 1)).toEqual({ zoneId: "a", address: "wss://a", channel: 1 });
    expect(pickChannel(zones, "room.one", rules, 2)).toBeNull();
    expect(pickChannel(zones, "room.one", rules, 3)).toMatchObject({ zoneId: "b", channel: 3 });
    expect(pickChannel(zones, "room.one", rules, 9)).toEqual({ zoneId: "b", address: "wss://b", channel: 9 });
  });
});
