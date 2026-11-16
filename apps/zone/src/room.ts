// One channel with people on the ends of sockets (Task 3.1): a Channel, the
// database, and whoever is connected. The channel knows the world; this
// knows who is on which line, tells each what they should see, and writes
// down where they stood when they go.
//
// It does not know what a socket is made of: it is handed something that can
// send bytes and be closed (server.ts makes those from WebSockets, a test may
// make them from nothing). Every byte is ours (packages/protocol).

import { faceOf, keepWhereabouts, whereaboutsOf } from "@nzila/db";
import { PROTOCOL_VERSION, ZONE_CLOSE, arrivalLook, checkLook, decodeClientMessage, encodeJoinAccepted, encodeWho } from "@nzila/protocol";
import { type Sql } from "postgres";
import { Channel, type Place } from "./channel.ts";
import { type District } from "./district.ts";

/** How many people one channel holds (the roadmap's number, proved or changed by the load test of 3.7). */
export const CHANNEL_HOLDS = 80;
/** One step of the world, in milliseconds: twenty a second. */
export const STEP_MS = 50;
/** A snapshot goes out every this many steps: ten a second. */
export const STEPS_A_SNAPSHOT = 2;
/** Everyone's place is written down this often while they play, so that a zone that falls loses little: every thirty seconds. */
export const STEPS_A_CHECKPOINT = 600;
/** Messages a client may send in a second. A game sends twenty; the rest is noise and is not read. */
export const MESSAGES_A_SECOND = 60;
/** How many times a client may send what cannot be read, or flood, before it is put out. */
export const STRIKES = 5;
/** How far behind the loop may fall and still catch up, in steps; beyond it time is let go, not made up in a rush. */
const CATCH_UP_STEPS = 3;

export interface ZoneDeps {
  readonly sql: Sql;
  readonly district: District;
  /** Whether where a player stands here is written down for their return. Not for a rehearsal town the database has never heard of. */
  readonly remember?: boolean;
  /** Where the zone says what went wrong. */
  readonly log?: (line: string) => void;
}

/** A line to one client: bytes go down it, and it can be closed with a reason (ZONE_CLOSE). */
export interface Line {
  send(bytes: Uint8Array): void;
  close(code: number): void;
}

/** What the room keeps of each line. */
interface Held {
  readonly entityId: number;
  readonly playerId: string;
  /** Whose name and look this client has been sent: each is said once. */
  readonly told: Set<number>;
  /** Messages in the second now running, and how many times this client has gone too far. */
  heard: number;
  strikes: number;
}

/** How long the world's steps have been taking: what the load test reads (3.7). */
export interface Pace {
  steps: number;
  lastMs: number;
  worstMs: number;
  totalMs: number;
}

/** A number from a player's id: the same player, the same number, in every channel. */
function seedOf(playerId: string): number {
  let seed = 2166136261;
  for (let i = 0; i < playerId.length; i++) seed = Math.imul(seed ^ playerId.charCodeAt(i), 16777619);
  return seed >>> 0;
}

export class ChannelRoom {
  readonly number: number;
  readonly channel: Channel;
  readonly pace: Pace = { steps: 0, lastMs: 0, worstMs: 0, totalMs: 0 };
  private readonly sql: Sql;
  private readonly district: District;
  private readonly remember: boolean;
  private readonly log: (line: string) => void;
  private readonly held = new Map<Line, Held>();
  /** Who each body is, as the bytes every client near them is sent once. */
  private readonly faces = new Map<number, Uint8Array>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private owedMs = 0;
  private wokeAt = 0;
  /** People whose coming in is under way: they hold a place, and keep the channel from being closed as empty under them. */
  private arriving = 0;

  constructor(deps: ZoneDeps, number: number) {
    this.sql = deps.sql;
    this.district = deps.district;
    this.remember = deps.remember ?? true;
    this.log = deps.log ?? ((line: string) => console.error(line));
    this.number = number;
    this.channel = new Channel(deps.district.ground, deps.district.obstacles);
  }

  /** How many people are in or on their way in (the database is being asked about them), and how many more would fit. */
  get count(): number {
    return this.held.size + this.arriving;
  }
  get room(): number {
    return CHANNEL_HOLDS - this.count;
  }

  /** Starts the world's clock: a timer wakes the room, the room measures the time itself, and every step is the same length. */
  start(): void {
    if (this.timer) return;
    this.wokeAt = performance.now();
    this.owedMs = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      this.owedMs += now - this.wokeAt;
      this.wokeAt = now;
      for (let done = 0; this.owedMs >= STEP_MS && done < CATCH_UP_STEPS; done++) {
        this.owedMs -= STEP_MS;
        try {
          this.step();
        } catch (error) {
          // One bad step must not end the street for eighty people: it is said, and the next step is taken.
          this.log(`zone: a step of ${this.district.id} channel ${this.number} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
        }
      }
      if (this.owedMs >= STEP_MS) this.owedMs = 0;
    }, STEP_MS / 2);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Whether this player is in the channel, and on which line. */
  lineOf(playerId: string): Line | null {
    for (const [line, held] of this.held) if (held.playerId === playerId) return line;
    return null;
  }

  /**
   * A player comes in: where they last stood in this district, beside a paragem they have just got off at, at
   * `standing` when they were already here on another line, or at the district's door. False when there is no room
   * to stand anywhere near.
   */
  async enter(line: Line, playerId: string, paragem?: string, standing?: Place): Promise<boolean> {
    const district = this.district;
    this.arriving++;
    const [last, face] = await Promise.all([this.remember ? whereaboutsOf(this.sql, playerId) : null, faceOf(this.sql, playerId)]).finally(() => this.arriving--);
    let at: Place = last && last.districtId === district.id ? { x: last.x, y: last.y, z: last.z, yaw: district.arrival.yaw } : district.arrival;
    // Off a van at a paragem: the vans are each phone's own until the zone runs them (F-152), so the phone says
    // which paragem and the zone puts them beside it. It is believed that far and no farther: a paragem, never a place.
    const stop = paragem === undefined ? undefined : district.paragens.get(paragem);
    if (stop) at = stop;
    if (standing) at = standing;
    const entityId = this.channel.join(playerId, at) ?? this.channel.join(playerId, district.arrival);
    if (entityId === null) return false;
    // The look is sent as it would be accepted today: what was stored under an older catalogue is not passed on blind.
    // One who has not chosen yet is given a look of their own, from who they are: a street of newcomers is not one person many times.
    const look = checkLook(face.look) ?? arrivalLook(seedOf(playerId));
    this.faces.set(entityId, encodeWho({ entityId, name: face.name, look: JSON.stringify(look) }));
    this.held.set(line, { entityId, playerId, told: new Set(), heard: 0, strikes: 0 });
    line.send(encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }));
    return true;
  }

  /** A line has gone, or is being put out: its player leaves the street, and where they stood is given back and written down. */
  async leave(line: Line): Promise<Place | null> {
    const held = this.held.get(line);
    if (!held) return null;
    this.held.delete(line);
    const left = this.channel.leave(held.entityId);
    this.faces.delete(held.entityId);
    for (const other of this.held.values()) other.told.delete(held.entityId);
    if (!left) return null;
    await this.keep(left.playerId, left.at);
    return left.at;
  }

  /** A message from a client: read, counted, and, when it is a stick, given to the channel. */
  hear(line: Line, bytes: Uint8Array): void {
    const held = this.held.get(line);
    if (!held) return;
    held.heard++;
    if (held.heard > MESSAGES_A_SECOND) {
      // Not read at all. The first one over the line in a second is counted against them.
      if (held.heard === MESSAGES_A_SECOND + 1) this.strike(line, held);
      return;
    }
    try {
      const message = decodeClientMessage(bytes);
      if (message.type === "input") this.channel.input(held.entityId, message);
      // Talk arrives with Task 3.5; a second "join" on a line already in means nothing.
    } catch {
      this.strike(line, held);
    }
  }

  private strike(line: Line, held: Held): void {
    held.strikes++;
    if (held.strikes >= STRIKES) line.close(ZONE_CLOSE.MISBEHAVED);
  }

  /** One step of the world, and what follows from it: snapshots, the count of messages, the checkpoint. */
  step(): void {
    const began = performance.now();
    this.channel.tick();
    const tick = this.channel.world.tick;
    if (tick % STEPS_A_SNAPSHOT === 0) {
      const everyone = this.channel.entities();
      for (const [line, held] of this.held) {
        const bytes = this.channel.snapshotFor(held.entityId, everyone);
        if (!bytes) continue;
        // Who each newcomer to their sight is, once, and then where everyone is.
        for (const seen of this.channel.seenBy(held.entityId)) {
          const face = seen === held.entityId || held.told.has(seen) ? undefined : this.faces.get(seen);
          if (!face) continue;
          held.told.add(seen);
          line.send(face);
        }
        line.send(bytes);
      }
    }
    if (tick % (1000 / STEP_MS) === 0) for (const held of this.held.values()) held.heard = 0;
    if (tick % STEPS_A_CHECKPOINT === 0) {
      for (const held of this.held.values()) {
        const at = this.channel.placeOf(held.entityId);
        if (at) void this.keep(held.playerId, at);
      }
    }
    const took = performance.now() - began;
    this.pace.steps++;
    this.pace.lastMs = took;
    this.pace.totalMs += took;
    if (took > this.pace.worstMs) this.pace.worstMs = took;
  }

  /** Everyone out, each written down: the zone is closing. */
  async empty(code: number): Promise<void> {
    this.stop();
    const lines = [...this.held.keys()];
    await Promise.all(lines.map((line) => this.leave(line)));
    for (const line of lines) line.close(code);
  }

  /** Writes down where a player stands. A failure is said and survived: the player goes on playing. */
  private async keep(playerId: string, at: Place): Promise<void> {
    if (!this.remember) return;
    try {
      await keepWhereabouts(this.sql, playerId, this.district.provinceId, { districtId: this.district.id, x: at.x, y: at.y, z: at.z });
    } catch (error) {
      this.log(`zone: could not keep where ${playerId} stands: ${String(error)}`);
    }
  }
}
