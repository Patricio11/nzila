import { describe, expect, test } from "vitest";
import { BASE_BISCATOS, BISCATO_KINDS, biscatoPay, isBiscatoKind, parseBiscatos, taperPercent } from "./biscatos.ts";

describe("the rules of biscatos (Task 4.5, D-4.22)", () => {
  test("every biscato has its pay, its length and what it costs the body", () => {
    for (const kind of BISCATO_KINDS) {
      const one = BASE_BISCATOS.kinds[kind];
      expect(one.leastMk).toBeLessThanOrEqual(one.mostMk);
      expect(one.seconds).toBeGreaterThanOrEqual(60);
      expect(one.seconds).toBeLessThanOrEqual(120);
    }
  });

  test("wrong rules are refused, every fault said", () => {
    expect(() => parseBiscatos({})).toThrow(/version[\s\S]*kinds\.pratos[\s\S]*taper[\s\S]*roundTo/);
    const kinds = { pratos: { leastMk: 500, mostMk: 100, seconds: 10, energia: -1, fome: 0 } };
    expect(() => parseBiscatos({ ...BASE_BISCATOS, kinds })).toThrow(/leastMk and mostMk[\s\S]*seconds[\s\S]*energia and fome/);
    const fault = /taper/;
    expect(() => parseBiscatos({ ...BASE_BISCATOS, taper: [] })).toThrow(fault);
    expect(() => parseBiscatos({ ...BASE_BISCATOS, taper: "half" })).toThrow(fault);
    expect(() => parseBiscatos({ ...BASE_BISCATOS, taper: [{ fromMk: 100, percent: 100 }] })).toThrow(fault);
    expect(() => parseBiscatos({ ...BASE_BISCATOS, taper: [{ fromMk: 0, percent: 50 }, { fromMk: 1000, percent: 80 }] })).toThrow(fault);
    expect(() => parseBiscatos({ ...BASE_BISCATOS, taper: [{ fromMk: 0, percent: 100 }, { fromMk: 0, percent: 50 }] })).toThrow(fault);
    expect(() => parseBiscatos({ ...BASE_BISCATOS, taper: [{ fromMk: 0, percent: 0 }] })).toThrow(fault);
    expect(() => parseBiscatos(null)).toThrow(/version/);
  });

  test("a biscato is known by its name", () => {
    expect(isBiscatoKind("pratos")).toBe(true);
    expect(isBiscatoKind("assalto")).toBe(false);
  });

  test("the day's taper halves the pay and halves it again, and never stops it", () => {
    expect(taperPercent(BASE_BISCATOS, 0)).toBe(100);
    expect(taperPercent(BASE_BISCATOS, 1999)).toBe(100);
    expect(taperPercent(BASE_BISCATOS, 2000)).toBe(50);
    expect(taperPercent(BASE_BISCATOS, 4000)).toBe(25);
    expect(taperPercent(BASE_BISCATOS, 1_000_000)).toBe(25);
  });

  test("a round pays from the least to the most by its score, rounded down, and nothing for nothing", () => {
    const { leastMk, mostMk } = BASE_BISCATOS.kinds.pratos;
    expect(biscatoPay(BASE_BISCATOS, "pratos", 1000, 0)).toBe(mostMk);
    expect(biscatoPay(BASE_BISCATOS, "pratos", 5000, 0)).toBe(mostMk);
    expect(biscatoPay(BASE_BISCATOS, "pratos", 1, 0)).toBe(leastMk);
    expect(biscatoPay(BASE_BISCATOS, "pratos", 500, 0)).toBe(300);
    expect(biscatoPay(BASE_BISCATOS, "pratos", 0, 0)).toBe(0);
    expect(biscatoPay(BASE_BISCATOS, "pratos", -5, 0)).toBe(0);
    // Late in a busy day: a quarter, rounded down to ten, and never under ten.
    expect(biscatoPay(BASE_BISCATOS, "pratos", 1000, 5000)).toBe(110);
    expect(biscatoPay({ ...BASE_BISCATOS, taper: [{ fromMk: 0, percent: 1 }] }, "pratos", 1, 0)).toBe(10);
  });
});
