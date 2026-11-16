// Which channel a player is put in (Task 3.2). A street with nobody in it is
// no fun and a street too full is slow, so: people are put together until a
// channel is comfortably full, and only then is another opened. A friend's
// invitation gets past "comfortably", up to what a channel can hold.

import { type ZoneCard } from "./presence.ts";

export interface ChannelRules {
  /** A channel is filled to this many before another is opened. */
  readonly fillTo: number;
  /** And never holds more than this. */
  readonly cap: number;
}

export interface Picked {
  readonly zoneId: string;
  readonly address: string;
  readonly channel: number;
}

/**
 * The channel for someone coming into a district's room, or null when no zone runs it or (for
 * an invitation) the channel asked for is full.
 *
 * Not invited: the fullest channel that is not yet comfortably full, so that people meet; when
 * every one is, a new channel, with the lowest number nobody has, on the zone with the fewest
 * people. Invited to a number: that channel wherever it is, while it has room at all; one that
 * is not open is opened on the emptiest zone.
 */
export function pickChannel(zones: readonly ZoneCard[], room: string, rules: ChannelRules, invitedTo?: number): Picked | null {
  const running = zones
    .map((zone) => ({ zone, held: zone.rooms.find((one) => one.name === room) }))
    .filter((one): one is { zone: ZoneCard; held: ZoneCard["rooms"][number] } => one.held !== undefined)
    // The same answer whatever order the zones were read in.
    .sort((a, b) => (a.zone.id < b.zone.id ? -1 : 1));
  if (running.length === 0) return null;
  const open = running.flatMap(({ zone, held }) => held.channels.map((channel) => ({ zone, ...channel })));
  const load = (zone: ZoneCard): number => zone.rooms.reduce((sum, one) => sum + one.channels.reduce((n, channel) => n + channel.players, 0), 0);
  const emptiest = [...running].sort((a, b) => load(a.zone) - load(b.zone))[0]!.zone;

  if (invitedTo !== undefined) {
    const there = open.find((channel) => channel.number === invitedTo);
    if (there) return there.players < rules.cap ? { zoneId: there.zone.id, address: there.zone.address, channel: invitedTo } : null;
    return { zoneId: emptiest.id, address: emptiest.address, channel: invitedTo };
  }
  const meeting = open.filter((channel) => channel.players < rules.fillTo).sort((a, b) => b.players - a.players || a.number - b.number)[0];
  if (meeting) return { zoneId: meeting.zone.id, address: meeting.zone.address, channel: meeting.number };
  let number = 1;
  while (open.some((channel) => channel.number === number)) number++;
  return { zoneId: emptiest.id, address: emptiest.address, channel: number };
}
