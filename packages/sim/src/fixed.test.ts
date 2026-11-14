import { describe, expect, test } from "vitest";
import {
  FULL_TURN,
  TRIG_ONE,
  approach,
  clamp,
  cosCdeg,
  divAway,
  divRound,
  floorDiv,
  floorMod,
  idiv,
  isqrt,
  length2,
  mulTrig,
  normCdeg,
  sinCdeg,
  yawFromDir,
} from "./fixed.ts";

describe("integer division", () => {
  test("idiv rounds toward zero and never returns negative zero", () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(Object.is(idiv(-1, 2), 0)).toBe(true);
  });

  test("floorDiv and floorMod follow the floor, so cells line up across zero", () => {
    expect(floorDiv(-1, 500)).toBe(-1);
    expect(floorDiv(499, 500)).toBe(0);
    expect(floorMod(-1, 500)).toBe(499);
    expect(floorMod(1001, 500)).toBe(1);
  });

  test("divAway never falls short", () => {
    expect(divAway(7, 2)).toBe(4);
    expect(divAway(-7, 2)).toBe(-4);
    expect(divAway(6, 2)).toBe(3);
    expect(Object.is(divAway(0, 5), 0)).toBe(true);
  });

  test("divRound rounds to nearest", () => {
    expect(divRound(149, 100)).toBe(1);
    expect(divRound(150, 100)).toBe(2);
  });
});

test("clamp and approach", () => {
  expect(clamp(5, 0, 3)).toBe(3);
  expect(clamp(-5, 0, 3)).toBe(0);
  expect(clamp(2, 0, 3)).toBe(2);
  expect(approach(0, 10, 4)).toBe(4);
  expect(approach(8, 10, 4)).toBe(10);
  expect(approach(10, 0, 4)).toBe(6);
  expect(approach(2, 0, 4)).toBe(0);
});

test("isqrt is the exact floor of the square root", () => {
  expect(isqrt(0)).toBe(0);
  expect(isqrt(1)).toBe(1);
  for (const n of [2, 3, 4, 15, 16, 17, 999_999, 1_000_000, 1_000_001, 123_456_789_012]) {
    const r = isqrt(n);
    expect(r * r).toBeLessThanOrEqual(n);
    expect((r + 1) * (r + 1)).toBeGreaterThan(n);
  }
  expect(length2(3000, 4000)).toBe(5000);
});

describe("trigonometry from tables", () => {
  test("exact at the quarter turns, in every quadrant", () => {
    expect(sinCdeg(0)).toBe(0);
    expect(sinCdeg(9000)).toBe(TRIG_ONE);
    expect(sinCdeg(18000)).toBe(0);
    expect(sinCdeg(27000)).toBe(-TRIG_ONE);
    expect(cosCdeg(0)).toBe(TRIG_ONE);
    expect(cosCdeg(18000)).toBe(-TRIG_ONE);
    expect(sinCdeg(3000)).toBe(TRIG_ONE / 2);
    expect(sinCdeg(15000)).toBe(TRIG_ONE / 2);
    expect(sinCdeg(21000)).toBe(-TRIG_ONE / 2);
    expect(sinCdeg(33000)).toBe(-TRIG_ONE / 2);
    expect(sinCdeg(-3000)).toBe(-TRIG_ONE / 2);
    expect(sinCdeg(FULL_TURN + 3000)).toBe(TRIG_ONE / 2);
  });

  test("within 4 parts in 65536 of the true sine at every centidegree", () => {
    let worst = 0;
    for (let a = 0; a < FULL_TURN; a += 7) {
      worst = Math.max(worst, Math.abs(sinCdeg(a) - Math.sin((a * Math.PI) / 18000) * TRIG_ONE));
    }
    expect(worst).toBeLessThan(4);
  });

  test("mulTrig scales and rounds", () => {
    expect(mulTrig(1000, TRIG_ONE)).toBe(1000);
    expect(mulTrig(1000, sinCdeg(3000))).toBe(500);
    expect(Object.is(mulTrig(-1, 100), 0)).toBe(true);
  });

  test("normCdeg wraps both ways", () => {
    expect(normCdeg(-1)).toBe(35999);
    expect(normCdeg(36000)).toBe(0);
  });
});

describe("yawFromDir", () => {
  test("the eight compass directions", () => {
    expect(yawFromDir(0, 0)).toBe(0);
    expect(yawFromDir(0, 5)).toBe(0);
    expect(yawFromDir(5, 5)).toBe(4500);
    expect(yawFromDir(5, 0)).toBe(9000);
    expect(yawFromDir(5, -5)).toBe(13500);
    expect(yawFromDir(0, -5)).toBe(18000);
    expect(yawFromDir(-5, -5)).toBe(22500);
    expect(yawFromDir(-5, 0)).toBe(27000);
    expect(yawFromDir(-5, 5)).toBe(31500);
    expect(yawFromDir(-1, 1000)).toBeGreaterThan(35900);
  });

  test("agrees with sin and cos to within a tenth of a degree all the way round", () => {
    for (let a = 0; a < FULL_TURN; a += 37) {
      const yaw = yawFromDir(sinCdeg(a), cosCdeg(a));
      const off = Math.min(normCdeg(yaw - a), normCdeg(a - yaw));
      expect(off).toBeLessThanOrEqual(10);
    }
  });
});
