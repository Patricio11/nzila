// A new player's first hour, written out (Task 4.7): what it earns and what it costs, from the rules files, so that
// docs/ECONOMY.md and the tests say the same as the code. Its own entry ("@nzila/economy/primeira-hora"): the phone
// never needs it.
//
// The hour is the one the game is built to give: the family's card, the money for the taxi, the day's three errands
// (and what the cantina charges for the thing an errand asks to bring), a round of each biscato at a middling score,
// and something to eat and drink. Fares are not yet charged through the ledger; when they are, they join it.

import { BISCATO_SCORE_MAX, BASE_BISCATOS, biscatoPay, type BiscatoKind, type BiscatoRules } from "./biscatos.ts";
import { BASE_CATALOGUE, BASE_SHOPS, priceBasket, type Catalogue, type ShopList } from "./items.ts";
import { type Mk } from "./ledger.ts";
import { type OriginTier } from "./origins.ts";
import { BASE_RECADOS, payFor, type Recado, type RecadoRules } from "./recados.ts";

/** What the typical first hour does beyond its errands: a round of each biscato, and a meal. */
export const PRIMEIRA_HORA = {
  biscatos: [
    { kind: "pratos", score: 600 },
    { kind: "carga", score: 500 },
    { kind: "zunga", score: 600 },
    { kind: "carros", score: 500 },
  ] as readonly { readonly kind: BiscatoKind; readonly score: number }[],
  comida: [
    { item: "pao", quantity: 2 },
    { item: "gasosa", quantity: 1 },
    { item: "agua", quantity: 1 },
  ] as readonly { readonly item: string; readonly quantity: number }[],
} as const;

export interface Linha {
  readonly what: "cartao" | "familia" | "recado" | "biscato" | "comida" | "recado-coisa";
  /** Positive when it is earned, negative when it is spent. */
  readonly mk: Mk;
  readonly note: string;
}

export interface Hora {
  readonly linhas: readonly Linha[];
  readonly ganhou: Mk;
  readonly gastou: Mk;
  /** What the player holds at the end of it, Carteira and Banco together. */
  readonly fica: Mk;
}

/**
 * The first hour of a player with this card, from this family, on a day with these errands: line by line. An errand
 * that asks for a thing to be brought costs that thing at the cantina; one that asks for money in the Banco moves it
 * there, and costs nothing.
 */
export function primeiraHora(
  player: { readonly card: Mk; readonly tier: OriginTier; readonly recados: readonly Recado[] },
  rules: { readonly recados: RecadoRules; readonly biscatos: BiscatoRules; readonly shops: ShopList; readonly catalogue: Catalogue } = { recados: BASE_RECADOS, biscatos: BASE_BISCATOS, shops: BASE_SHOPS, catalogue: BASE_CATALOGUE },
  plan: { readonly biscatos: readonly { readonly kind: BiscatoKind; readonly score: number }[]; readonly comida: readonly { readonly item: string; readonly quantity: number }[] } = PRIMEIRA_HORA,
): Hora {
  const linhas: Linha[] = [{ what: "cartao", mk: player.card, note: "o cartão da família" }];
  linhas.push({ what: "familia", mk: rules.recados.familia[player.tier], note: "o dinheiro para o táxi" });
  for (const [n, recado] of player.recados.slice(0, rules.recados.perDay).entries()) {
    if (recado.kind === "traz" && recado.item) {
      const priced = priceBasket(rules.shops, rules.catalogue, "cantina", [{ item: recado.item, quantity: 1 }]);
      if (priced.ok) linhas.push({ what: "recado-coisa", mk: -priced.total, note: `${recado.item}, para levar` });
    }
    linhas.push({ what: "recado", mk: payFor(rules.recados, n), note: recado.kind });
  }
  let paidToday = 0;
  for (const round of plan.biscatos) {
    const pay = biscatoPay(rules.biscatos, round.kind, Math.min(BISCATO_SCORE_MAX, round.score), paidToday);
    paidToday += pay;
    linhas.push({ what: "biscato", mk: pay, note: `${round.kind}, ${round.score} pontos` });
  }
  const meal = priceBasket(rules.shops, rules.catalogue, "cantina", plan.comida);
  if (meal.ok) linhas.push({ what: "comida", mk: -meal.total, note: plan.comida.map((one) => `${one.quantity} ${one.item}`).join(", ") });
  const ganhou = linhas.filter((one) => one.mk > 0).reduce((total, one) => total + one.mk, 0);
  const gastou = linhas.filter((one) => one.mk < 0).reduce((total, one) => total - one.mk, 0);
  return { linhas, ganhou, gastou, fica: ganhou - gastou };
}
