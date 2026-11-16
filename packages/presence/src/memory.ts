// Presence kept in the memory of one process: for tests, and for a zone and
// an API that are alone and have no Redis. Time is given, so that a test can
// let ten seconds pass in none.

import { randomBytes } from "node:crypto";
import { HELD_TTL_S, PLACE_TTL_S, SEAT_TTL_S, ZONE_TTL_S, type Presence, type Seat, type Standing, type ZoneCard } from "./presence.ts";

export function memoryPresence(now: () => number = Date.now): Presence {
  const zones = new Map<string, { card: ZoneCard; until: number }>();
  const seats = new Map<string, { seat: Seat; until: number }>();
  const places = new Map<string, { at: Standing; until: number }>();
  const holds = new Map<string, { seat: Seat; until: number }>();
  return {
    announce: async (card) => void zones.set(card.id, { card, until: now() + ZONE_TTL_S * 1000 }),
    retire: async (zoneId) => void zones.delete(zoneId),
    zones: async () => {
      for (const [id, zone] of zones) if (zone.until <= now()) zones.delete(id);
      return [...zones.values()].map((zone) => zone.card);
    },
    reserve: async (seat) => {
      const ticket = randomBytes(24).toString("base64url");
      seats.set(ticket, { seat, until: now() + SEAT_TTL_S * 1000 });
      return ticket;
    },
    claim: async (ticket) => {
      const held = seats.get(ticket);
      seats.delete(ticket);
      // Swept as tickets are taken: one that was never taken is dropped when its time has passed.
      for (const [other, seat] of seats) if (seat.until <= now()) seats.delete(other);
      return held && held.until > now() ? held.seat : null;
    },
    hold: async (seat) => void holds.set(seat.playerId, { seat, until: now() + HELD_TTL_S * 1000 }),
    held: async (playerId) => {
      const kept = holds.get(playerId);
      if (kept && kept.until <= now()) holds.delete(playerId);
      return kept && kept.until > now() ? kept.seat : null;
    },
    unhold: async (playerId) => void holds.delete(playerId),
    stand: async (playerId, at) => void places.set(playerId, { at, until: now() + PLACE_TTL_S * 1000 }),
    standing: async (playerId) => {
      const held = places.get(playerId);
      return held && held.until > now() ? held.at : null;
    },
    forget: async (playerId) => void places.delete(playerId),
    close: async () => {},
  };
}
