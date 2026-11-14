// Protecting what can identify a person (Rule 16).
//
// A phone number is stored twice, and neither copy is the number:
//   - encrypted (AES-256-GCM), so that support can read it back for a logged reason;
//   - as a keyed hash, so that "who has this number?" can be answered at sign-in
//     without decrypting anything.
// A device id is stored only as a keyed hash: nobody ever needs it back.
//
// Keys come from the environment and never from the repository. Encryption
// keys are numbered so they can be rotated: new values are written with the
// newest key and old values stay readable with the key that wrote them.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const FORMAT = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface Keyring {
  /** The key new values are written with. */
  readonly current: number;
  readonly keys: ReadonlyMap<number, Uint8Array>;
}

/** Reads encryption keys from "1:<base64>,2:<base64>". Each key is 32 bytes; ids are 1 to 255; the highest is current. */
export function parseKeyring(text: string | undefined): Keyring {
  const keys = new Map<number, Uint8Array>();
  for (const part of (text ?? "").split(",").filter(Boolean)) {
    const [idText, base64] = part.split(":");
    const id = Number(idText);
    const key = Buffer.from(base64 ?? "", "base64");
    if (!Number.isInteger(id) || id < 1 || id > 255 || key.length !== 32) {
      throw new Error("FIELD_KEYS must look like 1:<base64 of 32 bytes>,2:<base64 of 32 bytes>");
    }
    keys.set(id, key);
  }
  if (keys.size === 0) throw new Error("FIELD_KEYS is not set: personal data cannot be stored without an encryption key");
  return { current: Math.max(...keys.keys()), keys };
}

/** Reads the secret for keyed hashes: base64 of at least 32 bytes. */
export function parsePepper(base64: string | undefined): Uint8Array {
  const pepper = Buffer.from(base64 ?? "", "base64");
  if (pepper.length < 32) throw new Error("HASH_PEPPER must be base64 of at least 32 bytes");
  return pepper;
}

/**
 * Encrypts one field. `context` names where the value lives ("players.phone"):
 * it is bound into the ciphertext, so a value copied into another column or
 * another kind of field does not decrypt.
 */
export function encryptField(plain: string, context: string, keyring: Keyring): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyring.keys.get(keyring.current)!, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT, keyring.current]), iv, body, cipher.getAuthTag()]);
}

/** Decrypts a field. Throws when it was tampered with, moved, or written with a key that is gone. */
export function decryptField(stored: Uint8Array, context: string, keyring: Keyring): string {
  const bytes = Buffer.from(stored);
  if (bytes.length < 2 + IV_BYTES + TAG_BYTES || bytes[0] !== FORMAT) throw new Error("not an encrypted field");
  const key = keyring.keys.get(bytes[1]!);
  if (!key) throw new Error(`encrypted with key ${bytes[1]}, which is not in the keyring`);
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(2, 2 + IV_BYTES));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(bytes.subarray(2 + IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("an encrypted field failed its integrity check");
  }
}

/**
 * A keyed hash: the same value always gives the same hash, and without the
 * pepper the hash says nothing about the value. `context` keeps hashes of
 * different kinds of thing apart ("device", "phone").
 */
export function keyedHash(value: string, context: string, pepper: Uint8Array): string {
  return createHmac("sha256", pepper).update(`${context}\n${value}`, "utf8").digest("hex");
}

/**
 * A phone number in one canonical form ("+244923456789"), so that the same
 * number typed two ways is the same number. A nine-digit number beginning
 * with 9 is taken to be Angolan. Returns null for what is not a phone number.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, "");
  const full = /^9\d{8}$/.test(digits) ? `+244${digits}` : digits.replace(/^00/, "+");
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : null;
}

/** The two stored forms of a phone number. */
export function protectPhone(input: string, keyring: Keyring, pepper: Uint8Array): { phoneEnc: Buffer; phoneHash: string } | null {
  const phone = normalizePhone(input);
  if (!phone) return null;
  return { phoneEnc: encryptField(phone, "players.phone", keyring), phoneHash: keyedHash(phone, "phone", pepper) };
}

export function hashDeviceId(deviceId: string, pepper: Uint8Array): string {
  return keyedHash(deviceId, "device", pepper);
}
