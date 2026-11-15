import { describe, expect, test } from "vitest";
import { AGE_BANDS, ageBandOf } from "./age.ts";

describe("the age gate", () => {
  test("under 15 may not play; whoever turns 15 this year may", () => {
    expect(ageBandOf(2012, 2026)).toBe("young");
    expect(ageBandOf(2026, 2026)).toBe("young");
    expect(ageBandOf(2011, 2026)).toBe("15_17");
  });

  test("an adult is someone who is 18 whatever the month", () => {
    // Born in 2008: 17 or 18 in 2026, so not yet counted as an adult.
    expect(ageBandOf(2008, 2026)).toBe("15_17");
    expect(ageBandOf(2007, 2026)).toBe("18_plus");
    expect(ageBandOf(1960, 2026)).toBe("18_plus");
  });

  test("what is not a year someone alive was born in is refused", () => {
    for (const bad of [2027, 1900, 1990.5, Number.NaN, 0]) expect(ageBandOf(bad, 2026)).toBe("invalid");
    expect(AGE_BANDS).toEqual(["15_17", "18_plus"]);
  });
});
