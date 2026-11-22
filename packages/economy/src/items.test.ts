import { describe, expect, test } from "vitest";
import { BASE_CATALOGUE, BASE_SHOPS, MOST_OF_ONE, parseCatalogue, parseShops, priceBasket, unitsCarried } from "./items.ts";

describe("the catalogue of things", () => {
  test("the game's own catalogue and the cantina's list load, and every thing the cantina sells is a thing", () => {
    expect(BASE_CATALOGUE.items.get("pao")).toMatchObject({ kind: "comida", use: "comer", size: 1 });
    expect(BASE_CATALOGUE.carryUnits).toBeGreaterThan(5);
    const cantina = BASE_SHOPS.shops.get("cantina")!;
    expect(cantina.length).toBeGreaterThan(15);
    for (const line of cantina) expect(BASE_CATALOGUE.items.has(line.item)).toBe(true);
    // Bread is the cheapest thing on the list a player eats, and it is cheap: a corrida buys four.
    expect(cantina.find((line) => line.item === "pao")!.price).toBeLessThanOrEqual(100);
  });

  test("a catalogue with faults says every one of them", () => {
    expect(() => parseCatalogue({ version: 0, carryUnits: 0, items: [{ id: "Pão", kind: "carro", size: -1, use: "fumar", fome: 20_000, energia: 0 }, { id: "x", kind: "comida", size: 1, use: null, fome: 0, energia: 0 }, { id: "x", kind: "comida", size: 1, use: null, fome: 0, energia: 0 }] })).toThrow(
      /version[\s\S]*carryUnits[\s\S]*items\[0\]\.id[\s\S]*items\[0\]\.kind[\s\S]*items\[0\]\.size[\s\S]*items\[0\]\.use[\s\S]*items\[0\]: fome[\s\S]*items\[2\]\.id: "x" is listed twice/,
    );
    expect(() => parseCatalogue({ version: 1, carryUnits: 10, items: "nada" })).toThrow(/items: a list/);
    expect(() => parseCatalogue({ version: 1, carryUnits: 10, items: [{ id: 5, kind: "comida", size: 1, use: null, fome: 0, energia: 0 }] })).toThrow(/items\[0\]\.id/);
    expect(() => parseCatalogue(null)).toThrow(/version/);
    // Furniture says the floor it stands on, and nothing else does (Task 5.3).
    const thing = { size: 8, use: null, fome: 0, energia: 0 };
    expect(parseCatalogue({ version: 1, carryUnits: 24, items: [{ id: "cadeira", kind: "mobilia", ...thing, chao: [1, 2] }] }).items.get("cadeira")!.chao).toEqual([1, 2]);
    expect(() => parseCatalogue({ version: 1, carryUnits: 24, items: [{ id: "cadeira", kind: "mobilia", ...thing }] })).toThrow(/items\[0\]\.chao/);
    expect(() => parseCatalogue({ version: 1, carryUnits: 24, items: [{ id: "pao", kind: "comida", ...thing, chao: [1, 1] }] })).toThrow(/items\[0\]\.chao/);
    for (const chao of [[0, 1], [1, 13], [1], "1x1", [1.5, 1]]) expect(() => parseCatalogue({ version: 1, carryUnits: 24, items: [{ id: "cadeira", kind: "mobilia", ...thing, chao }] }), JSON.stringify(chao)).toThrow(/chao/);
    expect([...BASE_CATALOGUE.items.values()].filter((item) => item.kind === "mobilia").every((item) => BASE_SHOPS.shops.get("moveis")!.some((line) => line.item === item.id))).toBe(true);
  });

  test("a price list with faults says every one of them", () => {
    expect(() => parseShops({ version: 1, shops: { Loja: { stock: [{ item: "pao", price: 0 }, { item: "pao", price: 5 }, { item: "ouro", price: 5 }] }, bar: {} } }, BASE_CATALOGUE)).toThrow(
      /shops\.Loja: lower-case[\s\S]*stock\[0\]\.price[\s\S]*stock\[1\]: "pao" is sold twice[\s\S]*stock\[2\]: "ouro" is no thing[\s\S]*shops\.bar\.stock: a list/,
    );
    expect(() => parseShops({ version: 0, shops: null }, BASE_CATALOGUE)).toThrow(/version[\s\S]*shops: an object/);
  });
});

describe("a basket", () => {
  test("is priced line by line, the same thing twice is one line, and the room it takes is counted", () => {
    const priced = priceBasket(BASE_SHOPS, BASE_CATALOGUE, "cantina", [{ item: "pao", quantity: 2 }, { item: "sumo", quantity: 1 }, { item: "pao", quantity: 1 }]);
    expect(priced).toEqual({
      ok: true,
      lines: [
        { item: "pao", quantity: 3, price: 50, amount: 150 },
        { item: "sumo", quantity: 1, price: 200, amount: 200 },
      ],
      total: 350,
      units: 4,
    });
  });

  test("nothing, a thing the shop does not sell, a shop that is not one, or a quantity that is not one, is not priced", () => {
    expect(priceBasket(BASE_SHOPS, BASE_CATALOGUE, "cantina", [])).toEqual({ ok: false, error: "empty" });
    expect(priceBasket(BASE_SHOPS, BASE_CATALOGUE, "cantina", [{ item: "carro", quantity: 1 }])).toEqual({ ok: false, error: "not_sold" });
    expect(priceBasket(BASE_SHOPS, BASE_CATALOGUE, "joalharia", [{ item: "pao", quantity: 1 }])).toEqual({ ok: false, error: "not_sold" });
    for (const quantity of [0, -1, 1.5]) expect(priceBasket(BASE_SHOPS, BASE_CATALOGUE, "cantina", [{ item: "pao", quantity }])).toEqual({ ok: false, error: "quantity" });
    expect(priceBasket(BASE_SHOPS, BASE_CATALOGUE, "cantina", [{ item: "pao", quantity: MOST_OF_ONE }, { item: "pao", quantity: 1 }])).toEqual({ ok: false, error: "quantity" });
  });

  test("the room things take in a Mochila; a thing no longer in the catalogue takes none", () => {
    expect(unitsCarried(BASE_CATALOGUE, [{ item: "carvao", quantity: 2 }, { item: "fosforos", quantity: 9 }, { item: "esquecido", quantity: 3 }])).toBe(12);
  });
});
