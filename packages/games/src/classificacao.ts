// The tables' ranking (Task 4B.1): each player has points at each game, in each bairro, counted the way chess counts
// them (Elo): a win against someone with more points brings more than a win against someone with fewer, and a loss
// to someone weaker costs more. A kota counts by how strong it plays: beating Kota Domingos brings far more than
// beating Kota Zeca, who is learning. Pure: the books (packages/db) keep the points, and call this to change them.

import { KOTAS, type Forca, type Jogo, type Mesa } from "./mesa.ts";

/** What a player has before their first game of a kind, in a bairro. */
export const PONTOS_INICIAIS = 1000;
/** What a kota counts as, by how strong it plays: a beginner below a newcomer, the feared well above. */
export const PONTOS_KOTA: Readonly<Record<Forca, number>> = { principiante: 800, conhecedor: 1100, temido: 1400 };
/** How much one game can move a player's points, at most. */
const K = 32;

export type Resultado = "ganhou" | "perdeu" | "empate";

/** A kota's points, by its strength at a game. */
export const pontosDoKota = (kota: number, jogo: Jogo): number => PONTOS_KOTA[KOTAS[kota]!.forca[jogo]];

/** How a finished game came out for each seat; null while it is not finished. */
export function resultados(mesa: Mesa): Resultado[] | null {
  const partida = mesa.partida;
  let vencedor: number | null;
  if (partida.jogo === "ludo") {
    if (partida.estado.winner === null) return null;
    vencedor = partida.estado.winner;
  } else {
    const result = partida.estado.result;
    if (result === null) return null;
    // The first side (White, the light pieces) is the seat that played first.
    const primeiro = result === "w" || result === 0;
    vencedor = result === "empate" ? null : primeiro ? mesa.primeiro : 1 - mesa.primeiro;
  }
  return mesa.lugares.map((_, lugar) => (vencedor === null ? "empate" : lugar === vencedor ? "ganhou" : "perdeu"));
}

/** A seat as the ranking counts it: its points, and whether a player sat in it (a kota's points never change). */
export interface Sentado {
  readonly pontos: number;
  readonly jogador: boolean;
}

/**
 * What each seat gains or loses from a finished game, in whole points (a kota's always 0). Each pair of seats is a
 * game between them: the winner against each loser; a draw between two who drew; at Não te irrites, two who did not
 * win are nothing to each other.
 */
export function ajuste(sentados: readonly Sentado[], como: readonly Resultado[]): number[] {
  const delta = sentados.map(() => 0);
  for (let i = 0; i < sentados.length; i++) {
    for (let j = i + 1; j < sentados.length; j++) {
      const a = como[i]!;
      const b = como[j]!;
      // Two who lost (at Não te irrites) have not played each other.
      if (a === "perdeu" && b === "perdeu") continue;
      const conta = a === "empate" ? 0.5 : a === "ganhou" ? 1 : 0;
      const espera = 1 / (1 + 10 ** ((sentados[j]!.pontos - sentados[i]!.pontos) / 400));
      if (sentados[i]!.jogador) delta[i]! += K * (conta - espera);
      if (sentados[j]!.jogador) delta[j]! += K * (espera - conta);
    }
  }
  return delta.map((one) => Math.round(one));
}
