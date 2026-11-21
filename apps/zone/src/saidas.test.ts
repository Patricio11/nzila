import { describe, expect, test } from "vitest";
import { APART_MS, ASK_AGAIN_MS, ASK_LASTS_MS, OUTING_MOST_MS, Saidas } from "./saidas.ts";

const PLACES = [{ x: 0, z: 0 }, { x: 100_000, z: 0 }, { x: 0, z: 100_000 }];
const at = (where: Record<string, { x: number; z: number }>) => (player: string) => where[player] ?? null;

describe("going out (Task 10.13, D-10.3 to D-10.5)", () => {
  test("an ask, a yes: the two are out to the place asked, and neither can be asked or ask again meanwhile", () => {
    const saidas = new Saidas(3);
    expect(saidas.convidar("ana", "rui", 1, 0)).toBe(true);
    const saida = saidas.aceitar("rui", "ana", 5_000);
    expect(saida).toMatchObject({ a: "ana", b: "rui", lugar: 1, chegou: false });
    expect(saidas.of("ana")).toBe(saidas.of("rui"));
    expect(saidas.convidar("ze", "ana", 0, 6_000)).toBe("ocupado");
    expect(saidas.convidar("rui", "ze", 0, 6_000)).toBe("ocupado");
  });

  test("a no costs nothing and is not asked again for half an hour; a yes to an ask that is gone is refused", () => {
    const saidas = new Saidas(3);
    expect(saidas.convidar("ana", "rui", 0, 0)).toBe(true);
    expect(saidas.recusar("rui", "ana", 1_000)).toBe(true);
    expect(saidas.of("ana")).toBeNull();
    expect(saidas.aceitar("rui", "ana", 2_000)).toBe("convite");
    expect(saidas.convidar("ana", "rui", 0, 60_000)).toBe("cedo");
    // The other way is another matter, and so is someone else.
    expect(saidas.convidar("rui", "ana", 0, 60_000)).toBe(true);
    expect(saidas.convidar("ana", "ze", 0, 60_000)).toBe(true);
    expect(saidas.convidar("ana", "rui", 0, ASK_AGAIN_MS + 2_000)).toBe(true);
  });

  test("three asks an hour, and an ask not answered is forgotten", () => {
    const saidas = new Saidas(3);
    for (const who of ["b", "c", "d"]) expect(saidas.convidar("a", who, 0, 0)).toBe(true);
    expect(saidas.convidar("a", "e", 0, 1_000)).toBe("muitos");
    expect(saidas.convidar("a", "e", 0, 3_600_001)).toBe(true);
    expect(saidas.aceitar("e", "a", 3_600_001 + ASK_LASTS_MS + 1)).toBe("convite");
  });

  test("another place is an ask back, not counted against the hour; the first answers it the same way", () => {
    const saidas = new Saidas(3);
    expect(saidas.convidar("ana", "rui", 0, 0)).toBe(true);
    expect(saidas.outro("rui", "ana", 2, 1_000)).toBe(true);
    // The first ask is no more; the one back stands.
    expect(saidas.aceitar("rui", "ana", 2_000)).toBe("convite");
    expect(saidas.outro("ana", "rui", 1, 3_000)).toBe(true);
    expect(saidas.aceitar("rui", "ana", 4_000)).toMatchObject({ a: "ana", b: "rui", lugar: 1 });
    // Rui answered twice with a place and has his three asks still.
    const others = new Saidas(3);
    others.convidar("x", "rui", 0, 0);
    for (let n = 0; n < 5; n++) expect(others.outro(n % 2 === 0 ? "rui" : "x", n % 2 === 0 ? "x" : "rui", n % 3, 1_000 + n)).toBe(true);
    expect(others.convidar("rui", "y", 0, 9_000)).toBe(true);
  });

  test("a place that is not one of the district's is not asked, nor oneself", () => {
    const saidas = new Saidas(2);
    expect(saidas.convidar("ana", "rui", 2, 0)).toBe("nao_pode");
    expect(saidas.convidar("ana", "ana", 0, 0)).toBe("nao_pode");
    saidas.convidar("ana", "rui", 0, 0);
    expect(saidas.outro("rui", "ana", 5, 1_000)).toBe("nao_pode");
  });

  test("they arrive when both stand at the place, once", () => {
    const saidas = new Saidas(3);
    saidas.convidar("ana", "rui", 1, 0);
    saidas.aceitar("rui", "ana", 0);
    expect(saidas.step(1_000, at({ ana: { x: 95_000, z: 0 }, rui: { x: 60_000, z: 0 } }), PLACES).chegaram).toEqual([]);
    const there = at({ ana: { x: 95_000, z: 3_000 }, rui: { x: 104_000, z: -2_000 } });
    expect(saidas.step(2_000, there, PLACES).chegaram).toHaveLength(1);
    expect(saidas.step(3_000, there, PLACES).chegaram).toEqual([]);
    expect(saidas.of("ana")?.chegou).toBe(true);
  });

  test("it ends when either ends it, when they have been far apart a while, when it has grown late", () => {
    const saidas = new Saidas(3);
    saidas.convidar("ana", "rui", 0, 0);
    saidas.aceitar("rui", "ana", 0);
    expect(saidas.terminar("rui")).toMatchObject({ a: "ana", b: "rui" });
    expect(saidas.of("ana")).toBeNull();
    expect(saidas.terminar("ana")).toBeNull();

    saidas.convidar("ana", "rui", 0, 10_000);
    saidas.aceitar("rui", "ana", 10_000);
    const far = at({ ana: { x: 0, z: 0 }, rui: { x: 90_000, z: 0 } });
    expect(saidas.step(20_000, far, PLACES).fim).toEqual([]);
    // Together again for a moment: the count starts over.
    expect(saidas.step(30_000, at({ ana: { x: 0, z: 0 }, rui: { x: 5_000, z: 0 } }), PLACES).fim).toEqual([]);
    expect(saidas.step(40_000, far, PLACES).fim).toEqual([]);
    expect(saidas.step(40_000 + APART_MS - 1, far, PLACES).fim).toEqual([]);
    expect(saidas.step(40_000 + APART_MS + 1, far, PLACES).fim.map((one) => one.porque)).toEqual(["longe"]);
    expect(saidas.of("rui")).toBeNull();

    const late = 1_000_000;
    saidas.convidar("rui", "ana", 0, late);
    saidas.aceitar("ana", "rui", late);
    expect(saidas.step(late + OUTING_MOST_MS + 1, at({}), PLACES).fim.map((one) => one.porque)).toEqual(["tarde"]);
  });

  test("someone who leaves the street takes their asks with them", () => {
    const saidas = new Saidas(3);
    saidas.convidar("ana", "rui", 0, 0);
    saidas.convidar("ze", "ana", 0, 0);
    saidas.forget("ana");
    expect(saidas.aceitar("rui", "ana", 1_000)).toBe("convite");
    expect(saidas.aceitar("ana", "ze", 1_000)).toBe("convite");
  });
});
