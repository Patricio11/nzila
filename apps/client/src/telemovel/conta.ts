// What the player does with their account from the Telemóvel (the BI, Os meus dados): a name, the choices that can
// be said no to, everything kept of them, deleting it, a new password. Fetched with those screens, not on the way in
// (the way in is full: F-226).

import { ACCOUNT_KEY, account, ask, keep, noteChange, type Choices, type NameAnswer } from "../world/account.ts";

/** Whether a name can be had. Null when there is no server to say. */
export async function askName(name: string): Promise<NameAnswer | null> {
  const mine = account();
  if (!mine?.token) return null;
  return (await ask<{ answer: NameAnswer }>("POST", "/v1/names/check", { name }, mine.token)).answer?.answer ?? null;
}

/** Takes a name. "ok", or the one word of why not. */
export async function rename(name: string): Promise<"ok" | "taken" | "refused" | "spent" | "invalid" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { answer, error } = await ask<{ name: string; nameFree: boolean }>("PUT", "/v1/me/name", { name }, mine.token);
  if (answer) {
    noteChange();
    keep({ ...mine, name: answer.name, nameFree: answer.nameFree });
    return "ok";
  }
  return error === "name_taken" ? "taken" : error === "name_refused" ? "refused" : error === "name_spent" ? "spent" : error === "invalid" ? "invalid" : "offline";
}

/** What the player has said yes to, of the things that can be said no to. Null when there is no server to say. */
export async function choices(): Promise<Choices | null> {
  const mine = account();
  return mine?.token ? (await ask<Choices>("GET", "/v1/me/consents", undefined, mine.token)).answer : null;
}

/** Says yes or no to one of them. What stands now, or null when it could not be said. */
export async function choose(purpose: keyof Choices, granted: boolean): Promise<Choices | null> {
  const mine = account();
  return mine?.token ? (await ask<Choices>("PUT", "/v1/me/consents", { purpose, granted }, mine.token)).answer : null;
}

/** Everything the server keeps of the player, with what this phone alone keeps beside it. */
export async function exportData(): Promise<Record<string, unknown> | null> {
  const mine = account();
  if (!mine?.token) return null;
  const { answer } = await ask<Record<string, unknown>>("GET", "/v1/me/data", undefined, mine.token);
  if (!answer) return null;
  const local = (key: string): unknown => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    } catch {
      return null;
    }
  };
  return { ...answer, onThisPhone: { settings: local("nzila.settings"), dataUsed: local("nzila.data"), look: local("nzila.look") } };
}

/** Ends the account on the server, then removes what this phone kept of it. True when it is gone. */
export async function deleteAccount(): Promise<boolean> {
  const mine = account();
  if (!mine?.token || !mine.biNumber) return false;
  const { answer } = await ask<{ ok: boolean }>("DELETE", "/v1/me", { biNumber: mine.biNumber }, mine.token);
  if (!answer?.ok) return false;
  try {
    // What was the player's goes; how this phone likes the game drawn stays.
    for (const key of [ACCOUNT_KEY, "nzila.look", "nzila.foto"]) localStorage.removeItem(key);
  } catch {
    // Storage is off: there was nothing kept to remove.
  }
  return true;
}

/** Someone who knows their password chooses another. */
export async function changePassword(current: string, next: string): Promise<"ok" | "wrong" | "invalid" | "slow" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { status, answer, error } = await ask<{ ok: boolean }>("PUT", "/v1/me/password", { current, next }, mine.token);
  return answer ? "ok" : error === "wrong_login" ? "wrong" : error === "invalid" ? "invalid" : status === 429 ? "slow" : "offline";
}
