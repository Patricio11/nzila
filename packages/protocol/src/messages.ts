// The messages between a client and a zone, except the snapshot, which has
// its own file. Each begins with one byte naming its type.
//
// A client only ever sends intentions (Rule 3). Nothing in a client message
// carries a position, an amount, a price or a result.

import { type DriveInput, type MoveInput } from "@nzila/sim";
import { LOOK_BYTES, packLook, unpackLook, type Look } from "./look.ts";
import { ProtocolError, Reader, Writer } from "./wire.ts";

/** The first byte of every message. Numbers are never reused. */
export const MSG = {
  JOIN: 1,
  JOIN_ACCEPTED: 2,
  JOIN_REFUSED: 3,
  INPUT: 4,
  SNAPSHOT: 5,
  EVENT: 6,
  CHAT_SEND: 7,
  CHAT_HEARD: 8,
  CHAT_TYPING: 9,
  HANDOFF: 10,
  WHO: 11,
  EMOTE: 12,
  TRAFFIC: 13,
  RIDE: 14,
  NUDGE: 15,
  /** Zone to client: a table game as it stands (mesa.ts). */
  MESA: 16,
  /** Client to zone: what a player asks of a table. */
  MESA_PEDIDO: 17,
  /** Client to zone: eat or drink one of a thing the player carries (Task 4.4). */
  COMER: 18,
  /** Client to zone: sit on a bench's seat, or get up from it (F-205, Task 4.4). */
  BANCO: 19,
  /** Client to zone: begin a biscato here, what the thumb has done in it, or that it is over (Task 4.5). */
  BISCATO: 20,
  /** Client to zone: a ride asked for and paid (by its id), getting on it, getting off it (Task 6.2). */
  CORRIDA: 21,
  /** Zone to client: every ride asked for in the channel, where it is going and from when (Task 6.2). */
  CORRIDAS: 22,
  /** Client to zone: what a player asks about going out with someone (Task 10.13). */
  SAIR: 23,
  /** Client to zone: a gesture for two offered to someone, or their offer answered (the founder, 2026-11-21). */
  A_DOIS: 24,
  /** Client to zone: the player goes over to the other side of a campo's match (D-11.12). Written in bola.ts. */
  LADO: 25,
} as const;

/** Why a zone closed a connection that had been let in. A client treats one it does not know as a dropped line. */
export const ZONE_CLOSE = {
  /** The same player came in from somewhere else: this one is put out, and must not come straight back. */
  ELSEWHERE: 4100,
  /** The client kept sending what no client of ours sends. */
  MISBEHAVED: 4101,
  /** Staff put the player out of the channel: the client asks the matchmaker again, which says whether they may come back. */
  PUT_OUT: 4102,
} as const;

const TOKEN_BYTES = 512;
const ID_BYTES = 64;
const ADDRESS_BYTES = 256;
/** The longest chat line, in characters. */
export const CHAT_MAX_CHARS = 200;
const CHAT_BYTES = CHAT_MAX_CHARS * 4;
const EVENT_TEXT_BYTES = 256;
const EVENT_ARGS = 16;
/** How many recent input frames one Input message may repeat. */
export const INPUT_MAX_FRAMES = 8;

// ---------------------------------------------------------------- Join

/** The name a district's rooms go by in a zone: its id, without the stroke a web address would trip on. */
export const zoneRoomOf = (districtId: string): string => districtId.replaceAll("/", ".");

/** Client to zone, first message on a connection. FROZEN LAYOUT: see version.ts. */
export interface Join {
  readonly protocolVersion: number;
  /** What lets them in: the session token today, the seat reserved by the matchmaker from Task 3.2. Opaque to the zone's own code beyond checking it. */
  readonly token: string;
}

export function encodeJoin(m: Join): Uint8Array {
  return new Writer().u8(MSG.JOIN).uint(m.protocolVersion).text(m.token).finish();
}

function readJoin(r: Reader): Join {
  return { protocolVersion: r.uint(), token: r.text(TOKEN_BYTES) };
}

export interface JoinAccepted {
  readonly protocolVersion: number;
  /** The player's own entity in snapshots. */
  readonly entityId: number;
  readonly tick: number;
  /** The zone's clock, Unix milliseconds, so the client can compute the world clock. */
  readonly serverTimeMs: number;
  readonly provinceId: string;
  readonly districtId: string;
  readonly channel: number;
}

export function encodeJoinAccepted(m: JoinAccepted): Uint8Array {
  return new Writer()
    .u8(MSG.JOIN_ACCEPTED)
    .uint(m.protocolVersion)
    .uint(m.entityId)
    .uint(m.tick)
    .uint(m.serverTimeMs)
    .text(m.provinceId)
    .text(m.districtId)
    .uint(m.channel)
    .finish();
}

function readJoinAccepted(r: Reader): JoinAccepted {
  return {
    protocolVersion: r.uint(),
    entityId: r.uint(),
    tick: r.uint(),
    serverTimeMs: r.uint(),
    provinceId: r.text(ID_BYTES),
    districtId: r.text(ID_BYTES),
    channel: r.uint(),
  };
}

/** Why a zone would not let a client in. Codes are never reused; a client treats one it does not know as "retry". */
export const JOIN_REFUSAL = {
  /** The client is too old: it must reload to get the current game. */
  REFRESH: 1,
  /** The zone is older than the client, in the middle of a rollout: try again shortly. */
  RETRY: 2,
  /** The seat was not reserved, or expired: go back to the matchmaker. */
  BAD_SEAT: 3,
  FULL: 4,
} as const;
export type JoinRefusalCode = (typeof JOIN_REFUSAL)[keyof typeof JOIN_REFUSAL];

/** Zone to client. FROZEN LAYOUT: see version.ts. */
export interface JoinRefused {
  readonly reason: number;
  /** The version the zone speaks, for the client's error report. */
  readonly zoneVersion: number;
}

export function encodeJoinRefused(m: JoinRefused): Uint8Array {
  return new Writer().u8(MSG.JOIN_REFUSED).u8(m.reason).uint(m.zoneVersion).finish();
}

function readJoinRefused(r: Reader): JoinRefused {
  return { reason: r.u8(), zoneVersion: r.uint() };
}

// ---------------------------------------------------------------- Input

/**
 * The stick for one simulation step. On foot, dx and dz are the direction to
 * walk in. At the wheel, dx steers and dz is the throttle. The zone knows
 * which applies; the client does not get to say.
 */
export interface InputFrame {
  /** -127..127 */
  readonly dx: number;
  /** -127..127 */
  readonly dz: number;
  readonly run: boolean;
  readonly brake: boolean;
  /** On foot: jump. Left out is the same as false. */
  readonly jump?: boolean;
}

/** Client to zone, ten times a second. */
export interface Input {
  /** The number of the newest frame. Frame i of the list is step seq - i. */
  readonly seq: number;
  /** The tick of the last snapshot the client received whole, or 0. The zone sends deltas against it. */
  readonly ackTick: number;
  /** Newest first. Recent frames are repeated so a lost packet loses nothing. */
  readonly frames: readonly InputFrame[];
}

export function encodeInput(m: Input): Uint8Array {
  if (m.frames.length < 1 || m.frames.length > INPUT_MAX_FRAMES) throw new RangeError("an Input carries 1 to 8 frames");
  const w = new Writer().u8(MSG.INPUT).uint(m.seq).uint(m.ackTick).u8(m.frames.length);
  for (const f of m.frames) w.u8(f.dx + 128).u8(f.dz + 128).u8((f.run ? 1 : 0) + (f.brake ? 2 : 0) + (f.jump ? 4 : 0));
  return w.finish();
}

function readInput(r: Reader): Input {
  const seq = r.uint();
  const ackTick = r.uint();
  const count = r.u8();
  if (count < 1 || count > INPUT_MAX_FRAMES) throw new ProtocolError("too_long", "input frames");
  const frames: InputFrame[] = [];
  for (let i = 0; i < count; i++) {
    // Whatever the bytes say, a frame that leaves here is inside the stick's range.
    const dx = Math.max(-127, r.u8() - 128);
    const dz = Math.max(-127, r.u8() - 128);
    const flags = r.u8();
    frames.push({ dx, dz, run: (flags & 1) !== 0, brake: (flags & 2) !== 0, ...((flags & 4) !== 0 ? { jump: true } : {}) });
  }
  return { seq, ackTick, frames };
}

export function toMoveInput(frame: InputFrame): MoveInput {
  return { dx: frame.dx, dz: frame.dz, run: frame.run, ...(frame.jump ? { jump: true } : {}) };
}

export function toDriveInput(frame: InputFrame): DriveInput {
  return { throttle: frame.dz, steer: frame.dx, brake: frame.brake };
}

// ---------------------------------------------------------------- Event

/** Kinds of event. Numbers are never reused; a client ignores one it does not know. */
export const EVENT = {
  /** subject plays emote args[0]. */
  EMOTE: 1,
  /** A notice from the zone to this client; text is a catalog key, never a sentence. */
  NOTICE: 2,
  /** Talk is open in this channel: the chat bar may be used. Not sent where it is not. */
  CHAT_OPEN: 3,
  /** A line this client sent was not said to anyone. subject is the line's messageId; args[0] is why (CHAT_REFUSAL). */
  CHAT_REFUSED: 4,
  /** The player's asking to get on a van was not done (the van had gone, or was full): they are still on foot. */
  RIDE_REFUSED: 6,
  /** Someone beside the player says they have just handed them something: the phone asks the API what it holds. Nothing is believed from this but the asking. subject: who. */
  GIVEN: 7,
  /** This client and subject have greeted each other (a wave answered by a wave, close by): they have met. */
  MET: 5,
  /** What the player asked of a table was not done. subject: the table; args[0]: why (its place in MESA_RECUSAS). */
  MESA_REFUSED: 8,
  /** Someone invites this player to play at a table. subject: who; args[0]: the table. */
  CONVITE: 9,
  /** A game this player played at a table has been written down. subject: the table; args: their points now, and what the game changed them by. */
  PONTOS: 11,
  /** The answer to this player's invitation. subject: who was invited; args: the table, and 1 for yes or 0 for no. */
  CONVITE_RESPOSTA: 10,
  /**
   * This player's Fome and Energia as the zone keeps them (Task 4.4): on arriving, after eating, when they become too
   * tired to go fast or no longer are, and every half minute. args: fome, energia, 1 when too tired; text: the thing
   * just eaten or drunk, or empty.
   */
  NECESSIDADES: 12,
  /** What the player asked to eat or drink was not: text is why, "nao_tens" (none carried) or "nao_se_come" (not eaten in the street). */
  COMER_RECUSADO: 13,
  /** This player's Energia ran out: they woke at the hospital (Task 4.4). text: the stay, by which the API is asked for its bill. */
  HOSPITAL: 14,
  /** A biscato begun (Task 4.5): text is its kind; args: the round's seed and its length in milliseconds. */
  BISCATO: 15,
  /** A biscato scored by the zone: text is the note by which the API is asked to pay; args: score (0 to 1 000), what was done (plates clean, loads delivered), what went wrong (plates put up dirty, stacks fallen), the most there was to do. */
  BISCATO_FIM: 16,
  /** A biscato not begun: text is why ("longe", "cansado", "ocupado"). */
  BISCATO_RECUSADO: 17,
  /** This player's ride (Task 6.2): args are its vehicle number and where it is in its corrida (CORRIDA_FASES); text its kind. */
  CORRIDA: 18,
  /** A ride not given: text is why ("sem_estrada", "ocupado", "nao_paga"); the API gives the fare back on the zone's note. */
  CORRIDA_RECUSADA: 19,
  /** subject has just handed args[0] (a body) the thing named in text, as the record says (D-10.2): seen in the hand of one and then the other. */
  PRESENTE: 20,
  /** An outing (Task 10.13): args[0] is what is said, its place in SAIR_DITOS (sair.ts); subject is the other of the two. */
  SAIR: 21,
  /**
   * A gesture for two (the founder, 2026-11-21): args[0] is what is said, its place in A_DOIS_DITOS. "pedido": subject
   * offers this player the gesture args[1]. "nao": subject said not now. "nao_pode": what this player asked was not
   * done. "feito": subject and the body args[1] make the gesture args[2] together, for whoever sees them.
   */
  A_DOIS: 22,
  /** The ball of a campo (subject: the campo's number in the pack): args are x, z, vx, vz (mm, mm/s) and how many milliseconds ago that was so. Read with bolaAt (bola.ts). */
  BOLA: 23,
  /** A goal on a campo: subject scored it; args: the campo, how many they have now, and in a match the side it counts for (1 amarelos, 2 vermelhos; 0 no match), the score of each side, and 1 when that side has just won. */
  GOLO: 24,
  /** Subject is on a side of a campo's match, or has left it: args are the campo, the side (1, 2; 0 left), and the score of each side. */
  LADO: 25,
} as const;

/**
 * Why a table did not do what was asked: a seat that is not there, taken, already sitting, not sitting, not now, not
 * their turn, not by the rules, too far; too many invitations in the hour; an invitation that is not there (any more).
 * Never reordered.
 */
export const MESA_RECUSAS = ["lugar", "ocupado", "sentado", "fora", "fase", "vez", "regras", "longe", "muitos", "convite"] as const;

/** Why a line was not said. Numbers are never reused. */
export const CHAT_REFUSAL = {
  /** It has a word the game does not pass on. */
  WORDS: 1,
  /** Too many lines too quickly. */
  SLOW_DOWN: 2,
  /** It carries an address to somewhere outside the game. */
  LINKS: 3,
  /** A moderator has silenced the speaker for a time. */
  MUTED: 4,
} as const;

/**
 * The gestures a player can make, as they are numbered on the wire. WIRE FORMAT: new ones are added at the
 * end, and none is moved or removed.
 */
export const EMOTE_NAMES = ["acenar", "rir", "aplaudir", "chamar", "dancar"] as const;
export type EmoteName = (typeof EMOTE_NAMES)[number];

/** Client to zone: I make this gesture. The zone tells whoever can see (an Event of kind EMOTE). */
export interface EmoteMade {
  /** Its place in EMOTE_NAMES. */
  readonly emote: number;
}

export function encodeEmote(m: EmoteMade): Uint8Array {
  return new Writer().u8(MSG.EMOTE).u8(m.emote).finish();
}

function readEmote(r: Reader): EmoteMade {
  return { emote: r.bounded(EMOTE_NAMES.length - 1, "emote") };
}

/**
 * Zone to client: something happened that a snapshot does not carry. The
 * shape is deliberately general, so a new kind of event needs no new message
 * and an old client can skip what it does not understand.
 */
export interface WorldEvent {
  readonly kind: number;
  readonly tick: number;
  /** The entity it is about, or 0. */
  readonly subject: number;
  readonly args: readonly number[];
  readonly text: string;
}

export function encodeEvent(m: WorldEvent): Uint8Array {
  if (m.args.length > EVENT_ARGS) throw new RangeError("an event carries at most 16 numbers");
  const w = new Writer().u8(MSG.EVENT).uint(m.kind).uint(m.tick).uint(m.subject).u8(m.args.length);
  for (const arg of m.args) w.int(arg);
  return w.text(m.text).finish();
}

function readEvent(r: Reader): WorldEvent {
  const kind = r.uint();
  const tick = r.uint();
  const subject = r.uint();
  const count = r.bounded(EVENT_ARGS, "event args");
  const args: number[] = [];
  for (let i = 0; i < count; i++) args.push(r.int());
  return { kind, tick, subject, args, text: r.text(EVENT_TEXT_BYTES) };
}

// ---------------------------------------------------------------- Chat

/** Client to zone: say this to whoever is near. */
export interface ChatSend {
  /** Made by the client, so a line sent twice over a bad network is said once (Rule 5). */
  readonly messageId: number;
  readonly text: string;
}

export function encodeChatSend(m: ChatSend): Uint8Array {
  return new Writer().u8(MSG.CHAT_SEND).uint(m.messageId).text(m.text).finish();
}

function readChatSend(r: Reader): ChatSend {
  const messageId = r.uint();
  const text = r.text(CHAT_BYTES);
  if ([...text].length > CHAT_MAX_CHARS) throw new ProtocolError("too_long", "chat line");
  return { messageId, text };
}

/**
 * Zone to client: someone spoke. Close by, the words come with it. Farther
 * off the text is empty and only the balloon shows: words a player is too far
 * away to read are never sent to their phone at all.
 */
export interface ChatHeard {
  readonly from: number;
  readonly tick: number;
  readonly text: string;
}

export function encodeChatHeard(m: ChatHeard): Uint8Array {
  return new Writer().u8(MSG.CHAT_HEARD).uint(m.from).uint(m.tick).text(m.text).finish();
}

function readChatHeard(r: Reader): ChatHeard {
  return { from: r.uint(), tick: r.uint(), text: r.text(CHAT_BYTES) };
}

/** Both ways: the three dots. From a client, `from` is ignored: the zone knows who is speaking. */
export interface ChatTyping {
  readonly from: number;
  readonly typing: boolean;
}

export function encodeChatTyping(m: ChatTyping): Uint8Array {
  return new Writer().u8(MSG.CHAT_TYPING).uint(m.from).bool(m.typing).finish();
}

function readChatTyping(r: Reader): ChatTyping {
  return { from: r.uint(), typing: r.bool() };
}

// ---------------------------------------------------------------- Who

const NAME_BYTES = 96;
const BI_BYTES = 32;

/**
 * Zone to client: who an entity is. Sent once for each player a client comes to see, before or with the
 * first snapshot that has them, so that a body can be drawn as its owner chose it and named when it stands
 * still (D-3.5). A snapshot says only where; this says who, and is not repeated.
 */
export interface Who {
  readonly entityId: number;
  /** The name on their BI, and its number: what a player is known by to anyone who meets them, and how they are blocked or reported. */
  readonly name: string;
  readonly bi: string;
  /** Their look, or null for one that is not known. Twelve bytes on the wire (look.ts: packLook). */
  readonly look: Look | null;
}

export function encodeWho(m: Who): Uint8Array {
  const w = new Writer().u8(MSG.WHO).uint(m.entityId).text(m.name).text(m.bi).bool(m.look !== null);
  if (m.look) for (const byte of packLook(m.look)) w.u8(byte);
  return w.finish();
}

function readWho(r: Reader): Who {
  const entityId = r.uint();
  const name = r.text(NAME_BYTES);
  const bi = r.text(BI_BYTES);
  if (!r.bool()) return { entityId, name, bi, look: null };
  const bytes = new Uint8Array(LOOK_BYTES);
  for (let n = 0; n < LOOK_BYTES; n++) bytes[n] = r.u8();
  // Bytes that are no look the wardrobe knows come out as no look: what the phone draws is always checked.
  return { entityId, name, bi, look: unpackLook(bytes) };
}

// ---------------------------------------------------------------- Ride

/**
 * Client to zone: I get on this van (by its place in the district's list of vehicles), or I get off it here. The
 * zone decides: a van standing at a paragem, beside the player, with a seat free; a place to stand beside the van.
 */
export type RideAsked = { readonly on: number } | { readonly off: { readonly x: number; readonly z: number } };

export function encodeRide(m: RideAsked): Uint8Array {
  const w = new Writer().u8(MSG.RIDE);
  return "on" in m ? w.uint(m.on + 1).finish() : w.uint(0).int(m.off.x).int(m.off.z).finish();
}

function readRide(r: Reader): RideAsked {
  const on = r.bounded(TRAFFIC_VEHICLES_AT_MOST, "vehicle");
  return on > 0 ? { on: on - 1 } : { off: { x: r.int(), z: r.int() } };
}

// ---------------------------------------------------------------- Nudge

/** Client to zone: I have just handed something to this person (by their entity). The zone tells them to look, and no more. */
export interface Nudge {
  readonly entity: number;
}

export function encodeNudge(m: Nudge): Uint8Array {
  return new Writer().u8(MSG.NUDGE).uint(m.entity).finish();
}

/** Client to zone: eat or drink one of a thing carried, by its name in the catalogue of things. */
export interface Comer {
  readonly item: string;
}

/** A thing's name, as the catalogue writes them. */
const ITEM_NAME = /^[a-z][a-z0-9-]{0,31}$/;

export function encodeComer(m: Comer): Uint8Array {
  return new Writer().u8(MSG.COMER).text(m.item).finish();
}

function readComer(r: Reader): Comer {
  const item = r.text(32);
  if (!ITEM_NAME.test(item)) throw new ProtocolError("malformed", "item");
  return { item };
}

/** Client to zone: sit on a seat of the district's benches (by its place in the pack's list of seats), or get up. */
export interface Banco {
  readonly seat: number;
  readonly sim: boolean;
}

/** The most seats a district's benches have, as a number on the wire. */
const BENCH_SEATS_MAX = 4096;

export function encodeBanco(m: Banco): Uint8Array {
  return new Writer().u8(MSG.BANCO).uint(m.seat).u8(m.sim ? 1 : 0).finish();
}

function readBanco(r: Reader): Banco {
  const seat = r.uint();
  const sim = r.u8();
  if (seat >= BENCH_SEATS_MAX || sim > 1) throw new ProtocolError("malformed", "banco");
  return { seat, sim: sim === 1 };
}

// ---------------------------------------------------------------- Biscato

/** The most of a thumb's inputs one message carries: the phone sends a round's in batches as it goes. */
export const BISCATO_BATCH_MAX = 256;
/** What one input says is a number from 0 to this: a rub or a flick, left or right, which thing from the bacia. */
export const BISCATO_WHAT_MAX = 7;
/** A biscato's kind, as a place's id names it. */
const BISCATO_KIND = /^[a-z]{2,16}$/;

/**
 * Client to zone, about a biscato (Task 4.5): begin the one of this kind where the player stands; what the thumb
 * has done since the last batch, each at a time from the round's start in milliseconds and what it was (0 to 7, by
 * the biscato: a rub or a flick, a push left or right, which thing from the bacia; the zone keeps the order); or
 * that the player is done, early or at the end.
 */
export type BiscatoPedido =
  | { readonly op: "comecar"; readonly kind: string }
  | { readonly op: "mais"; readonly inputs: readonly { readonly t: number; readonly what: number }[] }
  | { readonly op: "acabar" };

export function encodeBiscato(m: BiscatoPedido): Uint8Array {
  const w = new Writer().u8(MSG.BISCATO);
  if (m.op === "comecar") return w.u8(1).text(m.kind).finish();
  if (m.op === "acabar") return w.u8(3).finish();
  if (m.inputs.length > BISCATO_BATCH_MAX) throw new RangeError("too many inputs for one batch");
  w.u8(2).uint(m.inputs.length);
  let was = 0;
  // Each as the time since the one before, times eight, and what it was in the lowest three bits.
  for (const input of m.inputs) {
    if (!Number.isInteger(input.what) || input.what < 0 || input.what > BISCATO_WHAT_MAX) throw new RangeError("not an input a biscato knows");
    w.uint((input.t - was) * 8 + input.what);
    was = input.t;
  }
  return w.finish();
}

function readBiscato(r: Reader): BiscatoPedido {
  const op = r.u8();
  if (op === 1) {
    const kind = r.text(16);
    if (!BISCATO_KIND.test(kind)) throw new ProtocolError("malformed", "biscato");
    return { op: "comecar", kind };
  }
  if (op === 3) return { op: "acabar" };
  if (op !== 2) throw new ProtocolError("malformed", "biscato");
  const count = r.bounded(BISCATO_BATCH_MAX, "biscato inputs");
  const inputs: { t: number; what: number }[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const packed = r.uint();
    t += Math.floor(packed / 8);
    inputs.push({ t, what: packed % 8 });
  }
  return { op: "mais", inputs };
}

// ---------------------------------------------------------------- Corrida (Task 6.2)

/** A ride's vehicle number: past every vehicle of a district's traffic (TRAFFIC_VEHICLES_AT_MOST), so the two never meet. */
export const HIRED_VEHICLE_BASE = 4096;
/** A ride's id, as the API makes it. */
const CORRIDA_ID = /^[A-Za-z0-9_-]{8,40}$/;

/** Client to zone: the ride paid for (its id), getting on it where it waits, or getting off it now. Written in corridas.ts. */
export type CorridaPedido = { readonly op: "pedir"; readonly id: string } | { readonly op: "subir" } | { readonly op: "descer" };

function readCorrida(r: Reader): CorridaPedido {
  const op = r.u8();
  if (op === 1) {
    const id = r.text(40);
    if (!CORRIDA_ID.test(id)) throw new ProtocolError("malformed", "corrida");
    return { op: "pedir", id };
  }
  if (op === 2) return { op: "subir" };
  if (op === 3) return { op: "descer" };
  throw new ProtocolError("malformed", "corrida");
}

// ---------------------------------------------------------------- A dois: gestures for two

/** The gestures two make together, by their number on the wire: a handshake, for anyone; a hug, between two adults. Never reordered. */
export const GESTOS_A_DOIS = ["apertar", "abracar"] as const;
export type GestoADois = (typeof GESTOS_A_DOIS)[number];
/** What the zone says of one (an Event of kind A_DOIS). Never reordered. */
export const A_DOIS_DITOS = ["pedido", "nao", "nao_pode", "feito"] as const;

/** Client to zone: offer someone (by their number in the channel) a gesture for two; or say yes or no to theirs. */
export type ADoisPedido = { readonly op: "oferecer"; readonly entidade: number; readonly gesto: number } | { readonly op: "aceitar" | "recusar"; readonly entidade: number };

export function encodeADois(m: ADoisPedido): Uint8Array {
  const w = new Writer().u8(MSG.A_DOIS);
  if (m.op === "oferecer") return w.u8(1).uint(m.entidade).u8(m.gesto).finish();
  return w.u8(m.op === "aceitar" ? 2 : 3).uint(m.entidade).finish();
}

function readADois(r: Reader): ADoisPedido {
  const op = r.u8();
  if (op === 1) return { op: "oferecer", entidade: r.uint(), gesto: r.bounded(GESTOS_A_DOIS.length - 1, "gesture for two") };
  if (op === 2 || op === 3) return { op: op === 2 ? "aceitar" : "recusar", entidade: r.uint() };
  throw new ProtocolError("malformed", "a dois");
}

// ---------------------------------------------------------------- Sair (Task 10.13)

/** The most places a district offers for an outing. */
export const SAIR_LUGARES_MAX = 16;

/**
 * Client to zone: ask someone (by their number in the channel) out to a place (its number among the district's
 * places for an outing); say yes or no to their ask; answer it with another place; or end the outing one is on.
 * Written in sair.ts.
 */
export type SairPedido =
  | { readonly op: "convidar" | "outro"; readonly entidade: number; readonly lugar: number }
  | { readonly op: "aceitar" | "recusar"; readonly entidade: number }
  | { readonly op: "terminar" };

function readSair(r: Reader): SairPedido {
  const op = r.u8();
  if (op === 1 || op === 4) return { op: op === 1 ? "convidar" : "outro", entidade: r.uint(), lugar: r.bounded(SAIR_LUGARES_MAX - 1, "place") };
  if (op === 2 || op === 3) return { op: op === 2 ? "aceitar" : "recusar", entidade: r.uint() };
  if (op === 5) return { op: "terminar" };
  throw new ProtocolError("malformed", "sair");
}

// ---------------------------------------------------------------- Mesa

/** What a player asks of a table. Numbers are never reused. */
const PEDIDOS = ["", "sentar", "levantar", "comecar", "jogar", "lancar", "convidar", "aceitar", "recusar", "rapida"] as const;
/** The most squares a move names: a run of captures at damas. */
const CASAS_MAX = 16;

/**
 * Client to zone: at this table (its place in the district's list), sit in a seat, get up, begin now, play a
 * move, throw the dice. A move is the squares it goes by: at xadrez the square left, the square reached and the
 * piece a pawn becomes (1 to 4: dama, torre, bispo, cavalo); at damas every square the piece stands on; at Não te
 * irrites the piece. What it takes, and the dice, are the zone's to work out.
 */
export type MesaPedido =
  | { readonly mesa: number; readonly pedido: "sentar"; readonly lugar: number }
  | { readonly mesa: number; readonly pedido: "levantar" }
  | { readonly mesa: number; readonly pedido: "comecar" }
  | { readonly mesa: number; readonly pedido: "lancar" }
  | { readonly mesa: number; readonly pedido: "jogar"; readonly casas: readonly number[] }
  /** Invite someone (by their number in the channel) to play at this table; accept or decline their invitation to it. */
  | { readonly mesa: number; readonly pedido: "convidar" | "aceitar" | "recusar"; readonly entidade: number }
  /** Choose a quick game (three minutes) for the game about to begin, or the slow one. */
  | { readonly mesa: number; readonly pedido: "rapida"; readonly sim: boolean };

export function encodeMesaPedido(m: MesaPedido): Uint8Array {
  const w = new Writer().u8(MSG.MESA_PEDIDO).uint(m.mesa).u8(PEDIDOS.indexOf(m.pedido));
  if (m.pedido === "sentar") w.u8(m.lugar);
  if (m.pedido === "convidar" || m.pedido === "aceitar" || m.pedido === "recusar") w.uint(m.entidade);
  if (m.pedido === "rapida") w.bool(m.sim);
  if (m.pedido === "jogar") {
    if (m.casas.length > CASAS_MAX) throw new RangeError("a move names at most 16 squares");
    w.u8(m.casas.length);
    for (const casa of m.casas) w.u8(casa);
  }
  return w.finish();
}

function readMesaPedido(r: Reader): MesaPedido {
  const mesa = r.uint();
  const code = r.u8();
  const pedido = PEDIDOS[code];
  if (!pedido) throw new ProtocolError("malformed", "table request");
  if (pedido === "sentar") return { mesa, pedido, lugar: r.bounded(3, "seat") };
  if (pedido === "convidar" || pedido === "aceitar" || pedido === "recusar") return { mesa, pedido, entidade: r.uint() };
  if (pedido === "rapida") return { mesa, pedido, sim: r.bool() };
  if (pedido !== "jogar") return { mesa, pedido };
  const count = r.bounded(CASAS_MAX, "squares");
  const casas: number[] = [];
  for (let n = 0; n < count; n++) casas.push(r.bounded(63, "square"));
  return { mesa, pedido, casas };
}

// ---------------------------------------------------------------- Traffic

/** How many vehicles a district's traffic may name in one message. */
export const TRAFFIC_VEHICLES_AT_MOST = 512;

/**
 * Zone to client: how the street's traffic is waiting (D-3.2, F-152), so that every phone in a channel sees the same
 * van stand for the same person. Every vehicle not named is on its timetable. The rules and the vehicles' names are
 * the pack's and packages/world's: here only numbers.
 */
export interface TrafficSaid {
  /** The zone's clock when it was said, Unix milliseconds: the clock every phone draws the traffic by. */
  readonly nowMs: number;
  readonly vehicles: readonly {
    /** Its place in the district's list of vehicles. */
    readonly index: number;
    /** How far behind its timetable, in milliseconds. */
    readonly lagMs: number;
    /** How fast that is changing, milliseconds a millisecond, in hundredths from -1 to 1. */
    readonly rate: number;
    /** Taken off the road for a while. */
    readonly away: boolean;
  }[];
}

export function encodeTraffic(m: TrafficSaid): Uint8Array {
  const w = new Writer().u8(MSG.TRAFFIC).uint(m.nowMs).uint(m.vehicles.length);
  for (const one of m.vehicles) w.uint(one.index).uint(Math.max(0, Math.round(one.lagMs))).u8(Math.round(Math.max(-1, Math.min(1, one.rate)) * 100) + 100).bool(one.away);
  return w.finish();
}

function readTraffic(r: Reader): TrafficSaid {
  const nowMs = r.uint();
  const count = r.bounded(TRAFFIC_VEHICLES_AT_MOST, "traffic");
  const vehicles = [];
  for (let n = 0; n < count; n++) {
    const index = r.bounded(TRAFFIC_VEHICLES_AT_MOST - 1, "vehicle");
    const lagMs = r.uint();
    const rate = (Math.min(200, r.u8()) - 100) / 100;
    vehicles.push({ index, lagMs, rate, away: r.bool() });
  }
  return { nowMs, vehicles };
}

// ---------------------------------------------------------------- Handoff

export const HANDOFF_REASON = {
  /** The player went through a gateway to another district. */
  TRAVEL: 1,
  /** The channel is being merged or split. */
  REBALANCE: 2,
  /** This zone process is going away. */
  SHUTDOWN: 3,
} as const;

/** Zone to client: your seat is now over there. Connect to it and carry on. */
export interface Handoff {
  readonly reason: number;
  readonly provinceId: string;
  readonly districtId: string;
  readonly channel: number;
  /** Where the next zone listens. */
  readonly address: string;
  /** The seat reserved there. */
  readonly token: string;
  /** The spawn or gateway to arrive at, or empty to keep the current position. */
  readonly arriveAt: string;
}

export function encodeHandoff(m: Handoff): Uint8Array {
  return new Writer()
    .u8(MSG.HANDOFF)
    .u8(m.reason)
    .text(m.provinceId)
    .text(m.districtId)
    .uint(m.channel)
    .text(m.address)
    .text(m.token)
    .text(m.arriveAt)
    .finish();
}

function readHandoff(r: Reader): Handoff {
  return {
    reason: r.u8(),
    provinceId: r.text(ID_BYTES),
    districtId: r.text(ID_BYTES),
    channel: r.uint(),
    address: r.text(ADDRESS_BYTES),
    token: r.text(TOKEN_BYTES),
    arriveAt: r.text(ID_BYTES),
  };
}

// ---------------------------------------------------------------- Decoding

/** What a zone may receive. */
export type ClientMessage =
  | ({ readonly type: "join" } & Join)
  | ({ readonly type: "input" } & Input)
  | ({ readonly type: "chat_send" } & ChatSend)
  | ({ readonly type: "chat_typing" } & ChatTyping)
  | ({ readonly type: "emote" } & EmoteMade)
  | ({ readonly type: "ride" } & { readonly ride: RideAsked })
  | ({ readonly type: "nudge" } & Nudge)
  | ({ readonly type: "mesa" } & MesaPedido)
  | ({ readonly type: "comer" } & Comer)
  | ({ readonly type: "banco" } & Banco)
  | ({ readonly type: "biscato" } & { readonly pedido: BiscatoPedido })
  | ({ readonly type: "corrida" } & { readonly pedido: CorridaPedido })
  | ({ readonly type: "sair" } & { readonly pedido: SairPedido })
  | ({ readonly type: "a_dois" } & { readonly pedido: ADoisPedido })
  | { readonly type: "lado"; readonly campo: number };

/**
 * Decodes a message from a client. Throws ProtocolError on anything that is
 * not exactly one of the messages a client may send: the zone drops it, and
 * drops the client if it keeps coming.
 */
export function decodeClientMessage(bytes: Uint8Array): ClientMessage {
  const r = new Reader(bytes);
  const type = r.u8();
  if (type === MSG.JOIN) return { type: "join", ...readJoin(r) };
  if (type === MSG.INPUT) return { type: "input", ...readInput(r) };
  if (type === MSG.CHAT_SEND) return { type: "chat_send", ...readChatSend(r) };
  if (type === MSG.CHAT_TYPING) return { type: "chat_typing", ...readChatTyping(r) };
  if (type === MSG.EMOTE) return { type: "emote", ...readEmote(r) };
  if (type === MSG.RIDE) return { type: "ride", ride: readRide(r) };
  if (type === MSG.NUDGE) return { type: "nudge", entity: r.uint() };
  if (type === MSG.MESA_PEDIDO) return { type: "mesa", ...readMesaPedido(r) };
  if (type === MSG.COMER) return { type: "comer", ...readComer(r) };
  if (type === MSG.BANCO) return { type: "banco", ...readBanco(r) };
  if (type === MSG.BISCATO) return { type: "biscato", pedido: readBiscato(r) };
  if (type === MSG.CORRIDA) return { type: "corrida", pedido: readCorrida(r) };
  if (type === MSG.SAIR) return { type: "sair", pedido: readSair(r) };
  if (type === MSG.A_DOIS) return { type: "a_dois", pedido: readADois(r) };
  if (type === MSG.LADO) return { type: "lado", campo: r.u8() };
  throw new ProtocolError("unknown_type", String(type));
}

/** What a client may receive, except the snapshot (see snapshot.ts). */
export type ZoneMessage =
  | ({ readonly type: "join_accepted" } & JoinAccepted)
  | ({ readonly type: "join_refused" } & JoinRefused)
  | ({ readonly type: "event" } & WorldEvent)
  | ({ readonly type: "chat_heard" } & ChatHeard)
  | ({ readonly type: "chat_typing" } & ChatTyping)
  | ({ readonly type: "handoff" } & Handoff)
  | ({ readonly type: "who" } & Who)
  | ({ readonly type: "traffic" } & TrafficSaid)
  /** The channel's rides: read with decodeCorridas (corridas.ts), by the code that draws them, fetched when there is one. */
  | { readonly type: "corridas"; readonly bytes: Uint8Array }
  /** A table game: read with decodeMesa (mesa.ts), by the code that draws tables, fetched when there is one to draw. */
  | { readonly type: "mesa"; readonly bytes: Uint8Array }
  | { readonly type: "snapshot" }
  | { readonly type: "unknown"; readonly code: number };

/**
 * Decodes a message from the zone. A type this client does not know comes
 * back as "unknown" so it can be skipped: a newer zone may say things an
 * older client has no word for. A snapshot is only recognised here; it is
 * decoded by decodeSnapshot, which needs the client's earlier snapshots.
 */
export function decodeZoneMessage(bytes: Uint8Array): ZoneMessage {
  const r = new Reader(bytes);
  const type = r.u8();
  if (type === MSG.SNAPSHOT) return { type: "snapshot" };
  if (type === MSG.JOIN_ACCEPTED) return { type: "join_accepted", ...readJoinAccepted(r) };
  if (type === MSG.JOIN_REFUSED) return { type: "join_refused", ...readJoinRefused(r) };
  if (type === MSG.EVENT) return { type: "event", ...readEvent(r) };
  if (type === MSG.CHAT_HEARD) return { type: "chat_heard", ...readChatHeard(r) };
  if (type === MSG.CHAT_TYPING) return { type: "chat_typing", ...readChatTyping(r) };
  if (type === MSG.HANDOFF) return { type: "handoff", ...readHandoff(r) };
  if (type === MSG.WHO) return { type: "who", ...readWho(r) };
  if (type === MSG.TRAFFIC) return { type: "traffic", ...readTraffic(r) };
  if (type === MSG.CORRIDAS) return { type: "corridas", bytes };
  if (type === MSG.MESA) return { type: "mesa", bytes };
  return { type: "unknown", code: type };
}
