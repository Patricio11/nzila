// An email address and a password, for saving the BI the ordinary way
// (Task 2.2; founder, 2026-11-15: "normal signup and login, can use email").
// The rule is shared: the game says at once what is wrong, and the API, which
// decides, says the same.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * An address in the one form two typings of it share (trimmed, lower case),
 * or null for what is not one. Deliberately plain: something, an @, a domain
 * with a dot. Whether the address exists is not something a rule can know.
 */
export function checkEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : null;
}

/** Why a password will not do. */
export type PasswordFault = "short" | "long" | "obvious";

/**
 * A password is long enough to be worth guessing at, and is not the address
 * it goes with. Nothing is asked about capitals or signs: length is what
 * counts, and rules of that kind make passwords people write on paper.
 */
export function checkPassword(input: unknown, email = ""): PasswordFault | null {
  if (typeof input !== "string") return "short";
  const length = [...input].length;
  if (length < PASSWORD_MIN) return "short";
  if (length > PASSWORD_MAX) return "long";
  const plain = input.trim().toLowerCase();
  const name = email.slice(0, Math.max(0, email.indexOf("@")));
  if (plain === email || (name.length >= PASSWORD_MIN && plain === name) || /^(.)\1+$/u.test(input) || ["12345678", "123456789", "1234567890", "password", "palavra-passe", "qwertyuiop"].includes(plain)) return "obvious";
  return null;
}
