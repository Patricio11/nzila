// The tables of a channel (Task 4B.1): the games the bairro plays in the street, held by the zone. Each table is
// a Mesa (packages/games): this keeps them, answers what players ask of them, lets time pass at them with dice
// the zone rolls, and says how each stands for the phones near it. A move a phone names by its squares is looked
// for among the moves the rules allow: what it takes, and what the dice said, are never the phone's to say.

import { randomInt } from "node:crypto";
import {
  DESCANSO_MS, ESPERA_MS, VEZ_MS, comecar, damasMoves, jogar, lancar, levantar, ludoMoves, lugarDe, novaMesa, passo, recusou, sentar, vezDe, xadrezMoves,
  type Jogo, type Lance, type Mesa, type Recusa,
} from "@nzila/games";
import { encodeMesa, type MesaPedido } from "@nzila/protocol";
import { type Place } from "./channel.ts";

/** How near a seat a player must stand to sit in it; and how near a table a phone is told how it stands. Millimetres. */
export const MESA_REACH_MM = 2500;
export const MESA_SEEN_MM = 45_000;
/** How far behind the seat, away from the table, someone who gets up is put. */
const GET_UP_MM = 650;
/** The pieces a pawn may become, as a phone names them (1 to 4). */
const PROMOCOES = [undefined, "q", "r", "b", "n"] as const;

/** A table of the district, as the zone reads it from the pack: its game, its middle, and its seats in order. */
export interface TablePlace {
  readonly jogo: Jogo;
  readonly x: number;
  readonly z: number;
  readonly seats: readonly Place[];
}

/** What a request did to the player's body: sat them in a seat, stood them up beside one, or neither. */
export type Feito = { readonly sit: Place } | { readonly stand: Place } | { readonly nada: true };

/** Why a table would not: the rules' reasons, and "longe": too far from the seat. */
export type MesaRecusa = Recusa | "longe";

export class Mesas {
  private readonly places: readonly TablePlace[];
  private readonly mesas: Mesa[];
  private readonly dado: () => number;

  constructor(places: readonly TablePlace[], now: number, dado: () => number = () => randomInt(1, 7)) {
    this.places = places;
    this.mesas = places.map((place) => novaMesa(place.jogo, now));
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
      const seat = this.places[index]!.seats[pedido.lugar];
      if (!seat) return "lugar";
      if (!at || Math.hypot(seat.x - at.x, seat.z - at.z) > MESA_REACH_MM) return "longe";
      // One table at a time.
      const elsewhere = this.seatOf(playerId);
      if (elsewhere && elsewhere.mesa !== index) return "sentado";
      done = sentar(mesa, pedido.lugar, playerId, now);
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
    else if (pedido.pedido === "lancar") done = lancar(mesa, playerId, this.dado(), now);
    else {
      const lance = lanceOf(mesa, pedido.casas);
      if (!lance) return lugarDe(mesa, playerId) < 0 ? "fora" : "regras";
      done = jogar(mesa, playerId, lance, now);
    }
    if (recusou(done)) return done;
    this.mesas[index] = done;
    return { nada: true };
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
    const left = mesa.fase === "espera" ? ESPERA_MS - passed : mesa.fase === "fim" ? DESCANSO_MS - passed : turn !== null && mesa.lugares[turn]!.jogador !== null ? VEZ_MS[mesa.jogo] - passed : 0;
    return encodeMesa({
      mesa: index,
      versao: mesa.versao,
      fase: mesa.fase,
      primeiro: mesa.primeiro,
      restaMs: Math.max(0, left),
      lugares: mesa.lugares.map((lugar) => ({ entidade: lugar.jogador === null ? 0 : entityOf(lugar.jogador), guardado: lugar.jogador === null && lugar.guardado !== null && lugar.guardado.ate > now })),
      partida: mesa.partida,
      ultimo: mesa.ultimo,
    });
  }
}

/** The move the rules allow that goes by these squares, for the side to play; null when there is none. */
export function lanceOf(mesa: Mesa, casas: readonly number[]): Lance | null {
  const partida = mesa.partida;
  if (partida.jogo === "xadrez") {
    const promotion = PROMOCOES[casas[2] ?? 0];
    const move = xadrezMoves(partida.estado).find((one) => one.from === casas[0] && one.to === casas[1] && one.promotion === promotion);
    return move && casas.length <= 3 ? { jogo: "xadrez", lance: move } : null;
  }
  if (partida.jogo === "damas") {
    const move = damasMoves(partida.estado).find((one) => one.path.length === casas.length && one.path.every((square, n) => square === casas[n]));
    return move ? { jogo: "damas", lance: move } : null;
  }
  if (partida.dado === null || casas.length !== 1) return null;
  const move = ludoMoves(partida.estado, partida.dado).find((one) => one.piece === casas[0]);
  return move ? { jogo: "ludo", lance: move, dado: partida.dado } : null;
}
