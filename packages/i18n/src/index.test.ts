import { expect, test } from "vitest";
import { messageKeys, t } from "./index.ts";

test("every key has a non-empty message", () => {
  for (const key of messageKeys) expect(t(key).trim().length).toBeGreaterThan(0);
});

test("no message contains another game's name", () => {
  for (const key of messageKeys) {
    const text = t(key).toLowerCase();
    expect(text).not.toContain("vida na banda");
    expect(text).not.toContain("mwangol");
  }
});
