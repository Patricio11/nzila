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
}

/** The account kept on this device, or null when nobody has come in yet. */
export function account(): Account | null {
  try {
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

/** One question to the server. Null when it cannot be reached or says no; `status` tells which no. */
async function ask<T>(method: string, path: string, body: unknown, token?: string): Promise<{ status: number; answer: T | null }> {
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
    return { status: response.status, answer: response.ok ? json : null };
  } catch {
    return { status: 0, answer: null };
  }
}

/** Makes sure the server knows this device's player. Gives back the account, with a token when the server answered. */
export async function ensureGuest(): Promise<Account | null> {
  const mine = account();
  if (!mine || mine.token) return mine;
  const { answer } = await ask<{ playerId: string; token: string }>("POST", "/v1/guests", { deviceId: mine.deviceId, platform: platform(), ageBand: mine.ageBand });
  return answer?.token ? keep({ ...mine, playerId: answer.playerId, token: answer.token }) : mine;
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
