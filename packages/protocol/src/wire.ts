// Bytes on the wire. Every message is hand-packed: bandwidth is the budget
// that matters most on a phone that pays by the megabyte (Rule 2).
//
// Whole numbers are written as variable-length integers: seven bits to a
// byte, small numbers in one byte. Signed numbers are folded first ("zigzag")
// so that small negatives are small too. Text is UTF-8 with its length in
// front.
//
// Everything read here came over a network from a machine we do not control.
// A reader never trusts a length, never reads past the end, and fails with a
// ProtocolError and nothing else.

export type ProtocolErrorCode =
  | "truncated" // the message ends before it should
  | "malformed" // a number or a text that cannot be what it claims
  | "too_long" // a text or a list over its limit
  | "unknown_type" // a message type this side does not know
  | "missing_baseline"; // a delta against a snapshot this side no longer has

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  constructor(code: ProtocolErrorCode, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ProtocolError";
    this.code = code;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class Writer {
  private bytes = new Uint8Array(128);
  private length = 0;

  private push(byte: number): void {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = byte;
  }

  /** One byte, 0..255. */
  u8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError(`not a byte: ${value}`);
    this.push(value);
    return this;
  }

  /** A whole number from 0 up to the largest exact integer. */
  uint(value: number): this {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`not an unsigned integer: ${value}`);
    let rest = value;
    while (rest >= 128) {
      this.push((rest % 128) + 128);
      rest = Math.floor(rest / 128);
    }
    this.push(rest);
    return this;
  }

  /** A whole number of either sign. */
  int(value: number): this {
    if (!Number.isSafeInteger(value) || Math.abs(value) >= 2 ** 52) throw new RangeError(`not an integer: ${value}`);
    return this.uint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  text(value: string): this {
    const utf8 = encoder.encode(value);
    this.uint(utf8.length);
    for (const byte of utf8) this.push(byte);
    return this;
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

export class Reader {
  private readonly bytes: Uint8Array;
  private at = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  u8(): number {
    if (this.at >= this.bytes.length) throw new ProtocolError("truncated");
    return this.bytes[this.at++]!;
  }

  uint(): number {
    let value = 0;
    let scale = 1;
    // Eight bytes of seven bits reach past the largest exact integer; a ninth is never honest.
    for (let i = 0; i < 8; i++) {
      const byte = this.u8();
      value += (byte % 128) * scale;
      if (byte < 128) {
        if (!Number.isSafeInteger(value)) throw new ProtocolError("malformed", "integer too large");
        return value;
      }
      scale *= 128;
    }
    throw new ProtocolError("malformed", "integer too long");
  }

  int(): number {
    const folded = this.uint();
    return folded % 2 === 0 ? folded / 2 : -(folded + 1) / 2;
  }

  /** A uint that must not exceed max. */
  bounded(max: number, what: string): number {
    const value = this.uint();
    if (value > max) throw new ProtocolError("too_long", what);
    return value;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  /** Text of at most maxBytes of UTF-8. */
  text(maxBytes: number): string {
    const length = this.bounded(maxBytes, "text");
    if (this.at + length > this.bytes.length) throw new ProtocolError("truncated");
    const slice = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    try {
      return decoder.decode(slice);
    } catch {
      throw new ProtocolError("malformed", "text is not UTF-8");
    }
  }
}
