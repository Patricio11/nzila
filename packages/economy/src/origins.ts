// A lotaria da vida (D-0.44): where a player is born sets what they start
// with. At first play one card is drawn: the family (the father's trade and
// the mother's), the province the family came from, the bairro the player
// grew up in, and the Makuta they arrive with. No rerolls.
//
// The table is data (tunables/origins.json), versioned like every number of
// the game; this file checks it and draws from it. The draw is pure: whoever
// calls it brings the dice, and the server is the only one who may (the
// client proposes nothing here).

import table from "../tunables/origins.json" with { type: "json" };
import { BASE_TUNABLES } from "./base.ts";

/** How a family lives. The card says it; nothing in the rules reads it. */
export type OriginTier = "aperto" | "remediado" | "bem" | "ouro";

export interface OriginFamily {
  readonly id: string;
  /** The father's trade and the mother's: ids of words in the catalog. */
  readonly pai: string;
  readonly mae: string;
  readonly tier: OriginTier;
  /** How often this family is drawn, against the sum of all weights. Nothing: a family no longer dealt, kept for those who drew it. */
  readonly weight: number;
  /** The least and the most Makuta this family starts a child with. */
  readonly min: number;
  readonly max: number;
  /** Where such a family lives: the draw goes with the area. */
  readonly bairros: readonly string[];
}

export interface OriginTable {
  readonly version: number;
  /** Amounts fall on multiples of this. */
  readonly step: number;
  readonly families: readonly OriginFamily[];
  /** Where the family came from, before Luanda or in it. */
  readonly provinces: readonly { readonly id: string; readonly weight: number }[];
}

/** The card a player was dealt. */
export interface Origin {
  readonly family: string;
  readonly pai: string;
  readonly mae: string;
  readonly tier: OriginTier;
  readonly province: string;
  readonly bairro: string;
  readonly makuta: number;
  /** Which table it was drawn from. */
  readonly version: number;
}

const TIERS: readonly string[] = ["aperto", "remediado", "bem", "ouro"];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const whole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const id = (value: unknown): value is string => typeof value === "string" && ID.test(value);

/** Every problem of a table of origins, at once. `floor` is the least anyone may start with. */
export function originTableErrors(input: unknown, floor: number): string[] {
  const errors: string[] = [];
  const given = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (!whole(given.version) || given.version < 1) errors.push("version: expected a whole number from 1");
  const step = whole(given.step) && given.step > 0 ? given.step : 0;
  if (step === 0) errors.push("step: expected a whole number above 0");
  const families = Array.isArray(given.families) ? (given.families as Record<string, unknown>[]) : [];
  const provinces = Array.isArray(given.provinces) ? (given.provinces as Record<string, unknown>[]) : [];
  if (families.length === 0) errors.push("families: at least one");
  if (provinces.length === 0) errors.push("provinces: at least one");
  const seen = new Set<unknown>();
  for (const [n, family] of families.entries()) {
    const at = `families.${id(family?.id) ? family.id : n}`;
    if (typeof family !== "object" || family === null) {
      errors.push(`${at}: expected an object`);
      continue;
    }
    if (!id(family.id) || seen.has(family.id)) errors.push(`${at}: needs an id of its own`);
    seen.add(family.id);
    if (!id(family.pai) || !id(family.mae)) errors.push(`${at}: needs a father's trade and a mother's`);
    if (typeof family.tier !== "string" || !TIERS.includes(family.tier)) errors.push(`${at}: tier is not one of ${TIERS.join(", ")}`);
    if (!whole(family.weight) || family.weight < 0) errors.push(`${at}: weight must be a whole number, 0 for a family no longer dealt`);
    if (!whole(family.min) || !whole(family.max) || family.min > family.max) errors.push(`${at}: needs a least and a most, in that order`);
    else if (family.min < floor) errors.push(`${at}: nobody starts with less than ${floor}`);
    else if (step > 0 && (family.min % step !== 0 || family.max % step !== 0)) errors.push(`${at}: amounts fall on multiples of ${step}`);
    if (!Array.isArray(family.bairros) || family.bairros.length === 0 || !family.bairros.every(id)) errors.push(`${at}: needs at least one bairro`);
  }
  if (families.length > 0 && !families.some((family) => whole(family?.weight) && family.weight > 0)) errors.push("families: at least one must be dealt");
  seen.clear();
  for (const [n, province] of provinces.entries()) {
    if (typeof province !== "object" || province === null || !id(province.id) || seen.has(province.id) || !whole(province.weight) || province.weight < 1) errors.push(`provinces.${n}: needs an id of its own and a weight from 1`);
    else seen.add(province.id);
  }
  return errors;
}

/** The table, checked. Throws on one that may not be drawn from. */
export function parseOriginTable(input: unknown, floor: number): OriginTable {
  const errors = originTableErrors(input, floor);
  if (errors.length > 0) throw new Error(`invalid table of origins:\n${errors.join("\n")}`);
  return input as OriginTable;
}

function weighted<T extends { readonly weight: number }>(items: readonly T[], roll: number): T {
  let left = roll * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    left -= item.weight;
    if (left < 0) return item;
  }
  // A roll of exactly 1, which honest dice never give: the last thing that is dealt at all.
  return items.findLast((item) => item.weight > 0)!;
}

/**
 * Deals one card. `roll` gives a number from 0 up to, not including, 1 each
 * time it is asked: four are used, for the family, the amount, the bairro and
 * the province, in that order.
 */
export function drawOrigin(from: OriginTable, roll: () => number): Origin {
  const family = weighted(from.families, roll());
  const steps = (family.max - family.min) / from.step;
  const makuta = family.min + Math.min(steps, Math.floor(roll() * (steps + 1))) * from.step;
  const bairro = family.bairros[Math.min(family.bairros.length - 1, Math.floor(roll() * family.bairros.length))]!;
  const province = weighted(from.provinces, roll()).id;
  return { family: family.id, pai: family.pai, mae: family.mae, tier: family.tier, province, bairro, makuta, version: from.version };
}

/** The card of a family that was drawn before, read back from what was recorded of it. Null when the table no longer has the family. */
export function originOf(from: OriginTable, recorded: { family: string; province: string; bairro: string; makuta: number; version: number }): Origin | null {
  const family = from.families.find((one) => one.id === recorded.family);
  return family ? { family: family.id, pai: family.pai, mae: family.mae, tier: family.tier, province: recorded.province, bairro: recorded.bairro, makuta: recorded.makuta, version: recorded.version } : null;
}

/** The starter table: placeholder families and shares until the founder sets them (D-0.44). */
export const BASE_ORIGINS: OriginTable = parseOriginTable(table, BASE_TUNABLES.player.startingFloor);
