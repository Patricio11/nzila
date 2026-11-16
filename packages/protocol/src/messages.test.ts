import { describe, expect, test } from "vitest";
import {
  CHAT_MAX_CHARS,
  EVENT,
  HANDOFF_REASON,
  JOIN_REFUSAL,
  MSG,
  decodeClientMessage,
  decodeZoneMessage,
  encodeChatHeard,
  encodeChatSend,
  encodeChatTyping,
  encodeWho,
  encodeEmote,
  EMOTE_NAMES,
  CHAT_REFUSAL,
  zoneRoomOf,
  encodeEvent,
  encodeHandoff,
  encodeInput,
  encodeJoin,
  encodeJoinAccepted,
  encodeJoinRefused,
  toDriveInput,
  toMoveInput,
  type InputFrame,
} from "./messages.ts";
import { MIN_CLIENT_VERSION, PROTOCOL_VERSION, negotiate } from "./version.ts";
import { arrivalLook, checkLook } from "./look.ts";
import { ProtocolError, Writer } from "./wire.ts";

const frame = (dx: number, dz: number, run = false, brake = false): InputFrame => ({ dx, dz, run, brake });

describe("round trips", () => {
  test("Join", () => {
    const m = { protocolVersion: 7, token: "seat.eyJhbGciOi.abc-123" };
    expect(decodeClientMessage(encodeJoin(m))).toEqual({ type: "join", ...m });
  });

  test("JoinAccepted", () => {
    const m = { protocolVersion: 1, entityId: 4021, tick: 987_654, serverTimeMs: 1_794_000_123_456, provinceId: "ao-lua", districtId: "ao-lua/l1", channel: 2 };
    expect(decodeZoneMessage(encodeJoinAccepted(m))).toEqual({ type: "join_accepted", ...m });
  });

  test("JoinRefused", () => {
    const m = { reason: JOIN_REFUSAL.FULL, zoneVersion: 3 };
    expect(decodeZoneMessage(encodeJoinRefused(m))).toEqual({ type: "join_refused", ...m });
  });

  test("Input, with every corner of the stick and both flags", () => {
    const m = { seq: 123_456, ackTick: 61_700, frames: [frame(127, -127, true, false), frame(-127, 127, false, true), frame(0, 0), frame(-1, 1, true, true)] };
    expect(decodeClientMessage(encodeInput(m))).toEqual({ type: "input", ...m });
  });

  test("Event", () => {
    const m = { kind: EVENT.EMOTE, tick: 500, subject: 77, args: [3, -40_000, 0], text: "" };
    expect(decodeZoneMessage(encodeEvent(m))).toEqual({ type: "event", ...m });
    const notice = { kind: EVENT.NOTICE, tick: 501, subject: 0, args: [], text: "notice.zone.restarting" };
    expect(decodeZoneMessage(encodeEvent(notice))).toEqual({ type: "event", ...notice });
  });

  test("ChatSend, ChatHeard, ChatTyping", () => {
    const send = { messageId: 41, text: "Tudo fixe? Bora à Ilha!" };
    expect(decodeClientMessage(encodeChatSend(send))).toEqual({ type: "chat_send", ...send });
    const heard = { from: 77, tick: 900, text: "Bora!" };
    expect(decodeZoneMessage(encodeChatHeard(heard))).toEqual({ type: "chat_heard", ...heard });
    const typing = { from: 77, typing: true };
    expect(decodeZoneMessage(encodeChatTyping(typing))).toEqual({ type: "chat_typing", ...typing });
    expect(decodeClientMessage(encodeChatTyping({ from: 0, typing: false }))).toEqual({ type: "chat_typing", from: 0, typing: false });
  });

  test("Handoff", () => {
    const m = { reason: HANDOFF_REASON.TRAVEL, provinceId: "ao-lua", districtId: "ao-lua/l2", channel: 1, address: "wss://z3.example/l2", token: "seat.xyz", arriveAt: "causeway" };
    expect(decodeZoneMessage(encodeHandoff(m))).toEqual({ type: "handoff", ...m });
  });
});

describe("a gesture", () => {
  test("a client says which gesture it makes, by its number; a number that is no gesture is not read", () => {
    for (const [n] of EMOTE_NAMES.entries()) expect(decodeClientMessage(encodeEmote({ emote: n }))).toEqual({ type: "emote", emote: n });
    expect(() => decodeClientMessage(encodeEmote({ emote: EMOTE_NAMES.length }))).toThrow(ProtocolError);
    expect(encodeEmote({ emote: 2 })).toHaveLength(2);
    // The zone tells of a gesture with an event: a client never sends one of those, and a zone never sends this.
    expect(decodeZoneMessage(encodeEmote({ emote: 1 }))).toEqual({ type: "unknown", code: 12 });
    // WIRE FORMAT: added to at the end, never moved.
    expect(EMOTE_NAMES).toEqual(["acenar", "rir", "aplaudir", "chamar", "dancar"]);
    expect(CHAT_REFUSAL).toEqual({ WORDS: 1, SLOW_DOWN: 2, LINKS: 3 });
  });
});

describe("where a district is asked for", () => {
  test("a district's room is its id made fit for a web address", () => {
    expect(zoneRoomOf("ao-lua/l1")).toBe("ao-lua.l1");
  });
});

describe("who someone is", () => {
  test("Who: the entity, the name on their BI, and their look as it is kept", () => {
    const who = { entityId: 412, name: "Dona Xepa", bi: "00000412-LA", look: checkLook(arrivalLook(5))! };
    expect(decodeZoneMessage(encodeWho(who))).toEqual({ type: "who", ...who });
    // Small: the entity, the name, and twelve bytes of look.
    expect(encodeWho(who).length).toBeLessThanOrEqual(3 + 1 + 9 + 1 + 11 + 1 + 12);
    // One whose look is not known has none to send.
    expect(decodeZoneMessage(encodeWho({ entityId: 1, name: "Caluanda 7", bi: "", look: null }))).toEqual({ type: "who", entityId: 1, name: "Caluanda 7", bi: "", look: null });
    // A look that could not be dressed arrives as no look, never as something to draw.
    expect(decodeZoneMessage(encodeWho({ ...who, look: { ...who.look, hair: "moicano" } }))).toEqual({ type: "who", entityId: 412, name: "Dona Xepa", bi: "00000412-LA", look: null });
    // A client never says who anyone is.
    expect(() => decodeClientMessage(encodeWho(who))).toThrow(ProtocolError);
  });
});

describe("sizes", () => {
  test("an Input with four frames is 20 bytes or less: under 200 bytes a second upstream", () => {
    const bytes = encodeInput({ seq: 2_000_000, ackTick: 2_000_000, frames: [frame(90, 90), frame(90, 90), frame(90, 80), frame(80, 80)] });
    expect(bytes.length).toBeLessThanOrEqual(20);
  });

  test("a chat line someone only sees as a balloon costs a handful of bytes", () => {
    expect(encodeChatHeard({ from: 300, tick: 100_000, text: "" }).length).toBeLessThanOrEqual(7);
    expect(encodeChatTyping({ from: 300, typing: true }).length).toBeLessThanOrEqual(4);
  });

  test("an emote costs ten bytes or less", () => {
    expect(encodeEvent({ kind: EVENT.EMOTE, tick: 100_000, subject: 300, args: [2], text: "" }).length).toBeLessThanOrEqual(10);
  });
});

describe("what a zone accepts from a client", () => {
  test("only the messages a client may send", () => {
    for (const zoneOnly of [encodeJoinAccepted({ protocolVersion: 1, entityId: 1, tick: 1, serverTimeMs: 1, provinceId: "a", districtId: "b", channel: 1 }), encodeChatHeard({ from: 1, tick: 1, text: "x" }), encodeHandoff({ reason: 1, provinceId: "a", districtId: "b", channel: 1, address: "c", token: "d", arriveAt: "" }), new Uint8Array([200])]) {
      expect(() => decodeClientMessage(zoneOnly)).toThrow(ProtocolError);
    }
  });

  test("a stick value outside the range is brought inside it, never passed on", () => {
    const forged = new Writer().u8(MSG.INPUT).uint(1).uint(0).u8(1).u8(0).u8(0).u8(0xff).finish();
    const decoded = decodeClientMessage(forged);
    expect(decoded).toMatchObject({ frames: [{ dx: -127, dz: -127, run: true, brake: true }] });
    // A jump is one more bit, and a frame without one says nothing of it.
    const jumped = decodeClientMessage(encodeInput({ seq: 1, ackTick: 0, frames: [{ dx: 0, dz: 5, run: false, brake: false, jump: true }, { dx: 0, dz: 5, run: false, brake: false }] }));
    expect(jumped).toMatchObject({ frames: [{ jump: true }, { dx: 0, dz: 5 }] });
    expect("jump" in (jumped as unknown as { frames: object[] }).frames[1]!).toBe(false);
  });

  test("no frames, or too many, is refused on both sides", () => {
    expect(() => encodeInput({ seq: 1, ackTick: 0, frames: [] })).toThrow(RangeError);
    expect(() => encodeInput({ seq: 1, ackTick: 0, frames: Array.from({ length: 9 }, () => frame(0, 0)) })).toThrow(RangeError);
    for (const count of [0, 9, 255]) {
      const forged = new Writer().u8(MSG.INPUT).uint(1).uint(0).u8(count).finish();
      expect(() => decodeClientMessage(forged)).toThrow(ProtocolError);
    }
  });

  test("a chat line is at most 200 characters, counted as a person counts them", () => {
    const longest = "ã".repeat(CHAT_MAX_CHARS);
    expect(decodeClientMessage(encodeChatSend({ messageId: 1, text: longest }))).toMatchObject({ text: longest });
    const flags = "🇦🇴".repeat(CHAT_MAX_CHARS / 2);
    expect(decodeClientMessage(encodeChatSend({ messageId: 1, text: flags }))).toMatchObject({ text: flags });
    expect(() => decodeClientMessage(encodeChatSend({ messageId: 1, text: longest + "a" }))).toThrow(ProtocolError);
    expect(() => decodeClientMessage(encodeChatSend({ messageId: 1, text: "a".repeat(801) }))).toThrow(ProtocolError);
  });

  test("an oversized token or event is refused", () => {
    expect(() => decodeClientMessage(encodeJoin({ protocolVersion: 1, token: "x".repeat(513) }))).toThrow(ProtocolError);
    expect(() => encodeEvent({ kind: 1, tick: 1, subject: 1, args: Array.from({ length: 17 }, () => 0), text: "" })).toThrow(RangeError);
    const forged = new Writer().u8(MSG.EVENT).uint(1).uint(1).uint(1).u8(17).finish();
    expect(() => decodeZoneMessage(forged)).toThrow(ProtocolError);
  });

  test("random bytes and cut-off messages only ever fail as a ProtocolError", () => {
    let seed = 99;
    const rand = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return Math.floor(((seed >>> 0) / 4294967296) * n);
    };
    const tryBoth = (bytes: Uint8Array): void => {
      for (const decode of [decodeClientMessage, decodeZoneMessage]) {
        try {
          decode(bytes);
        } catch (error) {
          expect(error).toBeInstanceOf(ProtocolError);
        }
      }
    };
    for (let i = 0; i < 3000; i++) {
      const bytes = new Uint8Array(rand(40));
      for (let j = 0; j < bytes.length; j++) bytes[j] = j === 0 ? rand(12) : rand(256);
      tryBoth(bytes);
    }
    const valid = [
      encodeJoin({ protocolVersion: 1, token: "seat.abc" }),
      encodeInput({ seq: 9, ackTick: 3, frames: [frame(1, 2), frame(3, 4)] }),
      encodeChatSend({ messageId: 1, text: "Bom dia!" }),
      encodeHandoff({ reason: 1, provinceId: "ao-lua", districtId: "ao-lua/l2", channel: 1, address: "wss://z", token: "t", arriveAt: "x" }),
      encodeEvent({ kind: 1, tick: 5, subject: 2, args: [1, 2], text: "k" }),
      encodeJoinAccepted({ protocolVersion: 1, entityId: 1, tick: 1, serverTimeMs: 1, provinceId: "a", districtId: "b", channel: 1 }),
    ];
    for (const bytes of valid) for (let cut = 0; cut < bytes.length; cut++) tryBoth(bytes.subarray(0, cut));
  });
});

describe("versions: an old client is told to refresh and never crashes", () => {
  test("negotiate", () => {
    expect(negotiate(PROTOCOL_VERSION)).toBe("ok");
    expect(negotiate(MIN_CLIENT_VERSION)).toBe("ok");
    expect(negotiate(3, 3, 5)).toBe("ok");
    expect(negotiate(5, 3, 5)).toBe("ok");
    expect(negotiate(2, 3, 5)).toBe("client_too_old");
    expect(negotiate(6, 3, 5)).toBe("client_too_new");
  });

  test("golden bytes: Join and JoinRefused are frozen, so every client ever shipped can ask and be answered", () => {
    expect([...encodeJoin({ protocolVersion: 1, token: "ab" })]).toEqual([1, 1, 2, 97, 98]);
    expect([...encodeJoinRefused({ reason: JOIN_REFUSAL.REFRESH, zoneVersion: 300 })]).toEqual([3, 1, 0xac, 0x02]);
  });

  test("a zone from the future: the join of a version 1 client still decodes, and the refusal it gets is one it can read", () => {
    const fromOldClient = encodeJoin({ protocolVersion: 1, token: "seat" });
    const join = decodeClientMessage(fromOldClient);
    expect(join.type === "join" && negotiate(join.protocolVersion, 4, 9)).toBe("client_too_old");
    const reply = decodeZoneMessage(encodeJoinRefused({ reason: JOIN_REFUSAL.REFRESH, zoneVersion: 9 }));
    expect(reply).toEqual({ type: "join_refused", reason: JOIN_REFUSAL.REFRESH, zoneVersion: 9 });
  });

  test("a message type invented later is skipped by an old client, not thrown", () => {
    expect(decodeZoneMessage(new Uint8Array([200, 1, 2, 3]))).toEqual({ type: "unknown", code: 200 });
    // Fields added to the end of a known message later are ignored too.
    const longer = new Uint8Array([...encodeJoinRefused({ reason: JOIN_REFUSAL.RETRY, zoneVersion: 2 }), 9, 9, 9]);
    expect(decodeZoneMessage(longer)).toEqual({ type: "join_refused", reason: JOIN_REFUSAL.RETRY, zoneVersion: 2 });
    // A refusal code invented later still arrives as a number the client can fall back on.
    expect(decodeZoneMessage(encodeJoinRefused({ reason: 77, zoneVersion: 2 }))).toMatchObject({ reason: 77 });
  });

  test("a snapshot is recognised and left for decodeSnapshot", () => {
    expect(decodeZoneMessage(new Uint8Array([MSG.SNAPSHOT, 1, 0, 0, 0, 0]))).toEqual({ type: "snapshot" });
  });
});

test("an input frame means walking on foot and driving at the wheel", () => {
  const f = frame(-40, 127, true, true);
  expect(toMoveInput(f)).toEqual({ dx: -40, dz: 127, run: true });
  expect(toMoveInput({ ...f, jump: true })).toEqual({ dx: -40, dz: 127, run: true, jump: true });
  expect(toDriveInput(f)).toEqual({ throttle: 127, steer: -40, brake: true });
});
