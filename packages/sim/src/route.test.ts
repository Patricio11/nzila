import { describe, expect, test } from "vitest";
import { DEFAULT_CLOCK, compileClock, gameTimeAt, msUntilGameSecond } from "./clock.ts";
import { compileRoute, msUntilArrival, routeVehicleAt, routeVehiclesAt, type RouteDef } from "./route.ts";

const clock = compileClock(DEFAULT_CLOCK);
const H = 3600;

// A rectangular loop, 300 m by 100 m, climbing 4 m along its far side, with three stops.
const loop: RouteDef = {
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 300_000, y: 0, z: 0 },
    { x: 300_000, y: 4000, z: 100_000 },
    { x: 0, y: 4000, z: 100_000 },
  ],
  stops: [
    { pointIndex: 0, dwellMs: 8000 },
    { pointIndex: 1, dwellMs: 5000 },
    { pointIndex: 3, dwellMs: 5000 },
  ],
  cruiseMmPerS: 10_000,
  rampMs: 3000,
  headwayMs: 30_000,
  serviceStartGameS: 5 * H,
  serviceEndGameS: 19 * H,
};
const route = compileRoute(loop);

// Real time 0 is 06:00 on the game clock, well inside the service window.
const NOON = msUntilGameSecond(clock, 0, 12 * H);

describe("the timetable", () => {
  test("golden: lap time, loop length and the number of vans", () => {
    expect(route.loopMm).toBe(800_000);
    // Legs of 300 m, 400 m and 100 m at 10 m/s, 3 s of ramp each, 18 s of waiting.
    expect(route.lapMs).toBe(30_000 + 40_000 + 10_000 + 9000 + 18_000);
    expect(route.vehicleCount).toBe(4);
  });

  test("vans are spread evenly round the lap", () => {
    const gap = route.lapMs / route.vehicleCount;
    const a = routeVehicleAt(route, clock, 0, NOON)!;
    const b = routeVehicleAt(route, clock, 1, NOON - gap)!;
    expect(b).toEqual({ ...a, index: 1 });
  });

  test("a van is back where it was one lap later", () => {
    for (const t of [NOON, NOON + 12_345, NOON + 77_777]) {
      expect(routeVehicleAt(route, clock, 2, t + route.lapMs)).toEqual(routeVehicleAt(route, clock, 2, t));
    }
  });
});

describe("one van through a lap", () => {
  // Van 0 begins a lap whenever real time is a multiple of the lap time.
  const lapStart = Math.ceil(NOON / route.lapMs) * route.lapMs;
  const van = (ms: number) => routeVehicleAt(route, clock, 0, lapStart + ms)!;

  test("waits at the first stop with the door open, facing down the road", () => {
    expect(van(0)).toEqual({ index: 0, x: 0, y: 0, z: 0, yaw: 9000, dwelling: true, stop: 0, msToStop: 0 });
    expect(van(7999).dwelling).toBe(true);
  });

  test("pulls away gently, cruises, and slows into the next stop", () => {
    expect(van(8000)).toMatchObject({ x: 0, dwelling: false, stop: 1, msToStop: 33_000 });
    // One second in, it has covered under 2 m, not 10.
    expect(van(9000).x).toBe(1666);
    // Cruising: 10 m every second.
    expect(van(21_000).x - van(20_000).x).toBe(10_000);
    // The last second is as gentle as the first.
    expect(300_000 - van(40_000).x).toBe(1666);
    expect(van(40_500).x).toBeLessThan(300_000);
    expect(van(41_000)).toMatchObject({ x: 300_000, z: 0, dwelling: true, stop: 1, msToStop: 0 });
  });

  test("never moves backwards and never jumps", () => {
    let last = van(0);
    let travelled = 0;
    for (let ms = 100; ms <= route.lapMs; ms += 100) {
      const now = van(ms);
      const hop = Math.abs(now.x - last.x) + Math.abs(now.z - last.z);
      expect(hop).toBeLessThanOrEqual(1001);
      travelled += hop;
      last = now;
    }
    expect(Math.abs(travelled - route.loopMm)).toBeLessThan(50);
  });

  test("turns the corners, climbs the hill and passes the point that is not a stop", () => {
    const climbing = van(46_000 + 8000);
    expect(climbing).toMatchObject({ x: 300_000, yaw: 0, dwelling: false, stop: 2 });
    expect(climbing.y).toBeGreaterThan(0);
    expect(climbing.y).toBeLessThan(4000);
    expect(climbing.y * 25).toBe(climbing.z);
    const farSide = van(46_000 + 20_000);
    expect(farSide).toMatchObject({ y: 4000, z: 100_000, yaw: 27000, stop: 2 });
    const home = van(route.lapMs - 2000);
    expect(home).toMatchObject({ x: 0, yaw: 18000, stop: 0, msToStop: 2000 });
    expect(home.z).toBeLessThan(7000);
  });
});

describe("service hours", () => {
  const closing = msUntilGameSecond(clock, 0, 19 * H);
  const opening = msUntilGameSecond(clock, 0, 5 * H);

  test("in the middle of the day every van is on the road", () => {
    expect(routeVehiclesAt(route, clock, NOON).map((v) => v.index)).toEqual([0, 1, 2, 3]);
  });

  test("in the middle of the night none is", () => {
    const night = msUntilGameSecond(clock, 0, 1 * H);
    expect(routeVehiclesAt(route, clock, night)).toEqual([]);
    expect(routeVehicleAt(route, clock, 0, night)).toBeNull();
  });

  test("a van finishes the lap it started before closing, and starts no other", () => {
    const justAfter = routeVehiclesAt(route, clock, closing + 1000);
    expect(justAfter.length).toBeGreaterThan(0);
    expect(routeVehiclesAt(route, clock, closing + route.lapMs + 1000)).toEqual([]);
  });

  test("vans come out one by one after opening, each from the first stop", () => {
    const before = routeVehiclesAt(route, clock, opening - 1000).length;
    const after = routeVehiclesAt(route, clock, opening + route.lapMs / route.vehicleCount + 1000).length;
    const full = routeVehiclesAt(route, clock, opening + route.lapMs + 1000).length;
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(4);
    expect(full).toBe(4);
  });
});

describe("msUntilArrival", () => {
  test("is the truth: wait that long and a van is standing at the stop", () => {
    for (const now of [NOON, NOON + 3333, NOON + 19_000, NOON + 61_234]) {
      for (const stop of [0, 1, 2]) {
        const wait = msUntilArrival(route, clock, stop, now)!;
        expect(wait).toBeGreaterThanOrEqual(0);
        expect(wait).toBeLessThanOrEqual(loop.headwayMs);
        const there = routeVehiclesAt(route, clock, now + wait).filter((v) => v.dwelling && v.stop === stop);
        expect(there.length).toBe(1);
      }
    }
  });

  test("is zero while a van waits at the stop", () => {
    const lapStart = Math.ceil(NOON / route.lapMs) * route.lapMs;
    expect(msUntilArrival(route, clock, 0, lapStart)).toBe(0);
    expect(msUntilArrival(route, clock, 0, lapStart + 4000)).toBe(0);
    expect(msUntilArrival(route, clock, 1, lapStart + 41_000)).toBe(0);
  });

  test("is null at night, and after the last van has passed", () => {
    const night = msUntilGameSecond(clock, 0, 1 * H);
    expect(msUntilArrival(route, clock, 0, night)).toBeNull();
    expect(msUntilArrival(route, clock, 2, night)).toBeNull();
    const closing = msUntilGameSecond(clock, 0, 19 * H);
    // Half a lap after closing some vans are still finishing, but none will start a lap to reach stop 0.
    expect(routeVehiclesAt(route, clock, closing + route.lapMs / 2).length).toBeGreaterThan(0);
    expect(msUntilArrival(route, clock, 0, closing + route.lapMs / 2)).toBeNull();
    expect(msUntilArrival(route, clock, 2, closing + 1000)).not.toBeNull();
  });

  test("refuses a stop that is not on the route", () => {
    expect(() => msUntilArrival(route, clock, 3, NOON)).toThrow();
  });
});

describe("other shapes of route", () => {
  test("one stop: the van goes all the way round and back to it", () => {
    const single = compileRoute({ ...loop, stops: [{ pointIndex: 2, dwellMs: 0 }], rampMs: 0, headwayMs: 1_000_000 });
    expect(single.vehicleCount).toBe(1);
    expect(single.lapMs).toBe(80_000);
    const start = Math.ceil(NOON / single.lapMs) * single.lapMs;
    expect(routeVehicleAt(single, clock, 0, start)).toMatchObject({ x: 300_000, z: 100_000, dwelling: false, stop: 0 });
    expect(routeVehicleAt(single, clock, 0, start + 40_000)).toMatchObject({ x: 0, z: 0 });
    // With no waiting time, a van at the stop this instant still counts as arrived.
    expect(msUntilArrival(single, clock, 0, start)).toBe(0);
    expect(msUntilArrival(single, clock, 0, start + 1000)).toBe(79_000);
  });

  test("a leg shorter than the ramp still arrives, without overshooting", () => {
    const short = compileRoute({
      ...loop,
      points: [{ x: 0, y: 0, z: 0 }, { x: 5000, y: 0, z: 0 }, { x: 5000, y: 0, z: 5000 }],
      stops: [{ pointIndex: 0, dwellMs: 1000 }, { pointIndex: 1, dwellMs: 1000 }],
    });
    const start = Math.ceil(NOON / short.lapMs) * short.lapMs;
    let last = 0;
    for (let ms = 1000; ms < 2000; ms += 50) {
      const v = routeVehicleAt(short, clock, 0, start + ms)!;
      expect(v.x).toBeGreaterThanOrEqual(last);
      expect(v.x).toBeLessThanOrEqual(5000);
      last = v.x;
    }
    expect(routeVehicleAt(short, clock, 0, start + 2000)).toMatchObject({ x: 5000, dwelling: true, stop: 1 });
  });

  test("a night service wraps past midnight", () => {
    const owl = compileRoute({ ...loop, serviceStartGameS: 22 * H, serviceEndGameS: 2 * H });
    const midnight = msUntilGameSecond(clock, 0, 0) + 60_000;
    expect(gameTimeAt(clock, midnight).daylight).toBe(false);
    expect(routeVehiclesAt(owl, clock, midnight).length).toBeGreaterThan(0);
    expect(routeVehiclesAt(owl, clock, NOON)).toEqual([]);
  });
});

test("a bad route is refused", () => {
  const bad = (change: Partial<RouteDef>) => () => compileRoute({ ...loop, ...change });
  expect(bad({ points: [{ x: 0, y: 0, z: 0 }] })).toThrow();
  expect(bad({ stops: [] })).toThrow();
  expect(bad({ cruiseMmPerS: 0 })).toThrow();
  expect(bad({ headwayMs: 0 })).toThrow();
  expect(bad({ rampMs: -1 })).toThrow();
  expect(bad({ points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }], stops: [{ pointIndex: 0, dwellMs: 0 }] })).toThrow();
  expect(bad({ stops: [{ pointIndex: 4, dwellMs: 0 }] })).toThrow();
  expect(bad({ stops: [{ pointIndex: -1, dwellMs: 0 }] })).toThrow();
  expect(bad({ stops: [{ pointIndex: 0.5, dwellMs: 0 }] })).toThrow();
  expect(bad({ stops: [{ pointIndex: 0, dwellMs: -5 }] })).toThrow();
  expect(bad({ stops: [{ pointIndex: 2, dwellMs: 0 }, { pointIndex: 1, dwellMs: 0 }] })).toThrow();
  expect(bad({ stops: [{ pointIndex: 1, dwellMs: 0 }, { pointIndex: 1, dwellMs: 0 }] })).toThrow();
});
