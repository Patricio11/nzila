import { describe, expect, test } from "vitest";
import base from "../tunables/base.json" with { type: "json" };
import { BASE_TUNABLES } from "./base.ts";
import { fillTunables, parseTunables, tunableAt, tunablesChanges, tunablesSpec, validateTunables } from "./tunables.ts";

const copy = (): Record<string, Record<string, unknown>> => JSON.parse(JSON.stringify(base));
const errorsOf = (input: unknown): string[] => {
  const result = validateTunables(input);
  return result.ok ? [] : result.errors;
};

describe("the starter file", () => {
  test("is valid and loads", () => {
    expect(validateTunables(base)).toEqual({ ok: true, tunables: base });
    expect(BASE_TUNABLES.version).toBeGreaterThanOrEqual(2);
  });

  test("carries the numbers the rules fix (Rule 6)", () => {
    expect(BASE_TUNABLES.crime).toMatchObject({
      shieldPlayHours: 5,
      shieldAccountDays: 7,
      assaltoPermilleOfCash: 200,
      burglaryCooldownHours: 24,
      burglaryPermilleOfMovableValue: 100,
      hotGoodsHours: 24,
      maxSentenceMinutes: 30,
    });
  });

  test("carries the numbers the founder set: a Makuta buys what a kwanza buys (D-0.9)", () => {
    expect(BASE_TUNABLES.player.startingFloor).toBe(1500);
    // A corrida in Luanda costs 200 Kz.
    expect(BASE_TUNABLES.fares.candongueiroLocal).toBe(200);
  });
});

describe("the validator", () => {
  test("refuses what is not an object, at the top or inside", () => {
    for (const bad of [null, 7, "x", [], undefined]) expect(errorsOf(bad)).toEqual(["tunables: expected an object"]);
    const t = copy();
    (t as Record<string, unknown>).fares = 150;
    expect(errorsOf(t)).toEqual(["fares: expected an object"]);
  });

  test("names every problem at once, with its path", () => {
    const t = copy();
    delete t.fares!.candongueiroLocal;
    t.player!.startingFloor = 99.5;
    t.needs!.fomePerHour = "4000";
    t.crime!.assaltoPermilleOfCash = 1001;
    t.crime!.maxSentenceMinutes = 0;
    t.heat!.wind = 3;
    (t as Record<string, unknown>).casino = {};
    expect(errorsOf(t)).toEqual([
      "player.startingFloor: expected a whole number",
      "fares.candongueiroLocal: missing",
      "needs.fomePerHour: expected a whole number",
      "crime.assaltoPermilleOfCash: 1001 is outside 0 to 1000",
      "crime.maxSentenceMinutes: 0 is outside 1 to 120",
      "heat.wind: not a known tunable",
      "casino: not a known tunable",
    ]);
  });

  test("is not fooled by names every object has", () => {
    const t = copy();
    Object.assign(t.heat!, { toString: 1 });
    expect(errorsOf(t)).toEqual(["heat.toString: not a known tunable"]);
  });

  test("refuses caps that contradict each other", () => {
    const t = copy();
    t.transfers!.newAccountDailyCap = 600_000;
    t.stakes!.perGameCap = 500_001;
    t.transfers!.noSendDays = 30;
    t.channels!.fillTo = 81;
    expect(errorsOf(t)).toEqual([
      "transfers.noSendDays: an account that may send nothing is still a new one",
      "transfers.newAccountDailyCap: a new account may not send more than an established one",
      "stakes.perGameCap: one stake may not be larger than the daily cap it counts against",
      "channels.fillTo: a channel cannot be filled past what it holds",
    ]);
  });

  test("parseTunables returns the tunables or throws with every problem", () => {
    expect(parseTunables(base)).toEqual(base);
    const t = copy();
    t.player!.startingFloor = -1;
    t.fares!.candongueiroLocal = -1;
    expect(() => parseTunables(t)).toThrow(/player\.startingFloor[\s\S]*fares\.candongueiroLocal/);
  });
});

describe("the Estúdio's view of them (Task 4.6)", () => {
  test("every tunable is listed by its path, with its range", () => {
    const spec = tunablesSpec();
    expect(spec).toContainEqual({ path: "needs.fomePerHour", min: 0, max: 100_000 });
    expect(spec).toContainEqual({ path: "version", min: 1, max: 1_000_000 });
    expect(spec.every((one) => tunableAt(BASE_TUNABLES, one.path) !== undefined)).toBe(true);
    expect(tunableAt(BASE_TUNABLES, "needs.nothing")).toBeUndefined();
    expect(tunableAt(null, "needs.fomePerHour")).toBeUndefined();
  });

  test("a version recorded before the code gained a tunable is read with the file's number for it, and loses what the code dropped", () => {
    const old = copy();
    delete old.needs!.hospitalBill;
    old.needs!.gone = 5;
    old.needs!.fomePerHour = 1234;
    const filled = fillTunables(old, BASE_TUNABLES);
    expect(validateTunables(filled).ok).toBe(true);
    expect(tunableAt(filled, "needs.hospitalBill")).toBe(BASE_TUNABLES.needs.hospitalBill);
    expect(tunableAt(filled, "needs.fomePerHour")).toBe(1234);
    expect(tunableAt(filled, "needs.gone")).toBeUndefined();
    expect(validateTunables(fillTunables(null, BASE_TUNABLES))).toEqual({ ok: true, tunables: BASE_TUNABLES });
  });

  test("what a change changes, path by path, the version aside", () => {
    const after = copy();
    after.needs!.fomePerHour = 9;
    after.version = 99 as never;
    expect(tunablesChanges(BASE_TUNABLES, after)).toEqual([{ path: "needs.fomePerHour", from: BASE_TUNABLES.needs.fomePerHour, to: 9 }]);
    expect(tunablesChanges(BASE_TUNABLES, BASE_TUNABLES)).toEqual([]);
  });
});
