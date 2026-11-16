// Presence kept in Redis, where every zone and every API process reads the
// same thing. Each fact is one key that Redis itself forgets when its time
// is up: nothing here sweeps.
//
//   nzila:zone:<id>     a zone's card, as JSON; lives ten seconds from when it was last said
//   nzila:zones         the ids of zones that have ever spoken (the cards say which still do)
//   nzila:seat:<ticket> a reserved seat; taken with GETDEL, so once
//   nzila:at:<player>   where a player stands

import { randomBytes } from "node:crypto";
import { createClient } from "redis";
import { PLACE_TTL_S, SEAT_TTL_S, ZONE_TTL_S, type Presence, type Seat, type Standing, type ZoneCard } from "./presence.ts";

export const DEFAULT_REDIS_URL = "redis://localhost:6380";

/** The address from the environment, or the development default. */
export function redisUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

const read = <T>(text: string | null): T | null => {
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/** `prefix` keeps one test's keys apart from another's and from a developer's own. */
export async function redisPresence(url = redisUrl(), prefix = "nzila", log: (line: string) => void = (line) => console.error(line)): Promise<Presence> {
  const client = createClient({ url });
  // Said, and survived: the client connects again by itself, and whoever asked meanwhile is told no.
  client.on("error", (error: unknown) => log(`presence: redis: ${String(error)}`));
  await client.connect();
  const key = (kind: string, id: string): string => `${prefix}:${kind}:${id}`;
  const all = `${prefix}:zones`;
  return {
    announce: async (card) => {
      await client.set(key("zone", card.id), JSON.stringify(card), { expiration: { type: "EX", value: ZONE_TTL_S } });
      await client.sAdd(all, card.id);
    },
    retire: async (zoneId) => {
      await client.del(key("zone", zoneId));
      await client.sRem(all, zoneId);
    },
    zones: async () => {
      const ids = await client.sMembers(all);
      if (ids.length === 0) return [];
      const cards = await client.mGet(ids.map((id) => key("zone", id)));
      const alive: ZoneCard[] = [];
      for (const [n, text] of cards.entries()) {
        const card = read<ZoneCard>(text);
        if (card) alive.push(card);
        // A zone whose card has gone has died: its name is struck off.
        else await client.sRem(all, ids[n]!);
      }
      return alive;
    },
    reserve: async (seat) => {
      const ticket = randomBytes(24).toString("base64url");
      await client.set(key("seat", ticket), JSON.stringify(seat), { expiration: { type: "EX", value: SEAT_TTL_S } });
      return ticket;
    },
    // Only a ticket of ours is looked up: nothing else a phone sends becomes a key.
    claim: async (ticket) => (/^[A-Za-z0-9_-]{16,64}$/.test(ticket) ? read<Seat>(await client.getDel(key("seat", ticket))) : null),
    stand: async (playerId, at) => void (await client.set(key("at", playerId), JSON.stringify(at), { expiration: { type: "EX", value: PLACE_TTL_S } })),
    standing: async (playerId) => read<Standing>(await client.get(key("at", playerId))),
    forget: async (playerId) => void (await client.del(key("at", playerId))),
    close: async () => {
      await client.close();
    },
  };
}
