import { describe, expect, test } from "vitest";
import { AT_HOME, LAST, TRACK, ludoBot, ludoMoves, newLudo, playLudo, squareOf, type Ludo } from "./ludo.ts";

/** A game with the pieces placed by hand. */
const placed = (pieces: number[][], turn = 0, colours = [0, 1, 2, 3].slice(0, pieces.length)): Ludo => ({ ...newLudo(colours), pieces, turn });

describe("Não te irrites", () => {
  test("two to four seats of different colours, all pieces at home", () => {
    const game = newLudo([0, 2]);
    expect(game.pieces).toEqual([[-1, -1, -1, -1], [-1, -1, -1, -1]]);
    expect(game).toMatchObject({ turn: 0, tries: 3, winner: null });
    for (const bad of [[0], [0, 0], [0, 1, 2, 3, 0], [0, 4], [0, 1.5]]) expect(() => newLudo(bad)).toThrow(/two to four/);
  });

  test("all at home: three throws to make a 6, then the turn passes", () => {
    let game = newLudo([0, 1]);
    expect(ludoMoves(game, 3)).toEqual([]);
    game = playLudo(game, 3, null);
    expect(game).toMatchObject({ turn: 0, tries: 2 });
    game = playLudo(playLudo(game, 2, null), 5, null);
    expect(game).toMatchObject({ turn: 1, tries: 3 });
  });

  test("a 6 brings a piece out onto its start, must be used so when it can, and throws again", () => {
    const game = placed([[AT_HOME, AT_HOME, 10, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    const moves = ludoMoves(game, 6);
    expect(moves.every((move) => move.from === AT_HOME && move.to === 0)).toBe(true);
    expect(moves).toHaveLength(3);
    const after = playLudo(game, 6, moves[0]!);
    expect(after.pieces[0]).toEqual([0, AT_HOME, 10, AT_HOME]);
    expect(after.turn).toBe(0);
    // With its start held by its own piece and others still at home, the piece on the start moves on: the start is
    // kept clear (it had been free to move another piece instead: F-222).
    expect(ludoMoves(after, 6).map((move) => move.piece)).toEqual([0]);
  });

  test("landing on someone sends them home; never onto one's own", () => {
    // Seat 0 at its square 3 (board 3); seat 1 (colour 1, start at board 10) at its square 35 (board 5).
    const game = placed([[3, 1, AT_HOME, AT_HOME], [35, AT_HOME, AT_HOME, AT_HOME]]);
    const moves = ludoMoves(game, 2);
    expect(moves.find((move) => move.piece === 0)).toEqual({ piece: 0, from: 3, to: 5, sends: { seat: 1, piece: 0 } });
    // Piece 1 would land on piece 0 (square 3): not allowed.
    expect(ludoMoves(game, 2).some((move) => move.piece === 1)).toBe(false);
    const after = playLudo(game, 2, moves.find((move) => move.piece === 0)!);
    expect(after.pieces[1]![0]).toBe(AT_HOME);
    expect(after.turn).toBe(1);
  });

  test("into the goal by the exact number, never past its end or its own pieces there; four in wins", () => {
    const game = placed([[38, 41, 43, 42], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    // 38 + 2 = 40 is the goal's first square; 38 + 3 would jump its own piece at 41; 41 + 1 = 42 is taken.
    expect(ludoMoves(game, 2)).toEqual([{ piece: 0, from: 38, to: 40 }]);
    expect(ludoMoves(game, 3)).toEqual([]);
    expect(ludoMoves(game, 6)).toEqual([]);
    const done = playLudo(game, 2, { piece: 0, from: 38, to: 40 });
    expect(done.winner).toBe(0);
    expect(ludoMoves(done, 2)).toEqual([]);
    expect(playLudo(done, 2, null)).toBe(done);
    expect(LAST).toBe(TRACK + 3);
  });

  test("nothing to move: the turn passes; a wrong move, or none when there is one, is refused", () => {
    const game = placed([[39, AT_HOME, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    // 39 + 5 = 44 is past the goal's end.
    expect(ludoMoves(game, 5)).toEqual([]);
    expect(playLudo(game, 5, null).turn).toBe(1);
    expect(() => playLudo(game, 1, null)).toThrow(/must be made/);
    expect(() => playLudo(game, 1, { piece: 0, from: 39, to: 42 })).toThrow(/not a move/);
    expect(ludoMoves(game, 0)).toEqual([]);
    expect(ludoMoves(game, 7)).toEqual([]);
  });

  test("the board square of a piece depends on its colour's start", () => {
    const game = newLudo([1, 3]);
    expect(squareOf(game, 0, 0)).toBe(10);
    expect(squareOf(game, 1, 15)).toBe(5);
    expect(squareOf(game, 0, AT_HOME)).toBeNull();
    expect(squareOf(game, 0, 41)).toBeNull();
  });

  test("the kota sends someone home first, then brings one in, then out, keeps out of reach, and else runs the furthest", () => {
    // Can send seat 1 home with piece 0 (3 to 5), or bring piece 1 into the goal (37 to 39? no: 37 + 2 = 39 on track).
    const capture = placed([[3, 37, AT_HOME, AT_HOME], [35, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoBot(capture, 2)).toMatchObject({ piece: 0, sends: { seat: 1 } });
    const goal = placed([[38, 5, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoBot(goal, 2)).toMatchObject({ piece: 0, to: 40 });
    const out = placed([[5, AT_HOME, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoBot(out, 6)).toMatchObject({ from: AT_HOME });
    // Two pieces may move 3: one would land just ahead of someone (board 12, with seat 1 at board 10 behind it).
    const reach = placed([[9, 20, AT_HOME, AT_HOME], [0, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoBot(reach, 3)).toMatchObject({ piece: 1 });
    expect(ludoBot(placed([[39, AT_HOME, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]), 5)).toBeNull();
  });

  test("a whole game between four kotas ends, with a winner, by the rules", () => {
    let game = newLudo([0, 1, 2, 3]);
    let seed = 7;
    const roll = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return 1 + ((seed >>> 8) % 6);
    };
    for (let throws = 0; throws < 20_000 && game.winner === null; throws++) {
      const r = roll();
      game = playLudo(game, r, ludoBot(game, r));
    }
    expect(game.winner).not.toBeNull();
    expect(game.pieces[game.winner!]!.every((position) => position >= TRACK)).toBe(true);
  });

  test("the start is kept clear only when the piece on it can move; three throws while no piece can move but with a 6", () => {
    // The piece on the start cannot go 3 (its own piece is there): another moves.
    const blocked = placed([[0, 3, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoMoves(blocked, 3).map((move) => move.piece)).toEqual([1]);
    // One piece home in the goal at its far end and the rest at home: nothing can move but with a 6, so three throws.
    const settled = placed([[LAST, AT_HOME, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoMoves(settled, 2)).toEqual([]);
    expect(playLudo(settled, 2, null)).toMatchObject({ turn: 0, tries: 2 });
    // A piece in the goal with room beyond it could move with the right throw: one throw, as for a piece on the track.
    const room = placed([[LAST - 1, AT_HOME, AT_HOME, AT_HOME], [AT_HOME, AT_HOME, AT_HOME, AT_HOME]]);
    expect(ludoMoves(room, 5)).toEqual([]);
    expect(playLudo(room, 5, null)).toMatchObject({ turn: 1, tries: 3 });
  });
});
