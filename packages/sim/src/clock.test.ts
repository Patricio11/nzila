import { describe, expect, test } from "vitest";
import { DEFAULT_CLOCK, GAME_DAY_S, compileClock, gameTimeAt, inGameWindow, msUntilGameSecond } from "./clock.ts";

const MIN = 60_000;
const H = 3600;
const clock = compileClock(DEFAULT_CLOCK);

describe("the default clock", () => {
  test("one game day is 60 real minutes", () => {
    expect(clock.cycleMs).toBe(60 * MIN);
  });

  test("golden: the hours of the first day", () => {
    const at = (realMin: number) => gameTimeAt(clock, realMin * MIN).secondOfDay / H;
    expect(at(0)).toBe(6);
    expect(at(15)).toBe(11.5);
    expect(at(30)).toBe(17);
    expect(at(35)).toBe(17.5);
    expect(at(40)).toBe(18);
    expect(at(50)).toBe(0);
    expect(at(55)).toBe(3);
    expect(at(60)).toBe(6);
  });

  test("40 minutes of daylight, 20 of night", () => {
    let light = 0;
    for (let m = 0; m < 60; m++) if (gameTimeAt(clock, m * MIN + 1).daylight) light++;
    expect(light).toBe(40);
  });

  test("golden hour, 17:00 to 18:00, lasts a quarter of the daylight", () => {
    expect(msUntilGameSecond(clock, 30 * MIN, 18 * H)).toBe(10 * MIN);
  });

  test("the day number changes at midnight, not at sunrise", () => {
    expect(gameTimeAt(clock, 0).day).toBe(0);
    expect(gameTimeAt(clock, 50 * MIN - 1).day).toBe(0);
    expect(gameTimeAt(clock, 50 * MIN).day).toBe(1);
    expect(gameTimeAt(clock, 60 * MIN).day).toBe(1);
    expect(gameTimeAt(clock, 110 * MIN).day).toBe(2);
  });

  test("works before the epoch too", () => {
    const t = gameTimeAt(clock, -5 * MIN);
    expect(t.secondOfDay).toBe(3 * H);
    expect(t.day).toBe(0);
    expect(gameTimeAt(clock, -15 * MIN).day).toBe(-1);
  });

  test("game time never runs backwards within a day", () => {
    let last = gameTimeAt(clock, 0);
    for (let ms = 1000; ms < 180 * MIN; ms += 1000) {
      const now = gameTimeAt(clock, ms);
      const before = last.day * GAME_DAY_S + last.secondOfDay;
      expect(now.day * GAME_DAY_S + now.secondOfDay).toBeGreaterThanOrEqual(before);
      last = now;
    }
  });
});

describe("msUntilGameSecond", () => {
  test("is zero at the moment itself and a full cycle is never returned", () => {
    expect(msUntilGameSecond(clock, 0, 6 * H)).toBe(0);
    expect(msUntilGameSecond(clock, 1, 6 * H)).toBe(60 * MIN - 1);
  });

  test("lands on the asked hour, for hours on both sides of midnight", () => {
    for (const now of [0, 7 * MIN, 31 * MIN, 44 * MIN, 59 * MIN + 59_000]) {
      for (const target of [0, 3 * H + 17, 6 * H, 8 * H, 17 * H + 1800, 19 * H, 23 * H + 3599]) {
        const wait = msUntilGameSecond(clock, now, target);
        expect(wait).toBeGreaterThanOrEqual(0);
        expect(wait).toBeLessThan(clock.cycleMs);
        const then = gameTimeAt(clock, now + wait).secondOfDay;
        expect(then).toBeGreaterThanOrEqual(target);
        expect(then - target).toBeLessThan(40);
      }
    }
  });
});

test("an epoch shifts the whole clock", () => {
  const shifted = compileClock({ ...DEFAULT_CLOCK, epochMs: 1_000_000 });
  expect(gameTimeAt(shifted, 1_000_000).secondOfDay).toBe(6 * H);
  expect(gameTimeAt(shifted, 1_000_000 + 30 * MIN).secondOfDay).toBe(17 * H);
});

test("an even clock with one stretch", () => {
  const even = compileClock({ epochMs: 0, stretches: [{ startGameS: 0, realMs: 24 * MIN }], sunriseGameS: 6 * H, sunsetGameS: 18 * H });
  expect(gameTimeAt(even, 12 * MIN)).toEqual({ day: 0, secondOfDay: 12 * H, daylight: true });
  expect(gameTimeAt(even, 23 * MIN).daylight).toBe(false);
});

test("a window of the game day may wrap past midnight", () => {
  expect(inGameWindow(5 * H, 5 * H, 19 * H)).toBe(true);
  expect(inGameWindow(19 * H, 5 * H, 19 * H)).toBe(false);
  expect(inGameWindow(23 * H, 22 * H, 2 * H)).toBe(true);
  expect(inGameWindow(1 * H, 22 * H, 2 * H)).toBe(true);
  expect(inGameWindow(12 * H, 22 * H, 2 * H)).toBe(false);
});

test("a bad configuration is refused", () => {
  const base = { epochMs: 0, sunriseGameS: 0, sunsetGameS: 1 };
  expect(() => compileClock({ ...base, stretches: [] })).toThrow();
  expect(() => compileClock({ ...base, stretches: [{ startGameS: -1, realMs: 1000 }] })).toThrow();
  expect(() => compileClock({ ...base, stretches: [{ startGameS: GAME_DAY_S, realMs: 1000 }] })).toThrow();
  expect(() => compileClock({ ...base, stretches: [{ startGameS: 0.5, realMs: 1000 }] })).toThrow();
  expect(() => compileClock({ ...base, stretches: [{ startGameS: 0, realMs: 0 }] })).toThrow();
  expect(() => compileClock({ ...base, stretches: [{ startGameS: 0, realMs: 1.5 }] })).toThrow();
  expect(() =>
    compileClock({ ...base, stretches: [{ startGameS: 100, realMs: 1000 }, { startGameS: 50, realMs: 1000 }] }),
  ).toThrow();
});
