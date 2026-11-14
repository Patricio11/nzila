import { describe, expect, test } from "vitest";
import { pushOut, touchesAny, type BoxObstacle, type CircleObstacle, type Obstacle, type Push } from "./collision.ts";
import { length2 } from "./fixed.ts";

const post: CircleObstacle = { kind: "circle", x: 0, z: 0, radiusMm: 200 };
const kiosk: BoxObstacle = { kind: "box", x: 0, z: 0, halfWidthMm: 1000, halfLengthMm: 500, yaw: 0 };

function freed(px: number, pz: number, r: number, o: Obstacle): { x: number; z: number } | null {
  const push: Push = { x: 0, z: 0 };
  if (!pushOut(px, pz, r, o, push)) return null;
  return { x: px + push.x, z: pz + push.z };
}

describe("a round obstacle", () => {
  test("leaves a body alone when it is clear, even when just touching", () => {
    expect(freed(600, 0, 300, post)).toBeNull();
    expect(freed(500, 0, 300, post)).toBeNull();
  });

  test("pushes an overlapping body straight out, clear of it", () => {
    const at = freed(300, 400, 400, post)!;
    expect(length2(at.x, at.z)).toBeGreaterThanOrEqual(600);
    expect(length2(at.x, at.z)).toBeLessThan(606);
    // Along the line from the post through the body: 3-4-5.
    expect(at.x * 4 - at.z * 3).toBeLessThan(8);
  });

  test("picks a side when the body is exactly on top of it", () => {
    expect(freed(0, 0, 300, post)).toEqual({ x: 501, z: 0 });
  });
});

describe("a box", () => {
  test("leaves a body alone beyond its faces and beyond its corners", () => {
    expect(freed(1400, 0, 300, kiosk)).toBeNull();
    expect(freed(1250, 750, 300, kiosk)).toBeNull();
  });

  test("pushes a body off a face", () => {
    expect(freed(1200, 0, 300, kiosk)).toEqual({ x: 1302, z: 0 });
    expect(freed(0, -700, 300, kiosk)).toEqual({ x: 0, z: -802 });
  });

  test("pushes a body off a corner, along the diagonal", () => {
    const at = freed(1100, 600, 300, kiosk)!;
    expect(at.x - 1000).toBe(at.z - 500);
    expect(length2(at.x - 1000, at.z - 500)).toBeGreaterThanOrEqual(300);
  });

  test("ejects a body whose centre is inside, through the nearest face", () => {
    expect(freed(900, 0, 300, kiosk)).toEqual({ x: 1302, z: 0 });
    expect(freed(-900, 0, 300, kiosk)).toEqual({ x: -1302, z: 0 });
    expect(freed(0, 400, 300, kiosk)).toEqual({ x: 0, z: 802 });
    expect(freed(0, -400, 300, kiosk)).toEqual({ x: 0, z: -802 });
  });

  test("turns with its yaw", () => {
    // Turned a quarter, the long side lies along Z.
    const turned: BoxObstacle = { ...kiosk, yaw: 9000 };
    expect(freed(1200, 0, 300, turned)).toBeNull();
    expect(freed(700, 0, 300, turned)).toEqual({ x: 802, z: 0 });
    expect(freed(0, 1200, 300, turned)).toEqual({ x: 0, z: 1302 });
    // At 45 degrees a body off the end of the long axis is pushed along that axis.
    const slanted: BoxObstacle = { ...kiosk, yaw: 4500 };
    const at = freed(800, -800, 300, slanted)!;
    expect(Math.abs(at.x + at.z)).toBeLessThanOrEqual(2);
    expect(at.x).toBeGreaterThan(900);
  });
});

describe("touchesAny", () => {
  test("is false with nothing near, true inside something", () => {
    expect(touchesAny(5000, 5000, 300, [post, kiosk])).toBe(false);
    expect(touchesAny(300, 0, 300, [post])).toBe(true);
    expect(touchesAny(0, 700, 300, [post, kiosk])).toBe(true);
  });

  test("a body just pushed clear does not count as touching", () => {
    for (const yaw of [0, 1700, 4500, 8100, 12345]) {
      const box: BoxObstacle = { ...kiosk, yaw };
      for (const [px, pz] of [[900, 300], [-650, 480], [200, -520], [1150, 640]] as const) {
        const at = freed(px, pz, 300, box);
        if (at) expect(touchesAny(at.x, at.z, 300, [box])).toBe(false);
      }
    }
  });
});
