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
/** How long the server is waited for: at the door, before the game goes on without it; and for something the player asked for, on a slow network. */
const DOOR_PATIENCE_MS = 4000;
const PATIENCE_MS = 12_000;

export interface Account {
  /** A random name this device gave itself. The server keeps only a hash of it. */
  readonly deviceId: string;
  readonly ageBand: AgeBand;
  /** Present once the server has made the guest. */
  readonly playerId?: string;
  readonly token?: string;
  /** "linked" once the BI is saved with a phone number: the account can then be opened on another phone. */
  readonly kind?: "guest" | "linked";
  /** How the BI was saved, and whether the address was proved. Never the address or the number themselves. */
  readonly savedWith?: { readonly email: boolean; readonly emailVerified: boolean; readonly phoneNumber: boolean };
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

function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

/** Someone old enough comes in: this device is given its name, and the band is kept. The year is not. */
export function comeIn(ageBand: AgeBand): Account {
  return keep({ deviceId: newDeviceId(), ageBand });
}

const PUT_OUT = "nzila.saiu";

/** Whether this phone was put out of a saved account because it was opened on another. Asking clears it. */
export function wasPutOut(): boolean {
  try {
    const was = localStorage.getItem(PUT_OUT) !== null;
    localStorage.removeItem(PUT_OUT);
    return was;
  } catch {
    return false;
  }
}

function platform(): "android" | "ios" | "desktop" {
  const agent = navigator.userAgent;
  return /android/i.test(agent) ? "android" : /iphone|ipad|ipod/i.test(agent) ? "ios" : "desktop";
}

/** One question to the server. Null when it cannot be reached or says no; `status` and the one word of `error` tell which no. */
async function ask<T>(method: string, path: string, body: unknown, token?: string, patience = PATIENCE_MS): Promise<Asked<T>> {
  const first = await askOnce<T>(method, path, body, token, patience);
  // A request lost on the way (no answer at all, or a gateway's error) is asked once more, when asking twice does no
  // harm: reading, and the questions that change nothing. Whatever makes or changes something is never sent twice.
  const harmless = method === "GET" || path === "/v1/names/check";
  return harmless && (first.status === 0 || first.status >= 502) ? askOnce<T>(method, path, body, token, patience) : first;
}

/** An answer, or why not: the one word of the refusal, and whatever facts came with it. */
interface Asked<T> {
  status: number;
  answer: T | null;
  error?: string;
  said?: Record<string, unknown>;
}

async function askOnce<T>(method: string, path: string, body: unknown, token: string | undefined, patience: number): Promise<Asked<T>> {
  try {
    const response = await fetch(API + path, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(patience),
    });
    const text = await response.text();
    // Megabytes are money, and these are bytes too.
    dataMeter.add(text.length);
    const json = response.headers.get("content-type")?.includes("json") ? (JSON.parse(text) as T) : null;
    const error = response.ok ? undefined : (json as { error?: string } | null)?.error;
    return { status: response.status, answer: response.ok ? json : null, ...(error ? { error, said: json as Record<string, unknown> } : {}) };
  } catch {
    return { status: 0, answer: null };
  }
}

/** Makes sure the server knows this device's player. Gives back the account, with a token when the server answered. */
export async function ensureGuest(): Promise<Account | null> {
  const mine = account();
  // An account shown in the address is a picture of one: nothing is asked of the server in its name.
  if (!mine || mine.token || mine.deviceId === "shown") return mine;
  const { answer } = await ask<{ playerId: string; token: string; name: string; biNumber: string; arrivedAt: string }>("POST", "/v1/guests", { deviceId: mine.deviceId, platform: platform(), ageBand: mine.ageBand }, undefined, DOOR_PATIENCE_MS);
  return answer?.token ? keep({ ...mine, playerId: answer.playerId, token: answer.token, name: answer.name, nameFree: true, biNumber: answer.biNumber, arrivedAt: answer.arrivedAt }) : mine;
}

/**
 * A session the server no longer knows is let go of. A guest is asked for
 * anew on the next visit. A saved account was opened on another phone (one
 * active session, the newer wins): this phone forgets it, and the door says
 * so and offers the way back in.
 */
function forget(mine: Account): void {
  if (mine.kind !== "linked") return void keep({ deviceId: mine.deviceId, ageBand: mine.ageBand, ...(mine.origin ? { origin: mine.origin } : {}) });
  try {
    for (const key of [KEY, "nzila.look", "nzila.foto"]) localStorage.removeItem(key);
    localStorage.setItem(PUT_OUT, "1");
  } catch {
    // Storage is off: nothing was kept to forget.
  }
}

/** A seat in a channel of a district, and where the zone that holds it is reached ("" for the game's own address, at /zone). */
export interface PlaySeat {
  readonly address: string;
  readonly room: string;
  readonly seat: string;
  readonly channel: number;
}

/** Kept out of every street with others by a moderator: suspended until a time, or banned. */
export interface KeptOut {
  readonly kind: "suspend" | "ban";
  readonly until: string | null;
}

/**
 * Asks the matchmaker where to play: a channel of the district, or the one a friend invited to. Null when there is
 * nowhere (no network, no zone running, the invited channel full): the player then walks alone. `out` when a
 * moderator has kept them out, which they are told.
 */
export async function playSeat(districtId: string, channel?: number): Promise<PlaySeat | { out: KeptOut } | null> {
  const mine = account();
  if (!mine?.token) return null;
  const asked = await ask<PlaySeat>("POST", "/v1/play/join", { districtId, ...(channel ? { channel } : {}) }, mine.token);
  if (asked.error === "kept_out") return { out: { kind: asked.said?.kind === "ban" ? "ban" : "suspend", until: typeof asked.said?.until === "string" ? asked.said.until : null } };
  return asked.answer;
}

/** What a BI shows of someone met in the street. */
export interface PlayerCard {
  readonly name: string | null;
  readonly biNumber: string;
  readonly bairro: string | null;
  readonly arrivedAt: string;
}

/** The BI of another player, by its number. Null when it cannot be had. */
export async function playerCard(biNumber: string): Promise<PlayerCard | null> {
  const mine = account();
  if (!mine?.token) return null;
  return (await ask<PlayerCard>("POST", "/v1/players/card", { biNumber }, mine.token)).answer;
}

/** "Bloquear" and its undoing. True when the server recorded it. */
export async function blockPlayer(biNumber: string, on: boolean): Promise<boolean> {
  const mine = account();
  if (!mine?.token) return false;
  return (await ask<{ ok: boolean }>(on ? "POST" : "DELETE", "/v1/blocks", { biNumber }, mine.token)).answer?.ok === true;
}

export type ReportReason = "insults" | "harassment" | "sexual" | "scam" | "cheating" | "name" | "other";

/** "Denunciar". True when the moderators have it. */
export async function reportPlayer(biNumber: string, reason: ReportReason, note: string): Promise<boolean> {
  const mine = account();
  if (!mine?.token) return false;
  return (await ask<{ ok: boolean }>("POST", "/v1/reports", { biNumber, reason, ...(note.trim() ? { note: note.trim() } : {}) }, mine.token)).answer?.ok === true;
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

/** Counts what the player changes from this phone, so that an answer asked before a change is not laid over it. */
let changes = 0;

interface Whoami {
  kind: "guest" | "linked";
  name: string | null;
  nameFree: boolean;
  biNumber: string | null;
  ageBand: AgeBand | null;
  arrivedAt: string;
  look: Look | null;
  origin: Origin | null;
  savedWith?: { email: boolean; emailVerified: boolean; phoneNumber: boolean };
}

/** The account with what the server says of it laid over what this phone knew. */
function known(mine: Account, said: Whoami): Account {
  return { ...mine, kind: said.kind, ...(said.name ? { name: said.name } : {}), nameFree: said.nameFree, ...(said.biNumber ? { biNumber: said.biNumber } : {}), arrivedAt: said.arrivedAt, ...(said.origin ? { origin: said.origin } : {}), ...(said.savedWith ? { savedWith: said.savedWith } : {}) };
}

/** Asks the server who the player is, and keeps what it says of the BI. The account as it is now known. */
export async function refreshAccount(): Promise<Account | null> {
  const mine = await ensureGuest();
  if (!mine?.token) return mine;
  const before = changes;
  const { status, answer } = await ask<Whoami>("GET", "/v1/me", undefined, mine.token);
  if (status === 401) {
    forget(mine);
    return account();
  }
  // The player changed something while the question was on its way (a name, on a slow network): the answer is of before, and is let go.
  const now = account();
  return answer && now && changes === before ? keep(known(now, answer)) : now;
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
    changes++;
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

/** Asks for a code to be sent to a number. */
export async function sendCode(phone: string): Promise<"ok" | "invalid" | "slow" | "offline"> {
  const { status, answer } = await ask<{ ok: boolean }>("POST", "/v1/codes", { phone });
  return answer ? "ok" : status === 400 ? "invalid" : status === 429 ? "slow" : "offline";
}

/** Ties this account to a number, with the code sent to it. "has": the number already has an account. */
export async function linkPhone(phone: string, code: string): Promise<"ok" | "wrong" | "has" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { answer, error } = await ask<{ kind: "linked" }>("POST", "/v1/me/phone", { phone, code }, mine.token);
  if (answer) {
    changes++;
    keep({ ...mine, kind: "linked" });
    return "ok";
  }
  return error === "has_account" ? "has" : error === "wrong_code" || error === "invalid" ? "wrong" : "offline";
}

/**
 * A token the server has just given for a saved account is kept, with what the
 * server keeps of the player (the look, the name, the card) in place of what
 * this phone had: whoever was playing here as a guest is left behind.
 */
async function comeInto(deviceId: string, given: { playerId: string; token: string }): Promise<"ok" | "offline"> {
  const me = (await ask<Whoami>("GET", "/v1/me", undefined, given.token)).answer;
  if (!me?.ageBand) return "offline";
  keep(known({ deviceId, ageBand: me.ageBand, playerId: given.playerId, token: given.token }, me));
  try {
    localStorage.removeItem("nzila.foto");
    if (me.look) localStorage.setItem("nzila.look", JSON.stringify(me.look));
    else localStorage.removeItem("nzila.look");
  } catch {
    // Storage is off: the look is chosen again.
  }
  return "ok";
}

/** Comes into the account a number belongs to, on this phone. */
export async function signInPhone(phone: string, code: string): Promise<"ok" | "wrong" | "none" | "offline"> {
  const deviceId = account()?.deviceId ?? newDeviceId();
  const { answer, error } = await ask<{ playerId: string; token: string }>("POST", "/v1/signin/phone", { phone, code, deviceId, platform: platform() });
  if (!answer) return error === "no_account" ? "none" : error === "wrong_code" || error === "invalid" ? "wrong" : "offline";
  return comeInto(deviceId, answer);
}

/** Saves this account with an email address and a password. "has": the address is another player's. */
export async function linkEmail(email: string, password: string): Promise<"ok" | "has" | "invalid" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { answer, error } = await ask<{ kind: "linked" }>("POST", "/v1/me/email", { email, password }, mine.token);
  if (answer) {
    changes++;
    keep({ ...mine, kind: "linked", savedWith: { email: true, emailVerified: false, phoneNumber: mine.savedWith?.phoneNumber ?? false } });
    return "ok";
  }
  return error === "has_account" ? "has" : error === "invalid" ? "invalid" : "offline";
}

/** Comes into the account an address belongs to, on this phone. "slow": too many wrong guesses, the account is closed for a while. */
export async function signInEmail(email: string, password: string): Promise<"ok" | "wrong" | "slow" | "offline"> {
  const deviceId = account()?.deviceId ?? newDeviceId();
  const { answer, error } = await ask<{ playerId: string; token: string }>("POST", "/v1/signin/email", { email, password, deviceId, platform: platform() });
  if (!answer) return error === "wrong_login" || error === "invalid" ? "wrong" : error === "slow_down" ? "slow" : "offline";
  return comeInto(deviceId, answer);
}

/**
 * Whether a BI may be saved with a phone number here. Off: nobody is paying a provider to send the
 * codes (founder, 2026-11-16). On only where the build says so, or where this phone was told so
 * (the browser tests do that, against an API with the codes switched on).
 */
export function phoneOffered(): boolean {
  if (import.meta.env.VITE_PHONE_CODES === "on") return true;
  try {
    return localStorage.getItem("nzila.numero") !== null;
  } catch {
    return false;
  }
}

/** Types back the code sent to the address: the address is the player's own. */
export async function verifyEmail(code: string): Promise<"ok" | "wrong" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { answer, error } = await ask<{ verified: boolean }>("POST", "/v1/me/email/verify", { code }, mine.token);
  if (!answer) return error === "wrong_code" || error === "invalid" ? "wrong" : "offline";
  changes++;
  keep({ ...mine, savedWith: { email: true, emailVerified: true, phoneNumber: mine.savedWith?.phoneNumber ?? false } });
  return "ok";
}

/** Asks for the letter with the code again. */
export async function mailVerifyCode(): Promise<"ok" | "slow" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { status, answer } = await ask<{ ok: boolean }>("POST", "/v1/me/email/code", {}, mine.token);
  return answer ? "ok" : status === 429 ? "slow" : "offline";
}

/** "Esqueci-me": asks for a code to be sent to the address. The server says the same whether or not the address has a BI. */
export async function forgotPassword(email: string): Promise<"ok" | "slow" | "offline"> {
  const { status, answer } = await ask<{ ok: boolean }>("POST", "/v1/password/forgot", { email });
  return answer ? "ok" : status === 429 ? "slow" : "offline";
}

/** A new password, with the code sent to the address; and in, on this phone. */
export async function resetPassword(email: string, code: string, password: string): Promise<"ok" | "wrong" | "offline"> {
  const deviceId = account()?.deviceId ?? newDeviceId();
  const { answer, error } = await ask<{ playerId: string; token: string }>("POST", "/v1/password/reset", { email, code, password, deviceId, platform: platform() });
  if (!answer) return error === "wrong_code" || error === "invalid" ? "wrong" : "offline";
  return comeInto(deviceId, answer);
}

/** Someone who knows their password chooses another. */
export async function changePassword(current: string, next: string): Promise<"ok" | "wrong" | "invalid" | "slow" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const { status, answer, error } = await ask<{ ok: boolean }>("PUT", "/v1/me/password", { current, next }, mine.token);
  return answer ? "ok" : error === "wrong_login" ? "wrong" : error === "invalid" ? "invalid" : status === 429 ? "slow" : "offline";
}
