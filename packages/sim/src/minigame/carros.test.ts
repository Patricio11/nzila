import { describe, expect, test } from "vitest";
import { CARRO_PARTS, CARROS_INPUTS_MAX, DRIVE_OFF_MS, PASS_GAP_MS, carrosPass, carrosRound, carrosStart, scoreCarros, type Carro, type CarrosInput } from "./carros.ts";

const LENGTH = 90_000;

/** A steady hand: each car, as soon as it is in the place, gone over part by part, a pass every `everyMs`. */
function steadyHand(cars: readonly Carro[], everyMs: number): CarrosInput[] {
  const state = carrosStart(cars);
  const inputs: CarrosInput[] = [];
  let t = 0;
  while (state.car < cars.length && t <= LENGTH) {
    const car = cars[state.car]!;
    t = Math.max(t, car.arrives, state.inAt);
    const part = state.dirt.findIndex((layers) => layers > 0);
    const input = { t, what: part };
    inputs.push(input);
    carrosPass(state, cars, input);
    t += everyMs;
  }
  return inputs;
}

describe("lavar carros (Task 4.5)", () => {
  test("the cars are the same from the same seed: one every four seconds or so, four to six parts dirty, one to four layers each", () => {
    const cars = carrosRound(21, LENGTH);
    expect(carrosRound(21, LENGTH)).toEqual(cars);
    expect(carrosRound(22, LENGTH)).not.toEqual(cars);
    expect(cars.length).toBeGreaterThanOrEqual(18);
    expect(cars.length).toBeLessThanOrEqual(26);
    for (const car of cars) {
      expect(car.dirt).toHaveLength(CARRO_PARTS);
      const dirty = car.dirt.filter((layers) => layers > 0);
      expect(dirty.length).toBeGreaterThanOrEqual(4);
      expect(dirty.length).toBeLessThanOrEqual(6);
      expect(dirty.every((layers) => layers >= 1 && layers <= 4)).toBe(true);
    }
  });

  test("a steady hand washes every car; a slow one leaves a queue", () => {
    for (const seed of [1, 2, 3, 4]) {
      const cars = carrosRound(seed, LENGTH);
      expect(scoreCarros(cars, steadyHand(cars, 140), LENGTH)).toMatchObject({ score: 1000, washed: cars.length });
      expect(scoreCarros(cars, steadyHand(cars, 900), LENGTH).washed).toBeLessThan(cars.length);
    }
  });

  test("a pass over a clean part, before the car is in, or faster than a hand, does nothing", () => {
    const cars: Carro[] = [{ arrives: 0, dirt: [1, 0, 0, 0, 0, 0, 0, 0] }, { arrives: 1000, dirt: [0, 1, 0, 0, 0, 0, 0, 0] }];
    const state = carrosStart(cars);
    carrosPass(state, cars, { t: 0, what: 3 });
    expect(state.dirt[0]).toBe(1);
    carrosPass(state, cars, { t: 200, what: 0 });
    expect(state).toMatchObject({ washed: 1, car: 1, inAt: 200 + DRIVE_OFF_MS });
    // The next car has not pulled in while the last drives off.
    carrosPass(state, cars, { t: 900, what: 1 });
    expect(state.washed).toBe(1);
    carrosPass(state, cars, { t: 1500, what: 1 });
    expect(state.washed).toBe(2);
    // Faster than a hand: once.
    const two: Carro[] = [{ arrives: 0, dirt: [2, 0, 0, 0, 0, 0, 0, 0] }];
    expect(scoreCarros(two, [{ t: 0, what: 0 }, { t: PASS_GAP_MS - 1, what: 0 }], LENGTH).washed).toBe(0);
    expect(scoreCarros(two, [{ t: 0, what: 0 }, { t: PASS_GAP_MS, what: 0 }], LENGTH).washed).toBe(1);
    // A part that no car has, and no car at all.
    const after = carrosStart(two);
    carrosPass(after, two, { t: 0, what: 9 });
    expect(after.dirt[0]).toBe(2);
    expect(scoreCarros([], [{ t: 0, what: 0 }], LENGTH)).toEqual({ score: 0, washed: 0, cars: 0 });
  });

  test("out of order, after the round, or past a hand's count, count for nothing", () => {
    const one: Carro[] = [{ arrives: 0, dirt: [1, 0, 0, 0, 0, 0, 0, 0] }];
    expect(scoreCarros(one, [{ t: 500, what: 3 }, { t: 400, what: 0 }], LENGTH).washed).toBe(0);
    expect(scoreCarros(one, [{ t: LENGTH + 1, what: 0 }], LENGTH).washed).toBe(0);
    const many = [...Array.from({ length: CARROS_INPUTS_MAX }, (_, i): CarrosInput => ({ t: i, what: 5 })), { t: 5000, what: 0 }];
    expect(scoreCarros(one, many, LENGTH).washed).toBe(0);
  });
});
