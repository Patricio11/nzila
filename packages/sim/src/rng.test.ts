import { expect, test } from "vitest";
import { createRng, hashInts, rngChance, rngInt, rngRange, rngU32 } from "./rng.ts";

test("golden: the first numbers from seed 1 never change", () => {
  const rng = createRng(1);
  expect([rngU32(rng), rngU32(rng), rngU32(rng)]).toEqual([2693262067, 11749833, 2265367787]);
});

test("the same seed gives the same sequence, a different seed another", () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const seqA = Array.from({ length: 20 }, () => rngU32(a));
  expect(Array.from({ length: 20 }, () => rngU32(b))).toEqual(seqA);
  expect(Array.from({ length: 20 }, () => rngU32(c))).not.toEqual(seqA);
});

test("rngInt and rngRange stay inside their bounds and reach both ends", () => {
  const rng = createRng(7);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) {
    const v = rngRange(rng, -2, 3);
    expect(v).toBeGreaterThanOrEqual(-2);
    expect(v).toBeLessThanOrEqual(3);
    seen.add(v);
  }
  expect(seen.size).toBe(6);
  expect(rngInt(rng, 1)).toBe(0);
});

test("rngChance is never at 0 and always at 1000, and about right between", () => {
  const rng = createRng(9);
  let hits = 0;
  for (let i = 0; i < 4000; i++) {
    expect(rngChance(rng, 0)).toBe(false);
    expect(rngChance(rng, 1000)).toBe(true);
    if (rngChance(rng, 250)) hits++;
  }
  expect(hits).toBeGreaterThan(850);
  expect(hits).toBeLessThan(1150);
});

test("golden: hashInts", () => {
  expect(hashInts(0, [])).toBe(0);
  expect(hashInts(0, [1, 2, 3])).toBe(hashInts(0, [1, 2, 3]));
  expect(hashInts(0, [1, 2, 3])).not.toBe(hashInts(0, [3, 2, 1]));
  expect(hashInts(1, [1, 2, 3])).not.toBe(hashInts(0, [1, 2, 3]));
  expect(hashInts(0, [1, 2, 3])).toBe(1272988909);
});
