import { describe, expect, test } from "vitest";
import {
  decryptField,
  encryptField,
  hashDeviceId,
  keyedHash,
  normalizePhone,
  parseKeyring,
  parsePepper,
  protectPhone,
} from "./privacy.ts";

const key = (fill: number): string => Buffer.alloc(32, fill).toString("base64");
const keyring = parseKeyring(`1:${key(1)}`);
const pepper = parsePepper(key(9));

describe("keys from the environment", () => {
  test("the highest numbered key is the current one", () => {
    const ring = parseKeyring(`1:${key(1)},3:${key(3)},2:${key(2)}`);
    expect(ring.current).toBe(3);
    expect(ring.keys.size).toBe(3);
  });

  test("missing or malformed keys stop the process instead of storing data unprotected", () => {
    expect(() => parseKeyring(undefined)).toThrow(/not set/);
    expect(() => parseKeyring("")).toThrow(/not set/);
    expect(() => parseKeyring("1:c2hvcnQ=")).toThrow(/32 bytes/);
    expect(() => parseKeyring(`0:${key(1)}`)).toThrow();
    expect(() => parseKeyring(`256:${key(1)}`)).toThrow();
    expect(() => parseKeyring(`x:${key(1)}`)).toThrow();
    expect(() => parseKeyring("1")).toThrow();
    expect(() => parsePepper(undefined)).toThrow(/32 bytes/);
    expect(() => parsePepper("c2hvcnQ=")).toThrow(/32 bytes/);
  });
});

describe("field encryption", () => {
  test("round trips, and the stored bytes do not contain the value", () => {
    const stored = encryptField("+244923456789", "players.phone", keyring);
    expect(decryptField(stored, "players.phone", keyring)).toBe("+244923456789");
    expect(stored.toString("latin1")).not.toContain("923456789");
    expect(decryptField(encryptField("ção 😀", "x", keyring), "x", keyring)).toBe("ção 😀");
  });

  test("the same value encrypts differently every time", () => {
    const a = encryptField("+244923456789", "players.phone", keyring);
    const b = encryptField("+244923456789", "players.phone", keyring);
    expect(a.equals(b)).toBe(false);
  });

  test("a changed byte, anywhere, is refused", () => {
    const stored = encryptField("+244923456789", "players.phone", keyring);
    for (const at of [2, 10, 16, stored.length - 1]) {
      const tampered = Buffer.from(stored);
      tampered[at] = tampered[at]! ^ 1;
      expect(() => decryptField(tampered, "players.phone", keyring)).toThrow(/integrity/);
    }
  });

  test("a value moved to another field does not decrypt", () => {
    const stored = encryptField("+244923456789", "players.phone", keyring);
    expect(() => decryptField(stored, "staff.phone", keyring)).toThrow(/integrity/);
  });

  test("keys rotate: old values stay readable, new values use the new key, a retired key is named", () => {
    const old = encryptField("antigo", "f", keyring);
    const rotated = parseKeyring(`1:${key(1)},2:${key(2)}`);
    expect(decryptField(old, "f", rotated)).toBe("antigo");
    const fresh = encryptField("novo", "f", rotated);
    expect(fresh[1]).toBe(2);
    expect(() => decryptField(fresh, "f", keyring)).toThrow(/key 2, which is not in the keyring/);
  });

  test("what is not an encrypted field is refused", () => {
    expect(() => decryptField(Buffer.from("plain text"), "f", keyring)).toThrow(/not an encrypted field/);
    expect(() => decryptField(Buffer.concat([Buffer.from([9]), Buffer.alloc(40)]), "f", keyring)).toThrow(/not an encrypted field/);
  });
});

describe("keyed hashes", () => {
  test("the same value gives the same hash; another pepper or another kind of thing gives another", () => {
    expect(keyedHash("abc", "device", pepper)).toBe(keyedHash("abc", "device", pepper));
    expect(keyedHash("abc", "device", pepper)).toMatch(/^[0-9a-f]{64}$/);
    expect(keyedHash("abc", "device", pepper)).not.toBe(keyedHash("abc", "phone", pepper));
    expect(keyedHash("abc", "device", pepper)).not.toBe(keyedHash("abc", "device", parsePepper(key(8))));
    expect(hashDeviceId("abc", pepper)).toBe(keyedHash("abc", "device", pepper));
  });
});

describe("phone numbers", () => {
  test("one canonical form, however it is typed", () => {
    for (const typed of ["923456789", "923 456 789", "+244 923 456 789", "00244923456789", "+244-923-456-789", "(+244) 923.456.789"]) {
      expect(normalizePhone(typed), typed).toBe("+244923456789");
    }
    expect(normalizePhone("+27 82 123 4567")).toBe("+27821234567");
    expect(normalizePhone("+351 912 345 678")).toBe("+351912345678");
  });

  test("what is not a phone number is refused", () => {
    for (const bad of ["", "abc", "12345", "823456789", "+0123456789", "+244 923 456 789 000 000", "923456789x"]) {
      expect(normalizePhone(bad), bad).toBeNull();
    }
    expect(protectPhone("not a number", keyring, pepper)).toBeNull();
  });

  test("the two stored forms: one to read back, one to look up by", () => {
    const a = protectPhone("923 456 789", keyring, pepper)!;
    const b = protectPhone("+244923456789", keyring, pepper)!;
    expect(a.phoneHash).toBe(b.phoneHash);
    expect(decryptField(a.phoneEnc, "players.phone", keyring)).toBe("+244923456789");
  });
});
