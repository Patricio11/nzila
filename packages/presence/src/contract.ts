// What any presence must do, whatever keeps it. Asked of memory in presence.test.ts and of Redis in
// presence.integration.test.ts: one list of questions, so that the two cannot drift apart.

import { expect } from "vitest";
import { SEAT_TTL_S, ZONE_TTL_S, type Presence, type ZoneCard } from "./presence.ts";

/** `pass` lets that many seconds go by, however the keeper of this presence counts time. */
export async function behavesAsPresence(presence: Presence, pass: (seconds: number) => Promise<void>): Promise<void> {
  const card: ZoneCard = { id: "zone-a", address: "wss://a.example/zone", rooms: [{ name: "room.one", channels: [{ number: 1, players: 12 }] }] };
  // Zones: said, read, said again with news, and forgotten when they stop saying.
  expect(await presence.zones()).toEqual([]);
  await presence.announce(card);
  await presence.announce({ ...card, id: "zone-b", address: "" });
  expect((await presence.zones()).map((zone) => zone.id).sort()).toEqual(["zone-a", "zone-b"]);
  await presence.announce({ ...card, rooms: [{ name: "room.one", channels: [{ number: 1, players: 13 }] }] });
  expect((await presence.zones()).find((zone) => zone.id === "zone-a")!.rooms[0]!.channels[0]!.players).toBe(13);
  await presence.retire("zone-b");
  expect((await presence.zones()).map((zone) => zone.id)).toEqual(["zone-a"]);
  await pass(ZONE_TTL_S + 1);
  expect(await presence.zones()).toEqual([]);
  // And a zone forgotten is not remembered again by being asked about.
  expect(await presence.zones()).toEqual([]);

  // Seats: a ticket is taken once, by whoever shows it; nothing else is a ticket; an old one is nobody's.
  const seat = { playerId: "player-1", zoneId: "zone-a", room: "room.one", channel: 2 };
  const ticket = await presence.reserve(seat);
  expect(ticket).toMatch(/^[A-Za-z0-9_-]{24,}$/);
  expect(await presence.reserve(seat)).not.toBe(ticket);
  expect(await presence.claim(ticket)).toEqual(seat);
  expect(await presence.claim(ticket)).toBeNull();
  expect(await presence.claim("not-a-ticket-anyone-was-given")).toBeNull();
  expect(await presence.claim("zone:zone-a")).toBeNull();
  const late = await presence.reserve(seat);
  await pass(SEAT_TTL_S + 1);
  expect(await presence.claim(late)).toBeNull();

  // Places: the newest is the one read; forgotten when asked; and not kept for ever.
  expect(await presence.standing("player-1")).toBeNull();
  await presence.stand("player-1", { districtId: "d/1", x: 1, y: 2, z: 3, yaw: 9000 });
  await presence.stand("player-1", { districtId: "d/1", x: 10, y: 2, z: 30, yaw: 0 });
  expect(await presence.standing("player-1")).toEqual({ districtId: "d/1", x: 10, y: 2, z: 30, yaw: 0 });
  await presence.forget("player-1");
  expect(await presence.standing("player-1")).toBeNull();
  await presence.close();
}

