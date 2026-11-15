// A player's name (Task 2.3). The rule is shared: the game says at once why
// a name will not do, and the API, which decides, says the same.
//
// A name is 3 to 16 characters: letters of the Latin alphabet with their
// accents, digits after the first letter, and single spaces, hyphens or
// apostrophes between them. Two names are the same name when they differ
// only by case, accents or those separators, so nobody can pass for
// "Zé Manel" as "ze-manel".

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/** Why a name will not do, before anyone is asked whether it is free. */
export type NameFault = "short" | "long" | "letters";

/** What makes two names the same name: lower case, no accents, no separators. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** The name as it is kept (trimmed, single spaces) with its key, or what is wrong with it. */
export function checkName(input: unknown): { readonly name: string; readonly key: string } | NameFault {
  if (typeof input !== "string") return "letters";
  const name = input.normalize("NFC").trim().replace(/\s+/g, " ");
  const length = [...name].length;
  if (length < NAME_MIN) return "short";
  if (length > NAME_MAX) return "long";
  // A letter first; then letters and digits, with one space, hyphen or apostrophe at a time between them.
  if (!/^\p{Script=Latin}[\p{Script=Latin}\d]*(?:[ '-][\p{Script=Latin}\d]+)*$/u.test(name)) return "letters";
  const key = nameKey(name);
  // Letters that leave nothing plain behind (ª, º) would make a name with no key of its own.
  return key.length < NAME_MIN ? "letters" : { name, key };
}
