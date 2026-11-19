import { describe, expect, test } from "vitest";
import { fromFen, inCheck, newXadrez, perft, playXadrez, squareAt, squareName, xadrezBot, xadrezMoves, type Xadrez } from "./xadrez.ts";

/** A move by its squares' names: "e2e4", "e7e8q". */
const m = (text: string): { from: number; to: number; promotion?: "q" | "r" | "b" | "n" } => ({
  from: squareAt(text.slice(0, 2)),
  to: squareAt(text.slice(2, 4)),
  ...(text[4] ? { promotion: text[4] as "q" | "r" | "b" | "n" } : {}),
});
const play = (game: Xadrez, ...moves: string[]): Xadrez => moves.reduce((state, move) => playXadrez(state, m(move)), game);

describe("xadrez", () => {
  test("the squares have their names", () => {
    expect(squareName(squareAt("e4"))).toBe("e4");
    expect(squareAt("a8")).toBe(0);
    expect(squareAt("h1")).toBe(63);
  });

  test("the moves a chess program must find from known positions (perft)", () => {
    // From the start.
    expect([1, 2, 3].map((depth) => perft(newXadrez(), depth))).toEqual([20, 400, 8902]);
    // "Kiwipete": castling both ways, pins, en passant waiting to happen.
    const kiwipete = fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    expect([1, 2].map((depth) => perft(kiwipete, depth))).toEqual([48, 2039]);
    // Kings and pawns, with en passant through a check.
    const endgame = fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    expect([1, 2, 3].map((depth) => perft(endgame, depth))).toEqual([14, 191, 2812]);
    // Promotions, and castling rights lost.
    const promotions = fromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
    expect([1, 2].map((depth) => perft(promotions, depth))).toEqual([6, 264]);
  });

  test("checkmate: the fool's mate", () => {
    const game = play(newXadrez(), "f2f3", "e7e5", "g2g4", "d8h4");
    expect(inCheck(game)).toBe(true);
    expect(game.result).toBe("b");
    expect(xadrezMoves(game)).toEqual([]);
  });

  test("stalemate, too little to mate, fifty quiet moves, three times the same: each a draw", () => {
    // Black to move, not in check, and nowhere to go.
    const stale = playXadrez(fromFen("k7/8/1Q6/8/8/8/8/7K w - - 0 1"), m("b6c7"));
    expect(stale.result).toBe("empate");
    // A king takes the last piece that could mate.
    expect(playXadrez(fromFen("k7/8/8/8/8/8/1r6/K7 w - - 0 1"), m("a1b2")).result).toBe("empate");
    // A hundred half-moves without a capture or a pawn's move.
    expect(playXadrez(fromFen("k6r/8/8/8/8/8/R7/K7 w - - 99 80"), m("a2a3")).result).toBe("empate");
    // The knights out and back, twice: the start comes round a third time.
    const repeated = play(newXadrez(), "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8");
    expect(repeated.result).toBe("empate");
  });

  test("castling, en passant and promotion move what they should", () => {
    const castle = playXadrez(fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), m("e1g1"));
    expect([castle.board[squareAt("g1")], castle.board[squareAt("f1")], castle.board[squareAt("h1")]]).toEqual(["K", "R", "."]);
    expect(castle.castling).toBe("kq");
    const long = playXadrez(fromFen("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1"), m("e8c8"));
    expect([long.board[squareAt("c8")], long.board[squareAt("d8")], long.board[squareAt("a8")]]).toEqual(["k", "r", "."]);
    // A rook taken in its corner ends the castling on that side.
    expect(playXadrez(fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), m("a1a8")).castling).toBe("Kk");
    const passant = play(fromFen("4k3/8/8/8/1p6/8/P7/4K3 w - - 0 1"), "a2a4", "b4a3");
    expect([passant.board[squareAt("a3")], passant.board[squareAt("a4")]]).toEqual(["p", "."]);
    const queen = playXadrez(fromFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"), m("a7a8q"));
    expect(queen.board[squareAt("a8")]).toBe("Q");
    // Black promotes downward.
    expect(playXadrez(fromFen("4k3/8/8/8/8/8/p7/4K3 b - - 0 1"), m("a2a1n")).board[squareAt("a1")]).toBe("n");
    // Never into or through check: f1 is covered by the bishop on c4.
    const covered = fromFen("4k3/8/8/8/2b5/8/8/4K2R w K - 0 1");
    expect(xadrezMoves(covered).some((move) => move.to === squareAt("g1") && move.from === squareAt("e1"))).toBe(false);
  });

  test("a position read with its en passant square; a king never steps beside the other king; nothing deep is one", () => {
    const passant = fromFen("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
    expect(xadrezMoves(passant).some((move) => move.from === squareAt("d4") && move.to === squareAt("e3"))).toBe(true);
    // The white king on a1, the black on c3: b2 is next to it, so only a2 and b1.
    expect(xadrezMoves(fromFen("8/8/8/8/8/2k5/8/K7 w - - 0 1")).map((move) => squareName(move.to)).sort()).toEqual(["a2", "b1"]);
    expect(perft(newXadrez(), 0)).toBe(1);
    // Black to move with nothing to stop the rook's mate: the kota sees it coming and still moves.
    expect(xadrezBot(fromFen("7k/6pp/1p6/8/8/8/8/R5K1 b - - 0 1"), 2)).not.toBeNull();
  });

  test("a move the rules do not allow is refused; a finished game has none", () => {
    expect(() => playXadrez(newXadrez(), m("e2e5"))).toThrow(/not a move/);
    expect(xadrezMoves({ ...newXadrez(), result: "w" })).toEqual([]);
    expect(inCheck(fromFen("8/8/8/8/8/8/8/8 w - - 0 1"))).toBe(false);
    // A king on the far side's back rank: no pawn can stand behind it to attack it.
    expect(inCheck(fromFen("8/8/8/8/8/8/8/4k2K b - - 0 1"))).toBe(false);
    expect(inCheck(fromFen("k6K/8/8/8/8/8/8/8 w - - 0 1"))).toBe(false);
  });

  test("the kota takes a queen left hanging, mates when it can, and sees a draw and a loss ahead", () => {
    expect(xadrezBot(fromFen("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1"), 1)).toEqual(m("e4d5"));
    // Mate in one with the rook along the back rank.
    expect(xadrezBot(fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"), 2)).toEqual(m("a1a8"));
    // Three moves deep, the kota still finds it.
    expect(xadrezBot(fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"), 3)).toEqual(m("a1a8"));
    // A stalemate within reach is not mistaken for a win; a lone king still moves.
    expect(xadrezBot(fromFen("k7/8/1Q6/8/8/8/8/7K w - - 0 1"), 2)).not.toBeNull();
    expect(xadrezBot(fromFen("7k/8/8/8/8/8/5q2/7K b - - 0 1"), 2)).not.toBeNull();
    expect(xadrezBot({ ...newXadrez(), result: "empate" })).toBeNull();
  });
});
