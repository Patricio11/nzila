import { describe, expect, test } from "vitest";
import { PRATOS_FLICK, PRATOS_INPUTS_MAX, PRATOS_RUB, RUB_GAP_MS, pratosRound, scorePratos, type Prato, type PratosInput } from "./pratos.ts";

/** A good hand: each plate rubbed clean as it lands (or as the last is put up), then flicked. */
function washAll(plates: readonly Prato[], lengthMs: number, rubEveryMs = 150): PratosInput[] {
  const inputs: PratosInput[] = [];
  let t = 0;
  for (const plate of plates) {
    t = Math.max(t, plate.at);
    for (let n = 0; n < plate.dirt; n++) {
      inputs.push({ t, what: PRATOS_RUB });
      t += rubEveryMs;
    }
    if (t > lengthMs) break;
    inputs.push({ t, what: PRATOS_FLICK });
    t += 50;
  }
  return inputs;
}

describe("lavar pratos (Task 4.5)", () => {
  test("a round is the same from the same seed, different from another, and gets busier", () => {
    const round = pratosRound(42, 75_000);
    expect(pratosRound(42, 75_000)).toEqual(round);
    expect(pratosRound(43, 75_000)).not.toEqual(round);
    expect(round[0]!.at).toBe(0);
    expect(round.length).toBeGreaterThan(25);
    expect(round.length).toBeLessThan(40);
    expect(round.every((plate) => plate.dirt >= 3 && plate.dirt <= 8 && plate.at < 75_000)).toBe(true);
    const gaps = round.slice(1).map((plate, i) => plate.at - round[i]!.at);
    expect(gaps.slice(-5).reduce((a, b) => a + b)).toBeLessThan(gaps.slice(0, 5).reduce((a, b) => a + b));
  });

  test("every plate rubbed clean and flicked is the whole score", () => {
    const round = pratosRound(7, 75_000);
    const result = scorePratos(round, washAll(round, 75_000), 75_000);
    expect(result).toMatchObject({ dirty: 0, plates: round.length });
    expect(result.clean).toBeGreaterThan(round.length - 2);
    expect(result.score).toBeGreaterThan(940);
  });

  test("a plate put up dirty costs one that was clean", () => {
    const round: Prato[] = [{ at: 0, dirt: 2 }, { at: 0, dirt: 2 }, { at: 0, dirt: 2 }, { at: 0, dirt: 2 }];
    const rub = (t: number): PratosInput => ({ t, what: PRATOS_RUB });
    const flick = (t: number): PratosInput => ({ t, what: PRATOS_FLICK });
    expect(scorePratos(round, [rub(0), rub(200), flick(300), flick(400)], 60_000)).toEqual({ score: 0, clean: 1, dirty: 1, plates: 4 });
    expect(scorePratos(round, [rub(0), rub(200), flick(300), rub(400), rub(600), flick(700)], 60_000)).toEqual({ score: 500, clean: 2, dirty: 0, plates: 4 });
    // Never below nothing.
    expect(scorePratos(round, [flick(0), flick(1), flick(2)], 60_000).score).toBe(0);
  });

  test("tapping wildly is no better than rubbing: rubs closer than a hand can rub are one", () => {
    const round: Prato[] = [{ at: 0, dirt: 5 }];
    // Thirty taps in three tenths of a second are the three rubs a hand makes in that time: the plate is still dirty.
    const wild = Array.from({ length: 30 }, (_, i): PratosInput => ({ t: i * 10, what: PRATOS_RUB }));
    expect(scorePratos(round, [...wild, { t: 300, what: PRATOS_FLICK }], 60_000)).toMatchObject({ clean: 0, dirty: 1 });
    const steady = Array.from({ length: 5 }, (_, i): PratosInput => ({ t: i * RUB_GAP_MS, what: PRATOS_RUB }));
    expect(scorePratos(round, [...steady, { t: 700, what: PRATOS_FLICK }], 60_000)).toMatchObject({ clean: 1, dirty: 0 });
  });

  test("nothing before a plate lands, after the round, out of order or past a hand's count", () => {
    const round: Prato[] = [{ at: 5000, dirt: 1 }];
    // Before it lands: nothing to rub or put up.
    expect(scorePratos(round, [{ t: 100, what: PRATOS_RUB }, { t: 200, what: PRATOS_FLICK }], 60_000).clean).toBe(0);
    // After the round has ended.
    expect(scorePratos(round, [{ t: 5000, what: PRATOS_RUB }, { t: 60_001, what: PRATOS_FLICK }], 60_000).clean).toBe(0);
    // Time running backwards ends the reading.
    expect(scorePratos(round, [{ t: 5200, what: PRATOS_RUB }, { t: 5100, what: PRATOS_FLICK }], 60_000).clean).toBe(0);
    // Past the count a hand could make, nothing more is read.
    const many = [...Array.from({ length: PRATOS_INPUTS_MAX }, (): PratosInput => ({ t: 6000, what: PRATOS_RUB })), { t: 6000, what: PRATOS_FLICK } as PratosInput];
    expect(scorePratos(round, many, 60_000).clean).toBe(0);
    // More flicks than plates: the extra put up nothing.
    expect(scorePratos(round, [{ t: 5000, what: PRATOS_RUB }, { t: 5100, what: PRATOS_FLICK }, { t: 5200, what: PRATOS_FLICK }], 60_000)).toEqual({ score: 1000, clean: 1, dirty: 0, plates: 1 });
    expect(scorePratos([], [], 60_000)).toEqual({ score: 0, clean: 0, dirty: 0, plates: 0 });
    // Rubbing a plate already clean does it no harm, and no good.
    expect(scorePratos(round, [5000, 5200, 5400].map((t): PratosInput => ({ t, what: PRATOS_RUB })).concat({ t: 5500, what: PRATOS_FLICK }), 60_000)).toMatchObject({ clean: 1, dirty: 0 });
  });
});
