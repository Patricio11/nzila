// A table game, as the zone tells the phones near the table (Task 4B.1): who sits where, whose turn, how long it
// has left, the board, and the last thing done. Sent when it changes, and to whoever comes near. The phone
// draws it and works out which moves to light up; the zone alone decides what is played.
//
// What a phone asks of a table (sit, get up, begin, a move, a throw) is in messages.ts with the other things a
// client says: a move is the squares the piece goes by, never what it takes or what the dice say.

import type { Fase, Lance, Mesa, Partida } from "@nzila/games";
import { MSG } from "./messages.ts";
import { ProtocolError, Reader, Writer } from "./wire.ts";

/** How many seats a table has at most, and how many squares a run of captures at damas may pass through. */
const LUGARES_MAX = 4;
const CAMINHO_MAX = 16;
const FASES: readonly Fase[] = ["espera", "jogo", "fim"];
/** A chess piece on the wire: its place in this text (0 is an empty square). */
const PECAS = ".PNBRQKpnbrqk";
const PROMOCOES = ["", "q", "r", "b", "n"] as const;
const ROQUES = "KQkq";

export interface MesaDita {
  /** The table's place in the district's list of tables. */
  readonly mesa: number;
  readonly versao: number;
  readonly fase: Fase;
  readonly primeiro: number;
  /** What the turn now running has left, in milliseconds; 0 when a kota plays it, or none runs. */
  readonly restaMs: number;
  /** Who sits in each seat, by entity (0: a kota of the bairro), and whether a free seat is kept for someone. */
  readonly lugares: readonly { readonly entidade: number; readonly guardado: boolean }[];
  readonly partida: Partida;
  readonly ultimo: Mesa["ultimo"];
}

const resultado = (value: string | number | null, sides: readonly (string | number)[]): number => (value === null ? 0 : value === "empate" ? 3 : sides.indexOf(value) + 1);

export function encodeMesa(m: MesaDita): Uint8Array {
  const w = new Writer().u8(MSG.MESA).uint(m.mesa).uint(m.versao).u8(FASES.indexOf(m.fase)).u8(m.primeiro).uint(Math.max(0, Math.round(m.restaMs))).u8(m.lugares.length);
  for (const lugar of m.lugares) w.uint(lugar.entidade).bool(lugar.guardado);
  const partida = m.partida;
  if (partida.jogo === "xadrez") {
    const game = partida.estado;
    w.u8(0);
    for (const piece of game.board) w.u8(PECAS.indexOf(piece));
    let roques = 0;
    for (const [n, letter] of [...ROQUES].entries()) if (game.castling.includes(letter)) roques += 1 << n;
    w.bool(game.turn === "b").u8(roques).u8(game.enPassant < 0 ? 64 : game.enPassant).uint(game.quiet).u8(resultado(game.result, ["w", "b"]));
  } else if (partida.jogo === "damas") {
    const game = partida.estado;
    w.u8(1);
    for (const square of game.board) w.u8(square + 2);
    w.u8(game.turn).uint(game.quiet).u8(resultado(game.result, [0, 1]));
  } else {
    const game = partida.estado;
    w.u8(2);
    for (const pieces of game.pieces) for (const position of pieces) w.u8(position + 1);
    w.u8(game.turn).u8(game.tries).u8(game.winner === null ? 0 : game.winner + 1).u8(partida.dado ?? 0);
  }
  const ultimo = m.ultimo;
  w.bool(ultimo !== null);
  if (ultimo) {
    const lance = ultimo.lance;
    w.u8(ultimo.lugar);
    if (lance.jogo === "xadrez") w.u8(lance.lance.from).u8(lance.lance.to).u8(PROMOCOES.indexOf(lance.lance.promotion ?? ""));
    else if (lance.jogo === "damas") {
      w.u8(lance.lance.path.length);
      for (const square of lance.lance.path) w.u8(square);
      w.u8(lance.lance.takes.length);
      for (const square of lance.lance.takes) w.u8(square);
    } else {
      const move = lance.lance;
      w.u8(lance.dado).bool(move !== null);
      if (move) {
        w.u8(move.piece).u8(move.from + 1).u8(move.to + 1).bool(move.sends !== undefined);
        if (move.sends) w.u8(move.sends.seat).u8(move.sends.piece);
      }
    }
  }
  return w.finish();
}

/** A number on the wire that must be one of the first `count`. */
function oneOf(r: Reader, count: number, what: string): number {
  const value = r.u8();
  if (value >= count) throw new ProtocolError("malformed", what);
  return value;
}

/** A list of squares: its length, at most `most`, then each. */
function squares(r: Reader, most: number): number[] {
  const count = r.u8();
  if (count > most) throw new ProtocolError("too_long", "squares");
  return Array.from({ length: count }, () => oneOf(r, 64, "square"));
}

/** A table as the zone told it. Throws ProtocolError on anything that is not one. */
export function decodeMesa(bytes: Uint8Array): MesaDita {
  const r = new Reader(bytes);
  if (r.u8() !== MSG.MESA) throw new ProtocolError("unknown_type", "not a table");
  const mesa = r.uint();
  const versao = r.uint();
  const fase = FASES[oneOf(r, FASES.length, "phase")]!;
  const primeiro = oneOf(r, LUGARES_MAX, "first seat");
  const restaMs = r.uint();
  const count = r.u8();
  if (count < 2 || count > LUGARES_MAX) throw new ProtocolError("malformed", "seats");
  const lugares = Array.from({ length: count }, () => ({ entidade: r.uint(), guardado: r.bool() }));
  const jogo = oneOf(r, 3, "game");
  let partida: Partida;
  if (jogo === 0) {
    const board = Array.from({ length: 64 }, () => PECAS[oneOf(r, PECAS.length, "piece")]!);
    const turn = r.bool() ? "b" : "w";
    const roques = r.u8();
    const passant = oneOf(r, 65, "en passant");
    const quiet = r.uint();
    const result = [null, "w", "b", "empate"][oneOf(r, 4, "result")] as "w" | "b" | "empate" | null;
    partida = { jogo: "xadrez", estado: { board, turn, castling: [...ROQUES].filter((_, n) => (roques & (1 << n)) !== 0).join(""), enPassant: passant === 64 ? -1 : passant, quiet, seen: [], result } };
  } else if (jogo === 1) {
    const board = Array.from({ length: 64 }, () => (oneOf(r, 5, "square") - 2) as -2 | -1 | 0 | 1 | 2);
    const turn = oneOf(r, 2, "turn") as 0 | 1;
    const quiet = r.uint();
    const result = [null, 0, 1, "empate"][oneOf(r, 4, "result")] as 0 | 1 | "empate" | null;
    partida = { jogo: "damas", estado: { board, turn, quiet, result } };
  } else {
    if (count !== 4) throw new ProtocolError("malformed", "seats");
    const pieces = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => oneOf(r, 45, "position") - 1));
    const turn = oneOf(r, 4, "turn");
    const tries = oneOf(r, 4, "tries");
    const winner = oneOf(r, 5, "winner");
    const dado = oneOf(r, 7, "throw");
    partida = { jogo: "ludo", estado: { colours: [0, 1, 2, 3], pieces, turn, tries, winner: winner === 0 ? null : winner - 1 }, dado: dado === 0 ? null : dado };
  }
  let ultimo: Mesa["ultimo"] = null;
  if (r.bool()) {
    const lugar = oneOf(r, count, "seat");
    let lance: Lance;
    if (jogo === 0) {
      const from = oneOf(r, 64, "square");
      const to = oneOf(r, 64, "square");
      const promotion = PROMOCOES[oneOf(r, PROMOCOES.length, "promotion")];
      lance = { jogo: "xadrez", lance: promotion ? { from, to, promotion } : { from, to } };
    } else if (jogo === 1) {
      const path = squares(r, CAMINHO_MAX);
      lance = { jogo: "damas", lance: { path, takes: squares(r, CAMINHO_MAX) } };
    } else {
      const dado = oneOf(r, 7, "throw");
      let move = null;
      if (r.bool()) {
        const piece = oneOf(r, 4, "piece");
        const from = oneOf(r, 45, "position") - 1;
        const to = oneOf(r, 45, "position") - 1;
        move = r.bool() ? { piece, from, to, sends: { seat: oneOf(r, 4, "seat"), piece: oneOf(r, 4, "piece") } } : { piece, from, to };
      }
      lance = { jogo: "ludo", lance: move, dado };
    }
    ultimo = { lugar, lance };
  }
  return { mesa, versao, fase, primeiro, restaMs, lugares, partida, ultimo };
}
