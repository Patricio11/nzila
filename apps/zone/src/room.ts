// One channel with people on the ends of sockets (Task 3.1): a Channel, the
// database, and whoever is connected. The channel knows the world; this
// knows who is on which line, tells each what they should see, and writes
// down where they stood when they go.
//
// It does not know what a socket is made of: it is handed something that can
// send bytes and be closed (server.ts makes those from WebSockets, a test may
// make them from nothing). Every byte is ours (packages/protocol).

import { isGreeting } from "@nzila/i18n";
import { TrafficRules, actorAt } from "@nzila/world";
import { eatOne, faceOf, keepChatLines, keepNeeds, needsOf, recordPartida, keepWhereabouts, shutOutOf, standingAgainst, whereaboutsOf, type ChatLine } from "@nzila/db";
import { BASE_CATALOGUE, BASE_TUNABLES } from "@nzila/economy";
import { decayNeeds, eatNeeds, restNeeds, spendEffort, tooTired, type NeedsState } from "@nzila/sim";
import { type ChatFilter } from "@nzila/i18n";
import {
  type EntityState,
  type RideAsked,
  encodeTraffic, EVENT, MESA_RECUSAS, PROTOCOL_VERSION, ZONE_CLOSE, arrivalLook, settleLook, decodeClientMessage, encodeChatHeard, encodeChatTyping, encodeEvent, encodeJoinAccepted, encodeWho, type ChatSend, type MesaPedido, CHAT_REFUSAL } from "@nzila/protocol";
import { type Presence } from "@nzila/presence";
import { type Sql } from "postgres";
import { Channel, type Place } from "./channel.ts";
import { CAIXA_REACH_MM, MET_TTL_S, PLACE_REACH_MM, SHOP_REACH_MM, type District } from "./district.ts";
import { MESA_SEEN_MM, Mesas, type Terminada } from "./mesas.ts";
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
const STEPS_A_LOOK = 5;
const MARK_EVERY_MS = 1000;
/** How near a van's middle a player must stand to get on it, and how far from it they may ask to get off. Millimetres. */
const BOARD_REACH_MM = 7000;
const ALIGHT_REACH_MM = 4500;
/** The traffic is decided every this many steps, and said to the phones every this many. */
const STEPS_A_TRAFFIC = 4;
const STEPS_A_TRAFFIC_SAID = 6;
/** Two people are "together" for handing something over within this far, in millimetres. */
export const HAND_REACH_MM = 3000;
/**
 * A greeting is answered when the other greets within this long, standing within this far. Long enough to type
 * "Tudo bem, e tu?" with one thumb. The wave is the first of the gestures.
 */
export const GREETING_WITHIN_MS = 20_000;
export const GREETING_WITHIN_MM = 6000;
const WAVE = 0;
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
  /** How long a quick game at a table lasts: three minutes; the browser tests' zone makes it short. */
  readonly rapidaMs?: number;
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
  /** When they last waved, and whom they have met in this stay (by entity): two people meet once. */
  wavedAt: number;
  readonly met: Set<number>;
  /** When they were last said to be standing at a caixa. */
  markedAt: number;
  /** Whom they were last said to be standing with, and when. */
  withWhom: string;
  withAt: number;
  nudgedAt: number;
  shopAt: number;
  placeAt: number;
  /** The players this one has met in this channel, by their ids: the API asks whether one of them is new. */
  metPlayers: Set<string>;
  /** The tables near them, and the version of each they were last told: a table is told again when it changes, or when they come near again. */
  tables: Map<number, number>;
  /** Their Fome and Energia, and whether something they asked to eat is being written. */
  needs: NeedsKept;
  eating: boolean;
}

/**
 * A player's Fome and Energia (Task 4.4), kept exactly: the needs as they were last set, and the steps, the fast
 * steps and the jumps since. What they are now is worked out from these, so that nothing is lost to rounding a
 * little at a time; they are set again only when something changes them outright (eating).
 */
interface NeedsKept {
  base: NeedsState;
  steps: number;
  /** Of those steps, the ones spent sitting (a bench, a stool) or riding a van: Energia comes back in them. */
  rest: number;
  fast: number;
  jumps: number;
  tired: boolean;
}

/** The rates of the needs: tunables (Rule 14). */
const NEEDS = BASE_TUNABLES.needs;
/** How near a bench's seat a player must stand to sit on it, and how far in front of it they stand up. Millimetres. */
const BENCH_REACH_MM = 2500;
const BENCH_STEP_MM = 600;
/** How long the zone's note of a stay at the hospital lasts for the API to ask its bill, in seconds. */
const HOSPITAL_NOTE_S = 600;

/** How long the world's steps have been taking: what the load test reads (3.7). */
export interface Pace {
  steps: number;
  lastMs: number;
  worstMs: number;
  totalMs: number;
  /** The same, since the zone last said how it was doing: what the Estúdio is shown. */
  sinceSteps: number;
  sinceWorstMs: number;
  sinceTotalMs: number;
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
  readonly pace: Pace = { steps: 0, lastMs: 0, worstMs: 0, totalMs: 0, sinceSteps: 0, sinceWorstMs: 0, sinceTotalMs: 0 };
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
  /** The street's traffic, when the district has any: decided here for everyone (F-152). */
  private readonly traffic: TrafficRules | null;
  private trafficAt = 0;
  /** The district's tables, and the games at them, when it has any (Task 4B.1). */
  readonly mesas: Mesas | null;
  /** Players a moderator has silenced, and the kicks already carried out (a kick stands for half a minute and is done once). */
  private readonly muted = new Set<string>();
  private readonly kicked = new Set<number>();
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
    this.traffic = deps.district.traffic ? new TrafficRules(deps.district.traffic.lines, deps.district.traffic.roamers) : null;
    this.mesas = (deps.district.tables?.length ?? 0) > 0 ? new Mesas(deps.district.tables!, Date.now(), undefined, deps.rapidaMs) : null;
  }

  /** How many people are in or on their way in (the database is being asked about them), and how many more would fit. */
  get count(): number {
    return this.held.size + this.away.size + this.arriving;
  }
  /** Everyone who has a body here, by player id: for the Estúdio. */
  get who(): string[] {
    return [...[...this.held.values()].map((held) => held.playerId), ...this.away.keys()];
  }
  /** How the steps have gone since this was last asked: the mean and the worst, in milliseconds. */
  health(): { meanMs: number; worstMs: number } {
    const pace = this.pace;
    const said = { meanMs: pace.sinceSteps ? Math.round((pace.sinceTotalMs / pace.sinceSteps) * 100) / 100 : 0, worstMs: Math.round(pace.sinceWorstMs * 100) / 100 };
    pace.sinceSteps = pace.sinceTotalMs = pace.sinceWorstMs = 0;
    return said;
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
      this.held.set(line, { entityId: back.entityId, playerId, told: new Set(), heard: 0, strikes: 0, typing: false, gestureAt: 0, wavedAt: 0, met: back.met, markedAt: 0, withWhom: "", withAt: 0, nudgedAt: 0, shopAt: 0, placeAt: 0, metPlayers: back.metPlayers, tables: new Map(), needs: back.needs, eating: false });
      this.lineOfEntity.set(back.entityId, line);
      line.send(encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId: back.entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }));
      this.welcome(line);
      this.tellNeeds(line, this.held.get(line)!, "");
      return true;
    }
    this.arriving++;
    const [last, face, apart, against, needs] = await Promise.all([this.remember ? this.lastPlace(playerId) : null, faceOf(this.sql, playerId), this.talk ? shutOutOf(this.sql, playerId) : [], this.talk ? standingAgainst(this.sql, [playerId]) : [], needsOf(this.sql, playerId)]).finally(() => this.arriving--);
    this.shut.set(playerId, new Set(apart));
    // Silenced by a moderator before they came in: silent from their first word.
    if (against.some((one) => one.kind === "mute")) this.muted.add(playerId);
    else this.muted.delete(playerId);
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
    const look = settleLook(face.look) ?? arrivalLook(seedOf(playerId));
    this.faces.set(entityId, encodeWho({ entityId, name: face.name, bi: face.biNumber, look }));
    this.held.set(line, { entityId, playerId, told: new Set(), heard: 0, strikes: 0, typing: false, gestureAt: 0, wavedAt: 0, met: new Set(), markedAt: 0, withWhom: "", withAt: 0, nudgedAt: 0, shopAt: 0, placeAt: 0, metPlayers: new Set(), tables: new Map(), needs: { base: needs, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(needs, NEEDS.tiredBelow) }, eating: false });
    this.lineOfEntity.set(entityId, line);
    this.channel.setTired(entityId, tooTired(needs, NEEDS.tiredBelow));
    // Noted at once where they came in, not at the next five-second round: a kamba going to them finds them (Task 4B.2).
    void this.keep(playerId, this.channel.placeOf(entityId) ?? at, false);
    line.send(encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }));
    this.welcome(line);
    this.tellNeeds(line, this.held.get(line)!, "");
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
    // A seat at a table is given to a kota, who plays on; and they leave the street standing beside it.
    if (this.mesas?.seatOf(held.playerId)) {
      this.mesas.leave(held.playerId, Date.now());
      this.channel.standUp(held.entityId, this.channel.sittingOf(held.entityId)!);
    }
    this.talk?.forget(held.entityId);
    this.shut.delete(held.playerId);
    this.takeEffort(held);
    await keepNeeds(this.sql, held.playerId, this.needsNow(held)).catch((error: unknown) => this.log(`zone: could not keep the needs of ${held.playerId}: ${String(error)}`));
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
      else if (message.type === "ride") this.rides(line, held, message.ride);
      else if (message.type === "nudge") this.nudges(held, message.entity);
      else if (message.type === "mesa") this.atTable(line, held, message);
      else if (message.type === "comer") this.eats(line, held, message.item);
      else if (message.type === "banco") this.onBench(held, message.seat, message.sim);
      // A second "join" on a line already in means nothing.
    } catch {
      this.strike(line, held);
    }
  }

  /** Fome and Energia as they are now: what was last set, worn by the steps since, the fast steps and the jumps (Task 4.4). */
  private needsNow(held: Held): NeedsState {
    const kept = held.needs;
    return spendEffort(restNeeds(decayNeeds(kept.base, kept.steps, NEEDS), kept.rest, NEEDS), kept.fast, kept.jumps, NEEDS);
  }

  /** The effort the channel counted for them since last asked, added to what their needs carry. */
  private takeEffort(held: Held): void {
    const effort = this.channel.takeEffort(held.entityId);
    held.needs.fast += effort.fast;
    held.needs.jumps += effort.jumps;
  }

  /** Tells a player their needs, and the thing just eaten or drunk when there is one. */
  private tellNeeds(line: Line, held: Held, eaten: string): void {
    const now = this.needsNow(held);
    line.send(encodeEvent({ kind: EVENT.NECESSIDADES, tick: this.channel.world.tick, subject: 0, args: [now.fome, now.energia, held.needs.tired ? 1 : 0], text: eaten }));
  }

  /**
   * Every five seconds for each player in turn: the effort counted is added, and whether they are too tired to go fast
   * or to jump is looked at again (they are told when it changes). Every thirty, their needs are written down and
   * they are told them.
   */
  private tendNeeds(line: Line, held: Held, lasting: boolean): void {
    this.takeEffort(held);
    const now = this.needsNow(held);
    const tired = tooTired(now, NEEDS.tiredBelow);
    const changed = tired !== held.needs.tired;
    if (changed) {
      held.needs.tired = tired;
      this.channel.setTired(held.entityId, tired);
    }
    // Nothing left: to the hospital, back on their feet there (the bill is the API's, on the zone's note).
    if (now.energia <= 0 && this.toHospital(line, held, now)) return;
    if (changed || lasting) this.tellNeeds(line, held, "");
    if (lasting) void keepNeeds(this.sql, held.playerId, now).catch((error: unknown) => this.log(`zone: could not keep the needs of ${held.playerId}: ${String(error)}`));
  }

  /**
   * Energia at zero (Task 4.4): the body is taken to the district's hospital (its door, when the pack has none yet),
   * they wake with Energia and some Fome back, never dead and never robbed, and a note is left for the API, which
   * asks a small bill for the stay. Not from a van or a seat: whoever sits or rides is resting already.
   */
  private toHospital(line: Line, held: Held, now: NeedsState): boolean {
    if (this.channel.ridingOf(held.entityId) || this.channel.sittingOf(held.entityId)) return false;
    if (!this.channel.put(held.entityId, this.district.hospital ?? this.district.arrival)) return false;
    const after = { fome: Math.max(now.fome, NEEDS.hospitalFome), energia: NEEDS.hospitalEnergia };
    held.needs = { base: after, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(after, NEEDS.tiredBelow) };
    this.channel.setTired(held.entityId, held.needs.tired);
    const stay = `${Date.now().toString(36)}${held.entityId.toString(36)}`;
    void this.presence?.mark(held.playerId, "hospital", stay, HOSPITAL_NOTE_S).catch(() => {});
    void keepNeeds(this.sql, held.playerId, after).catch((error: unknown) => this.log(`zone: could not keep the needs of ${held.playerId}: ${String(error)}`));
    line.send(encodeEvent({ kind: EVENT.HOSPITAL, tick: this.channel.world.tick, subject: 0, args: [], text: stay }));
    this.tellNeeds(line, held, "");
    return true;
  }

  /**
   * "Comer", "Beber" (Task 4.4): one of a thing carried leaves the Mochila and what it gives goes to Fome and Energia,
   * written together. Something not eaten in the street (rice, charcoal) is refused, as is something not carried.
   */
  private eats(line: Line, held: Held, item: string): void {
    const kind = BASE_CATALOGUE.items.get(item);
    const refuse = (why: string): void => line.send(encodeEvent({ kind: EVENT.COMER_RECUSADO, tick: this.channel.world.tick, subject: 0, args: [], text: why }));
    if (!kind?.use) return refuse("nao_se_come");
    if (held.eating) return;
    held.eating = true;
    this.takeEffort(held);
    const after = eatNeeds(this.needsNow(held), kind);
    void eatOne(this.sql, held.playerId, item, after)
      .then((ate) => {
        if (!ate) return refuse("nao_tens");
        held.needs = { base: after, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(after, NEEDS.tiredBelow) };
        this.channel.setTired(held.entityId, held.needs.tired);
        this.tellNeeds(line, held, item);
      })
      .catch((error: unknown) => {
        this.log(`zone: ${held.playerId} could not eat ${item}: ${String(error)}`);
        refuse("nao_tens");
      })
      .finally(() => (held.eating = false));
  }

  /**
   * Sitting on a bench, and getting up (F-205): the zone seats the body, so that everyone sees them sitting, and they
   * rest there (Task 4.4). Only a seat within reach, that nobody else is on, by someone on foot and at no table.
   */
  private onBench(held: Held, seat: number, sim: boolean): void {
    const sat = this.channel.sittingOf(held.entityId);
    const atTable = this.mesas?.seatOf(held.playerId) !== null && this.mesas?.seatOf(held.playerId) !== undefined;
    if (!sim) {
      // Up, a step in front of the bench, or as near it as there is room.
      if (sat && !atTable) this.channel.standUp(held.entityId, { ...sat, x: sat.x + Math.round(Math.sin((sat.yaw / 18_000) * Math.PI) * BENCH_STEP_MM), z: sat.z + Math.round(Math.cos((sat.yaw / 18_000) * Math.PI) * BENCH_STEP_MM) });
      return;
    }
    const place = this.district.benches?.[seat];
    const here = this.channel.placeOf(held.entityId);
    if (!place || !here || sat || atTable || this.channel.ridingOf(held.entityId)) return;
    if (Math.hypot(place.x - here.x, place.z - here.z) > BENCH_REACH_MM) return;
    for (const other of this.held.values()) {
      const theirs = other === held ? null : this.channel.sittingOf(other.entityId);
      if (theirs && theirs.x === place.x && theirs.z === place.z) return;
    }
    this.channel.sit(held.entityId, place);
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
    // Silenced by a moderator: nothing they say is passed on, they are told so, and the line is kept as not said.
    if (this.muted.has(held.playerId)) {
      line.send(encodeEvent({ kind: EVENT.CHAT_REFUSED, tick, subject: sent.messageId, args: [CHAT_REFUSAL.MUTED], text: "" }));
      this.said.push({ ...where, said: false, heardBy: 0 });
      return;
    }
    if (verdict.kind === "refuse") {
      line.send(encodeEvent({ kind: EVENT.CHAT_REFUSED, tick, subject: sent.messageId, args: [verdict.reason], text: "" }));
      this.said.push({ ...where, said: false, heardBy: 0 });
      return;
    }
    const hearers = reached(this.together(held.entityId), held.entityId, this.apart);
    for (const one of hearers) this.lineOfEntity.get(one.id)?.send(encodeChatHeard({ from: held.entityId, tick, text: one.reads ? verdict.text : "" }));
    this.said.push({ ...where, said: true, heardBy: hearers.filter((one) => one.reads).length - 1 });
    // "Bom dia", "Tudo bem?" and the like greet whoever is close, as a wave does (the founder, 2026-11-17).
    if (isGreeting(verdict.text)) this.greets(held, Date.now());
    // A line said is the end of its typing.
    held.typing = false;
  }

  /** Three dots over someone who is typing, for whoever would hear them: said when it starts and when it stops, not in between. */
  private saysTyping(held: Held, typing: boolean): void {
    if (!this.talk || held.typing === typing) return;
    held.typing = typing;
    const bytes = encodeChatTyping({ from: held.entityId, typing });
    for (const one of reached(this.together(held.entityId), held.entityId, this.apart)) if (one.id !== held.entityId) this.lineOfEntity.get(one.id)?.send(bytes);
  }

  /** A gesture, for whoever has the one who makes it in sight. */
  private gestures(held: Held, emote: number): void {
    const now = Date.now();
    if (now - held.gestureAt < GESTURE_GAP_MS) return;
    held.gestureAt = now;
    const bytes = encodeEvent({ kind: EVENT.EMOTE, tick: this.channel.world.tick, subject: held.entityId, args: [emote], text: "" });
    for (const [other, seeing] of this.held) if (seeing !== held && this.channel.seenBy(seeing.entityId).includes(held.entityId)) other.send(bytes);
    if (emote === WAVE) this.greets(held, now);
  }

  /**
   * Who is in the same room as someone, for talk (the spec's "the van is its own chat room"): riders of the same van
   * hear one another and nobody else, whatever the street says; people on foot hear people on foot. A van is small:
   * everyone in it is within reading.
   */
  private together(entityId: number): EntityState[] {
    const everyone = this.channel.entities();
    const on = this.channel.ridingOf(entityId)?.vehicle ?? null;
    return everyone.filter((one) => one.vehicleId === on);
  }

  /** "Look in your wallet", from someone who has just handed something over, to someone beside them; once a second at most. */
  private nudges(held: Held, entity: number): void {
    const now = Date.now();
    if (now - held.nudgedAt < GESTURE_GAP_MS) return;
    const from = this.channel.placeOf(held.entityId);
    const to = this.channel.placeOf(entity);
    const line = this.lineOfEntity.get(entity);
    if (!from || !to || !line || Math.hypot(from.x - to.x, from.z - to.z) > HAND_REACH_MM * 2 || this.apart(held.entityId, entity)) return;
    held.nudgedAt = now;
    line.send(encodeEvent({ kind: EVENT.GIVEN, tick: this.channel.world.tick, subject: held.entityId, args: [], text: "" }));
  }

  /**
   * Getting on a van and off it (F-157, riding together). On: the van must be one of the district's, standing at a
   * paragem, its door within reach of the player's body, with a seat free; the player is given a seat and carried.
   * Off: wherever the van is, beside it, at the place the phone asks for when it is near the van and free.
   */
  private rides(line: Line, held: Held, asked: RideAsked): void {
    const traffic = this.traffic;
    const seats = this.district.traffic?.vanSeats ?? [];
    if ("on" in asked) {
      const key = traffic?.keys[asked.on];
      const van = key ? traffic!.poses.find((pose) => pose.key === key && pose.van) : undefined;
      const at = this.channel.placeOf(held.entityId);
      const taken = new Set(this.channel.riders().filter((one) => one.vehicle === asked.on).map((one) => one.seat));
      const free = seats.find((seat) => !taken.has(seat));
      if (this.channel.ridingOf(held.entityId) || this.channel.sittingOf(held.entityId) || !van?.van?.dwelling || !at || Math.hypot(van.x * 1000 - at.x, van.z * 1000 - at.z) > BOARD_REACH_MM || free === undefined) {
        line.send(encodeEvent({ kind: EVENT.RIDE_REFUSED, tick: this.channel.world.tick, subject: asked.on, args: [], text: "" }));
        return;
      }
      this.channel.ride(held.entityId, asked.on, free);
      return;
    }
    const riding = this.channel.ridingOf(held.entityId);
    if (!riding) return;
    const key = traffic?.keys[riding.vehicle];
    const van = key ? traffic!.poses.find((pose) => pose.key === key) : undefined;
    const from = this.channel.placeOf(held.entityId)!;
    // Asked for beside the van, it is believed that far; anything else is beside the van all the same.
    const near = Math.hypot(asked.off.x - (van ? van.x * 1000 : from.x), asked.off.z - (van ? van.z * 1000 : from.z)) <= ALIGHT_REACH_MM;
    const at = near ? { x: asked.off.x, y: from.y, z: asked.off.z, yaw: from.yaw } : from;
    if (!this.channel.alight(held.entityId, at)) this.channel.alight(held.entityId, this.district.arrival);
  }

  /**
   * What a player asks of a table (Task 4B.1): to sit, get up, begin, play, throw. The zone checks where they stand
   * and the rules; their body is seated or stood up as the table says, and everyone near the table is told at once.
   */
  private atTable(line: Line, held: Held, pedido: MesaPedido): void {
    if (!this.mesas) return;
    const now = Date.now();
    if (pedido.pedido === "convidar" || pedido.pedido === "aceitar" || pedido.pedido === "recusar") return this.invites(line, held, pedido, now);
    const at = this.channel.ridingOf(held.entityId) ? null : (this.channel.sittingOf(held.entityId) ?? this.channel.placeOf(held.entityId));
    const done = this.mesas.ask(held.playerId, at, pedido, now);
    if (typeof done === "string") {
      line.send(encodeEvent({ kind: EVENT.MESA_REFUSED, tick: this.channel.world.tick, subject: pedido.mesa, args: [MESA_RECUSAS.indexOf(done)], text: "" }));
      return;
    }
    if ("sit" in done) this.channel.sit(held.entityId, done.sit);
    if ("stand" in done) this.channel.standUp(held.entityId, done.stand);
    this.tellTables(now);
  }

  /**
   * Invitations to play (Task 4B.1): to someone in the channel, never across a block. The one invited is asked; the
   * one who invited is told the answer; a yes keeps a seat for each at the table and tells whoever is near it.
   */
  private invites(line: Line, held: Held, pedido: Extract<MesaPedido, { entidade: number }>, now: number): void {
    const mesas = this.mesas!;
    const other = this.lineOfEntity.get(pedido.entidade);
    const otherHeld = other ? this.held.get(other) : undefined;
    const tick = this.channel.world.tick;
    const refuse = (why: (typeof MESA_RECUSAS)[number]): void => line.send(encodeEvent({ kind: EVENT.MESA_REFUSED, tick, subject: pedido.mesa, args: [MESA_RECUSAS.indexOf(why)], text: "" }));
    if (!other || !otherHeld || this.apart(held.entityId, pedido.entidade)) return refuse("convite");
    if (pedido.pedido === "convidar") {
      const done = mesas.convidar(held.playerId, otherHeld.playerId, pedido.mesa, now);
      if (done !== true) return refuse(done);
      other.send(encodeEvent({ kind: EVENT.CONVITE, tick, subject: held.entityId, args: [pedido.mesa], text: "" }));
      return;
    }
    const done = pedido.pedido === "aceitar" ? mesas.aceitar(held.playerId, otherHeld.playerId, pedido.mesa, now) : mesas.recusar(held.playerId, otherHeld.playerId);
    if (done !== true) return refuse(done);
    other.send(encodeEvent({ kind: EVENT.CONVITE_RESPOSTA, tick, subject: held.entityId, args: [pedido.mesa, pedido.pedido === "aceitar" ? 1 : 0], text: "" }));
    if (pedido.pedido === "aceitar") this.tellTables(now);
  }

  /** Whoever is near a table is told how it stands, when it has changed since they were last told or they have just come near. */
  /** Writes a finished game down (the ranking) and tells each player at it their points now and the change. */
  private record(fim: Terminada): void {
    void recordPartida(this.sql, { districtId: this.district.id, ...fim })
      .then((pontuados) => {
        for (const one of pontuados) {
          this.lineOf(one.playerId)?.send(encodeEvent({ kind: EVENT.PONTOS, tick: this.channel.world.tick, subject: fim.mesa, args: [one.depois, one.depois - one.antes], text: "" }));
        }
      })
      .catch((error: unknown) => this.log(`zone: a game at table ${fim.mesa} of ${this.district.id} was not written down: ${String(error)}`));
  }

  private tellTables(now: number): void {
    const mesas = this.mesas!;
    const entityOf = (playerId: string): number => {
      for (const held of this.held.values()) if (held.playerId === playerId) return held.entityId;
      return this.away.get(playerId)?.held.entityId ?? 0;
    };
    const said = new Map<number, Uint8Array>();
    for (const [line, held] of this.held) {
      const at = this.channel.placeOf(held.entityId);
      if (!at) continue;
      for (let index = 0; index < mesas.count; index++) {
        const table = mesas.placeOf(index)!;
        if (Math.hypot(table.x - at.x, table.z - at.z) > MESA_SEEN_MM) {
          held.tables.delete(index);
          continue;
        }
        if (held.tables.get(index) === mesas.versionOf(index)) continue;
        held.tables.set(index, mesas.versionOf(index));
        let bytes = said.get(index);
        if (!bytes) said.set(index, (bytes = mesas.said(index, entityOf, now)));
        line.send(bytes);
      }
    }
  }

  /**
   * A greeting answered by a greeting is a meeting: a wave, or the words people say ("Bom dia", "Tudo bem?").
   * A wave answered by a wave is a meeting (the founder, 2026-11-17: nobody arrives knowing anybody). When someone
   * waves and another who is close waved a moment ago, both are told they have met: once a pair, and never across
   * a block. What each phone does with knowing someone is its own (their name shown as they pass, for now).
   */
  private greets(held: Held, now: number): void {
    held.wavedAt = now;
    const here = this.channel.placeOf(held.entityId);
    if (!here) return;
    const tick = this.channel.world.tick;
    for (const [line, other] of this.held) {
      if (other === held || now - other.wavedAt > GREETING_WITHIN_MS || held.met.has(other.entityId) || this.apart(held.entityId, other.entityId)) continue;
      const there = this.channel.placeOf(other.entityId);
      if (!there || Math.hypot(there.x - here.x, there.z - here.z) > GREETING_WITHIN_MM) continue;
      held.met.add(other.entityId);
      other.met.add(held.entityId);
      // Said where the API can read it, for a while: "cumprimenta quem chegou" asks whether one was new.
      held.metPlayers.add(other.playerId);
      other.metPlayers.add(held.playerId);
      void this.presence?.mark(held.playerId, "conheceu", [...held.metPlayers].slice(-20).join(","), MET_TTL_S).catch(() => {});
      void this.presence?.mark(other.playerId, "conheceu", [...other.metPlayers].slice(-20).join(","), MET_TTL_S).catch(() => {});
      line.send(encodeEvent({ kind: EVENT.MET, tick, subject: held.entityId, args: [], text: "" }));
      this.lineOfEntity.get(held.entityId)?.send(encodeEvent({ kind: EVENT.MET, tick, subject: other.entityId, args: [], text: "" }));
    }
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

  /**
   * What staff have done to anyone here is carried out (Task 3.8): asked of the database every few seconds, one
   * question for the whole channel. Silenced: nothing they say is passed on. Suspended or banned: put out, and the
   * matchmaker will not let them back. Kicked (stuck somewhere): put out once, to come in again at the district's door.
   */
  private async heed(): Promise<void> {
    const ids = this.who;
    if (ids.length === 0) return;
    let against: Awaited<ReturnType<typeof standingAgainst>>;
    try {
      against = await standingAgainst(this.sql, ids);
    } catch (error) {
      this.log(`zone: could not read what stands against the players of channel ${this.number}: ${String(error)}`);
      return;
    }
    this.muted.clear();
    for (const one of against) if (one.kind === "mute") this.muted.add(one.playerId);
    for (const one of against) {
      if (one.kind === "mute" || this.kicked.has(one.id)) continue;
      if (one.kind === "kick") this.kicked.add(one.id);
      const line = await this.putOut(one.playerId);
      line?.close(ZONE_CLOSE.PUT_OUT);
      // A stuck player comes back at the door, not into the wall they were stuck in.
      if (one.kind === "kick") await this.keep(one.playerId, this.district.arrival);
      this.changed();
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
    // A step of play for everyone here: their needs wear with it, and whoever sits or rides rests (Task 4.4).
    for (const held of this.held.values()) {
      held.needs.steps++;
      if (this.channel.sittingOf(held.entityId) || this.channel.ridingOf(held.entityId)) held.needs.rest++;
    }
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
      void this.heed();
      if (tick % STEPS_A_CHECKPOINT === 0 && this.talk) void this.reread();
    }
    // The street's traffic, for everyone in the channel at once (F-152): ten times a second it is decided who waits
    // for whom, among every player on foot and the people of the street; a few times a second each phone is told.
    if (this.traffic && tick % STEPS_A_TRAFFIC === 0) {
      const now = Date.now();
      const people = this.channel.entities().filter((one) => one.kind === "player").map((one) => ({ x: one.x / 1000, z: one.z / 1000 }));
      const street = (this.district.traffic?.crowd ?? []).map((actor) => actorAt(actor, now / 1000)).filter((at) => at.speed > 0);
      this.traffic.step(now, this.trafficAt === 0 ? STEPS_A_TRAFFIC * STEP_MS : now - this.trafficAt, [...people, ...street], people);
      this.trafficAt = now;
      if (tick % STEPS_A_TRAFFIC_SAID === 0) {
        const bytes = encodeTraffic(this.traffic.state(now));
        for (const line of this.held.keys()) line.send(bytes);
      }
    }
    // Whoever rides a van is carried with it: where the zone's traffic has the van, they are. A van gone from the
    // road (its day is over) puts its riders down where it was.
    if (this.traffic) {
      for (const rider of this.channel.riders()) {
        const key = this.traffic.keys[rider.vehicle];
        const van = this.traffic.poses.find((pose) => pose.key === key);
        const at = this.channel.placeOf(rider.id);
        if (van) this.channel.carry(rider.id, { x: Math.round(van.x * 1000), y: Math.round(van.y * 1000), z: Math.round(van.z * 1000), yaw: Math.round(((van.heading * 18_000) / Math.PI + 36_000) % 36_000) });
        else if (at) this.channel.alight(rider.id, at);
      }
    }
    // Whoever stands at a caixa is said to be there, so that the API will bank for them (Task 4.1): looked for four
    // times a second, so that someone who has just walked up is not told to come closer, and said once a second.
    if (tick % STEPS_A_LOOK === 0 && this.presence && (this.district.caixas?.length ?? 0) > 0) {
      const now = Date.now();
      for (const held of this.held.values()) {
        if (now - held.markedAt < MARK_EVERY_MS) continue;
        const at = this.channel.placeOf(held.entityId);
        if (!at || !this.district.caixas!.some((caixa) => Math.hypot(caixa.x - at.x, caixa.z - at.z) <= CAIXA_REACH_MM)) continue;
        held.markedAt = now;
        void this.presence.mark(held.playerId, "caixa").catch(() => {});
      }
    }
    // And whoever stands at a shop, which one: the API sells only to someone the zone says is at it (Task 4.3).
    if (tick % STEPS_A_LOOK === 0 && this.presence && (this.district.shops?.length ?? 0) > 0) {
      const now = Date.now();
      for (const held of this.held.values()) {
        if (now - held.shopAt < MARK_EVERY_MS) continue;
        const at = this.channel.placeOf(held.entityId);
        const shop = at && !this.channel.ridingOf(held.entityId) ? this.district.shops!.find((one) => Math.hypot(one.x - at.x, one.z - at.z) <= SHOP_REACH_MM) : undefined;
        if (!shop) continue;
        held.shopAt = now;
        void this.presence.mark(held.playerId, "loja", shop.id).catch(() => {});
      }
    }
    // And which of the district's places a player stands at, as "<its number>/<how many there are>": an errand at a
    // place is done only where the zone says the player is (os recados do dia).
    if (tick % STEPS_A_LOOK === 0 && this.presence && (this.district.places?.length ?? 0) > 0) {
      const now = Date.now();
      const places = this.district.places!;
      for (const held of this.held.values()) {
        if (now - held.placeAt < MARK_EVERY_MS) continue;
        const at = this.channel.placeOf(held.entityId);
        const index = at && !this.channel.ridingOf(held.entityId) ? places.findIndex((one) => Math.hypot(one.x - at.x, one.z - at.z) <= PLACE_REACH_MM) : -1;
        if (index < 0) continue;
        held.placeAt = now;
        void this.presence.mark(held.playerId, "lugar", `${index}/${places.length}`).catch(() => {});
      }
    }
    // The tables: time passes at them (a kota plays, a turn runs out, the next game begins), and whoever is near is
    // told what changed. Someone whose seat was given to a kota for letting their turns run out is stood up.
    if (tick % STEPS_A_LOOK === 0 && this.mesas) {
      const now = Date.now();
      for (const one of this.mesas.step(now)) {
        const line = this.lineOf(one.playerId);
        const entity = line ? this.held.get(line)!.entityId : this.away.get(one.playerId)?.held.entityId;
        if (entity !== undefined) this.channel.standUp(entity, one.stand);
      }
      // A game ended with players at it is written down, and each of them told what it did to their points.
      for (const fim of this.mesas.acabadas()) this.record(fim);
      this.tellTables(now);
    }
    // And whoever stands close to another is said to be with them, so that the API will let one hand the other
    // Makuta (Task 4.1): the few nearest within arm's reach, said when it changes and once a second while it is so.
    if (tick % STEPS_A_LOOK === 0 && this.presence && this.held.size > 1) {
      const now = Date.now();
      const places = [...this.held.values()].map((held) => ({ held, at: this.channel.placeOf(held.entityId) }));
      for (const me of places) {
        if (!me.at) continue;
        const near = places
          .filter((other) => other !== me && other.at && !this.apart(me.held.entityId, other.held.entityId) && (this.channel.ridingOf(other.held.entityId)?.vehicle ?? null) === (this.channel.ridingOf(me.held.entityId)?.vehicle ?? null))
          .map((other) => ({ id: other.held.playerId, far: Math.hypot(other.at!.x - me.at!.x, other.at!.z - me.at!.z) }))
          .filter((other) => other.far <= HAND_REACH_MM)
          .sort((a, b) => a.far - b.far)
          .slice(0, 6)
          .map((other) => other.id)
          .join(",");
        if (near === "" || (near === me.held.withWhom && now - me.held.withAt < MARK_EVERY_MS)) {
          if (near === "") me.held.withWhom = "";
          continue;
        }
        me.held.withWhom = near;
        me.held.withAt = now;
        void this.presence.mark(me.held.playerId, "com", near).catch(() => {});
      }
    }
    // Where each player stands is written down once every five seconds, and where it lasts once every thirty: each
    // in a step of their own, not all eighty in one: no step carries the whole channel's writing (finding F-182).
    const slot = tick % STEPS_A_NOTE;
    const lasting = Math.floor(tick / STEPS_A_NOTE) % (STEPS_A_CHECKPOINT / STEPS_A_NOTE) === 0;
    let n = 0;
    for (const [line, held] of this.held) {
      if (n++ % STEPS_A_NOTE !== slot) continue;
      const at = this.channel.placeOf(held.entityId);
      if (at) void this.keep(held.playerId, at, lasting);
      this.tendNeeds(line, held, lasting);
    }
    const took = performance.now() - began;
    this.pace.steps++;
    this.pace.lastMs = took;
    this.pace.totalMs += took;
    if (took > this.pace.worstMs) this.pace.worstMs = took;
    this.pace.sinceSteps++;
    this.pace.sinceTotalMs += took;
    if (took > this.pace.sinceWorstMs) this.pace.sinceWorstMs = took;
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
   * Writes down where a player stands: always in the note, which their kambas read to go to them (Task 4B.2), and
   * where it lasts when `lasting` and this is a district the database knows (not a rehearsal town).
   * A failure is said and survived: the player goes on playing.
   */
  private async keep(playerId: string, at: Place, lasting = true): Promise<void> {
    const where = { districtId: this.district.id, x: at.x, y: at.y, z: at.z };
    try {
      await this.presence?.stand(playerId, { ...where, yaw: at.yaw });
      if (lasting && this.remember) await keepWhereabouts(this.sql, playerId, this.district.provinceId, where);
    } catch (error) {
      this.log(`zone: could not keep where ${playerId} stands: ${String(error)}`);
    }
  }
}
