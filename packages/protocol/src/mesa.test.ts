import { describe, expect, test } from "vitest";
import { fromFen, newDamas, newLudo, newXadrez, squareAt } from "@nzila/games";
import { decodeMesa, encodeMesa, type MesaDita } from "./mesa.ts";
import { MSG, decodeClientMessage, decodeZoneMessage, encodeMesaPedido } from "./messages.ts";
import { ProtocolError } from "./wire.ts";

const base = { mesa: 2, versao: 41, fase: "jogo" as const, primeiro: 1, restaMs: 59_400, rapida: false, fimMs: 0, porTempo: false, ultimo: null };
const two = [{ entidade: 7, guardado: false }, { entidade: 0, guardado: true }];
const four = [...two, { entidade: 0, guardado: false }, { entidade: 12, guardado: false }];
const round = (m: MesaDita): MesaDita => decodeMesa(encodeMesa(m));

describe("a table on the wire", () => {
  test("xadrez: the board, whose move, castling, en passant, the count of quiet moves, the result", () => {
    const game = fromFen("r3k2r/8/8/3pP3/8/8/8/R3K2R w Kq d6 7 30");
    const said: MesaDita = { ...base, lugares: two, partida: { jogo: "xadrez", estado: game }, ultimo: { lugar: 1, lance: { jogo: "xadrez", lance: { from: squareAt("d7"), to: squareAt("d5") } } } };
    const back = round(said);
    expect(back).toEqual({ ...said, partida: { jogo: "xadrez", estado: { ...game, seen: [] } } });
    // Over, Black having won, with a promotion the last thing done.
    const won = round({ ...said, fase: "fim", partida: { jogo: "xadrez", estado: { ...newXadrez(), turn: "b", castling: "", enPassant: -1, result: "b" } }, ultimo: { lugar: 0, lance: { jogo: "xadrez", lance: { from: 8, to: 0, promotion: "n" } } } });
    expect(won.partida.jogo === "xadrez" && [won.partida.estado.turn, won.partida.estado.castling, won.partida.estado.enPassant, won.partida.estado.result]).toEqual(["b", "", -1, "b"]);
    expect(won.ultimo).toEqual({ lugar: 0, lance: { jogo: "xadrez", lance: { from: 8, to: 0, promotion: "n" } } });
    expect(round({ ...said, partida: { jogo: "xadrez", estado: { ...newXadrez(), result: "empate" } } }).partida).toMatchObject({ estado: { result: "empate" } });
    expect(round({ ...said, partida: { jogo: "xadrez", estado: { ...newXadrez(), result: "w" } } }).partida).toMatchObject({ estado: { result: "w" } });
  });

  test("damas: the board, whose move, the quiet count, a run of captures, and each result", () => {
    const said: MesaDita = { ...base, fase: "espera", lugares: two, partida: { jogo: "damas", estado: { ...newDamas(), turn: 1, quiet: 3 } }, ultimo: { lugar: 0, lance: { jogo: "damas", lance: { path: [49, 35, 21], takes: [42, 28] } } } };
    expect(round(said)).toEqual(said);
    for (const result of [0, 1, "empate"] as const) expect(round({ ...said, partida: { jogo: "damas", estado: { ...newDamas(), result } } }).partida).toMatchObject({ estado: { result } });
  });

  test("Não te irrites: the pieces, whose throw, tries, the winner, the throw waiting, and a piece sent home", () => {
    const estado = { ...newLudo([0, 1, 2, 3]), pieces: [[-1, 0, 43, 12], [-1, -1, -1, -1], [5, 6, 7, 39], [40, 41, 42, 43]], turn: 2, tries: 1 };
    const said: MesaDita = { ...base, lugares: four, partida: { jogo: "ludo", estado, dado: 4 }, ultimo: { lugar: 3, lance: { jogo: "ludo", lance: { piece: 1, from: 3, to: 9, sends: { seat: 0, piece: 2 } }, dado: 6 } } };
    expect(round(said)).toEqual(said);
    const quiet: MesaDita = { ...said, partida: { jogo: "ludo", estado: { ...estado, winner: 3 }, dado: null }, ultimo: { lugar: 2, lance: { jogo: "ludo", lance: null, dado: 2 } } };
    expect(round(quiet)).toEqual(quiet);
    const plain: MesaDita = { ...said, ultimo: { lugar: 2, lance: { jogo: "ludo", lance: { piece: 0, from: -1, to: 0 }, dado: 6 } } };
    expect(round(plain)).toEqual(plain);
  });

  test("a quick game: chosen, its time left, and a game ended by the clock", () => {
    const quick: MesaDita = { ...base, lugares: two, rapida: true, fimMs: 151_200, partida: { jogo: "damas", estado: newDamas() } };
    expect(round(quick)).toEqual(quick);
    const over: MesaDita = { ...quick, fase: "fim", fimMs: 0, porTempo: true, partida: { jogo: "damas", estado: { ...newDamas(), result: 0 } } };
    expect(round(over)).toMatchObject({ rapida: true, fimMs: 0, porTempo: true, fase: "fim" });
  });

  test("a table arrives at the phone as its bytes, for the code that draws tables to read", () => {
    const bytes = encodeMesa({ ...base, lugares: two, partida: { jogo: "damas", estado: newDamas() } });
    const message = decodeZoneMessage(bytes);
    expect(message.type).toBe("mesa");
    expect(message.type === "mesa" && message.bytes).toBe(bytes);
    // A board just set up: nothing done on it yet.
    expect(decodeMesa(bytes).ultimo).toBeNull();
  });

  test("whatever is not a table is refused, and nothing else is thrown", () => {
    const good = encodeMesa({ ...base, lugares: four, partida: { jogo: "ludo", estado: newLudo([0, 1, 2, 3]), dado: null }, ultimo: { lugar: 1, lance: { jogo: "ludo", lance: null, dado: 3 } } });
    const bad = (edit: (bytes: Uint8Array) => Uint8Array): unknown => {
      try {
        decodeMesa(edit(good.slice()));
        return null;
      } catch (error) {
        return error;
      }
    };
    expect(bad((b) => b.subarray(0, b.length - 3))).toBeInstanceOf(ProtocolError);
    expect(bad((b) => ((b[0] = MSG.EVENT), b))).toMatchObject({ code: "unknown_type" });
    // The phase byte (after the type, the table, the version: 41 fits one byte).
    expect(bad((b) => ((b[3] = 9), b))).toMatchObject({ code: "malformed" });
    // Too few seats; too many. (After the turn's time: whether quick, its time left, whether it ended by the clock.)
    const seats = 4 + 1 + 3 + 3;
    expect(bad((b) => ((b[seats] = 1), b))).toMatchObject({ code: "malformed" });
    expect(bad((b) => ((b[seats] = 5), b))).toMatchObject({ code: "malformed" });
    // Não te irrites with two seats.
    const ludoTwo = encodeMesa({ ...base, lugares: two, partida: { jogo: "damas", estado: newDamas() } });
    const changed = ludoTwo.slice();
    changed[seats + 1 + 2 + 2] = 2;
    expect(() => decodeMesa(changed)).toThrow(ProtocolError);
    // A run of captures longer than any can be.
    const run = encodeMesa({ ...base, lugares: two, partida: { jogo: "damas", estado: newDamas() }, ultimo: { lugar: 0, lance: { jogo: "damas", lance: { path: [49, 35], takes: [42] } } } });
    const long = run.slice();
    // The path's length: the last bytes are the seat, the length, two squares, the takes' length and one square.
    long[long.length - 5] = 40;
    expect(() => decodeMesa(long)).toThrow(/too_long/);
  });
});

describe("what a player asks of a table", () => {
  test("sit, get up, begin, a move by its squares, a throw, a quick game: each read back as it was asked", () => {
    const asked = [
      { mesa: 3, pedido: "sentar" as const, lugar: 2 },
      { mesa: 3, pedido: "levantar" as const },
      { mesa: 0, pedido: "comecar" as const },
      { mesa: 1, pedido: "jogar" as const, casas: [52, 36, 0] },
      { mesa: 1, pedido: "lancar" as const },
      { mesa: 2, pedido: "convidar" as const, entidade: 41 },
      { mesa: 2, pedido: "aceitar" as const, entidade: 7 },
      { mesa: 2, pedido: "recusar" as const, entidade: 300 },
      { mesa: 1, pedido: "rapida" as const, sim: true },
      { mesa: 1, pedido: "rapida" as const, sim: false },
    ];
    for (const one of asked) expect(decodeClientMessage(encodeMesaPedido(one))).toEqual({ type: "mesa", ...one });
  });

  test("a request that is not one, a seat that is not, a square off the board, too many squares: refused", () => {
    expect(() => decodeClientMessage(new Uint8Array([MSG.MESA_PEDIDO, 0, 10]))).toThrow(ProtocolError);
    expect(() => decodeClientMessage(new Uint8Array([MSG.MESA_PEDIDO, 0, 0]))).toThrow(ProtocolError);
    expect(() => decodeClientMessage(new Uint8Array([MSG.MESA_PEDIDO, 0, 1, 4]))).toThrow(/too_long/);
    expect(() => decodeClientMessage(new Uint8Array([MSG.MESA_PEDIDO, 0, 4, 2, 12, 64]))).toThrow(/too_long/);
    expect(() => decodeClientMessage(new Uint8Array([MSG.MESA_PEDIDO, 0, 4, 17]))).toThrow(/too_long/);
    expect(() => encodeMesaPedido({ mesa: 0, pedido: "jogar", casas: Array.from({ length: 17 }, () => 1) })).toThrow(RangeError);
  });
});
