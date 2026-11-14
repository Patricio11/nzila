import { expect, test } from "vitest";
import { SIM_HZ, SIM_STEP_MS, stepPermille, takeSteps } from "./step.ts";

test("the simulation steps at a fixed 20 Hz", () => {
  expect(SIM_HZ).toBe(20);
  expect(SIM_STEP_MS).toBe(50);
});

test("frames add up to whole steps and the remainder is carried", () => {
  const acc = { ms: 0 };
  expect(takeSteps(acc, 16)).toBe(0);
  expect(takeSteps(acc, 16)).toBe(0);
  expect(takeSteps(acc, 16)).toBe(0);
  expect(takeSteps(acc, 16)).toBe(1);
  expect(acc.ms).toBe(14);
  expect(stepPermille(acc)).toBe(280);
  expect(takeSteps(acc, 136)).toBe(3);
  expect(acc.ms).toBe(0);
});

test("a long stall is capped and its backlog dropped", () => {
  const acc = { ms: 0 };
  expect(takeSteps(acc, 10_000)).toBe(5);
  expect(acc.ms).toBe(0);
  expect(takeSteps(acc, 400, 2)).toBe(2);
});

test("time never runs backwards", () => {
  const acc = { ms: 20 };
  expect(takeSteps(acc, -500)).toBe(0);
  expect(acc.ms).toBe(20);
});
