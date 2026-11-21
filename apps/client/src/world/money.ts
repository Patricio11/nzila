// What the player does with money and things, and with someone met: the bank, paying someone, the cantina, the
// Mochila, a player's card, blocking and reporting. Only the sheets fetched later use these, so they travel with
// those sheets and not with the way in (the megabytes rule, F-188, F-195).

import { account, ask, keep } from "./account.ts";

/** What a BI shows of someone met in the street. */
export interface PlayerCard {
  readonly name: string | null;
  readonly biNumber: string;
  readonly bairro: string | null;
  readonly arrivedAt: string;
  /** Where the two stand to each other (Task 4B.2). */
  readonly kamba?: "kambas" | "pedido_enviado" | "pedido_recebido" | "nada";
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

/** One movement of the Carteira or the Banco, as the books have it. */
export interface WalletLine {
  readonly id: string;
  readonly at: string;
  /** Positive when it came in. */
  readonly amount: number;
  readonly reason: string;
  readonly ref: string | null;
}

/** What the player holds and what moved, from the server's books; the balances are kept for the wallet on the screen. Null with no network. */
export async function walletNow(): Promise<{ cash: number; bank: number; cashLines: WalletLine[]; bankLines: WalletLine[] } | null> {
  const mine = account();
  if (!mine?.token) return null;
  const { answer } = await ask<{ cash: number; bank: number; cashLines: WalletLine[]; bankLines: WalletLine[] }>("GET", "/v1/me/wallet", undefined, mine.token);
  if (answer) keep({ ...(account() ?? mine), wallet: { cash: answer.cash, bank: answer.bank } });
  return answer;
}

/**
 * Into the Banco or out of it, at a caixa. "far": the zone does not say the player is at one. "short": they do
 * not hold that much. The key makes a second sending of the same tap harmless, so it is asked twice when the
 * first answer is lost.
 */
export async function bankMove(way: "deposit" | "withdraw", amount: number): Promise<"ok" | "far" | "short" | "offline"> {
  const mine = account();
  if (!mine?.token) return "offline";
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`.padEnd(12, "0");
  let said = await ask<{ cash: number; bank: number }>("POST", `/v1/bank/${way}`, { amount, key }, mine.token);
  if (said.status === 0 || said.status >= 502) said = await ask<{ cash: number; bank: number }>("POST", `/v1/bank/${way}`, { amount, key }, mine.token);
  // The zone's word that the player is at the caixa can be a moment behind their feet: asked once more, a little later.
  if (said.error === "not_at_caixa") {
    await new Promise((done) => setTimeout(done, 700));
    said = await ask<{ cash: number; bank: number }>("POST", `/v1/bank/${way}`, { amount, key }, mine.token);
  }
  if (said.answer) {
    keep({ ...(account() ?? mine), wallet: { cash: said.answer.cash, bank: said.answer.bank } });
    return "ok";
  }
  return said.error === "not_at_caixa" ? "far" : said.error === "insufficient" ? "short" : "offline";
}

/** What handing Makuta to someone came to. "together": the zone does not say the two stand together. */
export type Paid = "ok" | "together" | "unproved" | "new" | "limit" | "short" | "offline";

/** Hands Makuta to the player with this BI, in person. The key makes a second sending of the same tap harmless. */
export async function payPlayer(biNumber: string, amount: number): Promise<{ said: Paid; days?: number; left?: number }> {
  const mine = account();
  if (!mine?.token) return { said: "offline" };
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`.padEnd(12, "0");
  let said = await ask<{ cash: number; bank: number }>("POST", "/v1/pay", { biNumber, amount, key }, mine.token);
  if (said.status === 0 || said.status >= 502) said = await ask<{ cash: number; bank: number }>("POST", "/v1/pay", { biNumber, amount, key }, mine.token);
  if (said.error === "not_together") {
    await new Promise((done) => setTimeout(done, 700));
    said = await ask<{ cash: number; bank: number }>("POST", "/v1/pay", { biNumber, amount, key }, mine.token);
  }
  if (said.answer) {
    keep({ ...(account() ?? mine), wallet: { cash: said.answer.cash, bank: said.answer.bank } });
    return { said: "ok" };
  }
  const why = said.error;
  return { said: why === "not_together" ? "together" : why === "unproved" ? "unproved" : why === "too_new" ? "new" : why === "over_limit" ? "limit" : why === "insufficient" ? "short" : "offline", ...(typeof said.said?.days === "number" ? { days: said.said.days } : {}), ...(typeof said.said?.left === "number" ? { left: said.said.left } : {}) };
}

/** A kind of thing, as the server says: what it is, the room it takes in a Mochila, and whether it is eaten or drunk. */
export interface ThingAbout {
  readonly kind: "comida" | "bebida" | "mimo" | "cozinha" | "casa" | "presente";
  readonly size: number;
  readonly use: "comer" | "beber" | null;
}

export interface Held {
  readonly item: string;
  readonly quantity: number;
}

/** A purchase as its receipt has it. */
export interface Bought {
  readonly id: number;
  readonly at: string;
  readonly shop: string;
  readonly lines: readonly { readonly item: string; readonly quantity: number; readonly price: number; readonly amount: number }[];
  readonly total: number;
}

/** What the player carries, and the shop the zone says they stand at, with its prices. */
export interface Things {
  readonly items: readonly Held[];
  readonly about: Readonly<Record<string, ThingAbout>>;
  readonly units: number;
  readonly carryUnits: number;
  readonly receipts: readonly Bought[];
  readonly shop: { readonly id: string; readonly stock: readonly { readonly item: string; readonly price: number }[]; readonly card?: { readonly stamps: number; readonly of: number; readonly gift: string } } | null;
  readonly cash: number;
  readonly bank: number;
}

/** The Mochila, and the shop being stood at. Null with no network. */
export async function thingsNow(): Promise<Things | null> {
  const mine = account();
  if (!mine?.token) return null;
  const { answer } = await ask<Things>("GET", "/v1/me/items", undefined, mine.token);
  // The Carteira as the books say it now: the wallet on the screen follows.
  if (answer) keep({ ...(account() ?? mine), wallet: { cash: answer.cash, bank: answer.bank } });
  return answer;
}

const newKey = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`.padEnd(12, "0");

/** What buying came to. "far": the zone does not say the player is at the shop. "heavy": it would not go in the Mochila. */
export type BuySaid = "ok" | "far" | "short" | "heavy" | "offline";

/** Buys a basket at a shop. The key makes a second sending of the same tap the same purchase. */
/** The shop's card after a purchase: its stamps, and whether this one filled it (and the gift that came with it). */
export interface CardSaid {
  readonly stamps: number;
  readonly of: number;
  readonly filled: boolean;
  readonly gift: string | null;
}

export async function buyThings(shop: string, lines: readonly Held[]): Promise<{ said: BuySaid; receipt?: Bought; items?: readonly Held[]; card?: CardSaid }> {
  const mine = account();
  if (!mine?.token) return { said: "offline" };
  const key = newKey();
  const body = { shop, lines, key };
  let said = await ask<{ receipt: Bought; cash: number; bank: number; items: Held[]; card?: CardSaid }>("POST", "/v1/shop/buy", body, mine.token);
  if (said.status === 0 || said.status >= 502) said = await ask<{ receipt: Bought; cash: number; bank: number; items: Held[]; card?: CardSaid }>("POST", "/v1/shop/buy", body, mine.token);
  // The zone's word that the player is at the grille can be a moment behind their feet.
  if (said.error === "not_at_shop") {
    await new Promise((done) => setTimeout(done, 700));
    said = await ask<{ receipt: Bought; cash: number; bank: number; items: Held[]; card?: CardSaid }>("POST", "/v1/shop/buy", body, mine.token);
  }
  if (said.answer) {
    keep({ ...(account() ?? mine), wallet: { cash: said.answer.cash, bank: said.answer.bank } });
    return { said: "ok", receipt: said.answer.receipt, items: said.answer.items, ...(said.answer.card ? { card: said.answer.card } : {}) };
  }
  return { said: said.error === "not_at_shop" ? "far" : said.error === "insufficient" ? "short" : said.error === "too_heavy" ? "heavy" : "offline" };
}

/** What handing a thing to someone came to. "together": the zone does not say the two stand together. */
export type GaveThing = "ok" | "together" | "heavy" | "none" | "devolta" | "offline";

/** Hands one of a thing to the player with this BI, beside you. */
export async function giveThing(biNumber: string, item: string): Promise<{ said: GaveThing; items?: readonly Held[] }> {
  const mine = account();
  if (!mine?.token) return { said: "offline" };
  let said = await ask<{ items: Held[] }>("POST", "/v1/items/give", { biNumber, item, quantity: 1 }, mine.token);
  if (said.error === "not_together") {
    await new Promise((done) => setTimeout(done, 700));
    said = await ask<{ items: Held[] }>("POST", "/v1/items/give", { biNumber, item, quantity: 1 }, mine.token);
  }
  if (said.answer) return { said: "ok", items: said.answer.items };
  return { said: said.error === "not_together" ? "together" : said.error === "too_heavy" ? "heavy" : said.error === "none" ? "none" : said.error === "de_volta" ? "devolta" : "offline" };
}
