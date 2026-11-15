// Giving way: how freely a vehicle may go, from what is ahead of it.

import { describe, expect, test } from "vitest";
import { wayAhead } from "./traffic.ts";

// A van at the origin, driving toward +z (heading 0: forward is (sin, cos)).
const van = { key: "a", x: 0, z: 0, y: 0, heading: 0, halfWidth: 0.85, halfLength: 2.35 };
const car = (key: string, x: number, z: number, heading = 0, y = 0) => ({ key, x, z, y, heading, halfWidth: 0.8, halfLength: 2.0 });

describe("a driver and someone on foot", () => {
  test("the road clear, the driver goes freely", () => {
    expect(wayAhead(van, [van], [])).toBe(1);
    expect(wayAhead(van, [van], [{ x: 0, z: 30 }])).toBe(1);
  });

  test("someone in the lane ahead slows the driver, and stops them a little short", () => {
    const far = wayAhead(van, [van], [{ x: 0, z: 9 }]);
    const near = wayAhead(van, [van], [{ x: 0.3, z: 6 }]);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    // A step and a half from the bumper: the van stands.
    expect(wayAhead(van, [van], [{ x: 0, z: 3.7 }])).toBe(0);
    expect(wayAhead(van, [van], [{ x: -0.5, z: 2.5 }])).toBe(0);
  });

  test("someone on the pavement beside the lane, or behind, is in nobody's way", () => {
    expect(wayAhead(van, [van], [{ x: 1.6, z: 4 }])).toBe(1);
    expect(wayAhead(van, [van], [{ x: -1.6, z: 4 }])).toBe(1);
    expect(wayAhead(van, [van], [{ x: 0, z: -4 }])).toBe(1);
  });

  test("it is the way the vehicle faces that counts", () => {
    const east = { ...van, heading: Math.PI / 2 };
    expect(wayAhead(east, [east], [{ x: 3.7, z: 0 }])).toBe(0);
    expect(wayAhead(east, [east], [{ x: 0, z: 3.7 }])).toBe(1);
  });

  test("a vehicle up on the viaduct stops for nobody walking under it", () => {
    const above = { ...van, y: 6.4 };
    expect(wayAhead(above, [above], [{ x: 0, z: 3 }])).toBe(1);
  });
});

describe("a driver and the vehicle in front", () => {
  test("keeps a gap behind one going the same way, and is not held by its own self", () => {
    expect(wayAhead(van, [van, car("b", 0, 30)], [])).toBe(1);
    const closing = wayAhead(van, [van, car("b", 0, 8)], []);
    expect(closing).toBeGreaterThan(0);
    expect(closing).toBeLessThan(1);
    expect(wayAhead(van, [van, car("b", 0, 5)], [])).toBe(0);
    // Two that were put on top of one another by their timetables: the one behind waits, the one in front goes.
    const front = car("b", 0.2, 1);
    expect(wayAhead(van, [van, front], [])).toBe(0);
    expect(wayAhead(front, [van, front], [])).toBe(1);
  });

  test("at a crossing one of two goes first, always the same one, so that they never both wait", () => {
    // "b" crosses the van's way just ahead of it. The van is "a": it goes first, and "b" waits for it.
    const crossing = car("b", 0, 4.4, Math.PI / 2);
    expect(wayAhead(van, [van, crossing], [])).toBe(1);
    const later = { ...van, key: "c" };
    expect(wayAhead(later, [later, crossing], [])).toBe(0);
    // And from the crossing one's side: the van "a" lies across its way, a little ahead.
    const east = { ...car("b", -4.0, 0, Math.PI / 2) };
    expect(wayAhead(east, [east, van], [])).toBe(0);
    // Told to mind no vehicles (its patience has run out), it goes; it still stops for a person.
    expect(wayAhead(east, [east, van], [], false)).toBe(1);
    expect(wayAhead(east, [east, van], [{ x: -1.2, z: 0 }], false)).toBe(0);
  });

  test("is not held by what comes the other way, what is in the next lane or on another level", () => {
    expect(wayAhead(van, [van, car("b", 0.5, 5, Math.PI)], [])).toBe(1);
    expect(wayAhead(van, [van, car("b", 3.2, 5)], [])).toBe(1);
    expect(wayAhead(van, [van, car("b", 0, 5, 0, 6.4)], [])).toBe(1);
  });
});
