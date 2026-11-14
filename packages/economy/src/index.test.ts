import { expect, test } from "vitest";
import { isTransferAmount } from "./index.ts";

test("a transfer amount is a positive safe integer", () => {
  expect(isTransferAmount(150)).toBe(true);
  for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, "150", null]) {
    expect(isTransferAmount(bad)).toBe(false);
  }
});
