// One channel with people on the ends of sockets (Task 3.1): a Channel, the
// database, and whoever is connected. The channel knows the world; this
// knows who is on which line, tells each what they should see, and writes
// down where they stood when they go.
//
// It does not know what a socket is made of: it is handed something that can
// send bytes and be closed (server.ts makes those from WebSockets, a test may
// make them from nothing). Every byte is ours (packages/protocol).

import { isGreeting } from "@nzila/i18n";
import { TrafficRules, actorAt, cellsOf, mayStand, nearestPavement, type HomeKind, type SetDown } from "@nzila/world";
import { adultOf, eatOne, faceOf, familyHomeOf, moveThing, setDown, takeUp, thingsOf, type HomeThing, keepChatLines, keepNeeds, needsOf, presenteEntre, recordPartida, keepWhereabouts, shutOutOf, standingAgainst, whereaboutsOf, type ChatLine } from "@nzila/db";
import { BASE_CATALOGUE, BASE_TUNABLES, unitsCarried, type Tunables } from "@nzila/economy";
import { BASE_BISCATOS, isBiscatoKind } from "@nzila/economy/biscatos";
import { randomInt } from "node:crypto";
import { decayNeeds, eatNeeds, restNeeds, spendEffort, tooTired, type NeedsState } from "@nzila/sim";
import { type ChatFilter } from "@nzila/i18n";
import {
  type EntityState,
  type RideAsked,
  type BiscatoPedido,
  type CorridaPedido,
  type SairPedido,
  type ADoisPedido,
  A_DOIS_DITOS,
  GESTOS_A_DOIS,
  HIRED_VEHICLE_BASE,
  encodeTraffic,
  EVENT,
  MESA_RECUSAS,
  PROTOCOL_VERSION,
  ZONE_CLOSE,
  arrivalLook,
  settleLook,
  decodeClientMessage,
  encodeChatHeard,
  encodeChatTyping,
  encodeEvent,
  encodeJoinAccepted,
  encodeWho,
  type ChatSend,
  type MesaPedido,
  CHAT_REFUSAL,
} from "@nzila/protocol";
import { MOVEIS_AT_MOST, MOVEL_OPS, MOVEL_RECUSAS } from "@nzila/protocol/casa";
import { CORRIDA_FASES, CORRIDA_KINDS, encodeCorridas } from "@nzila/protocol/corridas";
import { SAIR_DITOS, SAIR_FINS, SAIR_RECUSAS, type SairDito, type SairRecusa } from "@nzila/protocol/sair";
import { Saidas, type Fim, type Saida } from "./saidas.ts";
import { BolaDoCampo, type Kicker } from "./bola.ts";
import { type Presence } from "@nzila/presence";
import { type Sql } from "postgres";
import { BISCATO_GRACE_MS, BISCATO_NOTE_S, scoreRonda, spotNear, takeInputs, type Ronda } from "./biscatos.ts";
import { Channel, type Place } from "./channel.ts";
import { BOARD_REACH_MM as RIDE_REACH_MM, Corridas, poseOf, type Corrida } from "./corridas.ts";
import { CAIXA_REACH_MM, GATEWAY_REACH_MM, MET_TTL_S, PLACE_REACH_MM, SHOP_REACH_MM, type District } from "./district.ts";
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
  /** The game's numbers in play (Task 4.6): read as they are needed, so that a change reaches a running zone. The file's when not given. */
  readonly tunables?: () => Tunables;
  /**
   * For the tests, and for nothing that players reach: someone who says they got off at "casa" is set down before
   * their own door. A phone is otherwise believed as far as a paragem and no farther.
   */
  readonly doorstep?: boolean;
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
  /** The campos whose ball they have been told of since they came near. */
  bolas: Set<number>;
  /** When they were last said to be standing where something is done for them. */
  servicoAt: number;
  /** When they were last said to be standing at a way out to another bairro. */
  portaAt: number;
  shopAt: number;
  placeAt: number;
  /** The players this one has met in this channel, by their ids: the API asks whether one of them is new. */
  metPlayers: Set<string>;
  /** The tables near them, and the version of each they were last told: a table is told again when it changes, or when they come near again. */
  tables: Map<number, number>;
  /** Their Fome and Energia, and whether something they asked to eat is being written. */
  needs: NeedsKept;
  eating: boolean;
  /** The biscato they are playing, if they are (Task 4.5). */
  ronda: Ronda | null;
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
/** How near a bench's seat a player must stand to sit on it, and how far in front of it they stand up. Millimetres. */
const BENCH_REACH_MM = 2500;
/** How near the middle of their doorway someone stands to open or shut their door; and the doorway itself, where nobody may be when it shuts. */
export const DOOR_REACH_MM = 2500;
const DOORWAY_HALF_MM = 700;
const DOORWAY_DEEP_MM = 550;
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
  private readonly doorstep: boolean;
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

  private readonly tunables: () => Tunables;
  /** Rides asked for in this channel (Task 6.2). */
  private readonly corridas: Corridas;
  /** Going out (Task 10.13): who is out with whom, when the district has places for it; and who here is 18 or over. */
  private readonly saidas: Saidas | null;
  /** The ball of each campo (2026-11-21), and where each body was a step ago: how fast it is going is what kicks. */
  private readonly bolas: BolaDoCampo[];
  private readonly wasAt = new Map<number, { x: number; z: number }>();
  private readonly adults = new Set<string>();

  constructor(deps: ZoneDeps, number: number, changed: () => void = () => {}) {
    this.changed = changed;
    this.holdMs = deps.holdMs ?? HOLD_MS;
    this.doorstep = deps.doorstep === true;
    this.talk = deps.filter ? new Talk(deps.filter) : null;
    this.sql = deps.sql;
    this.district = deps.district;
    this.remember = deps.remember ?? true;
    this.presence = deps.presence ?? null;
    this.holds = deps.holds ?? CHANNEL_HOLDS;
    this.tunables = deps.tunables ?? (() => BASE_TUNABLES);
    this.corridas = new Corridas(deps.district.ground);
    this.saidas = (deps.district.outings?.length ?? 0) > 0 ? new Saidas(deps.district.outings!.length) : null;
    this.bolas = (deps.district.campos ?? []).map((campo) => new BolaDoCampo(campo, Date.now()));
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
      this.held.set(line, { entityId: back.entityId, playerId, told: new Set(), heard: 0, strikes: 0, typing: false, gestureAt: 0, wavedAt: 0, met: back.met, markedAt: 0, withWhom: "", withAt: 0, nudgedAt: 0, bolas: new Set(), portaAt: 0, servicoAt: 0, shopAt: 0, placeAt: 0, metPlayers: back.metPlayers, tables: new Map(), needs: back.needs, eating: false, ronda: null });
      this.lineOfEntity.set(back.entityId, line);
      line.send(encodeJoinAccepted({ protocolVersion: PROTOCOL_VERSION, entityId: back.entityId, tick: this.channel.world.tick, serverTimeMs: Date.now(), provinceId: district.provinceId, districtId: district.id, channel: this.number }));
      this.welcome(line);
      this.tellNeeds(line, this.held.get(line)!, "");
      return true;
    }
    this.arriving++;
    const [last, face, apart, against, needs, adult, given] = await Promise.all([this.remember ? this.lastPlace(playerId) : null, faceOf(this.sql, playerId), this.talk || this.saidas ? shutOutOf(this.sql, playerId) : [], this.talk ? standingAgainst(this.sql, [playerId]) : [], needsOf(this.sql, playerId), adultOf(this.sql, playerId), district.homes ? familyHomeOf(this.sql, playerId) : null]).finally(() => this.arriving--);
    // The family's house, when it is in this bairro (Phase 5, D-5.8): open to them and to nobody else, its inside
    // theirs alone. Someone who went to sleep in it wakes where they lay. Someone who has not stood here wakes in a
    // public place of the bairro, among people, and walks home from there (the founder, 2026-11-22, D-5.10).
    const house = given && given.districtId === district.id ? given.house : 0;
    const home = house ? (district.homes?.(house, playerId, () => this.doors.has(house), (cx, cz) => this.under.get(playerId)?.has(`${cx},${cz}`) === true) ?? null) : null;
    if (home) {
      this.homes.set(playerId, { house, door: home.door, kind: home.kind, cellAt: home.cellAt });
      // What they have set down in it (Task 5.3): where it stands, nobody walks.
      this.furnish(playerId, await thingsOf(this.sql, playerId));
    } else this.homes.delete(playerId);
    this.shut.set(playerId, new Set(apart));
    // Whether they are 18 or over is learned once, here (D-10.3, F-113): going out is for two adults.
    if (adult) this.adults.add(playerId);
    else this.adults.delete(playerId);
    // Silenced by a moderator before they came in: silent from their first word.
    if (against.some((one) => one.kind === "mute")) this.muted.add(playerId);
    else this.muted.delete(playerId);
    const wakes = district.wakes ?? [district.arrival];
    let at: Place = last ?? wakes[[...playerId].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % wakes.length]!;
    // Off a van at a paragem: the vans are each phone's own until the zone runs them (F-152), so the phone says
    // which paragem and the zone puts them beside it. It is believed that far and no farther: a paragem, never a place.
    const stop = paragem === undefined ? undefined : district.paragens.get(paragem);
    if (stop) at = stop;
    if (standing) at = standing;
    // Before their own door, a pace and a half out from it: for the tests alone.
    if (this.doorstep && paragem === "casa" && home) {
      // Houses look up or down the bairro: out of the door is along Z, away from where its family wakes.
      at = { x: home.door.x, y: home.wake.y, z: Math.round(home.door.z + Math.sign(home.door.z - home.wake.z) * 1500), yaw: home.wake.yaw };
    }
    const entityId = this.channel.join(playerId, at, home?.own) ?? this.channel.join(playerId, district.arrival, home?.own);
    if (entityId === null) return false;
    // The look is sent as it would be accepted today: what was stored under an older catalogue is not passed on blind.
    // One who has not chosen yet is given a look of their own, from who they are: a street of newcomers is not one person many times.
    const look = settleLook(face.look) ?? arrivalLook(seedOf(playerId));
    this.faces.set(entityId, encodeWho({ entityId, name: face.name, bi: face.biNumber, look }));
    this.held.set(line, { entityId, playerId, told: new Set(), heard: 0, strikes: 0, typing: false, gestureAt: 0, wavedAt: 0, met: new Set(), markedAt: 0, withWhom: "", withAt: 0, nudgedAt: 0, bolas: new Set(), portaAt: 0, servicoAt: 0, shopAt: 0, placeAt: 0, metPlayers: new Set(), tables: new Map(), needs: { base: needs, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(needs, this.rules.tiredBelow) }, eating: false, ronda: null });
    this.lineOfEntity.set(entityId, line);
    this.channel.setTired(entityId, tooTired(needs, this.rules.tiredBelow));
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
    // What they have set down in their house, when it is in this bairro.
    const whose = this.held.get(line)?.playerId;
    if (whose && this.homes.get(whose)?.kind) this.tellThings(line, whose);
    // The doors that stand open, as they were left.
    for (const house of this.doors) line.send(encodeEvent({ kind: EVENT.PORTA, tick: this.channel.world.tick, subject: 0, args: [house, 1], text: "" }));
    // Back on a new line while out with someone: told again, so that the phone shows it.
    const held = this.held.get(line);
    const saida = held ? this.saidas?.of(held.playerId) : null;
    if (held && saida) this.tellSair(held.playerId, Saidas.other(saida, held.playerId), "combinado", saida.lugar);
    const rides = this.corridas.said(Date.now());
    if (rides.rides.length > 0) line.send(encodeCorridas(rides));
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
    // Whoever they were out with is told it is over; what they asked, and were asked, is no more.
    const saida = this.saidas?.terminar(held.playerId);
    if (saida) this.tellSair(Saidas.other(saida, held.playerId), held.playerId, "fim", SAIR_FINS.indexOf("saiu"));
    this.saidas?.forget(held.playerId);
    this.ofertas.delete(held.entityId);
    this.wasAt.delete(held.entityId);
    this.adults.delete(held.playerId);
    // A ride they called drives off.
    const called = this.corridas.of(held.entityId);
    if (called) {
      this.corridas.leave(called, Date.now());
      this.tellCorridas();
    }
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
      else if (message.type === "biscato") this.biscato(line, held, message.pedido);
      else if (message.type === "corrida") this.corrida(line, held, message.pedido);
      else if (message.type === "sair") this.sair(held, message.pedido);
      else if (message.type === "a_dois") this.aDois(line, held, message.pedido);
      // Over to the other side of a campo's match: the ball's own rules say whether, and its next step tells everyone.
      else if (message.type === "lado") this.bolas[message.campo]?.trocar(held.playerId, Date.now());
      else if (message.type === "porta") this.porta(held, message.open);
      else if (message.type === "movel") this.movel(line, held, message);
      // A second "join" on a line already in means nothing.
    } catch {
      this.strike(line, held);
    }
  }

  /** The needs' rules in play now: the newest version of the tunables (D-4.24). */
  private get rules(): Tunables["needs"] {
    return this.tunables().needs;
  }

  /** Fome and Energia as they are now: what was last set, worn by the steps since, the fast steps and the jumps (Task 4.4). */
  private needsNow(held: Held): NeedsState {
    const kept = held.needs;
    return spendEffort(restNeeds(decayNeeds(kept.base, kept.steps, this.rules), kept.rest, this.rules), kept.fast, kept.jumps, this.rules);
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
    const ronda = held.ronda;
    if (ronda && performance.now() > ronda.startedAt + ronda.lengthMs + BISCATO_GRACE_MS) this.endRonda(line, held);
    this.takeEffort(held);
    const now = this.needsNow(held);
    const tired = tooTired(now, this.rules.tiredBelow);
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

  /** Everyone in the channel is told of the rides on its roads, as they are now. */
  private tellCorridas(): void {
    const bytes = encodeCorridas(this.corridas.said(Date.now()));
    for (const line of this.held.keys()) line.send(bytes);
  }

  /** The player who called a ride is told where it is in its corrida (and why, when it ends or is not given). */
  private tellRide(ride: Corrida, text = ""): void {
    const bytes = encodeEvent({ kind: EVENT.CORRIDA, tick: this.channel.world.tick, subject: 0, args: [ride.vehicle, CORRIDA_FASES.indexOf(ride.fase)], text: text || ride.kind });
    this.lineOfEntity.get(ride.entity)?.send(bytes);
    // A táxi for two (D-10.5): whoever rides along is told the same.
    if (ride.com !== null) this.lineOfEntity.get(ride.com)?.send(bytes);
  }

  /** The body a player has in this channel, here or on a line that dropped; 0 when they have none. */
  private entityOf(playerId: string): number {
    for (const held of this.held.values()) if (held.playerId === playerId) return held.entityId;
    return this.away.get(playerId)?.held.entityId ?? 0;
  }

  /** Says something of an outing to one of the two: what, about whom, and a number (the place, or why). */
  private tellSair(to: string, about: string, what: SairDito, n: number, counter = false): void {
    this.lineOf(to)?.send(encodeEvent({ kind: EVENT.SAIR, tick: this.channel.world.tick, subject: this.entityOf(about), args: counter ? [SAIR_DITOS.indexOf(what), n, 1] : [SAIR_DITOS.indexOf(what), n], text: "" }));
  }

  /**
   * Convidar para sair (Task 10.13, D-10.3). Only between two who are both 18 or over and neither of whom has shut
   * the other out: looked at again at every step, and said the same ("nao_pode") whichever it was, so that nothing
   * is learned of the other. The one asked is asked; the one who asked is told the answer; agreed, both are told.
   */
  private sair(held: Held, pedido: SairPedido): void {
    const saidas = this.saidas;
    if (!saidas) return;
    const now = Date.now();
    const me = held.playerId;
    const refuse = (why: SairRecusa): void => this.lineOf(me)?.send(encodeEvent({ kind: EVENT.SAIR, tick: this.channel.world.tick, subject: "entidade" in pedido ? pedido.entidade : 0, args: [SAIR_DITOS.indexOf("recusado"), SAIR_RECUSAS.indexOf(why)], text: "" }));
    if (pedido.op === "terminar") {
      const saida = saidas.terminar(me);
      if (saida) this.endSaida(saida, "terminou");
      return;
    }
    const otherLine = this.lineOfEntity.get(pedido.entidade);
    const other = otherLine ? this.held.get(otherLine) : undefined;
    if (!other || other === held || !this.adults.has(me) || !this.adults.has(other.playerId) || this.apart(held.entityId, pedido.entidade)) return refuse("nao_pode");
    const them = other.playerId;
    if (pedido.op === "convidar") {
      const done = saidas.convidar(me, them, pedido.lugar, now);
      if (done !== true) return refuse(done);
      return this.tellSair(them, me, "convite", pedido.lugar);
    }
    if (pedido.op === "outro") {
      const done = saidas.outro(me, them, pedido.lugar, now);
      if (done !== true) return refuse(done);
      return this.tellSair(them, me, "convite", pedido.lugar, true);
    }
    if (pedido.op === "recusar") {
      const done = saidas.recusar(me, them, now);
      if (done !== true) return refuse(done);
      return this.tellSair(them, me, "nao", 0);
    }
    const saida = saidas.aceitar(me, them, now);
    if (typeof saida === "string") return refuse(saida);
    this.tellSair(me, them, "combinado", saida.lugar);
    this.tellSair(them, me, "combinado", saida.lugar);
  }

  /** A gesture for two offered and not yet answered: who offered it, to whom, which, and when. One at a time each. */
  private readonly ofertas = new Map<number, { to: number; gesto: number; at: number }>();

  /**
   * A gesture for two (the founder, 2026-11-21): a handshake, for anyone; a hug, between two adults. Offered to
   * someone within arm's reach who has not shut the offerer out; made only when the other says yes, and then seen by
   * whoever sees them. Checked again at the yes. Why not is never said beyond "not now".
   */
  private aDois(line: Line, held: Held, pedido: ADoisPedido): void {
    const now = Date.now();
    const tick = this.channel.world.tick;
    const tell = (to: Line | undefined, subject: number, args: number[]): void => to?.send(encodeEvent({ kind: EVENT.A_DOIS, tick, subject, args, text: "" }));
    const otherLine = this.lineOfEntity.get(pedido.entidade);
    const other = otherLine ? this.held.get(otherLine) : undefined;
    const may = (gesto: number): boolean => {
      const a = this.channel.placeOf(held.entityId);
      const c = other ? this.channel.placeOf(other.entityId) : undefined;
      if (!other || other === held || !a || !c || this.apart(held.entityId, other.entityId)) return false;
      if (Math.hypot(a.x - c.x, a.z - c.z) > HAND_REACH_MM * 1.5) return false;
      if (this.channel.ridingOf(held.entityId) || this.channel.ridingOf(other.entityId) || this.channel.sittingOf(held.entityId) || this.channel.sittingOf(other.entityId)) return false;
      // A hug is between two adults (D-0.34's line: nothing of the kind across the age bands).
      return GESTOS_A_DOIS[gesto] !== "abracar" || (this.adults.has(held.playerId) && this.adults.has(other.playerId));
    };
    if (pedido.op === "oferecer") {
      if (now - held.gestureAt < GESTURE_GAP_MS) return;
      held.gestureAt = now;
      if (!may(pedido.gesto)) return tell(line, pedido.entidade, [A_DOIS_DITOS.indexOf("nao_pode")]);
      this.ofertas.set(held.entityId, { to: pedido.entidade, gesto: pedido.gesto, at: now });
      return tell(otherLine, held.entityId, [A_DOIS_DITOS.indexOf("pedido"), pedido.gesto]);
    }
    const offer = this.ofertas.get(pedido.entidade);
    if (!offer || offer.to !== held.entityId || now - offer.at > 30_000) return tell(line, pedido.entidade, [A_DOIS_DITOS.indexOf("nao_pode")]);
    this.ofertas.delete(pedido.entidade);
    if (pedido.op === "recusar") return tell(otherLine, held.entityId, [A_DOIS_DITOS.indexOf("nao")]);
    if (!may(offer.gesto)) return tell(line, pedido.entidade, [A_DOIS_DITOS.indexOf("nao_pode")]);
    const bytes = encodeEvent({ kind: EVENT.A_DOIS, tick, subject: pedido.entidade, args: [A_DOIS_DITOS.indexOf("feito"), held.entityId, offer.gesto], text: "" });
    for (const [one, seeing] of this.held) {
      const sees = this.channel.seenBy(seeing.entityId);
      if (seeing === held || seeing === other || sees.includes(held.entityId) || sees.includes(pedido.entidade)) one.send(bytes);
    }
    // A handshake is a greeting: the two have met, as after a wave answered.
    if (other) {
      held.wavedAt = now;
      this.greets(other, now);
    }
  }

  /** How far from a campo its ball is told of, and how near its edge a body must be to play. Millimetres. */
  private static readonly BOLA_SEEN_MM = 90_000;
  private static readonly BOLA_PLAYED_MM = 4000;

  /**
   * The balls (2026-11-21): every step, whoever is on foot on or beside a campo may kick its ball by going into
   * it; a kick, a bounce and a goal are told to whoever is near, and someone who has just come near is told where
   * the ball is.
   */
  private stepBolas(): void {
    const now = Date.now();
    const tick = this.channel.world.tick;
    for (const [n, bola] of this.bolas.entries()) {
      const { x0, z0, x1, z1 } = bola.campo;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const near: Kicker[] = [];
      const watching: { line: Line; held: Held }[] = [];
      for (const [line, held] of this.held) {
        const at = this.channel.placeOf(held.entityId);
        if (!at || Math.hypot(at.x - cx, at.z - cz) > ChannelRoom.BOLA_SEEN_MM) {
          held.bolas.delete(n);
          continue;
        }
        watching.push({ line, held });
        const was = this.wasAt.get(held.entityId);
        const m = ChannelRoom.BOLA_PLAYED_MM;
        if (was && at.x > x0 - m && at.x < x1 + m && at.z > z0 - m && at.z < z1 + m && !this.channel.ridingOf(held.entityId) && !this.channel.sittingOf(held.entityId)) {
          near.push({ id: held.entityId, playerId: held.playerId, x: at.x, z: at.z, vx: ((at.x - was.x) * 1000) / STEP_MS, vz: ((at.z - was.z) * 1000) / STEP_MS, on: at.x >= x0 && at.x <= x1 && at.z >= z0 && at.z <= z1 });
        }
      }
      const { moved, golo, lados } = bola.step(now, near);
      const side = (id: number, lado: number): Uint8Array => encodeEvent({ kind: EVENT.LADO, tick, subject: id, args: [n, lado, bola.placar[0], bola.placar[1]], text: "" });
      const said = (): Uint8Array => encodeEvent({ kind: EVENT.BOLA, tick, subject: n, args: [bola.state.x, bola.state.z, bola.state.vx, bola.state.vz, now - bola.state.atMs], text: "" });
      const bytes = moved ? said() : null;
      for (const { line, held } of watching) {
        // Someone who has just come near is told where the ball lies and who is on which side.
        const came = !held.bolas.has(n);
        if (bytes) line.send(bytes);
        else if (came) line.send(said());
        if (came) for (const one of bola.lados.values()) line.send(side(one.id, one.lado));
        held.bolas.add(n);
      }
      for (const change of lados) {
        const told = side(change.id, change.lado);
        for (const { line } of watching) line.send(told);
      }
      if (golo) {
        const scored = encodeEvent({ kind: EVENT.GOLO, tick, subject: golo.id, args: [n, golo.total, golo.lado, golo.placar[0], golo.placar[1], golo.fim ? 1 : 0], text: "" });
        for (const { line } of watching) line.send(scored);
      }
    }
    for (const held of this.held.values()) {
      const at = this.channel.placeOf(held.entityId);
      if (at) this.wasAt.set(held.entityId, { x: at.x, z: at.z });
    }
  }

  /** An outing is over: both are told, and why. */
  private endSaida(saida: Saida, porque: Fim): void {
    this.tellSair(saida.a, saida.b, "fim", SAIR_FINS.indexOf(porque));
    this.tellSair(saida.b, saida.a, "fim", SAIR_FINS.indexOf(porque));
  }

  /** Time passes for those who are out: arrived together at the place, apart too long, grown late; or no longer allowed. */
  private stepSaidas(): void {
    const saidas = this.saidas;
    if (!saidas) return;
    const where = (playerId: string): { x: number; z: number } | null => this.channel.placeOf(this.entityOf(playerId));
    const { chegaram, fim } = saidas.step(Date.now(), where, this.district.outings ?? []);
    for (const saida of chegaram) {
      this.tellSair(saida.a, saida.b, "chegaram", saida.lugar);
      this.tellSair(saida.b, saida.a, "chegaram", saida.lugar);
    }
    for (const one of fim) this.endSaida(one.saida, one.porque);
    // One has shut the other out since: it is over, said as an ending like any other.
    for (const held of this.held.values()) {
      const saida = saidas.of(held.playerId);
      if (saida && saida.a === held.playerId && this.shut.get(saida.a)?.has(saida.b) === true) {
        saidas.terminar(saida.a);
        this.endSaida(saida, "terminou");
      }
    }
  }

  /**
   * Puts a rider down off a ride: on the pavement nearest the side they get off on, out of the road; where there is
   * none near, beside the ride; failing that, where people arrive.
   */
  private setDown(entity: number, at: { x: number; z: number; heading: number }): void {
    const side = { x: Math.round(at.x + Math.cos(at.heading) * 1800), z: Math.round(at.z - Math.sin(at.heading) * 1800) };
    const kerb = nearestPavement(this.corridas.ground, side, 10_000);
    const pose = { ...(kerb ?? side), y: this.channel.placeOf(entity)?.y ?? 0, yaw: Math.round(((at.heading * 18_000) / Math.PI + 36_000) % 36_000) };
    if (!this.channel.alight(entity, pose)) this.channel.alight(entity, this.district.arrival);
  }

  /**
   * A ride (Task 6.2, D-6.5). "pedir": the API's note says it is paid; the zone sends it from along the road, or says
   * why not and leaves a note for the fare to be given back. "subir": on, at the kerb, within reach. "descer": off
   * now, beside it; called off before getting on, the fare comes back.
   */
  private corrida(line: Line, held: Held, pedido: CorridaPedido): void {
    const refuse = (why: string): void => line.send(encodeEvent({ kind: EVENT.CORRIDA_RECUSADA, tick: this.channel.world.tick, subject: 0, args: [], text: why }));
    const giveBack = async (id: string, why: string): Promise<void> => {
      await (this.presence?.mark(held.playerId, "corrida-devolver", id, 600) ?? Promise.resolve()).catch(() => {});
      refuse(why);
    };
    const now = Date.now();
    const ride = this.corridas.of(held.entityId);
    if (pedido.op === "pedir") {
      if (ride || this.channel.ridingOf(held.entityId) || this.channel.sittingOf(held.entityId)) return refuse("ocupado");
      const at = this.channel.placeOf(held.entityId);
      if (!at || !this.presence) return refuse("nao_paga");
      void this.presence.marked(held.playerId, "corrida").then((note) => {
        const [id, kind, x, z, dois] = (note ?? "").split(":");
        const which = CORRIDA_KINDS.find((one) => one === kind);
        if (id !== pedido.id || !which || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) return refuse("nao_paga");
        // A táxi for two (D-10.5): only a táxi, and only for someone who is out with somebody; they ride beside them.
        const saida = dois === "2" && which === "taxi" ? this.saidas?.of(held.playerId) : null;
        const com = saida ? this.entityOf(Saidas.other(saida, held.playerId)) || null : null;
        const made = this.corridas.ask({ id, kind: which, playerId: held.playerId, entity: held.entityId, com }, at, { x: Number(x), z: Number(z) }, Date.now());
        if (made === "usada") return refuse("nao_paga");
        if (made === "sem_estrada") return void giveBack(id, "sem_estrada");
        this.tellCorridas();
        this.tellRide(made);
      });
      return;
    }
    // Asked along on a táxi for two: they get in beside whoever called it, and off when they like; the ride is not theirs.
    const along = ride ? null : this.corridas.alongOn(held.entityId);
    if (along) {
      const aboard = along.aboard.has(held.entityId);
      if (pedido.op === "subir" && !aboard) {
        const at = this.channel.placeOf(held.entityId);
        const there = poseOf(along, now);
        if (along.fase !== "espera" || !at || this.channel.ridingOf(held.entityId) || this.channel.sittingOf(held.entityId) || Math.hypot(there.x - at.x, there.z - at.z) > RIDE_REACH_MM) return;
        this.channel.ride(held.entityId, along.vehicle, 2);
        if (this.corridas.getIn(along, held.entityId, now)) this.tellCorridas();
        this.tellRide(along);
      } else if (pedido.op === "descer" && aboard) {
        along.aboard.delete(held.entityId);
        this.setDown(held.entityId, poseOf(along, now));
      }
      return;
    }
    if (!ride) return;
    if (pedido.op === "subir") {
      const at = this.channel.placeOf(held.entityId);
      const there = poseOf(ride, now);
      if (ride.fase !== "espera" || ride.aboard.has(held.entityId) || !at || Math.hypot(there.x - at.x, there.z - at.z) > RIDE_REACH_MM) return;
      this.channel.ride(held.entityId, ride.vehicle, 1);
      if (this.corridas.getIn(ride, held.entityId, now)) this.tellCorridas();
      this.tellRide(ride);
      return;
    }
    if (ride.fase === "leva" || ride.aboard.has(held.entityId)) {
      // Off on the way, or out again while it waited for the other: everyone in it is put down, and it goes.
      const pose = poseOf(ride, now);
      const onTheWay = ride.fase === "leva";
      for (const [n, entity] of [...ride.aboard].entries()) this.setDown(entity, { ...pose, x: pose.x + Math.sin(pose.heading) * 1200 * n, z: pose.z + Math.cos(pose.heading) * 1200 * n });
      ride.aboard.clear();
      this.corridas.leave(ride, now);
      this.tellCorridas();
      if (onTheWay) this.tellRide(ride, "desceu");
      else void giveBack(ride.id, "cancelada");
      return;
    }
    // Called off before getting on: it goes, and the fare comes back.
    this.corridas.leave(ride, now);
    this.tellCorridas();
    void giveBack(ride.id, "cancelada");
  }

  /** The rides go on: each rider is carried where their ride is; arrivals are set down; whoever is told is told. */
  private stepCorridas(): void {
    const now = Date.now();
    const changes = this.corridas.step(now);
    for (const ride of changes.waiting) this.tellRide(ride);
    for (const ride of changes.setOut) this.tellRide(ride);
    for (const ride of changes.gaveUp) {
      // Gone without whoever called it: someone asked along who got in is put down where it stood.
      const pose = poseOf(ride, now);
      for (const entity of ride.aboard) this.setDown(entity, pose);
      ride.aboard.clear();
      this.tellRide(ride, "foi_embora");
    }
    for (const ride of changes.arrived) {
      const heading = poseOf(ride, now).heading;
      // Set down together, a step apart along the kerb.
      for (const [n, entity] of [...ride.aboard].entries()) this.setDown(entity, { x: ride.drop.x + Math.sin(heading) * 1200 * n, z: ride.drop.z + Math.cos(heading) * 1200 * n, heading });
      ride.aboard.clear();
      this.tellRide(ride, "chegou");
    }
    for (const rider of this.channel.riders()) {
      if (rider.vehicle < HIRED_VEHICLE_BASE) continue;
      const ride = this.corridas.byVehicle(rider.vehicle);
      const at = this.channel.placeOf(rider.id);
      // In it while it waits at the kerb for the other of the two: they sit where it stands.
      if (ride?.fase === "espera" && ride.aboard.has(rider.id)) continue;
      if (ride?.fase === "leva" && ride.aboard.has(rider.id)) {
        const pose = poseOf(ride, now);
        this.channel.carry(rider.id, { x: Math.round(pose.x), y: at?.y ?? 0, z: Math.round(pose.z), yaw: Math.round(((pose.heading * 18_000) / Math.PI + 36_000) % 36_000) });
      } else if (at) this.channel.alight(rider.id, at);
    }
    if (changes.changed) this.tellCorridas();
  }

  /**
   * Energia at zero (Task 4.4): the body is taken to the district's hospital (its door, when the pack has none yet),
   * they wake with Energia and some Fome back, never dead and never robbed, and a note is left for the API, which
   * asks a small bill for the stay. Not from a van or a seat: whoever sits or rides is resting already.
   */
  private toHospital(line: Line, held: Held, now: NeedsState): boolean {
    if (this.channel.ridingOf(held.entityId) || this.channel.sittingOf(held.entityId)) return false;
    if (!this.channel.put(held.entityId, this.district.hospital ?? this.district.arrival)) return false;
    const after = { fome: Math.max(now.fome, this.rules.hospitalFome), energia: this.rules.hospitalEnergia };
    held.needs = { base: after, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(after, this.rules.tiredBelow) };
    this.channel.setTired(held.entityId, held.needs.tired);
    const stay = `${Date.now().toString(36)}${held.entityId.toString(36)}`;
    void keepNeeds(this.sql, held.playerId, after).catch((error: unknown) => this.log(`zone: could not keep the needs of ${held.playerId}: ${String(error)}`));
    // The phone is told once the note for the API is written: asked for the bill before it, the API would not know.
    void (this.presence?.mark(held.playerId, "hospital", stay, HOSPITAL_NOTE_S) ?? Promise.resolve())
      .catch(() => {})
      .then(() => line.send(encodeEvent({ kind: EVENT.HOSPITAL, tick: this.channel.world.tick, subject: 0, args: [], text: stay })));
    this.tellNeeds(line, held, "");
    return true;
  }

  /**
   * A biscato (Task 4.5, D-4.22). Begun only by someone on foot standing at a place of its kind, with the Energia it
   * takes; then what the thumb does comes in batches, and the round is scored when they say they are done, or by
   * itself when its time is well over.
   */
  private biscato(line: Line, held: Held, pedido: BiscatoPedido): void {
    if (pedido.op === "comecar") {
      const refuse = (why: string): void => line.send(encodeEvent({ kind: EVENT.BISCATO_RECUSADO, tick: this.channel.world.tick, subject: 0, args: [], text: why }));
      if (held.ronda) return refuse("ocupado");
      const here = this.channel.placeOf(held.entityId);
      const busy = this.channel.ridingOf(held.entityId) || this.channel.sittingOf(held.entityId);
      if (!isBiscatoKind(pedido.kind) || !here || busy || !spotNear(this.district.biscatos, pedido.kind, here)) return refuse("longe");
      const rules = BASE_BISCATOS.kinds[pedido.kind];
      this.takeEffort(held);
      const needs = this.needsNow(held);
      if (needs.energia < rules.energia || tooTired(needs, this.rules.tiredBelow)) return refuse("cansado");
      held.ronda = { kind: pedido.kind, seed: randomInt(2 ** 31), startedAt: performance.now(), lengthMs: rules.seconds * 1000, inputs: [] };
      line.send(encodeEvent({ kind: EVENT.BISCATO, tick: this.channel.world.tick, subject: 0, args: [held.ronda.seed, held.ronda.lengthMs], text: pedido.kind }));
      return;
    }
    if (!held.ronda) return;
    if (pedido.op === "mais") takeInputs(held.ronda, pedido.inputs, performance.now());
    else this.endRonda(line, held);
  }

  /**
   * A round over: scored, the Energia and the Fome the work took (as much of it as was played), and a note for the
   * API to pay it. The phone is told once the note is written.
   */
  private endRonda(line: Line, held: Held): void {
    const ronda = held.ronda;
    if (!ronda) return;
    held.ronda = null;
    const result = scoreRonda(ronda, performance.now() - ronda.startedAt);
    const rules = BASE_BISCATOS.kinds[ronda.kind];
    const share = Math.min(1, (performance.now() - ronda.startedAt) / ronda.lengthMs);
    this.takeEffort(held);
    const was = this.needsNow(held);
    const after = { fome: Math.max(0, was.fome - Math.round(rules.fome * share)), energia: Math.max(0, was.energia - Math.round(rules.energia * share)) };
    held.needs = { base: after, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(after, this.rules.tiredBelow) };
    this.channel.setTired(held.entityId, held.needs.tired);
    void keepNeeds(this.sql, held.playerId, after).catch((error: unknown) => this.log(`zone: could not keep the needs of ${held.playerId}: ${String(error)}`));
    const note = `${Date.now().toString(36)}${held.entityId.toString(36)}`;
    const said = (): void => {
      line.send(encodeEvent({ kind: EVENT.BISCATO_FIM, tick: this.channel.world.tick, subject: 0, args: [result.score, result.done, result.failed, result.most], text: note }));
      this.tellNeeds(line, held, "");
    };
    if (result.score === 0) return said();
    void (this.presence?.mark(held.playerId, "biscato", `${note}:${ronda.kind}:${result.score}`, BISCATO_NOTE_S) ?? Promise.resolve()).catch(() => {}).then(said);
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
        held.needs = { base: after, steps: 0, rest: 0, fast: 0, jumps: 0, tired: tooTired(after, this.rules.tiredBelow) };
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

  /**
   * Whether two bodies are nothing to each other: either has shut the other out, or a wall of a home is between
   * them (one is inside a house and the other is not inside it with them: seen through the window, not reached).
   */
  private apart = (a: number, b: number): boolean => {
    const one = this.playerOf(a);
    const other = this.playerOf(b);
    return (one !== null && other !== null && (this.shut.get(one)?.has(other) === true || this.shut.get(other)?.has(one) === true)) || this.channel.withinOf(a) !== this.channel.withinOf(b);
  };

  /** The houses whose door stands open (D-5.9). A door is as it was left; a room that is opened anew has them all shut. */
  private readonly doors = new Set<number>();
  /** Whose house is which, of those here who have one in this bairro: its number, and the middle of its doorway. */
  private readonly homes = new Map<string, { house: number; door: { x: number; z: number }; kind?: HomeKind; cellAt?: (x: number, z: number) => [number, number] }>();
  /** What each of them has set down in their house (Task 5.3), and the cells of its plan those things stand on. */
  private readonly things = new Map<string, HomeThing[]>();
  private readonly under = new Map<string, Set<string>>();
  private readonly moving = new Set<string>();

  private furnish(playerId: string, things: HomeThing[]): void {
    this.things.set(playerId, things);
    this.under.set(playerId, new Set(things.flatMap((thing) => cellsOf(this.standing(thing))).map(([x, z]) => `${x},${z}`)));
  }

  private standing(thing: { item: string; cx: number; cz: number; rot: number }): SetDown {
    return { cx: thing.cx, cz: thing.cz, rot: thing.rot, chao: BASE_CATALOGUE.items.get(thing.item)?.chao ?? [1, 1] };
  }

  /** Says to someone what is set down in their house, whole; and why what they last asked was not done, when it was not. */
  private tellThings(line: Line, playerId: string, why = 0): void {
    const things = this.things.get(playerId) ?? [];
    const tick = this.channel.world.tick;
    if (things.length === 0) line.send(encodeEvent({ kind: EVENT.MOVEIS, tick, subject: 0, args: [0, 0, 0, 0, 0, why], text: "" }));
    for (const [n, thing] of things.entries()) line.send(encodeEvent({ kind: EVENT.MOVEIS, tick, subject: thing.id, args: [thing.cx, thing.cz, thing.rot, n, things.length, why], text: thing.item }));
  }

  /**
   * A thing set down in one's own house, taken up, or put elsewhere in it (Task 5.3). Only standing in one's own
   * house; only where the house's plan has floor and nothing and nobody is; out of the Mochila and back into it
   * through the database, one asking at a time. What is so is then said whole.
   */
  private movel(line: Line, held: Held, asked: { op: number; id: number; item: string; cx: number; cz: number; rot: number }): void {
    const playerId = held.playerId;
    const home = this.homes.get(playerId);
    const refuse = (why: (typeof MOVEL_RECUSAS)[number]): void => this.tellThings(line, playerId, MOVEL_RECUSAS.indexOf(why));
    if (!home?.kind || this.channel.withinOf(held.entityId) !== playerId) return refuse("fora");
    if (this.moving.has(playerId)) return;
    const things = this.things.get(playerId) ?? [];
    const op = MOVEL_OPS[asked.op];
    const thing = things.find((one) => one.id === asked.id);
    const item = op === "por" ? asked.item : thing?.item;
    const sort = item ? BASE_CATALOGUE.items.get(item) : undefined;
    if (op !== "por" && !thing) return refuse("foi");
    if (!item || sort?.kind !== "mobilia") return refuse("nao_tens");
    // Where it would stand: floor of the house, clear of every other thing, and of the feet of whoever is inside.
    const there = this.standing({ item, cx: asked.cx, cz: asked.cz, rot: asked.rot });
    const feet = [...this.held.values()].filter((one) => this.channel.withinOf(one.entityId) === playerId).map((one) => this.channel.placeOf(one.entityId)!).map((at) => home.cellAt!(at.x, at.z).join(","));
    const clear = (): boolean => mayStand(home.kind!, things.filter((one) => one !== thing).map((one) => this.standing(one)), there) && !cellsOf(there).some(([x, z]) => feet.includes(`${x},${z}`));
    if (op !== "guardar" && (!clear() || (op === "por" && things.length >= MOVEIS_AT_MOST))) return refuse("lugar");
    this.moving.add(playerId);
    const done =
      op === "por"
        ? setDown(this.sql, playerId, { item, cx: asked.cx, cz: asked.cz, rot: asked.rot }).then((set) => (set ? (this.furnish(playerId, [...things, set]), "") : "nao_tens"))
        : op === "guardar"
          ? takeUp(this.sql, playerId, thing!.id, (carried, taken) => unitsCarried(BASE_CATALOGUE, carried) + (BASE_CATALOGUE.items.get(taken)?.size ?? 0) <= BASE_CATALOGUE.carryUnits).then((took) => (took === "full" ? "cheia" : (this.furnish(playerId, things.filter((one) => one !== thing)), took === "gone" ? "foi" : "")))
          : moveThing(this.sql, playerId, thing!.id, { cx: asked.cx, cz: asked.cz, rot: asked.rot }).then((moved) => (moved ? (this.furnish(playerId, things.map((one) => (one === thing ? { ...one, cx: asked.cx, cz: asked.cz, rot: asked.rot } : one))), "") : "foi"));
    void done
      .then((why) => refuse(why as (typeof MOVEL_RECUSAS)[number]))
      .catch((error: unknown) => {
        this.log(`zone: a thing of ${playerId}'s house could not be ${op}: ${String(error)}`);
        refuse("foi");
      })
      .finally(() => this.moving.delete(playerId));
  }

  /**
   * Someone opens the door of their house, or shuts it: standing at it, on either side. Shut, it is a wall to
   * them too from the next step, so it is not shut on anyone standing in the doorway. Everyone here is told.
   */
  private porta(held: Held, open: boolean): void {
    const home = this.homes.get(held.playerId);
    const at = this.channel.placeOf(held.entityId);
    if (!home || !at || this.doors.has(home.house) === open || Math.hypot(at.x - home.door.x, at.z - home.door.z) > DOOR_REACH_MM) return;
    if (!open) {
      for (const [other, theirs] of this.homes) {
        if (theirs.house !== home.house) continue;
        const line = this.lineOf(other);
        const there = line ? this.channel.placeOf(this.held.get(line)!.entityId) : null;
        if (there && Math.abs(there.x - home.door.x) < DOORWAY_HALF_MM && Math.abs(there.z - home.door.z) < DOORWAY_DEEP_MM) return;
      }
    }
    if (open) this.doors.add(home.house);
    else this.doors.delete(home.house);
    const bytes = encodeEvent({ kind: EVENT.PORTA, tick: this.channel.world.tick, subject: held.entityId, args: [home.house, open ? 1 : 0], text: "" });
    for (const line of this.held.keys()) line.send(bytes);
  }

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
    // A thing handed over is seen (F-257): what it was is read from the record, never taken from the phone, and
    // said to the two of them and to whoever has the giver in sight.
    const other = this.held.get(line);
    if (!other) return;
    void presenteEntre(this.sql, held.playerId, other.playerId)
      .then((item) => {
        if (!item) return;
        const bytes = encodeEvent({ kind: EVENT.PRESENTE, tick: this.channel.world.tick, subject: held.entityId, args: [entity], text: item });
        for (const [one, seeing] of this.held) if (seeing === held || seeing === other || this.channel.seenBy(seeing.entityId).includes(held.entityId)) one.send(bytes);
      })
      .catch((error: unknown) => this.log(`zone: could not read what ${held.playerId} handed over: ${String(error)}`));
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
    this.stepCorridas();
    // Whoever rides a van is carried with it: where the zone's traffic has the van, they are. A van gone from the
    // road (its day is over) puts its riders down where it was.
    if (this.traffic) {
      for (const rider of this.channel.riders()) {
        if (rider.vehicle >= HIRED_VEHICLE_BASE) continue;
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
    // And whoever stands where something is done for them (a barbearia), what: the API sells it only on this word.
    if (tick % STEPS_A_LOOK === 0 && this.presence && (this.district.servicos?.length ?? 0) > 0) {
      const now = Date.now();
      for (const held of this.held.values()) {
        if (now - held.servicoAt < MARK_EVERY_MS) continue;
        const at = this.channel.placeOf(held.entityId);
        const servico = at && !this.channel.ridingOf(held.entityId) ? this.district.servicos!.find((one) => Math.hypot(one.x - at.x, one.z - at.z) <= SHOP_REACH_MM) : undefined;
        if (!servico) continue;
        held.servicoAt = now;
        void this.presence.mark(held.playerId, "servico", servico.kind).catch(() => {});
      }
    }
    // And whoever stands at a way out to another bairro, which one, where it leads and where one arrives there: the
    // API sells the crossing only on this word (Task 11.2). Never from a van or a seat. A paragem may lead to more
    // than one bairro: every way out within reach is said, "id|to|arrive" each, with ";" between.
    if (tick % STEPS_A_LOOK === 0 && this.presence && (this.district.gateways?.length ?? 0) > 0) {
      const now = Date.now();
      for (const held of this.held.values()) {
        if (now - held.portaAt < MARK_EVERY_MS) continue;
        const at = this.channel.placeOf(held.entityId);
        const ways = at && !this.channel.ridingOf(held.entityId) && !this.channel.sittingOf(held.entityId) ? this.district.gateways!.filter((one) => Math.hypot(one.x - at.x, one.z - at.z) <= GATEWAY_REACH_MM) : [];
        if (ways.length === 0) continue;
        held.portaAt = now;
        void this.presence.mark(held.playerId, "porta", ways.map((one) => `${one.id}|${one.to}|${one.arrive}`).join(";")).catch(() => {});
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
    // The balls on the campos: every step.
    if (this.bolas.length > 0) this.stepBolas();
    // Those who are out together (Task 10.13): once a second.
    if (tick % (STEPS_A_LOOK * 4) === 0) this.stepSaidas();
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
