import { describe, expect, test } from "vitest";
import { BASE_TUNABLES } from "./base.ts";
import { BASE_ORIGINS, drawOrigin, originOf, originTableErrors, parseOriginTable, type OriginTable } from "./origins.ts";

const FLOOR = BASE_TUNABLES.player.startingFloor;
const rolls = (...values: number[]): (() => number) => {
  let n = 0;
  return () => values[n++ % values.length]!;
};
const small: OriginTable = {
  version: 7,
  step: 500,
  families: [
    { id: "a", pai: "mecanico", mae: "zungueira", tier: "aperto", weight: 3, min: 1500, max: 2500, bairros: ["x", "y"] },
    { id: "b", pai: "general", mae: "deputada", tier: "ouro", weight: 1, min: 250000, max: 250000, bairros: ["z"] },
  ],
  provinces: [
    { id: "luanda", weight: 1 },
    { id: "huambo", weight: 1 },
  ],
};

describe("the starter table", () => {
  test("is one that may be drawn from, and nobody starts under the floor (D-0.44)", () => {
    expect(originTableErrors(BASE_ORIGINS, FLOOR)).toEqual([]);
    expect(Math.min(...BASE_ORIGINS.families.map((family) => family.min))).toBe(FLOOR);
  });

  test("a rich family is really rare, and lives where the rich live", () => {
    const total = BASE_ORIGINS.families.reduce((sum, family) => sum + family.weight, 0);
    const share = (tier: string): number => BASE_ORIGINS.families.filter((family) => family.tier === tier).reduce((sum, family) => sum + family.weight, 0) / total;
    expect(share("ouro")).toBeLessThanOrEqual(0.01);
    expect(share("aperto")).toBeGreaterThan(0.5);
    for (const family of BASE_ORIGINS.families.filter((one) => one.tier === "ouro" || one.tier === "bem")) for (const bairro of family.bairros) expect(["talatona", "maianga", "kilamba"]).toContain(bairro);
    // Nobody in the millions: every Makuta handed out at birth is a faucet the economy must absorb.
    expect(Math.max(...BASE_ORIGINS.families.map((family) => family.max))).toBeLessThan(1_000_000);
  });

  test("over many draws the shares are the table's, and every amount is on a step inside its family", () => {
    let seed = 12345;
    const dice = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
    const drawn = new Map<string, number>();
    // Counted, not asserted one by one: twenty thousand cards are many assertions for one test.
    let wrong = 0;
    for (let n = 0; n < 20_000; n++) {
      const card = drawOrigin(BASE_ORIGINS, dice);
      const family = BASE_ORIGINS.families.find((one) => one.id === card.family)!;
      if (card.makuta < family.min || card.makuta > family.max || card.makuta % BASE_ORIGINS.step !== 0 || !family.bairros.includes(card.bairro)) wrong++;
      drawn.set(card.tier, (drawn.get(card.tier) ?? 0) + 1);
    }
    expect(wrong).toBe(0);
    expect(drawn.get("aperto")! / 20_000).toBeCloseTo(0.64, 1);
    expect(drawn.get("ouro")! / 20_000).toBeLessThan(0.02);
  });
});

describe("a draw", () => {
  test("uses four rolls: the family, the amount, the bairro, the province", () => {
    expect(drawOrigin(small, rolls(0, 0, 0, 0))).toEqual({ family: "a", pai: "mecanico", mae: "zungueira", tier: "aperto", province: "luanda", bairro: "x", makuta: 1500, version: 7 });
    expect(drawOrigin(small, rolls(0.74, 0.99, 0.99, 0.99))).toMatchObject({ family: "a", makuta: 2500, bairro: "y", province: "huambo" });
    expect(drawOrigin(small, rolls(0.75, 0.5, 0.5, 0.5))).toMatchObject({ family: "b", makuta: 250000, bairro: "z" });
  });

  test("a family no longer dealt is never drawn, whatever the dice", () => {
    const retired: OriginTable = { ...small, families: [small.families[0]!, { ...small.families[1]!, weight: 0 }] };
    for (const roll of [0, 0.5, 0.999999, 1]) expect(drawOrigin(retired, rolls(roll)).family).toBe("a");
  });

  test("dice that give exactly one still deal a card", () => {
    expect(drawOrigin(small, rolls(1))).toMatchObject({ family: "b", makuta: 250000, bairro: "z", province: "huambo" });
    expect(drawOrigin({ ...small, families: [small.families[0]!] }, rolls(1))).toMatchObject({ family: "a", makuta: 2500, bairro: "y" });
  });

  test("a card recorded before is read back whole, unless its family has left the table", () => {
    const recorded = { family: "a", province: "huambo", bairro: "y", makuta: 2000, version: 3 };
    expect(originOf(small, recorded)).toEqual({ ...recorded, pai: "mecanico", mae: "zungueira", tier: "aperto" });
    expect(originOf(small, { ...recorded, family: "gone" })).toBeNull();
  });
});

describe("a table that may not be drawn from", () => {
  test("is refused, with every problem said at once", () => {
    expect(originTableErrors(null, FLOOR)).toEqual(["version: expected a whole number from 1", "step: expected a whole number above 0", "families: at least one", "provinces: at least one"]);
    const family = small.families[0]!;
    const bad = {
      version: 1,
      step: 500,
      families: [
        family,
        { ...family },
        null,
        { ...family, id: "No Good", pai: "", tier: "rico", weight: -1, min: 3000, max: 2000, bairros: [] },
        { ...family, id: "poor", min: 1000 },
        { ...family, id: "odd", min: 1700, tier: 4, bairros: "x" },
      ],
      provinces: [{ id: "luanda", weight: 1 }, { id: "luanda", weight: 1 }, { id: "huambo", weight: 0 }, null],
    };
    expect(originTableErrors(bad, FLOOR)).toEqual([
      "families.a: needs an id of its own",
      "families.2: expected an object",
      "families.3: needs an id of its own",
      "families.3: needs a father's trade and a mother's",
      "families.3: tier is not one of aperto, remediado, bem, ouro",
      "families.3: weight must be a whole number, 0 for a family no longer dealt",
      "families.3: needs a least and a most, in that order",
      "families.3: needs at least one bairro",
      "families.poor: nobody starts with less than 1500",
      "families.odd: tier is not one of aperto, remediado, bem, ouro",
      "families.odd: amounts fall on multiples of 500",
      "families.odd: needs at least one bairro",
      "provinces.1: needs an id of its own and a weight from 1",
      "provinces.2: needs an id of its own and a weight from 1",
      "provinces.3: needs an id of its own and a weight from 1",
    ]);
    expect(() => parseOriginTable(bad, FLOOR)).toThrow(/invalid table of origins/);
    expect(parseOriginTable(small, FLOOR)).toBe(small);
    expect(originTableErrors({ ...small, families: [{ ...family, weight: 0 }] }, FLOOR)).toEqual(["families: at least one must be dealt"]);
  });
});
