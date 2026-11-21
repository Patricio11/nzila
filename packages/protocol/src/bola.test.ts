import { describe, expect, test } from "vitest";
import { BOLA_SLOWS, bolaAt, encodeLado } from "./bola.ts";
import { decodeClientMessage } from "./messages.ts";

describe("the ball on a campo", () => {
  test("a ball that is not moving stays where it was said, and so does any ball before the moment it was said", () => {
    expect(bolaAt({ x: 1000, z: 2000, vx: 0, vz: 0, atMs: 500 }, 9000)).toEqual({ x: 1000, z: 2000, vx: 0, vz: 0 });
    expect(bolaAt({ x: 1000, z: 2000, vx: 3000, vz: 0, atMs: 500 }, 400)).toEqual({ x: 1000, z: 2000, vx: 3000, vz: 0 });
  });

  test("kicked, it rolls in a straight line, slowing evenly, and stops", () => {
    const ball = { x: 0, z: 0, vx: 5200, vz: 0, atMs: 0 };
    // After a second: 5,2 m/s less 2,6 m/s each second.
    const one = bolaAt(ball, 1000);
    expect(one.vx).toBeCloseTo(5200 - BOLA_SLOWS, 6);
    expect(one.x).toBeCloseTo(5200 - BOLA_SLOWS / 2, 6);
    expect(one.z).toBe(0);
    // It stops after two seconds, 5,2 m on; and is there still an hour later.
    const stopped = bolaAt(ball, 2000);
    expect([stopped.x, stopped.vx]).toEqual([5200, 0]);
    expect(bolaAt(ball, 3_600_000)).toEqual({ x: 5200, z: 0, vx: 0, vz: 0 });
  });

  test("at an angle it keeps its line", () => {
    const at = bolaAt({ x: 100, z: 100, vx: 3000, vz: -4000, atMs: 0 }, 500);
    expect((at.x - 100) / (at.z - 100)).toBeCloseTo(-0.75, 6);
    expect(at.vx / at.vz).toBeCloseTo(-0.75, 6);
    expect(Math.hypot(at.vx, at.vz)).toBeCloseTo(5000 - BOLA_SLOWS / 2, 6);
  });
});

test("going over to the other side of a campo's match is said in two bytes, and read back", () => {
  expect(encodeLado(3)).toHaveLength(2);
  expect(decodeClientMessage(encodeLado(3))).toEqual({ type: "lado", campo: 3 });
});
