// Convidar para sair (Task 10.13, D-10.3 to D-10.5): who has asked whom out, who is out with whom and where, as one
// channel keeps it. The rules only: who may ask at all (two adults, neither shut out by the other) is the room's to
// check before it comes here, at every step.
//
// An ask names a place. The other says yes, no, or another place, which is an ask back the first answers the same
// way: they choose together. Agreed, the two are out until one ends it, they have been apart a long while, it has
// grown late, or one of them leaves the street.

import { type SairRecusa } from "@nzila/protocol/sair";

/** Asks a player may make in an hour (an answer with another place is not one). */
export const ASKS_AN_HOUR = 3;
/** Someone who said no is not asked again by the same player for this long. */
export const ASK_AGAIN_MS = 30 * 60_000;
/** An ask not answered is forgotten after this long. */
export const ASK_LASTS_MS = 90_000;
/** Both within this of the place: they have arrived. Millimetres. */
export const ARRIVE_MM = 12_000;
/** Farther apart than this, for this long, and the outing is over. */
export const APART_MM = 70_000;
export const APART_MS = 4 * 60_000;
/** An outing lasts this long at most: an evening, not a day. */
export const OUTING_MOST_MS = 45 * 60_000;

export interface Saida {
  /** The two, by their ids: `a` asked first. */
  readonly a: string;
  readonly b: string;
  /** The place, by its number among the district's places for an outing. */
  readonly lugar: number;
  readonly since: number;
  chegou: boolean;
  /** Since when they have been far apart, if they are. */
  apartSince: number | null;
}

interface Ask {
  readonly para: string;
  readonly lugar: number;
  readonly at: number;
}

export type Fim = "terminou" | "longe" | "tarde" | "saiu";

export class Saidas {
  /** How many places the district offers. */
  readonly lugares: number;
  /** The ask each player has out, if any: one at a time. */
  private readonly asks = new Map<string, Ask>();
  /** When each player asked, in the last hour. */
  private readonly asked = new Map<string, number[]>();
  /** "asker>asked": not again before this moment. */
  private readonly notBefore = new Map<string, number>();
  private readonly out = new Map<string, Saida>();

  constructor(lugares: number) {
    this.lugares = lugares;
  }

  /** The outing a player is on, if any. */
  of(player: string): Saida | null {
    return this.out.get(player) ?? null;
  }

  /** The other of the two. */
  static other(saida: Saida, player: string): string {
    return saida.a === player ? saida.b : saida.a;
  }

  /** `de` asks `para` out to a place. True when the ask stands; why not, otherwise. */
  convidar(de: string, para: string, lugar: number, now: number): true | SairRecusa {
    if (de === para || lugar < 0 || lugar >= this.lugares) return "nao_pode";
    if (this.out.has(de) || this.out.has(para)) return "ocupado";
    if ((this.notBefore.get(`${de}>${para}`) ?? 0) > now) return "cedo";
    const lately = (this.asked.get(de) ?? []).filter((at) => now - at < 3_600_000);
    if (lately.length >= ASKS_AN_HOUR) return "muitos";
    this.asked.set(de, [...lately, now]);
    this.asks.set(de, { para, lugar, at: now });
    return true;
  }

  /** The ask of `de` that `quem` is answering, if it still stands. */
  private standing(quem: string, de: string, now: number): Ask | null {
    const ask = this.asks.get(de);
    return ask && ask.para === quem && now - ask.at <= ASK_LASTS_MS ? ask : null;
  }

  /** "Vamos": the two are out, to the place asked. */
  aceitar(quem: string, de: string, now: number): Saida | SairRecusa {
    const ask = this.standing(quem, de, now);
    if (!ask) return "convite";
    this.asks.delete(de);
    if (this.out.has(quem) || this.out.has(de)) return "ocupado";
    // An ask either had out to someone else is no more.
    this.asks.delete(quem);
    const saida: Saida = { a: de, b: quem, lugar: ask.lugar, since: now, chegou: false, apartSince: null };
    this.out.set(de, saida);
    this.out.set(quem, saida);
    return saida;
  }

  /** "Agora não": nothing more is said, and `de` does not ask `quem` again for a while. */
  recusar(quem: string, de: string, now: number): true | SairRecusa {
    if (!this.standing(quem, de, now)) return "convite";
    this.asks.delete(de);
    this.notBefore.set(`${de}>${quem}`, now + ASK_AGAIN_MS);
    return true;
  }

  /** "Prefiro outro sítio": the ask is answered with an ask back, which is not counted against the hour. */
  outro(quem: string, de: string, lugar: number, now: number): true | SairRecusa {
    if (lugar < 0 || lugar >= this.lugares) return "nao_pode";
    if (!this.standing(quem, de, now)) return "convite";
    this.asks.delete(de);
    this.asks.set(quem, { para: de, lugar, at: now });
    return true;
  }

  /** A player ends the outing they are on, or leaves the street: the outing that ended, if there was one. */
  terminar(player: string): Saida | null {
    const saida = this.out.get(player);
    if (!saida) return null;
    this.out.delete(saida.a);
    this.out.delete(saida.b);
    return saida;
  }

  /** A player has left the street: what they asked, and what was asked of them, is no more. */
  forget(player: string): void {
    this.asks.delete(player);
    for (const [de, ask] of this.asks) if (ask.para === player) this.asks.delete(de);
  }

  /**
   * Time passes. `where` says where a player stands (millimetres), `places` where each place is. Which outings have
   * just arrived, and which are over and why.
   */
  step(now: number, where: (player: string) => { x: number; z: number } | null, places: readonly { readonly x: number; readonly z: number }[]): { chegaram: Saida[]; fim: { saida: Saida; porque: Fim }[] } {
    const chegaram: Saida[] = [];
    const fim: { saida: Saida; porque: Fim }[] = [];
    for (const saida of new Set(this.out.values())) {
      if (now - saida.since > OUTING_MOST_MS) {
        fim.push({ saida, porque: "tarde" });
        continue;
      }
      const a = where(saida.a);
      const b = where(saida.b);
      if (!a || !b) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > APART_MM) {
        saida.apartSince ??= now;
        if (now - saida.apartSince > APART_MS) fim.push({ saida, porque: "longe" });
        continue;
      }
      saida.apartSince = null;
      const place = places[saida.lugar];
      if (!saida.chegou && place && Math.hypot(a.x - place.x, a.z - place.z) <= ARRIVE_MM && Math.hypot(b.x - place.x, b.z - place.z) <= ARRIVE_MM) {
        saida.chegou = true;
        chegaram.push(saida);
      }
    }
    for (const { saida } of fim) this.terminar(saida.a);
    return { chegaram, fim };
  }
}
