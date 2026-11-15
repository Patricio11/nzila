// Saving the BI (Task 2.2): a guest ties their account to a phone number
// with a one-time code, and with that number comes back in on any phone.
//
// The code is sent by a `CodeSender`. Which company sends it (WhatsApp first,
// SMS behind it) is the founder's to choose on delivery and price to Angolan
// numbers (stub S-5); until then the sender prints the code where the API
// runs, and no real message leaves.
//
// Nothing here says whether a number has an account until a right code has
// been given: asking for a code always answers the same.

import { timingSafeEqual } from "node:crypto";
import { keyedHash, normalizePhone, protectPhone, type Keyring } from "@nzila/db";
import { type Sql } from "postgres";
import { Refusal } from "./routes.ts";
import { openSession } from "./sessions.ts";

export interface CodeSender {
  send(phone: string, code: string): Promise<void>;
}

/** S-5: the code goes to the console of the API, for development. */
export const consoleSender: CodeSender = {
  send: async (phone, code) => console.log(`code for ${phone}: ${code}`),
};

/** A code lives this long, answers this many tries, and a number is sent this many in a quarter of an hour. */
export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
export const CODES_PER_QUARTER = 3;

const hashPhone = (phone: string, pepper: Uint8Array): string => keyedHash(phone, "phone", pepper);
const hashCode = (phoneHash: string, code: string, pepper: Uint8Array): string => keyedHash(`${phoneHash}:${code}`, "login-code", pepper);

function phoneOf(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw new Refusal(400, "invalid");
  return phone;
}

/** Sends a code to a number. Says nothing of whether the number is anybody's. */
export async function sendCode(sql: Sql, pepper: Uint8Array, sender: CodeSender, newCode: () => string, input: string): Promise<void> {
  const phone = phoneOf(input);
  const phoneHash = hashPhone(phone, pepper);
  // A number is not sent codes without end, whoever asks and from wherever: each one costs money and rings a stranger's phone.
  const [recent] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM login_codes WHERE phone_hash = ${phoneHash} AND created_at > now() - interval '15 minutes'`;
  if (recent!.n >= CODES_PER_QUARTER) throw new Refusal(429, "slow_down");
  const code = newCode();
  await sql`INSERT INTO login_codes (phone_hash, code_hash, expires_at) VALUES (${phoneHash}, ${hashCode(phoneHash, code, pepper)}, now() + make_interval(mins => ${CODE_MINUTES}))`;
  await sender.send(phone, code);
}

/**
 * Whether `code` is the newest live code of a number. Every try is counted,
 * right or wrong, in a statement of its own, so that a refusal further on
 * cannot give the try back. `consume` uses the code up.
 */
async function codeIsRight(sql: Sql, pepper: Uint8Array, phoneHash: string, code: string, consume: boolean): Promise<boolean> {
  const [tried] = await sql<{ id: string; code_hash: string }[]>`
    UPDATE login_codes SET attempts = attempts + 1
    WHERE id = (SELECT id FROM login_codes WHERE phone_hash = ${phoneHash} AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC, id DESC LIMIT 1)
      AND attempts < ${CODE_TRIES}
    RETURNING id, code_hash`;
  if (!tried) return false;
  const given = Buffer.from(hashCode(phoneHash, code, pepper));
  const kept = Buffer.from(tried.code_hash);
  if (given.length !== kept.length || !timingSafeEqual(given, kept)) return false;
  if (!consume) return true;
  // Two requests with the same right code: one uses it.
  const used = await sql`UPDATE login_codes SET used_at = now() WHERE id = ${tried.id} AND used_at IS NULL RETURNING id`;
  return used.length === 1;
}

/**
 * Ties a guest to a number. When the number already has an account the code
 * is checked but kept, and the caller is told: the player then chooses to go
 * into that account (`signIn`, with the same code) or to stay.
 */
export async function linkPhone(sql: Sql, keyring: Keyring, pepper: Uint8Array, playerId: string, input: string, code: string): Promise<void> {
  const phone = phoneOf(input);
  const phoneHash = hashPhone(phone, pepper);
  const [holder] = await sql<{ id: string }[]>`SELECT id FROM players WHERE phone_hash = ${phoneHash}`;
  const another = holder !== undefined && holder.id !== playerId;
  if (!(await codeIsRight(sql, pepper, phoneHash, code, !another))) throw new Refusal(400, "wrong_code");
  if (another) throw new Refusal(409, "has_account");
  const kept = protectPhone(phone, keyring, pepper)!;
  try {
    await sql`UPDATE players SET kind = 'linked', phone_enc = ${kept.phoneEnc}, phone_hash = ${kept.phoneHash} WHERE id = ${playerId}`;
  } catch (error) {
    // Two guests proved the same number at the same instant: the index gives it to one.
    if ((error as { code?: string }).code === "23505") throw new Refusal(409, "has_account");
    throw error;
  }
}

/**
 * Comes into the account a number belongs to, on this device. One active
 * session a player: the newer one wins, so every older session ends, and the
 * phone it was on is told the next time it asks anything.
 */
export async function signIn(sql: Sql, pepper: Uint8Array, input: string, code: string, deviceId: string, platform: string | null): Promise<{ playerId: string; token: string }> {
  const phone = phoneOf(input);
  const phoneHash = hashPhone(phone, pepper);
  if (!(await codeIsRight(sql, pepper, phoneHash, code, true))) throw new Refusal(400, "wrong_code");
  const [holder] = await sql<{ id: string }[]>`SELECT id FROM players WHERE phone_hash = ${phoneHash} AND status = 'active'`;
  if (!holder) throw new Refusal(404, "no_account");
  return sql.begin(async (tx) => {
    await tx`UPDATE player_sessions SET revoked_at = now() WHERE player_id = ${holder.id} AND revoked_at IS NULL`;
    return { playerId: holder.id, token: await openSession(tx as unknown as Sql, pepper, holder.id, deviceId, platform) };
  });
}
