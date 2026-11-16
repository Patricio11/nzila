// One channel with people on the ends of sockets (Task 3.1): a Channel, the
// database, and whoever is connected. The channel knows the world; this
// knows who is on which line, tells each what they should see, and writes
// down where they stood when they go.
//
// It does not know what a socket is made of: it is handed something that can
// send bytes and be closed (server.ts makes those from WebSockets, a test may
// make them from nothing). Every byte is ours (packages/protocol).

import { faceOf, keepChatLines, keepWhereabouts, shutOutOf, whereaboutsOf, type ChatLine } from "@nzila/db";
import { type ChatFilter } from "@nzila/i18n";
import { EVENT, PROTOCOL_VERSION, ZONE_CLOSE, arrivalLook, checkLook, decodeClientMessage, encodeChatHeard, encodeChatTyping, encodeEvent, encodeJoinAccepted, encodeWho, type ChatSend } from "@nzila/protocol";
import { type Presence } from "@nzila/presence";
import { type Sql } from "postgres";
import { Channel, type Place } from "./channel.ts";
import { type District } from "./district.ts";
import { Talk, reached } from "./talk.ts";

/** How many people one channel holds when nobody says otherwise (the tunable `channels.cap`; held by the swarm of 3.7). */
export const CHANNEL_HOLDS = 80;
/** One step of the world, in milliseconds: twenty a second. */
export const STEP_MS = 50;
/** A snapshot goes out every this many steps: ten a second. */
export const STEPS_A_SNAPSHOT = 2;
/**
 * Everyone's place is written down while they play, so that a zone that falls loses little: every five seconds
 * where it is cheap to write (presence: Redis), every thirty where it lasts (PostgreSQL).
 */
export const STEPS_A_NOTE = 100;
export const STEPS_A_CHECKPOINT = 600;
/** Messages a client may send in a second. A game sends twenty; the rest is noise and is not read. */
export const MESSAGES_A_SECOND = 60;
/** How many times a client may send what cannot be read, or flood, before it is put out. */
export const STRIKES = 5;
/** A player whose line dropped keeps their body in the street, standing, this long: they may be in a tunnel (Task 3.4). */
export const HOLD_MS = 60_000;
/** A gesture a second, at the most, is passed on. */
const GESTURE_GAP_MS = 1000;
/** How far behind the loop may fall and still catch up, in steps; beyond it time is let go, not made up in a rush. */
const CATCH_UP_STEPS = 3;

export interface ZoneDeps {
  readonly sql: Sql;
  readonly district: District;
  /** Whether where a player stands here is written down for their return. Not for a rehearsal town the database has never heard of. */
  readonly remember?: boolean;
  /** Where places are noted every few seconds, and read first when someone comes back. Without it, PostgreSQL alone. */
  readonly presence?: Presence;
  /** How many people a channel holds. */
  readonly holds?: number;
  /** How long a dropped line's place is kept (HOLD_MS; a test brings a shorter one). */
  readonly holdMs?: number;
  /**
   * The word filter. Given, talk is open in the channels of this district; not given, nobody can say anything
   * (Rule 11: talk does not open before report, block and mute are there, and the lists are read; Q5).
   */
  readonly filter?: ChatFilter;
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
  /** Whether they are known to be typing, and when they last made a gesture. */
  typing: boolean;
  gestureAt: number;
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
  private readonly presence: Presence | null;
  private readonly holds: number;
  private readonly log: (line: string) => void;
  private readonly held = new Map<Line, Held>();
  /** Players whose line dropped: their bodies stand in the street until they come back or their time runs out. */
  private readonly away = new Map<string, { held: Held; timer: ReturnType<typeof setTimeout> }>();
  private readonly holdMs: number;
  /** Talk, when it is open here; who is on which line by their number; who has shut whom out; and lines waiting to be written down. */
  private readonly talk: Talk | null;
  private readonly lineOfEntity = new Map<number, Line>();
  private readonly shut = new Map<string, Set<string>>();
  private said: ChatLine[] = [];
  /** Told when someone has gone for good: the zone then closes a channel nobody is in, and says who is left. */
  private readonly changed: () => void;
  /** Who each body is, as the bytes every client near them is sent once. */
  private readonly faces = new Map<number, Uint8Array>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private owedMs = 0;
  private wokeAt = 0;
  /** People whose coming in is under way: they hold a place, and keep the channel from being closed as empty under them. */
  private arriving = 0;

  constructor(deps: ZoneDeps, number: number, changed: () => void = () => {}) {
    this.changed = changed;
    this.holdMs = deps.holdMs ?? HOLD_MS;
    this.talk = deps.filter ? new Talk(deps.filter) : null;
    this.sql = deps.sql;
    this.district = deps.district;
    this.remember = deps.remember ?? true;
    this.presence = deps.presence ?? null;
    this.holds = deps.holds ?? CHANNEL_HOLDS;
    this.log = deps.log ?? ((line: string) => console.error(line));
    this.number = number;
    this.channel = new Channel(deps.district.ground, deps.district.obstacles);
  }

  /** How many people are in or on their way in (the database is being asked about them), and how many more would fit. */
  get count(): number {
    return this.held.size + this.away.size + this.arriving;
  }
  get room(): number {
    return this.holds - this.count;
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

  /** The channel is closed because nobody is in it: its clock stops, and what was said in it is written down before it is forgotten. */
  retire(): void {
    this.stop();
    void this.writeDown();
  }

  /** Whether this player is in the channel, and on which line. */
  lineOf(playerId: string): Line | null {
    for (const [line, held] of this.held) if (held.playerId === playerId) return line;
    return null;
  }

  /** Whether this player has a body here: on a line, or left standing by a line that dropped. */
  has(playerId: string): boolean {
    return this.away.has(playerId) || this.lineOf(playerId) !== null;
  }

  /**
   * A line went without a word (no network, a tunnel, a phone put to sleep): the body stays, standing, and the
   * place is kept for a while. Gives back whose it was, or null for a line that held nobody.
   */
  drop(line: Line): string | null {
    const held = this.held.get(line);
    if (!held) return null;
    this.held.delete(line);
    this.lineOfEntity.delete(held.entityId);
    if (held.typing) this.saysTyping(held, false);
    const timer = setTimeout(() => void this.expire(held.playerId), this.holdMs);
    this.away.set(held.playerId, { held, timer });
    return held.playerId;
  }

  /** The time kept for someone to come back has run out: they leave the street, and where they stood is written down. */
  private async expire(playerId: string): Promise<void> {
    const kept = this.away.get(playerId);
    if (!kept) return;
    this.away.delete(playerId);
    await this.depart(kept.held);
    this.changed();
  }

  /** A player is put out of this channel because they have come in somewhere else. Gives back their line, if they had one, to be closed. */
  async putOut(playerId: string): Promise<Line | null> {
    const kept = this.away.get(playerId);
    if (kept) {
      clearTimeout(kept.timer);
      this.away.delete(playerId);
      await this.depart(kept.held);
      return null;
    }
    const line = this.lineOf(playerId);
    if (line) await this.leave(line);
    return line;
  }

  /**
   * A player comes in: where they last stood in this district, beside a paragem they have just got off at, at
   * `standing` when they were already here on another line, or at the district's door. False when there is no room
   * to stand anywhere near.
   */
  async enter(line: Line, playerId: string, paragem?: string, standing?: Place): Promise<boolean> {
    const district = this.district;
    // Back to a body they left here: on a line that dropped, or on one the zone has not yet noticed is dead.
    // The same body, the same number, the same place: to everyone else they never left.
    const kept = this.away.get(playerId);
    const old = kept ? null : this.lineOf(playerId);
    const back = kept?.held ?? (old ? this.held.get(old) : undefined);
    if (back) {
      if (kept) clearTimeout(kept.timer);
      this.away.delete(playerId);
      if (old) {
        this.held.delete(old);
        old.close(ZONE_CLOSE.ELSEWHERE);
      }
      this.channel.resume(back.entityId);
      this.held.set(line, { entityId: back.entityId, playerId, told: new Set(), heard: 0, strikes: 0, typing: false, gestureAt: 0 });
      this.lineOfEntity.set(back.entityId, line);
      line.send(encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId: back.entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }));
      this.welcome(line);
      return true;
    }
    this.arriving++;
    const [last, face, apart] = await Promise.all([this.remember ? this.lastPlace(playerId) : null, faceOf(this.sql, playerId), this.talk ? shutOutOf(this.sql, playerId) : []]).finally(() => this.arriving--);
    this.shut.set(playerId, new Set(apart));
    let at: Place = last ?? district.arrival;
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
    this.faces.set(entityId, encodeWho({ entityId, name: face.name, bi: face.biNumber, look }));
    this.held.set(line, { entityId, playerId, told: new Set(), heard: 0, strikes: 0, typing: false, gestureAt: 0 });
    this.lineOfEntity.set(entityId, line);
    line.send(encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }));
    this.welcome(line);
    return true;
  }

  /** What a newcomer is told beyond where they are: that talk is open here, when it is. */
  private welcome(line: Line): void {
    if (this.talk) line.send(encodeEvent({ kind: EVENT.CHAT_OPEN, tick: this.channel.world.tick, subject: 0, args: [], text: "" }));
  }

  /** A line has gone, or is being put out: its player leaves the street, and where they stood is given back and written down. */
  async leave(line: Line): Promise<Place | null> {
    const held = this.held.get(line);
    if (!held) return null;
    this.held.delete(line);
    this.lineOfEntity.delete(held.entityId);
    return this.depart(held);
  }

  /** A body leaves the street for good: nobody need remember who it was, and where it stood is written down. */
  private async depart(held: Held): Promise<Place | null> {
    // Whoever saw them typing is told they have stopped: nobody is left with three dots over an empty place.
    if (held.typing) this.saysTyping(held, false);
    this.talk?.forget(held.entityId);
    this.shut.delete(held.playerId);
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
      else if (message.type === "chat_send") this.says(line, held, message);
      else if (message.type === "chat_typing") this.saysTyping(held, message.typing);
      else if (message.type === "emote") this.gestures(held, message.emote);
      // A second "join" on a line already in means nothing.
    } catch {
      this.strike(line, held);
    }
  }

  /** Whether two bodies have shut each other out: either blocked the other. */
  private apart = (a: number, b: number): boolean => {
    const one = this.playerOf(a);
    const other = this.playerOf(b);
    return one !== null && other !== null && (this.shut.get(one)?.has(other) === true || this.shut.get(other)?.has(one) === true);
  };

  private playerOf(entityId: number): string | null {
    const line = this.lineOfEntity.get(entityId);
    return (line && this.held.get(line)?.playerId) ?? null;
  }

  /** Someone says a line: to whoever is near, with its words for whoever is nearer still (talk.ts). Kept for moderation either way. */
  private says(line: Line, held: Held, sent: ChatSend): void {
    if (!this.talk) return;
    const verdict = this.talk.line(held.entityId, sent.messageId, sent.text, Date.now());
    if (verdict.kind === "repeat" || verdict.kind === "empty") return;
    const tick = this.channel.world.tick;
    const where = { playerId: held.playerId, districtId: this.district.id, channel: this.number, text: verdict.text };
    if (verdict.kind === "refuse") {
      line.send(encodeEvent({ kind: EVENT.CHAT_REFUSED, tick, subject: sent.messageId, args: [verdict.reason], text: "" }));
      this.said.push({ ...where, said: false, heardBy: 0 });
      return;
    }
    const hearers = reached(this.channel.entities(), held.entityId, this.apart);
    for (const one of hearers) this.lineOfEntity.get(one.id)?.send(encodeChatHeard({ from: held.entityId, tick, text: one.reads ? verdict.text : "" }));
    this.said.push({ ...where, said: true, heardBy: hearers.filter((one) => one.reads).length - 1 });
    // A line said is the end of its typing.
    held.typing = false;
  }

  /** Three dots over someone who is typing, for whoever would hear them: said when it starts and when it stops, not in between. */
  private saysTyping(held: Held, typing: boolean): void {
    if (!this.talk || held.typing === typing) return;
    held.typing = typing;
    const bytes = encodeChatTyping({ from: held.entityId, typing });
    for (const one of reached(this.channel.entities(), held.entityId, this.apart)) if (one.id !== held.entityId) this.lineOfEntity.get(one.id)?.send(bytes);
  }

  /** A gesture, for whoever has the one who makes it in sight. */
  private gestures(held: Held, emote: number): void {
    const now = Date.now();
    if (now - held.gestureAt < GESTURE_GAP_MS) return;
    held.gestureAt = now;
    const bytes = encodeEvent({ kind: EVENT.EMOTE, tick: this.channel.world.tick, subject: held.entityId, args: [emote], text: "" });
    for (const [other, seeing] of this.held) if (seeing !== held && this.channel.seenBy(seeing.entityId).includes(held.entityId)) other.send(bytes);
  }

  /** Lines said since the last time are written down, together. A failure is said, and the lines are not lost to the next try. */
  private async writeDown(): Promise<void> {
    if (this.said.length === 0) return;
    const lines = this.said;
    this.said = [];
    try {
      await keepChatLines(this.sql, lines);
    } catch (error) {
      this.said = [...lines, ...this.said].slice(-2000);
      this.log(`zone: could not keep what was said: ${String(error)}`);
    }
  }

  /** Who has shut whom out is read again now and then: a block made a moment ago reaches the zone within half a minute. */
  private async reread(): Promise<void> {
    for (const held of this.held.values()) {
      try {
        this.shut.set(held.playerId, new Set(await shutOutOf(this.sql, held.playerId)));
      } catch (error) {
        this.log(`zone: could not read who ${held.playerId} has shut out: ${String(error)}`);
      }
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
    if (tick % STEPS_A_NOTE === 0) {
      void this.writeDown();
      const lasting = tick % STEPS_A_CHECKPOINT === 0;
      if (lasting && this.talk) void this.reread();
      for (const held of this.held.values()) {
        const at = this.channel.placeOf(held.entityId);
        if (at) void this.keep(held.playerId, at, lasting);
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
    for (const kept of this.away.values()) clearTimeout(kept.timer);
    const waited = [...this.away.values()];
    this.away.clear();
    await Promise.all([...lines.map((line) => this.leave(line)), ...waited.map((kept) => this.depart(kept.held))]);
    await this.writeDown();
    for (const line of lines) line.close(code);
  }

  /** Where a player last stood in this district: the note of a few seconds ago when there is one, else what PostgreSQL has. */
  private async lastPlace(playerId: string): Promise<Place | null> {
    const district = this.district;
    try {
      const noted = await this.presence?.standing(playerId);
      if (noted && noted.districtId === district.id) return { x: noted.x, y: noted.y, z: noted.z, yaw: noted.yaw };
    } catch (error) {
      this.log(`zone: could not read where ${playerId} stood: ${String(error)}`);
    }
    const last = await whereaboutsOf(this.sql, playerId);
    return last && last.districtId === district.id ? { x: last.x, y: last.y, z: last.z, yaw: district.arrival.yaw } : null;
  }

  /**
   * Writes down where a player stands: always in the note, and where it lasts when `lasting`.
   * A failure is said and survived: the player goes on playing.
   */
  private async keep(playerId: string, at: Place, lasting = true): Promise<void> {
    if (!this.remember) return;
    const where = { districtId: this.district.id, x: at.x, y: at.y, z: at.z };
    try {
      await this.presence?.stand(playerId, { ...where, yaw: at.yaw });
      if (lasting) await keepWhereabouts(this.sql, playerId, this.district.provinceId, where);
    } catch (error) {
      this.log(`zone: could not keep where ${playerId} stands: ${String(error)}`);
    }
  }
}
