// The tables of a channel without a network: who may sit, what a move named by its squares is, what the phones are told.

import { DESCANSO_MS, ESPERA_MS, FALTAS, KOTAS_MS, RAPIDA_MS, VEZ_MS, VEZ_RAPIDA_MS, newDamas, squareAt } from "@nzila/games";
import { decodeMesa } from "@nzila/protocol";
import { describe, expect, test } from "vitest";
import { CONVITES_HORA, CONVITE_MS, MESA_REACH_MM, Mesas, lanceOf, type TablePlace } from "./mesas.ts";

/** A chess table at (10 m, 10 m), seats north and south; a table of Não te irrites at (20 m, 10 m), four round it. */
const tables: TablePlace[] = [
  { jogo: "xadrez", x: 10_000, z: 10_000, seats: [{ x: 10_000, y: 600, z: 9220, yaw: 0 }, { x: 10_000, y: 600, z: 10_780, yaw: 18_000 }] },
  {
    jogo: "ludo",
    x: 20_000,
    z: 10_000,
    seats: [
      { x: 20_000, y: 590, z: 9280, yaw: 0 },
      { x: 20_720, y: 590, z: 10_000, yaw: 27_000 },
      { x: 20_000, y: 590, z: 10_720, yaw: 18_000 },
      { x: 19_280, y: 590, z: 10_000, yaw: 9000 },
    ],
  },
  { jogo: "damas", x: 30_000, z: 10_000, seats: [{ x: 30_000, y: 590, z: 9340, yaw: 0 }, { x: 30_000, y: 590, z: 10_660, yaw: 18_000 }] },
];
const by = (x: number, z: number) => ({ x, y: 0, z, yaw: 0 });
const square = (name: string): number => squareAt(name);

describe("the tables of a channel", () => {
  test("a player beside a seat sits in it; too far, at a seat not there, or at a second table, they do not", () => {
    const mesas = new Mesas(tables, 0, () => 6);
    expect(mesas.count).toBe(3);
    expect(mesas.ask("ana", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 0)).toEqual({ sit: tables[0]!.seats[0] });
    expect(mesas.seatOf("ana")).toEqual({ mesa: 0, lugar: 0 });
    expect(mesas.ask("beto", by(10_000, 10_780 + MESA_REACH_MM + 10), { mesa: 0, pedido: "sentar", lugar: 1 }, 0)).toBe("longe");
    expect(mesas.ask("beto", null, { mesa: 0, pedido: "sentar", lugar: 1 }, 0)).toBe("longe");
    expect(mesas.ask("beto", by(10_000, 11_500), { mesa: 0, pedido: "sentar", lugar: 3 }, 0)).toBe("lugar");
    expect(mesas.ask("beto", by(10_000, 11_500), { mesa: 7, pedido: "sentar", lugar: 0 }, 0)).toBe("lugar");
    expect(mesas.ask("beto", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 0)).toBe("ocupado");
    expect(mesas.ask("ana", by(20_000, 8000), { mesa: 1, pedido: "sentar", lugar: 0 }, 0)).toBe("sentado");
    // Asked from the seat she is in.
    expect(mesas.ask("ana", by(10_000, 9220), { mesa: 0, pedido: "sentar", lugar: 1 }, 0)).toBe("sentado");
    expect(mesas.seatOf("carla")).toBeNull();
    expect(mesas.mesa(9)).toBeNull();
    expect(mesas.placeOf(9)).toBeNull();
  });

  test("a move is looked for among those the rules allow, by its squares; the rest is refused", () => {
    const mesas = new Mesas(tables, 0, () => 6);
    mesas.ask("ana", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 0);
    mesas.ask("beto", by(10_000, 12_000), { mesa: 0, pedido: "sentar", lugar: 1 }, 0);
    expect(mesas.mesa(0)!.fase).toBe("jogo");
    expect(mesas.ask("ana", null, { mesa: 0, pedido: "jogar", casas: [square("e2"), square("e5")] }, 1)).toBe("regras");
    expect(mesas.ask("carla", null, { mesa: 0, pedido: "jogar", casas: [square("e2"), square("e5")] }, 1)).toBe("fora");
    expect(mesas.ask("beto", null, { mesa: 0, pedido: "jogar", casas: [square("e2"), square("e4")] }, 1)).toBe("vez");
    expect(mesas.ask("ana", null, { mesa: 0, pedido: "jogar", casas: [square("e2"), square("e4")] }, 1)).toEqual({ nada: true });
    expect(mesas.versionOf(0)).toBe(mesas.mesa(0)!.versao);
    expect(mesas.mesa(0)!.ultimo).toEqual({ lugar: 0, lance: { jogo: "xadrez", lance: { from: square("e2"), to: square("e4") } } });
    // A throw at a chess table is not one.
    expect(mesas.ask("beto", null, { mesa: 0, pedido: "lancar" }, 2)).toBe("regras");
    expect(mesas.ask("beto", null, { mesa: 0, pedido: "comecar" }, 2)).toBe("fase");
  });

  test("the squares of a move: a pawn that becomes a piece, a run of captures at damas, a piece of Não te irrites with the table's throw", () => {
    const pawn = new Mesas([tables[0]!], 0);
    const chess = pawn.mesa(0)!;
    const promoting = { ...chess, partida: { jogo: "xadrez" as const, estado: { ...chess.partida.estado, board: Array.from({ length: 64 }, (_, n) => (n === 8 ? "P" : n === 4 ? "k" : n === 60 ? "K" : ".")) } } } as typeof chess;
    expect(lanceOf(promoting, [8, 0, 4])).toEqual({ jogo: "xadrez", lance: { from: 8, to: 0, promotion: "n" } });
    expect(lanceOf(promoting, [8, 0])).toBeNull();
    expect(lanceOf(promoting, [8, 0, 1, 5])).toBeNull();
    const damas = new Mesas([tables[2]!], 0).mesa(0)!;
    expect(lanceOf(damas, [41, 32])).toEqual({ jogo: "damas", lance: { path: [41, 32], takes: [] } });
    expect(lanceOf(damas, [41, 32, 25])).toBeNull();
    expect(lanceOf({ ...damas, partida: { jogo: "damas", estado: { ...newDamas(), turn: 1 } } }, [16, 25])).toEqual({ jogo: "damas", lance: { path: [16, 25], takes: [] } });
    const ludo = new Mesas([tables[1]!], 0).mesa(0)!;
    expect(lanceOf(ludo, [0])).toBeNull();
    const thrown = { ...ludo, partida: { ...ludo.partida, dado: 6 } } as typeof ludo;
    expect(lanceOf(thrown, [2])).toEqual({ jogo: "ludo", lance: { piece: 2, from: -1, to: 0 }, dado: 6 });
    expect(lanceOf(thrown, [2, 3])).toBeNull();
    expect(lanceOf({ ...thrown, partida: { ...thrown.partida, dado: 3 } } as typeof ludo, [2])).toBeNull();
  });

  test("Não te irrites: the zone throws the dice, and the move goes with its throw", () => {
    const mesas = new Mesas(tables, 0, () => 6);
    mesas.ask("ana", by(20_000, 8000), { mesa: 1, pedido: "sentar", lugar: 0 }, 0);
    expect(mesas.ask("ana", null, { mesa: 1, pedido: "comecar" }, 1)).toEqual({ nada: true });
    expect(mesas.ask("ana", null, { mesa: 1, pedido: "lancar" }, 2)).toEqual({ nada: true });
    const after = mesas.mesa(1)!;
    expect(after.partida.jogo === "ludo" && after.partida.dado).toBe(6);
    expect(mesas.ask("ana", null, { mesa: 1, pedido: "jogar", casas: [1] }, 3)).toEqual({ nada: true });
    const moved = mesas.mesa(1)!;
    expect(moved.partida.jogo === "ludo" && moved.partida.estado.pieces[0]).toEqual([-1, 0, -1, -1]);
  });

  test("getting up: behind the seat, away from the table; not sitting, refused; a player leaving the street leaves the seat to a kota", () => {
    const mesas = new Mesas(tables, 0);
    expect(mesas.ask("ana", null, { mesa: 0, pedido: "levantar" }, 0)).toBe("fora");
    mesas.ask("ana", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 0);
    expect(mesas.ask("ana", null, { mesa: 0, pedido: "levantar" }, 1)).toEqual({ stand: { x: 10_000, y: 0, z: 9220 - 650, yaw: 0 } });
    expect(mesas.seatOf("ana")).toBeNull();
    // At the table of four, from the seat on the left: to the left.
    mesas.ask("beto", by(21_500, 10_000), { mesa: 1, pedido: "sentar", lugar: 1 }, 2);
    expect(mesas.ask("beto", null, { mesa: 1, pedido: "levantar" }, 3)).toEqual({ stand: { x: 20_720 + 650, y: 0, z: 10_000, yaw: 27_000 } });
    mesas.ask("carla", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 4);
    mesas.leave("carla", 5);
    expect(mesas.seatOf("carla")).toBeNull();
    mesas.leave("nobody", 5);
  });

  test("time passes at every table; a player who lets their turns run out is stood up, with where", () => {
    const mesas = new Mesas(tables, 0, () => 6);
    expect(mesas.step(KOTAS_MS - 1)).toEqual([]);
    mesas.step(KOTAS_MS);
    expect(mesas.mesa(0)!.ultimo?.lugar).toBe(0);
    mesas.ask("ana", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 10_000);
    mesas.ask("ana", null, { mesa: 0, pedido: "comecar" }, 10_000);
    let clock = 10_000;
    let stood: ReturnType<Mesas["step"]> = [];
    for (let n = 0; n < FALTAS * 2 && stood.length === 0; n++) {
      clock += VEZ_MS.xadrez;
      stood = mesas.step(clock);
    }
    expect(stood).toEqual([{ playerId: "ana", stand: { x: 10_000, y: 0, z: 9220 - 650, yaw: 0 } }]);
  });

  test("what the phones are told: whose seat is whose by their number, the time left, the board", () => {
    const mesas = new Mesas(tables, 1000, () => 6);
    mesas.ask("ana", by(10_000, 12_000), { mesa: 0, pedido: "sentar", lugar: 1 }, 1000);
    const entity = (playerId: string): number => (playerId === "ana" ? 42 : 0);
    // Waiting for a second player: the wait's time left.
    const waiting = decodeMesa(mesas.said(0, entity, 6000));
    expect(waiting).toMatchObject({ mesa: 0, fase: "espera", restaMs: ESPERA_MS - 5000, lugares: [{ entidade: 0, guardado: false }, { entidade: 42, guardado: false }] });
    mesas.ask("ana", null, { mesa: 0, pedido: "comecar" }, 7000);
    // A kota plays White: no time is counted for a kota.
    expect(decodeMesa(mesas.said(0, entity, 7500)).restaMs).toBe(0);
    mesas.step(7000 + 1400);
    // Ana's turn: her time.
    expect(decodeMesa(mesas.said(0, entity, 8400 + 10_000)).restaMs).toBe(VEZ_MS.xadrez - 10_000);
    // Long gone: never less than nothing.
    expect(decodeMesa(mesas.said(0, entity, 8400 + VEZ_MS.xadrez * 2)).restaMs).toBe(0);
    // A finished game: the rest's time left.
    const ended = new Mesas([tables[0]!], 0);
    const table = ended.mesa(0)!;
    Object.assign(ended, { mesas: [{ ...table, fase: "fim", desde: 0 }] });
    expect(decodeMesa(ended.said(0, entity, 4000)).restaMs).toBe(DESCANSO_MS - 4000);
  });

  test("a quick game: chosen by the seated player, told to the phones with its time left; shorter turns", () => {
    const mesas = new Mesas(tables, 0, () => 6);
    const entity = (playerId: string): number => (playerId === "ana" ? 42 : 0);
    mesas.ask("ana", by(10_000, 12_000), { mesa: 0, pedido: "sentar", lugar: 1 }, 0);
    // Someone not sitting cannot choose it.
    expect(mesas.ask("beto", null, { mesa: 0, pedido: "rapida", sim: true }, 100)).toBe("fora");
    expect(mesas.ask("ana", null, { mesa: 0, pedido: "rapida", sim: true }, 100)).toEqual({ nada: true });
    expect(decodeMesa(mesas.said(0, entity, 200))).toMatchObject({ rapida: true, fimMs: 0, porTempo: false });
    mesas.ask("ana", null, { mesa: 0, pedido: "comecar" }, 1000);
    mesas.step(1000 + 1400);
    // Ana's turn at a quick game: the quick turn's time, and the game's own.
    const told = decodeMesa(mesas.said(0, entity, 2400 + 5000));
    expect(told.restaMs).toBe(VEZ_RAPIDA_MS.xadrez - 5000);
    expect(told.fimMs).toBe(RAPIDA_MS - 6400);
  });

  test("a game that ends with a player at it is kept to be written down, once; a quick game ends on the zone's clock; kotas alone are not written down", () => {
    // A quick game of 10 seconds here.
    const mesas = new Mesas(tables, 0, () => 6, 10_000);
    mesas.ask("ana", by(10_000, 12_000), { mesa: 0, pedido: "sentar", lugar: 1 }, 0);
    mesas.ask("ana", null, { mesa: 0, pedido: "rapida", sim: true }, 0);
    mesas.ask("ana", null, { mesa: 0, pedido: "comecar" }, 1000);
    expect(mesas.acabadas()).toEqual([]);
    mesas.step(1000 + 10_000);
    const [ended] = mesas.acabadas();
    expect(ended).toMatchObject({ mesa: 0, jogo: "xadrez", rapida: true, porTempo: true });
    // Ana in seat 1, the kota of seat 0 (kota 0, Kota Zeca) in the other; level on the board after a move: a draw.
    expect(ended!.lugares.map((one) => [one.playerId, one.kota])).toEqual([[null, 0], ["ana", 1]]);
    expect(mesas.acabadas()).toEqual([]);
    // The tables of kotas alone play on and end their games: nothing is written down.
    // Played until their first game ends (a loaded gate ran out of time playing on for an hour of the game's clock).
    const alone = new Mesas([tables[2]!], 0, () => 6);
    let at = 0;
    for (; at < 4_000_000 && alone.mesa(0)!.fase !== "fim"; at += 5000) alone.step(at);
    expect(alone.mesa(0)!.fase).toBe("fim");
    alone.step(at + 5000);
    expect(alone.acabadas()).toEqual([]);
  });

  test("an invitation: asked, answered yes, a seat kept for each; the invited sits in theirs from whichever stool", () => {
    const mesas = new Mesas(tables, 0);
    expect(mesas.convidar("ana", "beto", 0, 1000)).toBe(true);
    expect(mesas.aceitar("beto", "ana", 0, 2000)).toBe(true);
    const table = mesas.mesa(0)!;
    expect(table.lugares.map((one) => one.guardado?.para)).toEqual(["ana", "beto"]);
    // Beto walks up to Ana's stool: he is seated in his own.
    expect(mesas.ask("beto", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 3000)).toEqual({ sit: tables[0]!.seats[1] });
    expect(mesas.seatOf("beto")).toEqual({ mesa: 0, lugar: 1 });
    // Someone else cannot take Ana's.
    expect(mesas.ask("carla", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 3000)).toBe("ocupado");
    expect(mesas.ask("ana", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 3000)).toEqual({ sit: tables[0]!.seats[0] });
    expect(mesas.mesa(0)!.fase).toBe("jogo");
  });

  test("an invitation answered no, one never sent, one too late, one to oneself or someone sitting: each said so", () => {
    const mesas = new Mesas(tables, 0);
    expect(mesas.convidar("ana", "ana", 0, 0)).toBe("lugar");
    expect(mesas.convidar("ana", "beto", 9, 0)).toBe("lugar");
    expect(mesas.aceitar("beto", "ana", 0, 0)).toBe("convite");
    expect(mesas.recusar("beto", "ana")).toBe("convite");
    expect(mesas.convidar("ana", "beto", 0, 0)).toBe(true);
    expect(mesas.recusar("beto", "carla")).toBe("convite");
    expect(mesas.recusar("beto", "ana")).toBe(true);
    expect(mesas.aceitar("beto", "ana", 0, 10)).toBe("convite");
    // Too late, or to another table than the one asked.
    mesas.convidar("ana", "beto", 0, 100);
    expect(mesas.aceitar("beto", "ana", 2, 200)).toBe("convite");
    mesas.convidar("ana", "beto", 0, 300);
    expect(mesas.aceitar("beto", "ana", 0, 300 + CONVITE_MS)).toBe("convite");
    // Someone sitting is not invited, and does not invite.
    mesas.ask("carla", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 400);
    expect(mesas.convidar("ana", "carla", 2, 500)).toBe("sentado");
    expect(mesas.convidar("carla", "ana", 2, 500)).toBe("sentado");
    // A table with no room for two.
    expect(mesas.convidar("ana", "beto", 0, 500)).toBe("ocupado");
    // The table filled between the asking and the yes.
    const busy = new Mesas(tables, 0);
    busy.convidar("ana", "beto", 0, 0);
    busy.ask("dino", by(10_000, 8000), { mesa: 0, pedido: "sentar", lugar: 0 }, 1);
    expect(busy.aceitar("beto", "ana", 0, 2)).toBe("ocupado");
  });

  test("six invitations an hour, and no more", () => {
    const mesas = new Mesas(tables, 0);
    for (let n = 0; n < CONVITES_HORA; n++) expect(mesas.convidar("ana", `p${n}`, 1, n * 1000)).toBe(true);
    expect(mesas.convidar("ana", "zeca", 1, 10_000)).toBe("muitos");
    expect(mesas.convidar("ana", "zeca", 1, 3_600_000 + 1)).toBe(true);
    // An answer is not a move: asked of a table as one, it is refused.
    expect(mesas.ask("ana", null, { mesa: 1, pedido: "aceitar", entidade: 3 }, 0)).toBe("convite");
  });
});
