// Whose name is shown: whoever is standing still and near, the nearest first, a few at once.

import { describe, expect, test } from "vitest";
import { NAMES_AT_ONCE, NAME_FAR_M, named, type Named } from "./names.ts";

const who = (name: string, x: number, z: number, still = true): Named => ({ name, x, y: 1.7, z, still });

describe("names over heads", () => {
  test("someone walking past has no name over them, however near; someone who stops does", () => {
    const people = [who("Zeca", 2, 0, false), who("Mingota", 3, 0)];
    expect(named(people, 0, 0).map((one) => one.who.name)).toEqual(["Mingota"]);
  });

  test("someone standing far off has none, and the viewer has none over themself", () => {
    expect(named([who("Longe", NAME_FAR_M + 1, 0), who("Perto", NAME_FAR_M - 1, 0), who("Eu", 0, 0)], 0, 0).map((one) => one.who.name)).toEqual(["Perto"]);
  });

  test("in a crowd standing about, only the nearest few are named, the nearest first", () => {
    const crowd = Array.from({ length: 12 }, (_, n) => who(`P${n}`, 12 - n, 0));
    const shown = named(crowd, 0, 0);
    expect(shown).toHaveLength(NAMES_AT_ONCE);
    expect(shown.map((one) => one.who.name)).toEqual(["P11", "P10", "P9", "P8", "P7", "P6"]);
    expect(shown[0]!.far).toBeCloseTo(1);
  });

  test("it is measured from where the viewer stands", () => {
    expect(named([who("Mingota", 30, 30)], 0, 0)).toEqual([]);
    expect(named([who("Mingota", 30, 30)], 28, 30).map((one) => one.who.name)).toEqual(["Mingota"]);
  });
});
