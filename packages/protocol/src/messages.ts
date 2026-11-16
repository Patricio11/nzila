// The messages between a client and a zone, except the snapshot, which has
// its own file. Each begins with one byte naming its type.
//
// A client only ever sends intentions (Rule 3). Nothing in a client message
// carries a position, an amount, a price or a result.

import { type DriveInput, type MoveInput } from "@nzila/sim";
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
} as const;

/** Why a zone closed a connection that had been let in. A client treats one it does not know as a dropped line. */
export const ZONE_CLOSE = {
  /** The same player came in from somewhere else: this one is put out, and must not come straight back. */
  ELSEWHERE: 4100,
  /** The client kept sending what no client of ours sends. */
  MISBEHAVED: 4101,
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
} as const;

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
const LOOK_BYTES = 512;

/**
 * Zone to client: who an entity is. Sent once for each player a client comes to see, before or with the
 * first snapshot that has them, so that a body can be drawn as its owner chose it and named when it stands
 * still (D-3.5). A snapshot says only where; this says who, and is not repeated.
 */
export interface Who {
  readonly entityId: number;
  /** The name on their BI. */
  readonly name: string;
  /** Their look, as the look chooser keeps it (JSON), or empty for one who never chose. Read with checkLook: it came over a wire. */
  readonly look: string;
}

export function encodeWho(m: Who): Uint8Array {
  return new Writer().u8(MSG.WHO).uint(m.entityId).text(m.name).text(m.look).finish();
}

function readWho(r: Reader): Who {
  return { entityId: r.uint(), name: r.text(NAME_BYTES), look: r.text(LOOK_BYTES) };
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
  | ({ readonly type: "chat_typing" } & ChatTyping);

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
  return { type: "unknown", code: type };
}
