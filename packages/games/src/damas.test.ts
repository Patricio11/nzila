import { describe, expect, test } from "vitest";
import { CERCO_DRAW, QUIET_DRAW, damasBot, damasMoves, escura, newDamas, playDamas, type Damas, type Square } from "./damas.ts";

/** A square by its row and column. */
const sq = (r: number, c: number): number => r * 8 + c;
/** A board with only the pieces given. */
const board = (pieces: [number, Square][], turn: 0 | 1 = 0): Damas => {
  const squares: Square[] = Array.from({ length: 64 }, () => 0 as Square);
  for (const [at, piece] of pieces) squares[at] = piece;
  return { board: squares, turn, quiet: 0, cerco: 0, result: null };
};

describe("damas", () => {
  test("twelve each on the dark squares, the dark corner on each player's right, the light to move, seven steps to begin with", () => {
    const game = newDamas();
    expect(game.board.filter((p) => p === 1)).toHaveLength(12);
    expect(game.board.filter((p) => p === -1)).toHaveLength(12);
    // The light side's back row is row 7, its right the far column: the corner there is dark and has a piece; and
    // the same for the dark side, whose right is column 0 of row 0.
    expect(escura(sq(7, 7))).toBe(true);
    expect(escura(sq(0, 0))).toBe(true);
    expect(escura(sq(7, 0))).toBe(false);
    expect(game.board[sq(7, 7)]).toBe(1);
    expect(game.board[sq(0, 0)]).toBe(-1);
    expect(game.board[sq(5, 1)]).toBe(1);
    expect(game.board[sq(2, 0)]).toBe(-1);
    expect(game.board.every((piece, square) => piece === 0 || escura(square))).toBe(true);
    expect(game.turn).toBe(0);
    expect(damasMoves(game)).toHaveLength(7);
    expect(damasMoves(game).every((move) => move.takes.length === 0 && Math.floor(move.path[1]! / 8) === 4)).toBe(true);
  });

  test("a man steps forward only; it captures forward and backward; capturing is obligatory", () => {
    const step = board([[sq(4, 3), 1]]);
    expect(damasMoves(step).map((move) => move.path[1]!).sort((a, b) => a - b)).toEqual([sq(3, 2), sq(3, 4)]);
    // A dark piece behind it: it must take it, backward, and nothing else.
    const back = board([[sq(4, 3), 1], [sq(5, 4), -1]]);
    expect(damasMoves(back)).toEqual([{ path: [sq(4, 3), sq(6, 5)], takes: [sq(5, 4)] }]);
  });

  test("of the ways to capture, the one that takes the most; a run of jumps; a piece never jumped twice", () => {
    // Two dark pieces in a line from the light man: one jump takes one, the other run takes two.
    const game = board([[sq(6, 1), 1], [sq(5, 2), -1], [sq(3, 2), -1], [sq(5, 0), -1]]);
    const moves = damasMoves(game);
    expect(moves).toEqual([{ path: [sq(6, 1), sq(4, 3), sq(2, 1)], takes: [sq(5, 2), sq(3, 2)] }]);
    const after = playDamas(game, moves[0]!);
    expect(after.board[sq(5, 2)]).toBe(0);
    expect(after.board[sq(3, 2)]).toBe(0);
    expect(after.board[sq(2, 1)]).toBe(1);
    expect(after.turn).toBe(1);
  });

  test("a man ending on the far row is crowned; a dama flies along the diagonal and captures from afar", () => {
    const crown = board([[sq(1, 2), 1], [sq(0, 7), -1], [sq(7, 0), -1]]);
    const crowned = playDamas(crown, { path: [sq(1, 2), sq(0, 1)], takes: [] });
    expect(crowned.board[sq(0, 1)]).toBe(2);
    const flying = board([[sq(7, 0), 2], [sq(4, 3), -1], [sq(0, 1), -1]]);
    const moves = damasMoves(flying);
    // It must capture: landing on any free square beyond the piece taken.
    expect(moves.map((move) => move.path[1]!).sort((a, b) => a - b)).toEqual([sq(0, 7), sq(1, 6), sq(2, 5), sq(3, 4)].sort((a, b) => a - b));
    expect(moves.every((move) => move.takes[0] === sq(4, 3))).toBe(true);
    // With nothing to take, a dama moves any distance along a free diagonal.
    const free = board([[sq(7, 0), 2], [sq(0, 1), -1]]);
    expect(damasMoves(free)).toHaveLength(7);
  });

  test("a side that cannot move has lost; forty quiet moves are a draw; a move that is not one is refused", () => {
    // The light man takes the last dark piece: the dark side has nothing left to move.
    const last = board([[sq(5, 2), 1], [sq(4, 3), -1]]);
    expect(playDamas(last, damasMoves(last)[0]!).result).toBe(0);
    const quiet = { ...board([[sq(7, 0), 2], [sq(0, 7), -2]]), quiet: QUIET_DRAW - 1 };
    expect(playDamas(quiet, damasMoves(quiet)[0]!).result).toBe("empate");
    expect(damasMoves({ ...quiet, result: "empate" })).toEqual([]);
    expect(() => playDamas(newDamas(), { path: [sq(5, 0), sq(3, 2)], takes: [] })).toThrow(/not a move/);
    // The dark side's men step toward the light side's back row.
    const dark = board([[sq(2, 1), -1]], 1);
    expect(damasMoves(dark).map((move) => Math.floor(move.path[1]! / 8))).toEqual([3, 3]);
  });

  test("the kota takes what it can and does not give a piece away for nothing", () => {
    const take = board([[sq(4, 3), 1], [sq(3, 4), -1], [sq(0, 1), -1]]);
    expect(damasBot(take, 2)!.takes).toEqual([sq(3, 4)]);
    // Two steps: one walks into a capture, one does not.
    const careful = board([[sq(5, 2), 1], [sq(2, 5), -1], [sq(3, 0), -1]]);
    const chosen = damasBot(careful, 3)!;
    expect(chosen.path[1]).not.toBe(sq(4, 1));
    expect(damasBot({ ...careful, result: 1 })).toBeNull();
  });

  test("the kota sees ahead a draw, a win and a loss", () => {
    const quiet = { ...board([[sq(7, 0), 2], [sq(0, 7), -2]]), quiet: QUIET_DRAW - 1 };
    expect(damasBot(quiet, 2)).not.toBeNull();
    const win = board([[sq(5, 2), 1], [sq(4, 3), -1]]);
    expect(damasBot(win, 2)!.takes).toEqual([sq(4, 3)]);
    // Either step of the last light man walks into a capture that ends the game: still a move is made.
    const lost = board([[sq(5, 2), 1], [sq(3, 0), -1], [sq(3, 4), -1]]);
    expect(damasBot(lost, 2)).not.toBeNull();
  });

  test("a whole game between two kotas ends, by the rules", () => {
    let game = newDamas();
    for (let moves = 0; moves < 400 && game.result === null; moves++) game = playDamas(game, damasBot(game, 2)!);
    expect(game.result).not.toBeNull();
  });

  test("of the captures that take the most, one that takes the most damas (the Portuguese rule of quality)", () => {
    // The light man can take a dark man or a dark dama, one piece either way: it must take the dama.
    const game = board([[sq(5, 3), 1], [sq(4, 2), -1], [sq(4, 4), -2], [sq(0, 0), -1]]);
    expect(damasMoves(game)).toEqual([{ path: [sq(5, 3), sq(3, 5)], takes: [sq(4, 4)] }]);
    // With no dama to take, either.
    const plain = board([[sq(5, 3), 1], [sq(4, 2), -1], [sq(4, 4), -1], [sq(0, 0), -1]]);
    expect(damasMoves(plain)).toHaveLength(2);
  });

  test("three damas against one, one of them on the long diagonal: a draw if not won in twelve moves each", () => {
    // The light damas on 3-3 (the long diagonal), 7-1 and 6-0; the dark one alone on 0-6. Nothing can be taken.
    const pieces: [number, Square][] = [[sq(3, 3), 2], [sq(7, 1), 2], [sq(6, 0), 2], [sq(0, 6), -2]];
    const near = { ...board(pieces), cerco: CERCO_DRAW - 1 };
    expect(damasMoves(near).every((move) => move.takes.length === 0)).toBe(true);
    const step = damasMoves(near).find((move) => move.path[0] === sq(7, 1) && move.path[1] === sq(6, 2))!;
    expect(playDamas(near, step)).toMatchObject({ cerco: CERCO_DRAW, result: "empate" });
    // Counted from the first move of it; and the count stops when it is no longer three against one on the diagonal.
    const begun = playDamas(board(pieces), step);
    expect(begun).toMatchObject({ cerco: 1, result: null });
    const off = playDamas({ ...near, board: near.board.map((piece, square) => (square === sq(3, 3) ? 0 : square === sq(5, 3) ? 2 : piece)) as Square[] }, step);
    expect(off).toMatchObject({ cerco: 0, result: null });
    // The dark side with the three, the light alone: the same.
    const other = board([[sq(4, 4), -2], [sq(0, 2), -2], [sq(1, 1), -2], [sq(7, 7), 2]], 1);
    const darkStep = damasMoves(other).find((move) => move.takes.length === 0)!;
    expect(playDamas(other, darkStep).cerco).toBe(1);
    // A man among the three is not three damas.
    const man = board([[sq(3, 3), 2], [sq(7, 1), 2], [sq(6, 0), 1], [sq(0, 6), -2]]);
    expect(playDamas(man, damasMoves(man).find((move) => move.path[0] === sq(7, 1))!).cerco).toBe(0);
  });
});
