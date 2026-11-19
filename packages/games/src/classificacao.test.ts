import { describe, expect, test } from "vitest";
import { PONTOS_INICIAIS, PONTOS_KOTA, ajuste, pontosDoKota, resultados } from "./classificacao.ts";
import { novaMesa } from "./mesa.ts";

describe("the tables' ranking", () => {
  test("a kota counts by how strong it plays: Kota Zeca below a newcomer, Kota Domingos well above", () => {
    expect(pontosDoKota(0, "xadrez")).toBe(PONTOS_KOTA.principiante);
    expect(pontosDoKota(3, "xadrez")).toBe(PONTOS_KOTA.temido);
    expect(pontosDoKota(2, "ludo")).toBe(PONTOS_KOTA.temido);
    expect(pontosDoKota(1, "damas")).toBe(PONTOS_KOTA.conhecedor);
    expect(PONTOS_KOTA.principiante).toBeLessThan(PONTOS_INICIAIS);
    expect(PONTOS_KOTA.temido).toBeGreaterThan(PONTOS_INICIAIS);
  });

  test("beating Kota Domingos brings far more than beating Kota Zeca; losing to Kota Zeca costs more than losing to Kota Domingos", () => {
    const novo = { pontos: PONTOS_INICIAIS, jogador: true };
    const [zeca] = ajuste([novo, { pontos: PONTOS_KOTA.principiante, jogador: false }], ["ganhou", "perdeu"]);
    const [domingos, kota] = ajuste([novo, { pontos: PONTOS_KOTA.temido, jogador: false }], ["ganhou", "perdeu"]);
    expect(zeca).toBe(8);
    expect(domingos).toBe(29);
    // A kota's points never move.
    expect(kota).toBe(0);
    const [toZeca] = ajuste([novo, { pontos: PONTOS_KOTA.principiante, jogador: false }], ["perdeu", "ganhou"]);
    const [toDomingos] = ajuste([novo, { pontos: PONTOS_KOTA.temido, jogador: false }], ["perdeu", "ganhou"]);
    expect(toZeca).toBe(-24);
    expect(toDomingos).toBe(-3);
  });

  test("two players: what one gains the other loses; a draw moves the stronger toward the weaker", () => {
    expect(ajuste([{ pontos: 1000, jogador: true }, { pontos: 1000, jogador: true }], ["ganhou", "perdeu"])).toEqual([16, -16]);
    expect(ajuste([{ pontos: 1200, jogador: true }, { pontos: 1000, jogador: true }], ["empate", "empate"])).toEqual([-8, 8]);
  });

  test("Não te irrites: the winner against each of the others; the others nothing to each other", () => {
    const four = [1000, 1000, 1000, 1000].map((pontos) => ({ pontos, jogador: true }));
    expect(ajuste(four, ["perdeu", "ganhou", "perdeu", "perdeu"])).toEqual([-16, 48, -16, -16]);
  });

  test("how a finished game came out, seat by seat, whoever played first; nothing while it goes on", () => {
    const xadrez = novaMesa("xadrez", 0);
    expect(resultados(xadrez)).toBeNull();
    const branco = { ...xadrez, primeiro: 1, partida: { jogo: "xadrez" as const, estado: { ...(xadrez.partida.estado as never as object), result: "w" } } } as never;
    expect(resultados(branco)).toEqual(["perdeu", "ganhou"]);
    const preto = { ...xadrez, partida: { jogo: "xadrez" as const, estado: { ...(xadrez.partida.estado as never as object), result: "b" } } } as never;
    expect(resultados(preto)).toEqual(["perdeu", "ganhou"]);
    const damas = novaMesa("damas", 0);
    expect(resultados(damas)).toBeNull();
    expect(resultados({ ...damas, partida: { jogo: "damas", estado: { ...(damas.partida.estado as never as object), result: 0 } } } as never)).toEqual(["ganhou", "perdeu"]);
    expect(resultados({ ...damas, partida: { jogo: "damas", estado: { ...(damas.partida.estado as never as object), result: "empate" } } } as never)).toEqual(["empate", "empate"]);
    const ludo = novaMesa("ludo", 0);
    expect(resultados(ludo)).toBeNull();
    expect(resultados({ ...ludo, partida: { ...ludo.partida, estado: { ...(ludo.partida.estado as never as object), winner: 2 } } } as never)).toEqual(["perdeu", "perdeu", "ganhou", "perdeu"]);
  });
});
