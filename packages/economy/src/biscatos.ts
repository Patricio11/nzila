// Biscatos (Task 4.5, D-4.22): quick work taken on the spot, scored by the zone and paid by the API from the `wage`
// faucet. What each pays, how long it lasts and what it costs the body are data (tunables/biscatos.json, Rule 14),
// checked as they load; so is the daily taper, which halves the pay and halves it again but never stops it.

import biscatosFile from "../tunables/biscatos.json" with { type: "json" };
import { type Mk } from "./ledger.ts";

/** The biscatos there are, by their name in a place's id (`biscato-<kind>-<where>`). */
export const BISCATO_KINDS = ["pratos", "carga"] as const;
export type BiscatoKind = (typeof BISCATO_KINDS)[number];

/** The best score of a round, as the zone gives it. */
export const BISCATO_SCORE_MAX = 1000;

export interface BiscatoKindRules {
  /** What the least and the best round pay, before the taper. */
  readonly leastMk: Mk;
  readonly mostMk: Mk;
  /** How long a round lasts. */
  readonly seconds: number;
  /** What a round costs the body, in the needs' units (of 10 000). */
  readonly energia: number;
  readonly fome: number;
}

export interface BiscatoRules {
  readonly version: number;
  readonly kinds: Readonly<Record<BiscatoKind, BiscatoKindRules>>;
  /** From what a day's biscatos have paid already, the share of the next one's pay. The first step is from 0. */
  readonly taper: readonly { readonly fromMk: Mk; readonly percent: number }[];
  /** Pay is rounded down to this many Makuta. */
  readonly roundTo: Mk;
}

const whole = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Reads the rules. Throws, saying every fault, on rules that are wrong. */
export function parseBiscatos(input: unknown): BiscatoRules {
  const r = (input ?? {}) as Record<string, unknown>;
  const faults: string[] = [];
  if (!whole(r.version, 1, 1_000_000)) faults.push("version: a whole number from 1");
  const kinds = (r.kinds ?? {}) as Record<string, Record<string, unknown> | undefined>;
  for (const kind of BISCATO_KINDS) {
    const one = kinds[kind] ?? {};
    if (!whole(one.leastMk, 1, 100_000) || !whole(one.mostMk, 1, 100_000) || (one.mostMk as number) < (one.leastMk as number)) faults.push(`kinds.${kind}: leastMk and mostMk, the least first`);
    if (!whole(one.seconds, 30, 300)) faults.push(`kinds.${kind}.seconds: 30 to 300`);
    if (!whole(one.energia, 0, 10_000) || !whole(one.fome, 0, 10_000)) faults.push(`kinds.${kind}: energia and fome, 0 to 10 000`);
  }
  const taper = r.taper;
  const steps = Array.isArray(taper) ? (taper as Record<string, unknown>[]) : [];
  const rising = steps.every((step, i) => whole(step.fromMk, 0, 10_000_000) && whole(step.percent, 1, 100) && (i === 0 ? step.fromMk === 0 : (step.fromMk as number) > (steps[i - 1]!.fromMk as number) && (step.percent as number) <= (steps[i - 1]!.percent as number)));
  if (steps.length === 0 || !rising) faults.push("taper: steps from 0, rising, each paying no more than the one before, and never nothing");
  if (!whole(r.roundTo, 1, 1000)) faults.push("roundTo: 1 to 1000");
  if (faults.length > 0) throw new Error(`biscatos.json:\n  ${faults.join("\n  ")}`);
  return r as unknown as BiscatoRules;
}

export const BASE_BISCATOS: BiscatoRules = parseBiscatos(biscatosFile);

/** Whether a name is one of the biscatos. */
export function isBiscatoKind(name: string): name is BiscatoKind {
  return (BISCATO_KINDS as readonly string[]).includes(name);
}

/** The share of a biscato's pay that is paid, after what the day's biscatos have paid already. */
export function taperPercent(rules: BiscatoRules, paidTodayMk: Mk): number {
  let percent = rules.taper[0]!.percent;
  for (const step of rules.taper) if (paidTodayMk >= step.fromMk) percent = step.percent;
  return percent;
}

/**
 * What a round pays: from the least to the most by its score, then the day's taper, rounded down. Nothing for a
 * score of nothing; never less than one rounding's worth for a score above it.
 */
export function biscatoPay(rules: BiscatoRules, kind: BiscatoKind, score: number, paidTodayMk: Mk): Mk {
  const one = rules.kinds[kind];
  const scored = Math.max(0, Math.min(BISCATO_SCORE_MAX, Math.floor(score)));
  if (scored === 0) return 0;
  const before = one.leastMk + Math.floor(((one.mostMk - one.leastMk) * scored) / BISCATO_SCORE_MAX);
  const after = Math.floor((before * taperPercent(rules, paidTodayMk)) / 100);
  return Math.max(rules.roundTo, Math.floor(after / rules.roundTo) * rules.roundTo);
}
