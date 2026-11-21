// The corrida brings down exactly what the street would ask for on getting off: the two rules give one answer.

import { STREAM, planStream, type StreamTier } from "@nzila/world/client";
import { expect, test } from "vitest";
import { traz } from "./traz.ts";

// A bairro of five chunks by four, each 64 m across, each with its full and its reduced model; one with a single model.
const chunks = Array.from({ length: 20 }, (_, n) => {
  const [i, j] = [n % 5, Math.floor(n / 5)];
  return { id: `c-${i}-${j}`, aabb: [i * 64, 0, j * 64, i * 64 + 64, 8, j * 64 + 64], lods: n === 7 ? [`c${n}.l0.glb`] : [`c${n}.l0.glb`, `c${n}.l1.glb`, `c${n}.walk.walkz`], bytes: { poupanca: 10 + n, normal: 100 + n, alta: 100 + n } };
});

test("at every tier and from anywhere, what the corrida fetches is what the street would stream there, in the same order", () => {
  for (const tier of ["poupanca", "normal", "alta"] as StreamTier[]) {
    for (const [x, z] of [[182, 115], [0, 0], [320, 256], [160, 128], [63.9, 64.1], [-50, 300]] as const) {
      const street = planStream(chunks, x, z, STREAM[tier]).want.map(({ id, model }) => ({ id, model }));
      expect(traz(chunks, x, z, tier).map(({ id, model }) => ({ id, model })), `${tier} at ${x},${z}`).toEqual(street);
    }
  }
  expect(traz(chunks, 182, 115, "poupanca").every((one) => one.model.endsWith(".l1.glb") || one.id === "c-2-1")).toBe(true);
  expect(traz(chunks, 182, 115, "normal")[0]).toMatchObject({ bytes: 100 + 7 });
});
