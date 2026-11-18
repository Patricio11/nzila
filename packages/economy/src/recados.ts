// Os recados do dia (docs/DAILY_PLAY_PROPOSAL.md, approved by the founder on 2026-11-18): what the bairro asks of
// a player today, and the small things that come back every day (the family's money for the taxi, the cantina's
// stamped card, a dark evening now and then). All of it is decided here by rule from the player and the date,
// so nothing has to be written down to know what a player's errands are, and the API and every phone agree.
//
// The rules' numbers are data (tunables/recados.json, Rule 14), checked as they load.

import recadosFile from "../tunables/recados.json" with { type: "json" };
import { type Mk } from "./ledger.ts";
import { type OriginTier } from "./origins.ts";

type Tier = OriginTier;
const TIERS: readonly Tier[] = ["aperto", "remediado", "bem", "ouro"];

/** The kinds of errand. "traz": buy a thing and take it to someone. "vaiver": go somewhere and see. "guarda": put
 * money in the bank. "cumprimenta": greet someone new to the bairro. */
export const RECADO_KINDS = ["traz", "vaiver", "guarda", "cumprimenta"] as const;
export type RecadoKind = (typeof RECADO_KINDS)[number];

export interface RecadoRules {
  readonly version: number;
  readonly perDay: number;
  /** What the first, second and third errand done in a day pay. */
  readonly pay: readonly Mk[];
  /** How many neighbours there are to ask (their names are in the catalogue, `recado.who.<n>`). */
  readonly neighbours: number;
  /** What may be asked for from the cantina. */
  readonly traz: readonly string[];
  /** How much may be asked to be put in the bank. */
  readonly guarda: readonly Mk[];
  /** The errand for two: a thing given to another player; what it pays the giver and the one given it. */
  readonly aDois: { readonly item: string; readonly pay: Mk; readonly received: Mk };
  /** What the family gives for the taxi each day, by how well off it is. */
  readonly familia: Readonly<Record<Tier, Mk>>;
  /** The cantina's card: how many days' stamps fill it, and what a full card is worth. */
  readonly cartao: { readonly stamps: number; readonly gift: string };
  /** Evenings without light: on how many days in seven, and from when to when in the game's day (seconds). */
  readonly apagao: { readonly daysOutOf7: number; readonly fromGameS: number; readonly toGameS: number };
  /** How many errands done in a bairro in a week make its party. */
  readonly festa: { readonly goal: number };
}

/** One errand: which in the day, what kind, who asks, and what it is about. */
export interface Recado {
  readonly n: number;
  readonly kind: RecadoKind;
  /** The neighbour who asks: `recado.who.<who>`. */
  readonly who: number;
  /** "traz": the thing. */
  readonly item?: string;
  /** "traz" and "vaiver": the place, as a number every phone and the zone turn into one of the district's places. */
  readonly place?: number;
  /** "guarda": how much. */
  readonly amount?: Mk;
}

const whole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const list = (value: unknown, check: (one: unknown) => boolean): boolean => Array.isArray(value) && value.length > 0 && value.every(check);

/** Reads the rules. Throws, saying every fault, on rules that are wrong. */
export function parseRecados(input: unknown): RecadoRules {
  const r = (input ?? {}) as Record<string, unknown>;
  const faults: string[] = [];
  if (!whole(r.version, 1, 1_000_000)) faults.push("version: a whole number from 1");
  if (!whole(r.perDay, 1, 6)) faults.push("perDay: 1 to 6");
  if (!list(r.pay, (one) => whole(one, 1, 100_000)) || (Array.isArray(r.pay) && r.pay.length < (r.perDay as number))) faults.push("pay: an amount for each errand of the day");
  if (!whole(r.neighbours, 1, 50)) faults.push("neighbours: 1 to 50");
  if (!list(r.traz, (one) => typeof one === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(one))) faults.push("traz: a list of things");
  if (!list(r.guarda, (one) => whole(one, 1, 1_000_000))) faults.push("guarda: a list of amounts");
  const aDois = (r.aDois ?? {}) as Record<string, unknown>;
  if (typeof aDois.item !== "string" || !whole(aDois.pay, 1, 100_000) || !whole(aDois.received, 0, 100_000)) faults.push("aDois: an item, what it pays, and what the one given it is paid");
  const familia = (r.familia ?? {}) as Record<string, unknown>;
  if (!TIERS.every((tier) => whole(familia[tier], 0, 1_000_000))) faults.push(`familia: an amount for each of ${TIERS.join(", ")}`);
  const cartao = (r.cartao ?? {}) as Record<string, unknown>;
  if (!whole(cartao.stamps, 2, 30) || typeof cartao.gift !== "string") faults.push("cartao: stamps (2 to 30) and a gift");
  const apagao = (r.apagao ?? {}) as Record<string, unknown>;
  if (!whole(apagao.daysOutOf7, 0, 7) || !whole(apagao.fromGameS, 0, 86_400) || !whole(apagao.toGameS, 0, 86_400) || (apagao.toGameS as number) <= (apagao.fromGameS as number)) faults.push("apagao: days out of 7, and a from before a to");
  const festa = (r.festa ?? {}) as Record<string, unknown>;
  if (!whole(festa.goal, 1, 100_000)) faults.push("festa: a goal");
  if (faults.length > 0) throw new Error(`recados.json:\n  ${faults.join("\n  ")}`);
  return r as unknown as RecadoRules;
}

export const BASE_RECADOS: RecadoRules = parseRecados(recadosFile);

/** A day in Luanda (UTC+1, no summer time), as YYYY-MM-DD. Errands, the family's money and the card go by it. */
export function dayOf(ms: number): string {
  return new Date(ms + 3_600_000).toISOString().slice(0, 10);
}

/** The week a day is in, from its Monday: the festa's. "2026-W47" style, by the ISO rule. */
export function weekOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime() + (3 - weekday) * 86_400_000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = 1 + Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** A number from a text, the same everywhere (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A run of numbers from a seed, each from 0 up to 1. */
function rolls(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A player's errands on a day: always the same for the same player and day. Never two of a kind on one day, and
 * never the same neighbour twice; one errand at least is in the street (a thing to take, or a place to see).
 */
export function recadosFor(rules: RecadoRules, playerId: string, day: string): Recado[] {
  const roll = rolls(hash(`${playerId}|${day}`));
  const pick = <T>(from: readonly T[]): T => from[Math.floor(roll() * from.length)]!;
  const kinds = [...RECADO_KINDS];
  // Shuffled, then the first in the street is brought to the front.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  const street = kinds.findIndex((kind) => kind === "traz" || kind === "vaiver");
  kinds.unshift(...kinds.splice(street, 1));
  const asked = new Set<number>();
  const out: Recado[] = [];
  for (let n = 0; n < Math.min(rules.perDay, kinds.length); n++) {
    const kind = kinds[n]!;
    let who = Math.floor(roll() * rules.neighbours);
    while (asked.has(who) && asked.size < rules.neighbours) who = (who + 1) % rules.neighbours;
    asked.add(who);
    const place = Math.floor(roll() * 1_000_000);
    if (kind === "traz") out.push({ n, kind, who, item: pick(rules.traz), place });
    else if (kind === "vaiver") out.push({ n, kind, who, place });
    else if (kind === "guarda") out.push({ n, kind, who, amount: pick(rules.guarda) });
    else out.push({ n, kind, who });
  }
  return out;
}

/** Which of a district's `count` places a recado's place is: the zone and every phone turn it the same way. */
export function placeOf(place: number, count: number): number {
  return count > 0 ? place % count : 0;
}

/** What doing an errand pays, by how many were already done that day. */
export function payFor(rules: RecadoRules, doneBefore: number): Mk {
  return rules.pay[Math.min(doneBefore, rules.pay.length - 1)]!;
}

/** Whether the light goes in the evenings of this day, in this district: the same answer for everyone in it. */
export function apagaoOn(rules: RecadoRules, day: string, districtId: string): boolean {
  return hash(`apagao|${districtId}|${day}`) % 7 < rules.apagao.daysOutOf7;
}

/** Whether the light is out at this second of the game's day, on a day it goes. */
export function inApagao(rules: RecadoRules, secondOfDay: number): boolean {
  return secondOfDay >= rules.apagao.fromGameS && secondOfDay < rules.apagao.toGameS;
}

/**
 * The cantina's card, from the days a player bought there (YYYY-MM-DD, any order, repeats allowed) since their last
 * full card: how many stamps it has, and whether this purchase, on `today`, fills it.
 */
export function stampsOf(rules: RecadoRules, days: readonly string[], today: string): { stamps: number; fills: boolean } {
  const before = new Set(days.filter((day) => day !== today));
  const stamped = before.size + 1;
  return { stamps: Math.min(stamped, rules.cartao.stamps), fills: stamped >= rules.cartao.stamps && !days.includes(today) };
}
