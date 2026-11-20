import { describe, expect, test } from "vitest";
import { BASE_BISCATOS } from "./biscatos.ts";
import { BASE_CATALOGUE, BASE_SHOPS } from "./items.ts";
import { PRIMEIRA_HORA, primeiraHora } from "./primeira-hora.ts";
import { BASE_RECADOS, type Recado } from "./recados.ts";

const traz: Recado = { n: 0, kind: "traz", who: 1, item: "pao", place: 3 };
const guarda: Recado = { n: 1, kind: "guarda", who: 2, amount: 500 };
const vaiver: Recado = { n: 2, kind: "vaiver", who: 3, place: 5 };

describe("a new player's first hour, written out (Task 4.7)", () => {
  test("line by line: the card, the taxi money, three errands less what the first asks to bring, four biscatos, a meal", () => {
    const hora = primeiraHora({ card: 1500, tier: "aperto", recados: [traz, guarda, vaiver] });
    expect(hora.linhas.map((one) => one.what)).toEqual(["cartao", "familia", "recado-coisa", "recado", "recado", "recado", "biscato", "biscato", "biscato", "biscato", "comida"]);
    expect(hora.linhas.find((one) => one.what === "familia")!.mk).toBe(BASE_RECADOS.familia.aperto);
    expect(hora.linhas.filter((one) => one.what === "recado").map((one) => one.mk)).toEqual(BASE_RECADOS.pay.slice(0, 3));
    // A pão bought for the errand, and the meal at the cantina's prices.
    expect(hora.linhas.find((one) => one.what === "recado-coisa")!.mk).toBe(-50);
    expect(hora.linhas.find((one) => one.what === "comida")!.mk).toBe(-(2 * 50 + 250 + 100));
    // Four rounds, none past the day's first step of the taper.
    expect(hora.linhas.filter((one) => one.what === "biscato").map((one) => one.mk)).toEqual([330, 370, 360, 400]);
    expect(hora.ganhou - hora.gastou).toBe(hora.fica);
    expect(hora.fica).toBe(1500 + 200 + 750 + 1460 - 50 - 450);
  });

  test("a family better off gives more for the taxi; an hour of errands that bring nothing costs only the meal", () => {
    const ouro = primeiraHora({ card: 25_000, tier: "ouro", recados: [guarda, vaiver] });
    expect(ouro.linhas.find((one) => one.what === "familia")!.mk).toBe(BASE_RECADOS.familia.ouro);
    expect(ouro.gastou).toBe(450);
    // A thing the cantina does not sell, and a meal it does not sell: nothing spent on them.
    const nothing = primeiraHora({ card: 1500, tier: "aperto", recados: [{ ...traz, item: "televisao" }] }, { recados: BASE_RECADOS, biscatos: BASE_BISCATOS, shops: BASE_SHOPS, catalogue: BASE_CATALOGUE }, { biscatos: PRIMEIRA_HORA.biscatos, comida: [] });
    expect(nothing.gastou).toBe(0);
  });
});
