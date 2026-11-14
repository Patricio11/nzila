import { describe, expect, test } from "vitest";
import { ProtocolError, Reader, Writer } from "./wire.ts";

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    throw error;
  }
  return "no error";
};

describe("numbers", () => {
  test("round trip, from zero to the largest exact integer", () => {
    const values = [0, 1, 127, 128, 16_383, 16_384, 2 ** 31, 2 ** 32 + 5, 1_794_000_000_000, Number.MAX_SAFE_INTEGER];
    const w = new Writer();
    for (const v of values) w.uint(v);
    const r = new Reader(w.finish());
    for (const v of values) expect(r.uint()).toBe(v);
  });

  test("signed numbers round trip, and small ones of either sign are one byte", () => {
    const values = [0, -1, 1, -64, 63, -65, 64, 150, -150, 512_000, -2_000_000_000, 2 ** 52 - 1, -(2 ** 52 - 1)];
    const w = new Writer();
    for (const v of values) w.int(v);
    const r = new Reader(w.finish());
    for (const v of values) expect(r.int()).toBe(v);
    expect(new Writer().int(-64).finish().length).toBe(1);
    expect(new Writer().int(63).finish().length).toBe(1);
    expect(new Writer().int(150).finish().length).toBe(2);
  });

  test("golden bytes: the encoding never changes", () => {
    expect([...new Writer().uint(300).int(-3).u8(255).bool(true).bool(false).finish()]).toEqual([0xac, 0x02, 0x05, 0xff, 1, 0]);
  });

  test("the writer refuses what it cannot write faithfully", () => {
    expect(() => new Writer().u8(256)).toThrow(RangeError);
    expect(() => new Writer().u8(-1)).toThrow(RangeError);
    expect(() => new Writer().u8(1.5)).toThrow(RangeError);
    expect(() => new Writer().uint(-1)).toThrow(RangeError);
    expect(() => new Writer().uint(1.5)).toThrow(RangeError);
    expect(() => new Writer().uint(2 ** 53)).toThrow(RangeError);
    expect(() => new Writer().int(2 ** 52)).toThrow(RangeError);
    expect(() => new Writer().int(Number.NaN)).toThrow(RangeError);
  });

  test("grows past its first buffer", () => {
    const w = new Writer();
    for (let i = 0; i < 1000; i++) w.u8(i % 256);
    const bytes = w.finish();
    expect(bytes.length).toBe(1000);
    expect(bytes[999]).toBe(999 % 256);
  });
});

describe("text", () => {
  test("round trips Portuguese, and anything else a player may type", () => {
    const lines = ["", "Bom dia!", "Tudo fixe? Bora à Ilha comer mufete", "ação, coração, avó", "😀🇦🇴", "日本語"];
    const w = new Writer();
    for (const line of lines) w.text(line);
    const r = new Reader(w.finish());
    for (const line of lines) expect(r.text(100)).toBe(line);
  });
});

describe("a reader never trusts what it is given", () => {
  test("reading past the end is 'truncated'", () => {
    expect(codeOf(() => new Reader(new Uint8Array([])).u8())).toBe("truncated");
    expect(codeOf(() => new Reader(new Uint8Array([0x80])).uint())).toBe("truncated");
    expect(codeOf(() => new Reader(new Uint8Array([5, 65, 66])).text(100))).toBe("truncated");
  });

  test("a number that never ends, or is too large to be exact, is 'malformed'", () => {
    expect(codeOf(() => new Reader(new Uint8Array(9).fill(0xff)).uint())).toBe("malformed");
    expect(codeOf(() => new Reader(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f])).uint())).toBe("malformed");
  });

  test("a length over the limit is 'too_long' before a single byte of it is read", () => {
    const huge = new Writer().uint(4_000_000_000).finish();
    expect(codeOf(() => new Reader(huge).text(64))).toBe("too_long");
    expect(codeOf(() => new Reader(new Uint8Array([9])).bounded(8, "list"))).toBe("too_long");
    expect(new Reader(new Uint8Array([8])).bounded(8, "list")).toBe(8);
  });

  test("bytes that are not UTF-8 are 'malformed'", () => {
    expect(codeOf(() => new Reader(new Uint8Array([2, 0xc3, 0x28])).text(100))).toBe("malformed");
  });

  test("the error says what went wrong", () => {
    expect(new ProtocolError("truncated").message).toBe("truncated");
    expect(new ProtocolError("too_long", "text").message).toBe("too_long: text");
    expect(new ProtocolError("truncated").name).toBe("ProtocolError");
  });
});
