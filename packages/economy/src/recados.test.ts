import { describe, expect, test } from "vitest";
import { BASE_RECADOS, apagaoOn, dayOf, inApagao, parseRecados, payFor, placeOf, recadosFor, stampsOf, weekOf } from "./recados.ts";

describe("os recados do dia", () => {
  test("the game's own rules load", () => {
    expect(BASE_RECADOS.perDay).toBe(3);
    expect(BASE_RECADOS.pay.length).toBeGreaterThanOrEqual(BASE_RECADOS.perDay);
    expect(BASE_RECADOS.familia.aperto).toBeLessThan(BASE_RECADOS.familia.ouro);
  });

  test("rules with faults say every one of them", () => {
    expect(() => parseRecados({ version: 0, perDay: 9, pay: [], neighbours: 0, traz: ["Pão"], guarda: [0], aDois: {}, familia: { aperto: 1 }, cartao: { stamps: 1 }, apagao: { daysOutOf7: 2, fromGameS: 10, toGameS: 5 }, festa: {} })).toThrow(
      /version[\s\S]*perDay[\s\S]*pay[\s\S]*neighbours[\s\S]*traz[\s\S]*guarda[\s\S]*aDois[\s\S]*familia[\s\S]*cartao[\s\S]*apagao[\s\S]*festa/,
    );
    expect(() => parseRecados(null)).toThrow(/version/);
    expect(() => parseRecados({ ...BASE_RECADOS, perDay: 3, pay: [100] })).toThrow(/pay: an amount for each/);
  });

  test("a player's errands are the same all day, differ from another's, and differ tomorrow", () => {
    const today = recadosFor(BASE_RECADOS, "player-a", "2026-11-18");
    expect(recadosFor(BASE_RECADOS, "player-a", "2026-11-18")).toEqual(today);
    expect(today).toHaveLength(3);
    expect(today.map((one) => one.n)).toEqual([0, 1, 2]);
    const others = ["player-b", "player-c", "player-d"].map((id) => JSON.stringify(recadosFor(BASE_RECADOS, id, "2026-11-18")));
    expect(others.some((one) => one !== JSON.stringify(today))).toBe(true);
    expect(JSON.stringify(recadosFor(BASE_RECADOS, "player-a", "2026-11-19"))).not.toBe(JSON.stringify(today));
  });

  test("never two of a kind or the same neighbour twice in a day; the first is always in the street; each has what it needs", () => {
    for (let i = 0; i < 400; i++) {
      const day = recadosFor(BASE_RECADOS, `p-${i}`, `2026-11-${String(1 + (i % 28)).padStart(2, "0")}`);
      expect(new Set(day.map((one) => one.kind)).size).toBe(day.length);
      expect(new Set(day.map((one) => one.who)).size).toBe(day.length);
      expect(["traz", "vaiver"]).toContain(day[0]!.kind);
      for (const one of day) {
        expect(one.who).toBeLessThan(BASE_RECADOS.neighbours);
        if (one.kind === "traz") expect(BASE_RECADOS.traz).toContain(one.item);
        if (one.kind === "traz" || one.kind === "vaiver") expect(one.place).toBeGreaterThanOrEqual(0);
        if (one.kind === "guarda") expect(BASE_RECADOS.guarda).toContain(one.amount);
      }
    }
  });

  test("with fewer neighbours than errands, the same one asks again rather than nobody", () => {
    const day = recadosFor({ ...BASE_RECADOS, neighbours: 1 }, "p", "2026-11-18");
    expect(day.map((one) => one.who)).toEqual([0, 0, 0]);
  });

  test("the day and the week are Luanda's", () => {
    // 23:30 in UTC is 00:30 the next day in Luanda.
    expect(dayOf(Date.UTC(2026, 10, 17, 23, 30))).toBe("2026-11-18");
    expect(dayOf(Date.UTC(2026, 10, 18, 12, 0))).toBe("2026-11-18");
    expect(weekOf("2026-11-16")).toBe("2026-W47");
    expect(weekOf("2026-11-22")).toBe("2026-W47");
    expect(weekOf("2026-11-23")).toBe("2026-W48");
    expect(weekOf("2027-01-01")).toBe("2026-W53");
  });

  test("a place number is one of the district's places; the pay falls through the day and stays at the last", () => {
    expect(placeOf(123_457, 10)).toBe(7);
    expect(placeOf(5, 0)).toBe(0);
    expect([0, 1, 2, 3, 9].map((n) => payFor(BASE_RECADOS, n))).toEqual([300, 250, 200, 200, 200]);
  });

  test("the light goes on some days of seven, the same for the whole district, and only in its hours", () => {
    const days = Array.from({ length: 700 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
    const dark = days.filter((day) => apagaoOn(BASE_RECADOS, day, "lda/l1")).length / days.length;
    expect(dark).toBeGreaterThan(0.15);
    expect(dark).toBeLessThan(0.45);
    expect(apagaoOn({ ...BASE_RECADOS, apagao: { ...BASE_RECADOS.apagao, daysOutOf7: 0 } }, "2026-11-18", "x")).toBe(false);
    expect(inApagao(BASE_RECADOS, 19 * 3600)).toBe(true);
    expect(inApagao(BASE_RECADOS, 12 * 3600)).toBe(false);
    expect(inApagao(BASE_RECADOS, BASE_RECADOS.apagao.toGameS)).toBe(false);
  });

  test("the cantina's card: one stamp a day, the seventh fills it, a second purchase on a day stamps nothing", () => {
    expect(stampsOf(BASE_RECADOS, [], "2026-11-18")).toEqual({ stamps: 1, fills: false });
    const six = ["2026-11-10", "2026-11-11", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
    expect(stampsOf(BASE_RECADOS, six, "2026-11-18")).toEqual({ stamps: 7, fills: true });
    expect(stampsOf(BASE_RECADOS, [...six.slice(1), "2026-11-18"], "2026-11-18")).toEqual({ stamps: 6, fills: false });
    expect(stampsOf(BASE_RECADOS, [...six, "2026-11-16", "2026-11-17"], "2026-11-18")).toEqual({ stamps: 7, fills: true });
  });
});
