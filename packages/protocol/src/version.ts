// Protocol versions. The number goes up whenever a message changes in a way
// an older client could misread, and whenever a golden number of packages/sim
// moves (an old client would predict a different world).
//
// A phone may hold a cached copy of the game from weeks ago. When it joins,
// it must be told plainly to refresh, never be left confused or crashing. Two
// messages make that possible and their layout is frozen for good: Join
// (client to zone) and JoinRefused (zone to client). Whatever else changes,
// every client ever shipped can send the first and read the second.

/** The version this build speaks. */
// 2 (2026-11-18): a look on the wire names each thing by its own number (WIRE_IDS), not its place in a list.
export const PROTOCOL_VERSION = 2;

/** The oldest client version the zone still accepts. */
export const MIN_CLIENT_VERSION = 2;

export type VersionVerdict = "ok" | "client_too_old" | "client_too_new";

/** What a zone speaking `current` and accepting from `oldest` says to a client speaking `client`. */
export function negotiate(client: number, oldest = MIN_CLIENT_VERSION, current = PROTOCOL_VERSION): VersionVerdict {
  if (client < oldest) return "client_too_old";
  // A client newer than the zone met a zone that has not been updated yet: a rollout in progress.
  if (client > current) return "client_too_new";
  return "ok";
}
