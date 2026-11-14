import { describe, expect, test } from "vitest";
import { brightness, lightingAt } from "./lighting.ts";
import { ATLAS, ATLAS_CELLS, ATLAS_CELL_PX, DAY, STREAM, WORLD, atlasIndex, atlasPixels, atlasUv } from "@nzila/world/client";
import { FPS_TARGET, ResolutionGovernor, TIERS, chooseTier } from "./tiers.ts";

const at = (hour: number) => lightingAt(hour * 3600);

describe("the light of the day", () => {
  test("the palette's day is in order and covers the whole clock", () => {
    expect(DAY[0]!.hour).toBe(0);
    expect(DAY[DAY.length - 1]!.hour).toBe(24);
    for (let i = 1; i < DAY.length; i++) expect(DAY[i]!.hour).toBeGreaterThan(DAY[i - 1]!.hour);
    // Midnight is the same light at both ends of the day.
    expect(at(0)).toEqual(at(24));
  });

  test("the sun rises in the east, stands high at noon and sets in the west", () => {
    expect(at(6.5).sunDirection[0]).toBeGreaterThan(0.8);
    expect(at(12).sunDirection[1]).toBeGreaterThan(0.9);
    expect(at(17.5).sunDirection[0]).toBeLessThan(-0.8);
    for (const hour of [0, 3, 6.5, 9, 12, 15, 17.5, 21]) {
      const [x, y, z] = at(hour).sunDirection;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      // The light always comes from above, by day and by night.
      expect(y).toBeGreaterThan(0.05);
    }
  });

  test("golden hour is warm and low: the sun is redder than it is blue, and near the horizon", () => {
    for (const hour of [17, 17.3, 17.6, 17.9]) {
      const light = at(hour);
      // Warm, and honey before it is orange: a redder sun turned pale pavements to rust (finding F-56).
      expect(light.sun[0]).toBeGreaterThan(light.sun[2] * 1.5);
      expect(light.horizon[0]).toBeGreaterThan(light.horizon[2]);
      // Under twenty degrees up: long shadows.
      expect(light.sunDirection[1]).toBeLessThan(0.35);
      expect(light.sunStrength).toBeGreaterThan(1);
      expect(light.sunUp).toBe(true);
    }
    // Noon is nearly white, and overhead.
    expect(at(12).sun[2]).toBeGreaterThan(220);
  });

  test("night is blue and readable, never black", () => {
    for (const hour of [20, 22, 0, 2, 4]) {
      const light = at(hour);
      expect(light.sunUp).toBe(false);
      expect(light.night).toBe(1);
      // Blue, not grey.
      expect(light.zenith[2]).toBeGreaterThan(light.zenith[0] * 2);
      expect(light.skyLight[2]).toBeGreaterThan(light.skyLight[0]);
      // And there is light to see by: the moon, and the sky.
      expect(light.sunStrength).toBeGreaterThan(0.3);
      expect(brightness(light.skyLight) * light.ambientStrength).toBeGreaterThan(0.25);
      expect(brightness(light.horizon)).toBeGreaterThan(0.15);
    }
    // But it is clearly darker than day.
    expect(brightness(at(1).horizon)).toBeLessThan(brightness(at(12).horizon) * 0.4);
  });

  test("dark comes on after sunset and lifts before sunrise, never in one step", () => {
    expect(at(17.99).night).toBe(0);
    expect(at(18.2).night).toBeGreaterThan(0.2);
    expect(at(18.2).night).toBeLessThan(0.5);
    expect(at(18.7).night).toBe(1);
    expect(at(5.8).night).toBeGreaterThan(0.2);
    expect(at(5.8).night).toBeLessThan(0.5);
    expect(at(6.01).night).toBe(0);
  });

  test("the colours of the sky never jump from one second to the next", () => {
    let last = lightingAt(0);
    for (let second = 30; second <= 86_400; second += 30) {
      const now = lightingAt(second);
      for (const part of ["zenith", "horizon", "skyLight", "groundLight"] as const) {
        for (let i = 0; i < 3; i++) expect(Math.abs(now[part][i]! - last[part][i]!)).toBeLessThan(4);
      }
      last = now;
    }
  });

  test("any second is a valid time, also one outside the day", () => {
    expect(lightingAt(-3600)).toEqual(lightingAt(23 * 3600));
    expect(lightingAt(86_400 + 12 * 3600)).toEqual(lightingAt(12 * 3600));
  });
});

describe("quality tiers", () => {
  test("the renderer's haze is where streaming stops: one distance, in one place", () => {
    for (const name of ["poupanca", "normal", "alta"] as const) expect(TIERS[name].drawDistanceM).toBe(STREAM[name].farM);
  });

  test("each tier draws more than the one below it", () => {
    const { poupanca, normal, alta } = TIERS;
    for (const [lower, higher] of [[poupanca, normal], [normal, alta]] as const) {
      expect(higher.height).toBeGreaterThan(lower.height);
      expect(higher.drawDistanceM).toBeGreaterThan(lower.drawDistanceM);
      expect(higher.crowd).toBeGreaterThan(lower.crowd);
      expect(higher.minHeight).toBeLessThanOrEqual(higher.height);
    }
    // The reference phone gets no real shadows and no sparkle: both are paid for in frames.
    expect(poupanca.shadows).toBe("blobs");
    expect(poupanca.waterSparkle).toBe(false);
    expect([poupanca.height, poupanca.minHeight, poupanca.drawDistanceM, poupanca.crowd]).toEqual([540, 432, 90, 12]);
  });

  test("a tier is chosen from the first-run benchmark, and memory can only lower it", () => {
    expect(chooseTier({ fpsSustained: 22 })).toBe("poupanca");
    expect(chooseTier({ fpsSustained: FPS_TARGET + 1 })).toBe("poupanca");
    expect(chooseTier({ fpsSustained: 40 })).toBe("normal");
    expect(chooseTier({ fpsSustained: 40 }, 4)).toBe("normal");
    expect(chooseTier({ fpsSustained: 60 })).toBe("alta");
    expect(chooseTier({ fpsSustained: 60 }, 8)).toBe("alta");
    expect(chooseTier({ fpsSustained: 60 }, 4)).toBe("normal");
    expect(chooseTier({ fpsSustained: 60 }, 2)).toBe("poupanca");
  });
});

describe("dynamic resolution", () => {
  test("holds the full picture while frames are on time", () => {
    const governor = new ResolutionGovernor(TIERS.poupanca);
    for (let i = 0; i < 300; i++) governor.frame(30);
    expect(governor.current).toBe(540);
  });

  test("shrinks the picture when frames run long, down to the tier's floor and no further", () => {
    const governor = new ResolutionGovernor(TIERS.poupanca);
    for (let i = 0; i < 20; i++) governor.frame(48);
    expect(governor.current).toBeLessThan(540);
    for (let i = 0; i < 400; i++) governor.frame(48);
    expect(governor.current).toBe(432);
  });

  test("grows back when there is room, more slowly than it shrank", () => {
    const governor = new ResolutionGovernor(TIERS.normal);
    let down = 0;
    while (governor.frame(50) > 540) down++;
    let up = 0;
    while (governor.frame(18) < 720) up++;
    expect(governor.current).toBe(720);
    expect(up).toBeGreaterThan(down);
  });

  test("one very long frame does not move it", () => {
    const governor = new ResolutionGovernor(TIERS.poupanca);
    for (let i = 0; i < 50; i++) governor.frame(30);
    governor.frame(4000);
    expect(governor.current).toBe(540);
  });
});

describe("the palette atlas", () => {
  test("every colour of the world has its own square, and they all fit", () => {
    expect(ATLAS.length).toBeLessThanOrEqual(ATLAS_CELLS * ATLAS_CELLS);
    expect(new Set(ATLAS).size).toBe(ATLAS.length);
    for (const wall of WORLD.walls) expect(atlasIndex(wall)).toBeGreaterThanOrEqual(0);
    expect(() => atlasIndex([1, 2, 3])).toThrow();
  });

  test("a square's place in the picture: its centre, counted from the top left as a model counts", () => {
    // Sixteen squares a side: the first is half a square in from the corner.
    expect(atlasUv(0)).toEqual([1 / 32, 1 / 32]);
    expect(atlasUv(15)).toEqual([31 / 32, 1 / 32]);
    expect(atlasUv(16)).toEqual([1 / 32, 3 / 32]);
    expect(atlasUv(255)).toEqual([31 / 32, 31 / 32]);
    for (const bad of [-1, 256, 1.5]) expect(() => atlasUv(bad)).toThrow();
  });

  test("the picture holds each colour where its square says it is", () => {
    const size = ATLAS_CELLS * ATLAS_CELL_PX;
    const pixels = atlasPixels();
    expect(pixels.length).toBe(size * size * 4);
    for (const [index, colour] of ATLAS.entries()) {
      const [u, v] = atlasUv(index);
      const at = (Math.floor(v * size) * size + Math.floor(u * size)) * 4;
      expect([...pixels.subarray(at, at + 4)], `square ${index}`).toEqual([...colour, 255]);
    }
  });
});
