// What is running, who is on their way in, and where everyone last stood
// (Task 3.2). Three small things many processes must agree on, kept where
// all of them can read: Redis. The same interface is answered from memory
// for tests and for a single process with no Redis.
//
//   zones   Each zone says, every few seconds, where it can be reached and
//           who is in each of its channels. A zone that stops saying so is
//           forgotten: nobody is sent to a process that has died.
//   seats   The API reserves a seat for a player in a channel and gives the
//           phone a ticket. The zone takes the ticket, once. A ticket is the
//           only thing a phone shows a zone: its session never leaves the API.
//   held    A player whose line dropped keeps their place in their channel for a
//           minute (Task 3.4). The zone says so here, so that the API sends
//           them back to that very channel and not to another.
//   places  Where each player stands, written every few seconds while they
//           play, so that a zone that falls loses a few steps and not a walk.

export interface ChannelCount {
  readonly number: number;
  readonly players: number;
  /** Who is in it, by player id: for the Estúdio, which shows who is where and can put out a player who is stuck. */
  readonly who?: readonly string[];
  /** How long a step of its world took since the zone last spoke, in milliseconds: the mean and the worst. */
  readonly meanMs?: number;
  readonly worstMs?: number;
}

/** What a zone says of itself. */
export interface ZoneCard {
  /** A name of its own, new each time the process starts. */
  readonly id: string;
  /** Where a phone reaches it: wss://host/path, or "" for "the game's own address, at /zone". */
  readonly address: string;
  /** The district rooms it runs and the channels open in each. */
  readonly rooms: readonly { readonly name: string; readonly channels: readonly ChannelCount[] }[];
}

export interface Seat {
  readonly playerId: string;
  /** The zone the seat is in, the district's room there, and the channel. */
  readonly zoneId: string;
  readonly room: string;
  readonly channel: number;
}

/** A place in a district: millimetres, and the way they face in centidegrees. */
export interface Standing {
  readonly districtId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** A zone is forgotten this long after it last spoke, and speaks this often: seconds. */
export const ZONE_TTL_S = 10;
export const ZONE_SAYS_EVERY_S = 3;
/** A seat is held this long for the phone to take it. */
export const SEAT_TTL_S = 30;
/** A player whose line dropped keeps their place this long. */
export const HELD_TTL_S = 60;
/** That a player is at a place where something may be done (a caixa) is believed this long after the zone last said so. */
export const AT_TTL_S = 6;
/** Where a player stood is kept this long after it was last written: a day. */
export const PLACE_TTL_S = 86_400;

export interface Presence {
  /** A zone says it is alive and what it holds. */
  announce(card: ZoneCard): Promise<void>;
  /** A zone says it is going: it is forgotten at once. */
  retire(zoneId: string): Promise<void>;
  /** Every zone that has spoken lately. */
  zones(): Promise<ZoneCard[]>;
  /** Reserves a seat and gives back the ticket for it. */
  reserve(seat: Seat): Promise<string>;
  /** Takes a ticket: the seat it was for, once; null for one that is unknown, spent or too old. */
  claim(ticket: string): Promise<Seat | null>;
  /** A zone says it is keeping a player's place in a channel; `held` reads it for a minute; `unhold` when they are back, or gone. */
  hold(seat: Seat): Promise<void>;
  held(playerId: string): Promise<Seat | null>;
  unhold(playerId: string): Promise<void>;
  /** Writes down where a player stands, and reads it back; `forget` when it has been written somewhere that lasts. */
  stand(playerId: string, at: Standing): Promise<void>;
  standing(playerId: string): Promise<Standing | null>;
  forget(playerId: string): Promise<void>;
  /**
   * The zone says a player is standing at a place where something may be done ("caixa"), and the API reads it
   * before it records what is done there: the zone decides where a player is, never the phone. Believed for a few
   * seconds; said again while they stand there.
   */
  mark(playerId: string, what: string): Promise<void>;
  marked(playerId: string): Promise<string | null>;
  close(): Promise<void>;
}
