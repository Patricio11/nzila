// The street's traffic as rules: a van waits for someone in its way, and a phone that follows what a zone decided
// sees every van where the zone has it (F-152).

import { describe, expect, test } from "vitest";
import { TrafficRules, vanRoute, wayAhead } from "./traffic-rules.ts";

// A square loop 200 m a side, with a paragem at two of its corners: one linha.
const loop: [number, number, number][] = [
  [0, 0, 0],
  [200, 0, 0],
  [200, 0, 200],
  [0, 0, 200],
];
const lines = [{ id: "linha", route: vanRoute(loop, [0, 2], 60) }];
// A car that drives up and down the first side, by its own timetable.
const car = { plan: { model: "carro", offset: 0, keys: [[0, 20, 6, "", 90], [20, 180, 6, "", 90], [40, 20, 6, "", 90]] as [number, number, number, string, number][] }, halfWidthMm: 900, halfLengthMm: 2200 };

describe("the street's traffic", () => {
  test("every vehicle is named the same way on every side: the other traffic first, then the vans of each linha", () => {
    const rules = new TrafficRules(lines, [car]);
    expect(rules.keys[0]).toBe("r0");
    expect(rules.keys.slice(1).every((key, n) => key === `linha/${n}`)).toBe(true);
    expect(rules.keys.length).toBe(1 + lines[0]!.route.vehicleCount);
  });

  test("with nobody about, every vehicle is where its timetable says, and waits for nothing", () => {
    const rules = new TrafficRules(lines, [car]);
    const now = 1_763_400_000_000;
    rules.place(now);
    for (let n = 1; n <= 20; n++) rules.step(now + n * 100, 100, [], []);
    expect(rules.waitedAt(now + 2000)).toBe(0);
    expect(rules.state(now + 2000).vehicles).toEqual([]);
    expect(rules.tangled).toBe(0);
  });

  test("someone standing in a vehicle's way is waited for: the vehicle falls behind its timetable, and says how fast", () => {
    const rules = new TrafficRules([], [car]);
    const now = 1_763_400_000_000;
    // The car is at x 20 going east at the start; someone stands at x 30, in its lane.
    const person = { x: 30, z: 6 };
    rules.place(now);
    let poses = rules.poses;
    for (let n = 1; n <= 60; n++) poses = rules.step(now + n * 100, 100, [person], [person], person);
    const at = poses.find((one) => one.key === "r0")!;
    // It stands short of them, and has fallen behind by most of those six seconds.
    expect(person.x - at.x).toBeGreaterThan(at.halfLength + 1);
    expect(rules.waitedAt(now + 6000)).toBeGreaterThan(4);
    expect(rules.heeding).toBe(1);
    expect(wayAhead(at, [], [person])).toBeLessThan(0.05);
    const said = rules.state(now + 6000);
    expect(said.vehicles).toEqual([{ index: 0, lagMs: expect.any(Number), rate: 1, away: false }]);
  });

  test("a phone that follows what the zone decided sees each vehicle where the zone has it, then and a moment later; a change of word is eased in", () => {
    const zone = new TrafficRules([], [car]);
    const phone = new TrafficRules([], [car]);
    const now = 1_763_400_000_000;
    const person = { x: 30, z: 6 };
    zone.place(now);
    for (let n = 1; n <= 30; n++) zone.step(now + n * 100, 100, [person], [person]);
    const said = zone.state(now + 3000);
    phone.follow(said);
    expect(phone.following).toBe(true);
    // At the moment it was said, the same place.
    const there = phone.place(now + 3000).find((one) => one.key === "r0")!;
    const zoneThere = zone.poses.find((one) => one.key === "r0")!;
    expect(Math.hypot(there.x - zoneThere.x, there.z - zoneThere.z)).toBeLessThan(0.01);
    // A second later, by the rate it was given, the phone still has it standing where the zone does.
    for (let n = 31; n <= 40; n++) zone.step(now + n * 100, 100, [person], [person]);
    const later = phone.place(now + 4000).find((one) => one.key === "r0")!;
    const zoneLater = zone.poses.find((one) => one.key === "r0")!;
    expect(Math.hypot(later.x - zoneLater.x, later.z - zoneLater.z)).toBeLessThan(0.2);
    // The person steps away and the zone lets it go: the phone is told, and the car is brought there over a moment, not jumped.
    for (let n = 41; n <= 60; n++) zone.step(now + n * 100, 100, [], []);
    const before = phone.place(now + 6000).find((one) => one.key === "r0")!;
    phone.follow(zone.state(now + 6000), now + 6000);
    const just = phone.place(now + 6000).find((one) => one.key === "r0")!;
    expect(Math.hypot(just.x - before.x, just.z - before.z)).toBeLessThan(0.01);
    const settled = phone.place(now + 6500).find((one) => one.key === "r0")!;
    for (let n = 61; n <= 65; n++) zone.step(now + n * 100, 100, [], []);
    const zoneSettled = zone.poses.find((one) => one.key === "r0")!;
    expect(Math.hypot(settled.x - zoneSettled.x, settled.z - zoneSettled.z)).toBeLessThan(0.2);
    // And deciding again goes on from where the zone left off.
    const own = phone.step(now + 6600, 100, [], []).find((one) => one.key === "r0")!;
    expect(phone.following).toBe(false);
    expect(Math.hypot(own.x - zoneSettled.x, own.z - zoneSettled.z)).toBeLessThan(2);
    phone.reset();
    expect(phone.waitedAt(now + 6600)).toBe(0);
  });
});
