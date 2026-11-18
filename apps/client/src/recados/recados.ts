// Os recados do dia, as the phone knows them (docs/DAILY_PLAY_PROPOSAL.md): asked of the server, which decides
// what they are and whether one is done. Fetched later, with the Mensagens app or once the player is in the street.

import { ptAOTranslator as tr, type MessageKey } from "@nzila/i18n";
import { ptAOLater } from "@nzila/i18n/later";
import { askAsPlayer } from "../world/account.ts";

// The words of the errands came with them (F-195).
tr.extend(ptAOLater);

export interface Recado {
  readonly n: number;
  readonly kind: "traz" | "vaiver" | "guarda" | "cumprimenta";
  readonly who: number;
  readonly item?: string;
  readonly place?: number;
  readonly amount?: number;
  readonly done: boolean;
}

export interface Today {
  readonly day: string;
  readonly recados: readonly Recado[];
  /** What the next errand done will pay. */
  readonly next: number;
  readonly aDois: { readonly item: string; readonly pay: number; readonly done: boolean };
  readonly familia: { readonly amount: number; readonly done: boolean };
  readonly apagao: boolean;
  /** When in the game's day the light goes, on a day it goes (seconds). */
  readonly apagaoHoras: readonly [number, number];
  readonly festa: { readonly week: string; readonly done: number; readonly goal: number };
}

/** What a phone may be told of an errand it says is done. */
export type FeitoSaid = "ok" | "not_there" | "not_yet" | "none" | "done" | "offline";

let cached: { at: number; today: Today } | null = null;
const listeners = new Set<(today: Today) => void>();

/** Today's errands; the last answer within a few seconds is answered again. Null with no network. */
export async function today(fresh = false): Promise<Today | null> {
  if (!fresh && cached && performance.now() - cached.at < 5000) return cached.today;
  const { answer } = await askAsPlayer<Today>("GET", "/v1/recados");
  if (answer) {
    cached = { at: performance.now(), today: answer };
    for (const listener of listeners) listener(answer);
  }
  return answer;
}

/** Hears every new answer: the street and the Mensagens app keep each other up to date. */
export function onToday(listener: (today: Today) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Says an errand is done. The server decides; what it pays comes back. */
export async function feito(n: number): Promise<{ said: FeitoSaid; pay?: number }> {
  let { answer, error } = await askAsPlayer<{ pay: number }>("POST", "/v1/recados/feito", { n });
  // The zone's word that the player is at the place can be a moment behind their feet: asked once more, a little later.
  if (error === "not_there") {
    await new Promise((done) => setTimeout(done, 900));
    ({ answer, error } = await askAsPlayer<{ pay: number }>("POST", "/v1/recados/feito", { n }));
  }
  void today(true);
  if (answer) return { said: "ok", pay: answer.pay };
  return { said: error === "not_there" || error === "not_yet" || error === "none" || error === "done" ? error : "offline" };
}

/** Asks, by itself, whether an errand is done now (after a deposit, after a meeting): "not yet" is no fault. */
export async function tentar(n: number): Promise<{ said: FeitoSaid; pay?: number }> {
  const { answer } = await askAsPlayer<{ done: boolean; pay?: number }>("POST", "/v1/recados/feito", { n, tentativa: true });
  if (answer?.done) {
    void today(true);
    return { said: "ok", ...(answer.pay !== undefined ? { pay: answer.pay } : {}) };
  }
  return { said: "not_yet" };
}

/** The family's money for the taxi. */
export async function familia(): Promise<{ said: "ok" | "done" | "offline"; amount?: number }> {
  const { answer, error } = await askAsPlayer<{ amount: number }>("POST", "/v1/familia");
  void today(true);
  if (answer) return { said: "ok", amount: answer.amount };
  return { said: error === "done" ? "done" : "offline" };
}

/** The neighbour who asks. */
export const whoOf = (who: number): string => tr.t(`recado.who.${who}` as MessageKey);

/** What the neighbour wrote. */
export function messageOf(one: Recado): string {
  if (one.kind === "traz") return tr.t("recado.traz", { item: tr.t(`item.${one.item}.um` as MessageKey) });
  if (one.kind === "guarda") return tr.t("recado.guarda", { amount: tr.makuta(one.amount ?? 0) });
  return tr.t(`recado.${one.kind}`);
}

/** The district's place an errand names: the same one the zone counts (packages/economy, placeOf). */
export function placeIn<T>(places: readonly T[], place: number | undefined): T | null {
  return places.length > 0 && place !== undefined ? places[place % places.length]! : null;
}
