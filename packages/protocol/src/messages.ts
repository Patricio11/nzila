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
  /** The answer to this player's invitation. subject: who was invited; args: the table, and 1 for yes or 0 for no. */
  CONVITE_RESPOSTA: 10,
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

// ---------------------------------------------------------------- Mesa

/** What a player asks of a table. Numbers are never reused. */
const PEDIDOS = ["", "sentar", "levantar", "comecar", "jogar", "lancar", "convidar", "aceitar", "recusar"] as const;
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
  | { readonly mesa: number; readonly pedido: "convidar" | "aceitar" | "recusar"; readonly entidade: number };

export function encodeMesaPedido(m: MesaPedido): Uint8Array {
  const w = new Writer().u8(MSG.MESA_PEDIDO).uint(m.mesa).u8(PEDIDOS.indexOf(m.pedido));
  if (m.pedido === "sentar") w.u8(m.lugar);
  if (m.pedido === "convidar" || m.pedido === "aceitar" || m.pedido === "recusar") w.uint(m.entidade);
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
  | ({ readonly type: "mesa" } & MesaPedido);

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
  if (type === MSG.MESA) return { type: "mesa", bytes };
  return { type: "unknown", code: type };
}
