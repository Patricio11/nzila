// Who is playing on this device (Tasks 2.1, 2.6). The first time someone
// comes in they are asked the year they were born; the year stays here, and
// only the band it falls in is kept or sent. Then the server is asked for a
// guest, and what it answers (a token, never shown) is kept beside the band.
//
// The server may not be there: a phone with no network, a machine with only
// the client built. The game then goes on with what this device knows, and
// asks again the next time. Nothing here decides anything the server owns:
// the look is proposed to it, the card of origin is dealt by it.

import { type Origin } from "@nzila/economy";
import { ageBandOf, type AgeBand, type Look } from "@nzila/protocol";
import { dataMeter } from "../net/data-meter.ts";

const KEY = "nzila.conta";
const API = "/api";
/** How long the server is waited for before the game goes on without it. */
const PATIENCE_MS = 4000;

export interface Account {
  /** A random name this device gave itself. The server keeps only a hash of it. */
  readonly deviceId: string;
  readonly ageBand: AgeBand;
  /** Present once the server has made the guest. */
  readonly playerId?: string;
  readonly token?: string;
  /** The card the server dealt, kept so that it can be shown with no network. */
  readonly origin?: Origin;
  /** What is on the BI: the name, whether it can still be changed for nothing, the number, the day of arrival. */
  readonly name?: string;
  readonly nameFree?: boolean;
  readonly biNumber?: string;
  readonly arrivedAt?: string;
}

/** What the server may say of a name while it is typed. */
export type NameAnswer = "free" | "yours" | "taken" | "refused" | "short" | "long" | "letters";

/** The account kept on this device, or null when nobody has come in yet. */
export function account(): Account | null {
  try {
    // `?conta=<json>` shows an account in the address, for stills. It has no token, so nothing is asked in its name.
    const shown = new URLSearchParams(location.search).get("conta");
    if (shown) {
      const given = JSON.parse(shown) as Record<string, unknown>;
      delete given.token;
      return { ...(given as unknown as Account), deviceId: "shown" };
    }
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Account> | null;
    return value && typeof value.deviceId === "string" && (value.ageBand === "15_17" || value.ageBand === "18_plus") ? (value as Account) : null;
  } catch {
    return null;
  }
}

function keep(next: Account): Account {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage is off: whoever this is, is asked again next time.
  }
  return next;
}

/** What a year of birth means today: a band, "young", or "invalid". */
export function ageOf(birthYear: number): ReturnType<typeof ageBandOf> {
  return ageBandOf(birthYear, new Date().getFullYear());
}

/** Someone old enough comes in: this device is given its name, and the band is kept. The year is not. */
export function comeIn(ageBand: AgeBand): Account {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const deviceId = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
  return keep({ deviceId, ageBand });
}

function platform(): "android" | "ios" | "desktop" {
  const agent = navigator.userAgent;
  return /android/i.test(agent) ? "android" : /iphone|ipad|ipod/i.test(agent) ? "ios" : "desktop";
}

/** One question to the server. Null when it cannot be reached or says no; `status` and the one word of `error` tell which no. */
async function ask<T>(method: string, path: string, body: unknown, token?: string): Promise<{ status: number; answer: T | null; error?: string }> {
  try {
    const response = await fetch(API + path, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(PATIENCE_MS),
    });
    const text = await response.text();
    // Megabytes are money, and these are bytes too.
    dataMeter.add(text.length);
    const json = response.headers.get("content-type")?.includes("json") ? (JSON.parse(text) as T) : null;
    const error = response.ok ? undefined : (json as { error?: string } | null)?.error;
    return { status: response.status, answer: response.ok ? json : null, ...(error ? { error } : {}) };
  } catch {
    return { status: 0, answer: null };
  }
}

/** Makes sure the server knows this device's player. Gives back the account, with a token when the server answered. */
export async function ensureGuest(): Promise<Account | null> {
  const mine = account();
  // An account shown in the address is a picture of one: nothing is asked of the server in its name.
  if (!mine || mine.token || mine.deviceId === "shown") return mine;
  const { answer } = await ask<{ playerId: string; token: string; name: string; biNumber: string; arrivedAt: string }>("POST", "/v1/guests", { deviceId: mine.deviceId, platform: platform(), ageBand: mine.ageBand });
  return answer?.token ? keep({ ...mine, playerId: answer.playerId, token: answer.token, name: answer.name, nameFree: true, biNumber: answer.biNumber, arrivedAt: answer.arrivedAt }) : mine;
}

/** A session the server no longer knows is let go of, so that the next visit asks for a new one. */
function forget(mine: Account): void {
  keep({ deviceId: mine.deviceId, ageBand: mine.ageBand, ...(mine.origin ? { origin: mine.origin } : {}) });
}

/** Proposes the look to the server. True when it was recorded. */
export async function pushLook(look: Look): Promise<boolean> {
  const mine = await ensureGuest();
  if (!mine?.token) return false;
  const { status, answer } = await ask<{ look: Look }>("PUT", "/v1/me/look", { look }, mine.token);
  if (status === 401) forget(mine);
  return answer !== null;
}

/** The card of origin: the one kept here, or the one the server deals now. Null when there is no server to deal it. */
export async function dealtOrigin(): Promise<Origin | null> {
  const mine = await ensureGuest();
  if (mine?.origin) return mine.origin;
  if (!mine?.token) return null;
  const { status, answer } = await ask<{ origin: Origin }>("POST", "/v1/me/origin", {}, mine.token);
  if (status === 401) forget(mine);
  if (!answer?.origin) return null;
  keep({ ...mine, origin: answer.origin });
  return answer.origin;
}

/** Asks the server who the player is, and keeps what it says of the BI. The account as it is now known. */
export async function refreshAccount(): Promise<Account | null> {
  const mine = await ensureGuest();
  if (!mine?.token) return mine;
  const { status, answer } = await ask<{ name: string | null; nameFree: boolean; biNumber: string | null; arrivedAt: string; origin: Origin | null }>("GET", "/v1/me", undefined, mine.token);
  if (status === 401) forget(mine);
  if (!answer) return mine;
  return keep({ ...mine, ...(answer.name ? { name: answer.name } : {}), nameFree: answer.nameFree, ...(answer.biNumber ? { biNumber: answer.biNumber } : {}), arrivedAt: answer.arrivedAt, ...(answer.origin ? { origin: answer.origin } : {}) });
}

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
    keep({ ...mine, name: answer.name, nameFree: answer.nameFree });
    return "ok";
  }
  return error === "name_taken" ? "taken" : error === "name_refused" ? "refused" : error === "name_spent" ? "spent" : error === "invalid" ? "invalid" : "offline";
}

export type Choices = { analytics: boolean; notifications: boolean };

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
    for (const key of [KEY, "nzila.look", "nzila.foto"]) localStorage.removeItem(key);
  } catch {
    // Storage is off: there was nothing kept to remove.
  }
  return true;
}
