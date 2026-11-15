// First golden tests for the typed stubs. Every Makuta figure and rate below
// is a fixture for the test, not a game value: those live in tunables.

import { describe, expect, test } from "vitest";
import { HEAT_MAX, heatBand, heatValue, type HeatWeights } from "./heat.ts";
import { SCORE_MAX, scoreTiming } from "./minigame/index.ts";
import { NEED_FULL, decayNeeds, spendEffort } from "./needs.ts";
import { assaltoLossCap, isShielded, type OffenceKind } from "./offence.ts";

describe("needs", () => {
  const rates = { fomePerHour: 4000, energiaPerHour: 2500 };

  test("golden: an hour of play", () => {
    expect(decayNeeds({ fome: NEED_FULL, energia: NEED_FULL }, 72_000, rates)).toEqual({ fome: 6000, energia: 7500 });
    expect(decayNeeds({ fome: NEED_FULL, energia: NEED_FULL }, 20 * 60 * 3, rates)).toEqual({ fome: 9800, energia: 9875 });
  });

  test("never below empty, never above full, and the input is not changed", () => {
    const start = { fome: 100, energia: NEED_FULL + 5000 };
    expect(decayNeeds(start, 72_000, rates)).toEqual({ fome: 0, energia: NEED_FULL });
    expect(start).toEqual({ fome: 100, energia: NEED_FULL + 5000 });
  });

  test("golden: going fast and jumping cost Energia, walking does not, and Fome is untouched", () => {
    const effort = { energiaPerRunHour: 6000, energiaPerJump: 15 };
    const rested = { fome: 7000, energia: NEED_FULL };
    expect(spendEffort(rested, 0, 0, effort)).toEqual(rested);
    expect(spendEffort(rested, 20 * 60 * 10, 0, effort)).toEqual({ fome: 7000, energia: 9000 });
    expect(spendEffort(rested, 0, 4, effort)).toEqual({ fome: 7000, energia: 9940 });
    expect(spendEffort({ fome: 7000, energia: 20 }, 72_000, 3, effort)).toEqual({ fome: 7000, energia: 0 });
    // Numbers that make no sense take nothing and give nothing.
    expect(spendEffort(rested, -500, -2, effort)).toEqual(rested);
  });
});

describe("heat", () => {
  const weights: HeatWeights = { darkness: 600, lighting: 300, crowd: 200, police: 400, recentOffences: 800 };
  const calm = { darkness: 0, lighting: 0, crowd: 0, police: 0, recentOffences: 0 };

  test("golden: a dark empty street is hot, the same street lit and busy is not", () => {
    expect(heatValue({ ...calm, darkness: 1000, recentOffences: 250 }, weights)).toBe(800);
    expect(heatValue({ ...calm, darkness: 1000, recentOffences: 250, lighting: 900, crowd: 700 }, weights)).toBe(390);
  });

  test("stays between 0 and the maximum", () => {
    expect(heatValue({ ...calm, police: 1000, crowd: 1000 }, weights)).toBe(0);
    expect(heatValue({ ...calm, darkness: 1000, recentOffences: 1000 }, weights)).toBe(HEAT_MAX);
  });

  test("the four bands the map shows", () => {
    expect([0, 249, 250, 499, 500, 749, 750, 1000].map(heatBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe("offence protections (Rule 6)", () => {
  const shield = { playSeconds: 5 * 3600, accountAgeSeconds: 7 * 86_400 };
  const cap = { permilleOfCash: 200, ceiling: 5000 };

  test("the kinds of offence are the five in the spec", () => {
    const kinds: OffenceKind[] = ["furto", "carteirista", "assalto", "arrombamento", "roubo_viatura"];
    expect(kinds.length).toBe(5);
  });

  test("a player is shielded until both the hours played and the age of the account are reached", () => {
    expect(isShielded(0, 0, shield)).toBe(true);
    expect(isShielded(6 * 3600, 2 * 86_400, shield)).toBe(true);
    expect(isShielded(1 * 3600, 30 * 86_400, shield)).toBe(true);
    expect(isShielded(5 * 3600, 7 * 86_400, shield)).toBe(false);
  });

  test("golden: an assalto takes at most the share, at most the ceiling, never a negative", () => {
    expect(assaltoLossCap(1000, cap)).toBe(200);
    expect(assaltoLossCap(1999, cap)).toBe(399);
    expect(assaltoLossCap(1_000_000, cap)).toBe(5000);
    expect(assaltoLossCap(0, cap)).toBe(0);
    expect(assaltoLossCap(-50, cap)).toBe(0);
  });
});

describe("timing minigames", () => {
  const rules = { perfectMs: 50, windowMs: 250 };
  const marks = [1000, 2000, 3000, 4000];

  test("golden: perfect, late, missed", () => {
    expect(scoreTiming(marks, [1000, 2040, 2990, 4050], rules)).toBe(SCORE_MAX);
    expect(scoreTiming(marks, [1150, 2000, 3000, 4000], rules)).toBe(875);
    expect(scoreTiming(marks, [1000, 2000], rules)).toBe(500);
    expect(scoreTiming(marks, [1251, 2251, 3300, 400], rules)).toBe(0);
    expect(scoreTiming(marks, [], rules)).toBe(0);
    expect(scoreTiming([], [1000], rules)).toBe(0);
  });

  test("tapping wildly earns no more than tapping well", () => {
    const wild = Array.from({ length: 200 }, (_, i) => 900 + i * 17);
    expect(scoreTiming(marks, wild, rules)).toBeLessThanOrEqual(SCORE_MAX);
    // One tap cannot be counted for two marks.
    expect(scoreTiming([1000, 1100], [1050], rules)).toBe(500);
  });
});
