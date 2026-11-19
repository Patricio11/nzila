// The tables of a channel (Task 4B.1): the games the bairro plays in the street, held by the zone. Each table is
// a Mesa (packages/games): this keeps them, answers what players ask of them, lets time pass at them with dice
// the zone rolls, and says how each stands for the phones near it. A move a phone names by its squares is looked
// for among the moves the rules allow: what it takes, and what the dice said, are never the phone's to say.

import { randomInt } from "node:crypto";
import {
  DESCANSO_MS, ESPERA_MS, LUGARES, comecar, escolherRapida, resta, vezMs, kotaDe, jogar, lanceDe, lancar, levantar, lugarDe, lugarGuardado, novaMesa, passo, recusou, reservar, sentar, vezDe,
  type Jogo, type Mesa, type Recusa,
} from "@nzila/games";
import { encodeMesa, type MesaPedido } from "@nzila/protocol";
import { type Place } from "./channel.ts";

/** How near a seat a player must stand to sit in it; and how near a table a phone is told how it stands. Millimetres. */
export const MESA_REACH_MM = 2500;
export const MESA_SEEN_MM = 45_000;
/** How far behind the seat, away from the table, someone who gets up is put. */
const GET_UP_MM = 650;
/** How long an invitation waits for its answer, and how many a player may send in an hour. */
export const CONVITE_MS = 60_000;
export const CONVITES_HORA = 6;
/** The pieces a pawn may become, as a phone names them (1 to 4). */

/** A table of the district, as the zone reads it from the pack: its game, its middle, and its seats in order. */
export interface TablePlace {
  readonly jogo: Jogo;
  readonly x: number;
  readonly z: number;
  readonly seats: readonly Place[];
}

/** What a request did to the player's body: sat them in a seat, stood them up beside one, or neither. */
export type Feito = { readonly sit: Place } | { readonly stand: Place } | { readonly nada: true };

/** Why a table would not: the rules' reasons; too far from the seat; too many invitations; no such invitation. */
export type MesaRecusa = Recusa | "longe" | "muitos" | "convite";

export class Mesas {
  private readonly places: readonly TablePlace[];
  private readonly mesas: Mesa[];
  private readonly dado: () => number;
  /** Invitations waiting for an answer, by who is invited; and when each player sent theirs, for the hour's count. */
  private readonly convites = new Map<string, { de: string; mesa: number; ate: number }>();
  private readonly enviados = new Map<string, number[]>();

  constructor(places: readonly TablePlace[], now: number, dado: () => number = () => randomInt(1, 7)) {
    this.places = places;
    // Each seat has its own kota of the bairro, the same one the phones name (kotaDe).
    this.mesas = places.map((place, mesa) => novaMesa(place.jogo, now, Array.from({ length: LUGARES[place.jogo] }, (_, lugar) => kotaDe(mesa, lugar))));
    this.dado = dado;
  }

  get count(): number {
    return this.mesas.length;
  }

  /** A table as it stands: for the tests and the Estúdio. */
  mesa(index: number): Mesa | null {
    return this.mesas[index] ?? null;
  }

  /** Where a table is. */
  placeOf(index: number): TablePlace | null {
    return this.places[index] ?? null;
  }

  /** The table and seat a player sits in, or null. */
  seatOf(playerId: string): { mesa: number; lugar: number } | null {
    for (const [mesa, one] of this.mesas.entries()) {
      const lugar = lugarDe(one, playerId);
      if (lugar >= 0) return { mesa, lugar };
    }
    return null;
  }

  /** Where someone getting up from a seat is set down: behind it, away from the table. */
  private standingBy(index: number, lugar: number): Place {
    const table = this.places[index]!;
    const seat = table.seats[lugar]!;
    const away = Math.hypot(seat.x - table.x, seat.z - table.z) || 1;
    return { x: Math.round(seat.x + ((seat.x - table.x) / away) * GET_UP_MM), y: 0, z: Math.round(seat.z + ((seat.z - table.z) / away) * GET_UP_MM), yaw: seat.yaw };
  }

  /** A player, standing `at` (or null when they ride), asks something of a table. */
  ask(playerId: string, at: Place | null, pedido: MesaPedido, now: number): Feito | MesaRecusa {
    const mesa = this.mesas[pedido.mesa];
    if (!mesa) return "lugar";
    const index = pedido.mesa;
    let done: Mesa | Recusa;
    if (pedido.pedido === "sentar") {
      // Within reach of the stool they came to; someone a seat is kept for sits in that one, whichever stool it was.
      const asked = this.places[index]!.seats[pedido.lugar];
      if (!asked) return "lugar";
      if (!at || Math.hypot(asked.x - at.x, asked.z - at.z) > MESA_REACH_MM) return "longe";
      const kept = lugarGuardado(mesa, playerId, now);
      const lugar = kept >= 0 ? kept : pedido.lugar;
      const seat = this.places[index]!.seats[lugar]!;
      // One table at a time.
      const elsewhere = this.seatOf(playerId);
      if (elsewhere && elsewhere.mesa !== index) return "sentado";
      done = sentar(mesa, lugar, playerId, now);
      if (recusou(done)) return done;
      this.mesas[index] = done;
      return { sit: seat };
    }
    if (pedido.pedido === "levantar") {
      const lugar = lugarDe(mesa, playerId);
      done = levantar(mesa, playerId, now);
      if (recusou(done)) return done;
      this.mesas[index] = done;
      return { stand: this.standingBy(index, lugar) };
    }
    if (pedido.pedido === "comecar") done = comecar(mesa, playerId, now);
    else if (pedido.pedido === "rapida") done = escolherRapida(mesa, playerId, pedido.sim);
    else if (pedido.pedido === "lancar") done = lancar(mesa, playerId, this.dado(), now);
    else if (pedido.pedido !== "jogar") return "convite";
    else {
      const lance = lanceOf(mesa, pedido.casas);
      if (!lance) return lugarDe(mesa, playerId) < 0 ? "fora" : "regras";
      done = jogar(mesa, playerId, lance, now);
    }
    if (recusou(done)) return done;
    this.mesas[index] = done;
    return { nada: true };
  }

  /**
   * `de` invites `para` to play at a table: one with a seat free for each. Kept a minute for the answer; six in an
   * hour at the most. Neither is to be sitting already.
   */
  convidar(de: string, para: string, mesa: number, now: number): true | MesaRecusa {
    const table = this.mesas[mesa];
    if (!table || de === para) return "lugar";
    if (this.seatOf(de) || this.seatOf(para)) return "sentado";
    if (recusou(reservar(table, [de, para], now))) return "ocupado";
    const sent = (this.enviados.get(de) ?? []).filter((at) => now - at < 3_600_000);
    if (sent.length >= CONVITES_HORA) return "muitos";
    this.enviados.set(de, [...sent, now]);
    this.convites.set(para, { de, mesa, ate: now + CONVITE_MS });
    return true;
  }

  /** `para` accepts the invitation of `de` to that table: a seat is kept for each, ten minutes. */
  aceitar(para: string, de: string, mesa: number, now: number): true | MesaRecusa {
    const convite = this.convites.get(para);
    if (!convite || convite.de !== de || convite.mesa !== mesa || convite.ate <= now) return "convite";
    this.convites.delete(para);
    const kept = reservar(this.mesas[mesa]!, [de, para], now);
    if (recusou(kept)) return kept;
    this.mesas[mesa] = kept;
    return true;
  }

  /** `para` says no to the invitation of `de`. */
  recusar(para: string, de: string): true | MesaRecusa {
    const convite = this.convites.get(para);
    if (!convite || convite.de !== de) return "convite";
    this.convites.delete(para);
    return true;
  }

  /** A player leaves the street: their seat, if they had one, is a kota's. */
  leave(playerId: string, now: number): void {
    const seat = this.seatOf(playerId);
    if (!seat) return;
    this.mesas[seat.mesa] = levantar(this.mesas[seat.mesa]!, playerId, now) as Mesa;
  }

  /**
   * Time passes at every table. Gives back the players whose seat was given to a kota for letting their turns run
   * out, each with where to stand them up.
   */
  step(now: number): { playerId: string; stand: Place }[] {
    const stood: { playerId: string; stand: Place }[] = [];
    for (const [index, before] of this.mesas.entries()) {
      const after = passo(before, now, this.dado);
      if (after === before) continue;
      this.mesas[index] = after;
      for (const [lugar, seat] of before.lugares.entries()) {
        if (seat.jogador !== null && after.lugares[lugar]!.jogador !== seat.jogador) stood.push({ playerId: seat.jogador, stand: this.standingBy(index, lugar) });
      }
    }
    return stood;
  }

  /** The version of a table, which goes up with every change: a phone told an older one is told again. */
  versionOf(index: number): number {
    return this.mesas[index]!.versao;
  }

  /** How a table stands, as the bytes for the phones: who sits where by their number in the channel (0 for a kota). */
  said(index: number, entityOf: (playerId: string) => number, now: number): Uint8Array {
    const mesa = this.mesas[index]!;
    const passed = now - mesa.desde;
    const turn = vezDe(mesa);
    const left = mesa.fase === "espera" ? ESPERA_MS - passed : mesa.fase === "fim" ? DESCANSO_MS - passed : turn !== null && mesa.lugares[turn]!.jogador !== null ? vezMs(mesa) - passed : 0;
    return encodeMesa({
      mesa: index,
      versao: mesa.versao,
      fase: mesa.fase,
      primeiro: mesa.primeiro,
      restaMs: Math.max(0, left),
      rapida: mesa.rapida,
      fimMs: resta(mesa, now) ?? 0,
      porTempo: mesa.porTempo,
      lugares: mesa.lugares.map((lugar) => ({ entidade: lugar.jogador === null ? 0 : entityOf(lugar.jogador), guardado: lugar.jogador === null && lugar.guardado !== null && lugar.guardado.ate > now })),
      partida: mesa.partida,
      ultimo: mesa.ultimo,
    });
  }
}

/** A move named by its squares, found among those the rules allow (lanceDe, packages/games): what the zone plays. */
export const lanceOf = lanceDe;
