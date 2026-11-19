// A table in the street (Task 4B.1): who sits at it, whose turn it is, and what the kotas of the bairro do when a
// seat is nobody's. Pure, like the rules it plays by: the zone holds one of these for each table, hands it the
// time and the dice, and tells the phones near the table what comes out.
//
// How a table lives:
//   - with nobody sitting, two (or four) kotas play among themselves, slowly, for whoever stops to watch;
//   - the first player to sit sets the board up afresh and waits a little for someone else to sit; then, or as
//     soon as they say so, a kota takes the free seat and the game begins;
//   - someone who sits where a kota is playing a player takes the kota's place and the game goes on;
//   - a player whose time for a move runs out has the kota play it for them; three in a row, and the seat is the kota's;
//   - a player who gets up leaves the seat to a kota, who finishes the game for them;
//   - after a game, a short rest, and the next begins with whoever is still sitting, the first side going to the other seat;
//   - a seat can be kept for someone invited, for ten minutes: nobody else sits in it, and no kota starts in their place;
//   - each seat has its own kota of the bairro, each with a character: one who is learning and blunders now and then,
//     one who plays a good game, and the ones the bairro fears, at the boards or at Não te irrites.

import { damasBot, damasMoves, newDamas, playDamas, type Damas, type DamasMove } from "./damas.ts";
import { ludoBot, ludoMoves, newLudo, playLudo, type Ludo, type LudoMove } from "./ludo.ts";
import { newXadrez, playXadrez, xadrezBot, xadrezMoves, type Xadrez, type XadrezMove } from "./xadrez.ts";

export type Jogo = "xadrez" | "damas" | "ludo";
export const JOGOS: readonly Jogo[] = ["xadrez", "damas", "ludo"];
/** Seats at each kind of table. */
export const LUGARES: Readonly<Record<Jogo, number>> = { xadrez: 2, damas: 2, ludo: 4 };

/** How long a player has for each move, by game. */
export const VEZ_MS: Readonly<Record<Jogo, number>> = { xadrez: 90_000, damas: 60_000, ludo: 20_000 };
/** How long a kota thinks with a player at the table; and among kotas alone, slowly enough to be watched. */
export const KOTA_MS = 1_400;
export const KOTAS_MS = 5_000;
/** How long a player alone at a table waits for another before a kota sits down with them. */
export const ESPERA_MS = 20_000;
/** The rest after a game, before the next. */
export const DESCANSO_MS = 10_000;
/** Turns a player lets run out in a row before their seat is given to a kota. */
export const FALTAS = 3;
/** How long a seat is kept for someone invited. */
export const GUARDA_MS = 10 * 60_000;
/**
 * How strong a kota plays. "principiante": a move ahead, and one move in three without thinking; "conhecedor": a
 * couple of moves ahead; "temido": at xadrez the exchanges followed through, at damas five moves ahead, at Não te
 * irrites every throw used as well as it can be. All inside the zone's step: at most some 20 ms a move (F-221).
 */
export type Forca = "principiante" | "conhecedor" | "temido";
/** The kotas of the bairro, by number: who they are at each game, and whether they are a mamã. Names are the phone's words. */
export const KOTAS: readonly { readonly forca: Readonly<Record<Jogo, Forca>>; readonly mulher: boolean }[] = [
  // Kota Zeca, still learning, who takes it well.
  { forca: { xadrez: "principiante", damas: "principiante", ludo: "principiante" }, mulher: false },
  // Kota Mbala, a good game of anything.
  { forca: { xadrez: "conhecedor", damas: "conhecedor", ludo: "conhecedor" }, mulher: false },
  // Mamã Joana, who never loses at Não te irrites.
  { forca: { xadrez: "conhecedor", damas: "conhecedor", ludo: "temido" }, mulher: true },
  // Kota Domingos, feared at the boards.
  { forca: { xadrez: "temido", damas: "temido", ludo: "conhecedor" }, mulher: false },
];
/** Which kota sits at a seat of a table: the same on every phone and in the zone. */
export const kotaDe = (mesa: number, lugar: number): number => (mesa * 2 + lugar) % KOTAS.length;
/** The kota who plays a good game: a table made without its kotas named has them at every seat. */
const MBALA = 1;

export type Partida =
  | { readonly jogo: "xadrez"; readonly estado: Xadrez }
  | { readonly jogo: "damas"; readonly estado: Damas }
  /** `dado`: the throw waiting for its move, or null when the seat to play has yet to throw. */
  | { readonly jogo: "ludo"; readonly estado: Ludo; readonly dado: number | null };

/** A move, as handed in. For Não te irrites, the piece moved with the throw already made (null: none could move). */
export type Lance =
  | { readonly jogo: "xadrez"; readonly lance: XadrezMove }
  | { readonly jogo: "damas"; readonly lance: DamasMove }
  | { readonly jogo: "ludo"; readonly lance: LudoMove | null; readonly dado: number };

export interface Lugar {
  /** The player sitting here, or null: a kota plays this seat. */
  readonly jogador: string | null;
  /** Kept for someone invited, until when. */
  readonly guardado: { readonly para: string; readonly ate: number } | null;
  /** Turns let run out in a row. */
  readonly faltas: number;
}

/** "espera": set up, waiting for players; "jogo": being played; "fim": over, resting before the next. */
export type Fase = "espera" | "jogo" | "fim";

export interface Mesa {
  readonly jogo: Jogo;
  readonly lugares: readonly Lugar[];
  /** The kota of each seat (KOTAS), who plays it when no player does. */
  readonly kotas: readonly number[];
  readonly partida: Partida;
  readonly fase: Fase;
  /** When the phase, or the turn now running, began. */
  readonly desde: number;
  /** The seat that plays first (White, the light pieces, the first throw): the other seat's in the next game. */
  readonly primeiro: number;
  /** The last thing done, by which seat: what every phone shows moving. A throw that moved nothing has `lance` null. */
  readonly ultimo: { readonly lugar: number; readonly lance: Lance } | null;
  /** Counted up with every change: a phone knows what is new. */
  readonly versao: number;
}

/** Why something asked of a table was not done. */
export type Recusa = "lugar" | "ocupado" | "sentado" | "fora" | "fase" | "vez" | "regras";

export const recusou = (feito: Mesa | Recusa): feito is Recusa => typeof feito === "string";

/** A fresh game for the table, with `primeiro` playing first. */
function partidaNova(jogo: Jogo, primeiro: number): Partida {
  if (jogo === "xadrez") return { jogo, estado: newXadrez() };
  if (jogo === "damas") return { jogo, estado: newDamas() };
  return { jogo, estado: { ...newLudo([0, 1, 2, 3]), turn: primeiro }, dado: null };
}

/** A table as the street first has it: kotas playing among themselves. `kotas`, which of them sits at each seat. */
export function novaMesa(jogo: Jogo, agora: number, kotas: readonly number[] = Array.from({ length: LUGARES[jogo] }, () => MBALA)): Mesa {
  const lugares = Array.from({ length: LUGARES[jogo] }, (): Lugar => ({ jogador: null, guardado: null, faltas: 0 }));
  return { jogo, lugares, kotas, partida: partidaNova(jogo, 0), fase: "jogo", desde: agora, primeiro: 0, ultimo: null, versao: 1 };
}

/** Whether the game in the table's hands is over. */
function acabou(partida: Partida): boolean {
  return partida.jogo === "ludo" ? partida.estado.winner !== null : partida.estado.result !== null;
}

/** The seat whose turn it is, while a game is being played. */
export function vezDe(mesa: Mesa): number | null {
  if (mesa.fase !== "jogo") return null;
  const partida = mesa.partida;
  if (partida.jogo === "ludo") return partida.estado.turn;
  const first = partida.jogo === "xadrez" ? partida.estado.turn === "w" : partida.estado.turn === 0;
  return first ? mesa.primeiro : 1 - mesa.primeiro;
}

/** The seat a player sits in, or -1. */
export function lugarDe(mesa: Mesa, jogador: string): number {
  return mesa.lugares.findIndex((lugar) => lugar.jogador === jogador);
}

/** Whether a player is sitting at the table. */
const comGente = (lugares: readonly Lugar[]): boolean => lugares.some((lugar) => lugar.jogador !== null);

/** Whether a seat is kept for someone other than this player, now. */
const guardadoPara = (lugar: Lugar, jogador: string, agora: number): boolean => lugar.guardado !== null && lugar.guardado.ate > agora && lugar.guardado.para !== jogador;

/** The table with a change made: counted, and the turn's clock started again. */
const mudou = (mesa: Mesa, mudanca: Partial<Mesa>, agora: number): Mesa => ({ ...mesa, ...mudanca, desde: agora, versao: mesa.versao + 1 });

/** A move handed in for the seat to play, by the rules; the game over when it ends it. */
function aplicar(mesa: Mesa, lugar: number, lance: Lance, agora: number): Mesa {
  const partida = mesa.partida;
  let seguinte: Partida;
  if (partida.jogo === "xadrez" && lance.jogo === "xadrez") seguinte = { jogo: "xadrez", estado: playXadrez(partida.estado, lance.lance) };
  else if (partida.jogo === "damas" && lance.jogo === "damas") seguinte = { jogo: "damas", estado: playDamas(partida.estado, lance.lance) };
  else if (partida.jogo === "ludo" && lance.jogo === "ludo") seguinte = { jogo: "ludo", estado: playLudo(partida.estado, lance.dado, lance.lance), dado: null };
  else throw new Error("Mesa: a move for another game");
  return mudou(mesa, { partida: seguinte, ultimo: { lugar, lance }, ...(acabou(seguinte) ? { fase: "fim" as const } : {}) }, agora);
}

/** A throw of the dice, for the seat to play; with nothing it can move, the turn is played out at once. */
function lancarPor(mesa: Mesa, lugar: number, dado: number, agora: number): Mesa {
  const partida = mesa.partida as Extract<Partida, { jogo: "ludo" }>;
  if (ludoMoves(partida.estado, dado).length === 0) return aplicar(mesa, lugar, { jogo: "ludo", lance: null, dado }, agora);
  return mudou(mesa, { partida: { ...partida, dado } }, agora);
}

/** One of a list, chosen by the dice the zone throws: the table stays pure, and a game can be played again from them. */
const aoCalhas = <T>(list: readonly T[], dado: () => number): T => list[(dado() * 7 + dado()) % list.length]!;

/**
 * What a kota does with the seat to play, as strong as that kota is: a move by the rules, or for Não te irrites a
 * throw, then the move. A beginner plays one move in three without thinking (a throw of 1 or 2 says so).
 */
function kotaJoga(mesa: Mesa, lugar: number, dado: () => number, agora: number): Mesa {
  const partida = mesa.partida;
  const forca = KOTAS[mesa.kotas[lugar]!]!.forca[mesa.jogo];
  const distraido = (): boolean => forca === "principiante" && dado() <= 2;
  if (partida.jogo === "xadrez") {
    const lance = distraido() ? aoCalhas(xadrezMoves(partida.estado), dado) : xadrezBot(partida.estado, forca === "principiante" ? 1 : 2, forca === "temido" ? 4 : 0)!;
    return aplicar(mesa, lugar, { jogo: "xadrez", lance }, agora);
  }
  if (partida.jogo === "damas") {
    const lance = distraido() ? aoCalhas(damasMoves(partida.estado), dado) : damasBot(partida.estado, forca === "principiante" ? 1 : forca === "temido" ? 5 : 3)!;
    return aplicar(mesa, lugar, { jogo: "damas", lance }, agora);
  }
  if (partida.dado === null) return lancarPor(mesa, lugar, dado(), agora);
  const moves = ludoMoves(partida.estado, partida.dado);
  const lance = distraido() ? aoCalhas(moves, dado) : ludoBot(partida.estado, partida.dado);
  return aplicar(mesa, lugar, { jogo: "ludo", lance, dado: partida.dado }, agora);
}

/**
 * A player sits down. At a table of kotas alone, the board is set up afresh and the table waits for others; where a
 * kota plays against players, the player takes the kota's place and the game goes on; while a game ends, they
 * sit for the next.
 */
export function sentar(mesa: Mesa, lugar: number, jogador: string, agora: number): Mesa | Recusa {
  const seat = mesa.lugares[lugar];
  if (!seat) return "lugar";
  if (lugarDe(mesa, jogador) >= 0) return "sentado";
  if (seat.jogador !== null || guardadoPara(seat, jogador, agora)) return "ocupado";
  const lugares = mesa.lugares.map((one, n): Lugar => (n === lugar ? { jogador, guardado: null, faltas: 0 } : one));
  if (!comGente(mesa.lugares)) return mudou(mesa, { lugares, partida: partidaNova(mesa.jogo, mesa.primeiro), fase: "espera", ultimo: null }, agora);
  // Everyone the table holds is sitting: no need to wait.
  const cheia = mesa.fase === "espera" && lugares.every((one) => one.jogador !== null);
  return mudou(mesa, { lugares, ...(cheia ? { fase: "jogo" as const } : {}) }, mesa.fase === "jogo" ? mesa.desde : agora);
}

/** A player gets up: a kota takes the seat and plays on. With nobody left, the kotas play among themselves. */
export function levantar(mesa: Mesa, jogador: string, agora: number): Mesa | Recusa {
  const lugar = lugarDe(mesa, jogador);
  if (lugar < 0) return "fora";
  const lugares = mesa.lugares.map((one, n): Lugar => (n === lugar ? { jogador: null, guardado: null, faltas: 0 } : one));
  const fase = mesa.fase === "espera" && !comGente(lugares) ? "jogo" : mesa.fase;
  return mudou(mesa, { lugares, fase }, mesa.fase === "jogo" ? mesa.desde : agora);
}

/** A seated player says to begin now: kotas take the free seats. */
export function comecar(mesa: Mesa, jogador: string, agora: number): Mesa | Recusa {
  if (lugarDe(mesa, jogador) < 0) return "fora";
  if (mesa.fase !== "espera") return "fase";
  return mudou(mesa, { fase: "jogo", lugares: mesa.lugares.map((one) => (one.jogador === null ? { ...one, guardado: null } : one)) }, agora);
}

/** A seated player keeps a free seat for someone they invite, for GUARDA_MS. */
export function guardar(mesa: Mesa, jogador: string, lugar: number, para: string, agora: number): Mesa | Recusa {
  const seat = mesa.lugares[lugar];
  if (!seat) return "lugar";
  if (lugarDe(mesa, jogador) < 0) return "fora";
  if (seat.jogador !== null || guardadoPara(seat, para, agora)) return "ocupado";
  const lugares = mesa.lugares.map((one, n): Lugar => (n === lugar ? { ...one, guardado: { para, ate: agora + GUARDA_MS } } : one));
  return { ...mesa, lugares, versao: mesa.versao + 1 };
}

/**
 * Seats kept for players who have agreed to play together (an invitation accepted): one for each, free ones, for
 * GUARDA_MS. Nobody else sits in them; the kotas play on until one of them sits, and the game waits for the other.
 */
export function reservar(mesa: Mesa, jogadores: readonly string[], agora: number): Mesa | Recusa {
  if (jogadores.some((jogador) => lugarDe(mesa, jogador) >= 0)) return "sentado";
  const livres = mesa.lugares.flatMap((one, n) => (one.jogador === null && (one.guardado === null || one.guardado.ate <= agora) ? [n] : []));
  if (livres.length < jogadores.length) return "ocupado";
  const lugares = mesa.lugares.map((one, n): Lugar => {
    const para = jogadores[livres.indexOf(n)];
    return para === undefined ? one : { ...one, guardado: { para, ate: agora + GUARDA_MS } };
  });
  return { ...mesa, lugares, versao: mesa.versao + 1 };
}

/** The seat kept for a player at a table, now, or -1. */
export function lugarGuardado(mesa: Mesa, jogador: string, agora: number): number {
  return mesa.lugares.findIndex((one) => one.jogador === null && one.guardado !== null && one.guardado.para === jogador && one.guardado.ate > agora);
}

/** A seated player whose turn it is makes a move. */
export function jogar(mesa: Mesa, jogador: string, lance: Lance, agora: number): Mesa | Recusa {
  const lugar = lugarDe(mesa, jogador);
  if (lugar < 0) return "fora";
  if (mesa.fase !== "jogo") return "fase";
  if (vezDe(mesa) !== lugar) return "vez";
  const partida = mesa.partida;
  // Não te irrites: the move goes with the throw the table made, never with one the phone says.
  if (partida.jogo === "ludo" && (lance.jogo !== "ludo" || partida.dado === null || lance.dado !== partida.dado)) return "regras";
  try {
    return descansa(aplicar(mesa, lugar, lance, agora), lugar);
  } catch {
    return "regras";
  }
}

/** A seated player of Não te irrites throws the dice; the table rolls them (`dado`, 1 to 6). */
export function lancar(mesa: Mesa, jogador: string, dado: number, agora: number): Mesa | Recusa {
  const lugar = lugarDe(mesa, jogador);
  if (lugar < 0) return "fora";
  if (mesa.fase !== "jogo") return "fase";
  if (vezDe(mesa) !== lugar) return "vez";
  if (mesa.partida.jogo !== "ludo" || mesa.partida.dado !== null) return "regras";
  return descansa(lancarPor(mesa, lugar, dado, agora), lugar);
}

/** A player who has played is no longer counted as letting turns run out. */
function descansa(mesa: Mesa, lugar: number): Mesa {
  return { ...mesa, lugares: mesa.lugares.map((one, n) => (n === lugar ? { ...one, faltas: 0 } : one)) };
}

/**
 * Time passes at the table: the wait ends, a kota plays its turn, a player's time runs out, the rest after a game
 * ends and the next begins. `dado` throws the dice (1 to 6) when a kota or a late player needs a throw. Gives back
 * the same table when nothing happened.
 */
export function passo(mesa: Mesa, agora: number, dado: () => number): Mesa {
  const passou = agora - mesa.desde;
  if (mesa.fase === "espera") {
    // A seat kept for someone invited holds the game until they come or the keeping runs out.
    const guardando = mesa.lugares.some((one) => one.jogador === null && one.guardado !== null && one.guardado.ate > agora);
    return passou >= ESPERA_MS && !guardando ? mudou(mesa, { fase: "jogo" }, agora) : mesa;
  }
  if (mesa.fase === "fim") {
    if (passou < DESCANSO_MS) return mesa;
    const primeiro = (mesa.primeiro + 1) % mesa.lugares.length;
    return mudou(mesa, { partida: partidaNova(mesa.jogo, primeiro), primeiro, fase: "jogo", ultimo: null }, agora);
  }
  const lugar = vezDe(mesa)!;
  const seat = mesa.lugares[lugar]!;
  if (seat.jogador === null) return passou >= (comGente(mesa.lugares) ? KOTA_MS : KOTAS_MS) ? kotaJoga(mesa, lugar, dado, agora) : mesa;
  if (passou < VEZ_MS[mesa.jogo]) return mesa;
  // The player's time is up: the kota beside them plays it, throw and move.
  let feito = kotaJoga(mesa, lugar, dado, agora);
  if (feito.partida.jogo === "ludo" && feito.partida.dado !== null) feito = kotaJoga(feito, lugar, dado, agora);
  const faltas = seat.faltas + 1;
  const lugares = feito.lugares.map((one, n): Lugar => (n !== lugar ? one : faltas >= FALTAS ? { jogador: null, guardado: null, faltas: 0 } : { ...one, faltas }));
  return { ...feito, lugares };
}
