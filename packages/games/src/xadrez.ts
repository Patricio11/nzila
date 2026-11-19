// Xadrez (Task 4B.1): the whole game, as the kotas of the Largo play it, by the rules everyone plays.
// Castling, en passant, promotion, check, checkmate and stalemate; a draw by fifty moves without a capture or a
// pawn's move, by the same position three times, and when neither side has enough left to mate. Pure and
// deterministic: whoever holds the game hands in the moves.
//
// The board is 64 squares, row by row from Black's back rank (row 0, "a8" to "h8") to White's (row 7).
// A piece is a letter: K Q R B N P for White, k q r b n p for Black; "." is an empty square.

export type Colour = "w" | "b";

export interface Xadrez {
  readonly board: readonly string[];
  readonly turn: Colour;
  /** Castling still allowed: "K" "Q" for White's king and queen side, "k" "q" for Black's. */
  readonly castling: string;
  /** The square a pawn may be taken on en passant, or -1. */
  readonly enPassant: number;
  /** Half-moves since the last capture or pawn move: a hundred is a draw. */
  readonly quiet: number;
  /** Every position so far, for the threefold repetition. */
  readonly seen: readonly string[];
  /** "w" or "b" for the winner, "empate" for a draw, null while it goes on. */
  readonly result: Colour | "empate" | null;
}

export interface XadrezMove {
  readonly from: number;
  readonly to: number;
  /** For a pawn reaching the last rank: "q", "r", "b" or "n". */
  readonly promotion?: "q" | "r" | "b" | "n";
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// A piece's letter is upper case for White: told by its code, which the search asks millions of times.
const colourOf = (piece: string): Colour | null => (piece === "." ? null : piece.charCodeAt(0) < 97 ? "w" : "b");
const rowOf = (square: number): number => Math.floor(square / 8);
const columnOf = (square: number): number => square % 8;
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;
const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;

/** A square's name ("e4") and back. */
export function squareName(square: number): string {
  return `${"abcdefgh"[columnOf(square)]}${8 - rowOf(square)}`;
}
export function squareAt(name: string): number {
  return (8 - Number(name[1])) * 8 + "abcdefgh".indexOf(name[0]!);
}

/** A position from Forsyth-Edwards notation (the usual way chess positions are written down). */
export function fromFen(fen: string): Xadrez {
  const [placement, turn, castling, enPassant, quiet] = fen.split(" ");
  const board: string[] = [];
  for (const char of placement!.replace(/\//g, "")) {
    if (/\d/.test(char)) for (let n = 0; n < Number(char); n++) board.push(".");
    else board.push(char);
  }
  const game: Xadrez = { board, turn: turn as Colour, castling: castling === "-" ? "" : castling!, enPassant: enPassant === "-" ? -1 : squareAt(enPassant!), quiet: Number(quiet), seen: [], result: null };
  return { ...game, seen: [keyOf(game)] };
}

/** The start of a game. */
export function newXadrez(): Xadrez {
  return fromFen(START);
}

/** What makes two positions the same, for the repetition rule. */
function keyOf(game: Xadrez): string {
  return `${game.board.join("")}${game.turn}${game.castling}${game.enPassant}`;
}

/** The letters of each side's pieces, for asking what attacks a square without building them each time. */
const LETTERS = { w: { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" }, b: { p: "p", n: "n", b: "b", r: "r", q: "q", k: "k" } } as const;

/** Whether a square is attacked by a side. */
function attacked(board: readonly string[], square: number, by: Colour): boolean {
  const r = (square / 8) | 0;
  const c = square % 8;
  const L = LETTERS[by];
  // A pawn of `by` attacks from the row behind, as it moves.
  const pawnRow = by === "w" ? r + 1 : r - 1;
  if (pawnRow >= 0 && pawnRow < 8) {
    if (c > 0 && board[pawnRow * 8 + c - 1] === L.p) return true;
    if (c < 7 && board[pawnRow * 8 + c + 1] === L.p) return true;
  }
  for (const [dr, dc] of KNIGHT) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === L.n) return true;
  }
  for (const [dr, dc] of KING) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === L.k) return true;
  }
  for (const [dr, dc] of ROOK) {
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const piece = board[rr * 8 + cc];
      if (piece !== ".") {
        if (piece === L.r || piece === L.q) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
  for (const [dr, dc] of BISHOP) {
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const piece = board[rr * 8 + cc];
      if (piece !== ".") {
        if (piece === L.b || piece === L.q) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
  return false;
}

/** Whether a side's king is in check. */
export function inCheck(game: Xadrez, side: Colour = game.turn): boolean {
  const king = game.board.indexOf(side === "w" ? "K" : "k");
  return king >= 0 && attacked(game.board, king, side === "w" ? "b" : "w");
}

/** Every move a piece of the side to move could make, before asking whether its own king is left in check. */
function pseudo(game: Xadrez): XadrezMove[] {
  const moves: XadrezMove[] = [];
  const side = game.turn;
  const board = game.board;
  const empty = (square: number): boolean => board[square] === ".";
  const enemy = (square: number): boolean => colourOf(board[square]!) === (side === "w" ? "b" : "w");
  for (let from = 0; from < 64; from++) {
    const piece = board[from]!;
    if (colourOf(piece) !== side) continue;
    const r = rowOf(from);
    const c = columnOf(from);
    const kind = piece.toLowerCase();
    const add = (to: number): void => {
      if (kind === "p" && (rowOf(to) === 0 || rowOf(to) === 7)) for (const promotion of ["q", "r", "b", "n"] as const) moves.push({ from, to, promotion });
      else moves.push({ from, to });
    };
    if (kind === "p") {
      const ahead = side === "w" ? -1 : 1;
      const one = (r + ahead) * 8 + c;
      if (r + ahead >= 0 && r + ahead < 8 && empty(one)) {
        add(one);
        const home = side === "w" ? 6 : 1;
        const two = (r + 2 * ahead) * 8 + c;
        if (r === home && empty(two)) add(two);
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        const rr = r + ahead;
        if (cc < 0 || cc > 7 || rr < 0 || rr > 7) continue;
        const to = rr * 8 + cc;
        if (enemy(to) || to === game.enPassant) add(to);
      }
      continue;
    }
    const steps = kind === "n" ? KNIGHT : kind === "k" ? KING : kind === "r" ? ROOK : kind === "b" ? BISHOP : [...ROOK, ...BISHOP];
    const slides = kind === "r" || kind === "b" || kind === "q";
    for (const [dr, dc] of steps) {
      let rr = r + dr;
      let cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const to = rr * 8 + cc;
        if (empty(to)) add(to);
        else {
          if (enemy(to)) add(to);
          break;
        }
        if (!slides) break;
        rr += dr;
        cc += dc;
      }
    }
    if (kind === "k") {
      // Castling: the right still held, the squares between empty, and the king never in, through or into check.
      const them = side === "w" ? "b" : "w";
      const home = side === "w" ? 60 : 4;
      if (from === home && !attacked(board, home, them)) {
        const [short, long] = side === "w" ? ["K", "Q"] : ["k", "q"];
        if (game.castling.includes(short) && empty(home + 1) && empty(home + 2) && !attacked(board, home + 1, them)) moves.push({ from, to: home + 2 });
        if (game.castling.includes(long) && empty(home - 1) && empty(home - 2) && empty(home - 3) && !attacked(board, home - 1, them)) moves.push({ from, to: home - 2 });
      }
    }
  }
  return moves;
}

/** The position after a move, without asking whether it was allowed or how the game stands. */
function apply(game: Xadrez, move: XadrezMove): Xadrez {
  const board = [...game.board];
  const piece = board[move.from]!;
  const kind = piece.toLowerCase();
  const captured = board[move.to] !== ".";
  board[move.to] = move.promotion ? (game.turn === "w" ? move.promotion.toUpperCase() : move.promotion) : piece;
  board[move.from] = ".";
  // En passant: the pawn taken is beside the square moved to.
  if (kind === "p" && move.to === game.enPassant) board[move.to + (game.turn === "w" ? 8 : -8)] = ".";
  // Castling: the rook comes round.
  if (kind === "k" && Math.abs(move.to - move.from) === 2) {
    const short = move.to > move.from;
    board[short ? move.from + 1 : move.from - 1] = board[short ? move.from + 3 : move.from - 4]!;
    board[short ? move.from + 3 : move.from - 4] = ".";
  }
  // A king or a rook that moves, or a rook taken, ends that castling.
  let castling = game.castling;
  const lose = (square: number, rights: string): void => {
    if (castling && (move.from === square || move.to === square)) castling = [...castling].filter((right) => !rights.includes(right)).join("");
  };
  lose(60, "KQ");
  lose(4, "kq");
  lose(63, "K");
  lose(56, "Q");
  lose(7, "k");
  lose(0, "q");
  const enPassant = kind === "p" && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : -1;
  return { board, turn: game.turn === "w" ? "b" : "w", castling, enPassant, quiet: kind === "p" || captured ? 0 : game.quiet + 1, seen: game.seen, result: null };
}

/** Every move the side to move may make. */
export function xadrezMoves(game: Xadrez): XadrezMove[] {
  if (game.result !== null) return [];
  return pseudo(game).filter((move) => !inCheck(apply(game, move), game.turn));
}

/** The same, each with the position it leads to: for the kota's search, which would otherwise make each move twice. */
function legalAfter(game: Xadrez): { move: XadrezMove; after: Xadrez }[] {
  const out: { move: XadrezMove; after: Xadrez }[] = [];
  for (const move of pseudo(game)) {
    const after = apply(game, move);
    if (!inCheck(after, game.turn)) out.push({ move, after });
  }
  return out;
}

/** Whether the pieces left can never mate: kings alone, or a king and one bishop or one knight against a king. */
function tooLittle(board: readonly string[]): boolean {
  const others = board.filter((piece) => piece !== "." && piece.toLowerCase() !== "k");
  return others.length === 0 || (others.length === 1 && "bn".includes(others[0]!.toLowerCase()));
}

/** The game after a move (one of `xadrezMoves`), and how it stands. */
export function playXadrez(game: Xadrez, move: XadrezMove): Xadrez {
  if (!xadrezMoves(game).some((one) => one.from === move.from && one.to === move.to && one.promotion === move.promotion)) throw new Error("Xadrez: not a move the rules allow");
  const after = apply(game, move);
  const key = keyOf(after);
  const next = { ...after, seen: [...game.seen, key] };
  if (xadrezMoves(next).length === 0) return { ...next, result: inCheck(next) ? game.turn : "empate" };
  if (next.quiet >= 100 || tooLittle(next.board) || next.seen.filter((one) => one === key).length >= 3) return { ...next, result: "empate" };
  return next;
}

/** How many positions a number of moves deep: the usual check of a chess program's moves (perft). */
export function perft(game: Xadrez, depth: number): number {
  if (depth === 0) return 1;
  let total = 0;
  for (const move of xadrezMoves(game)) total += depth === 1 ? 1 : perft({ ...apply(game, move), seen: [] }, depth - 1);
  return total;
}

const VALUE: Readonly<Record<string, number>> = { p: 100, n: 310, b: 320, r: 500, q: 900, k: 0, P: 100, N: 310, B: 320, R: 500, Q: 900, K: 0 };
/** A little for each square's nearness to the middle, worked out once. */
const MIDDLE = Array.from({ length: 64 }, (_, n) => (7 - (Math.abs(3.5 - rowOf(n)) + Math.abs(3.5 - columnOf(n)))) * 3);

/** How the board stands for a side: the pieces, and a little for being toward the middle. */
function worth(board: readonly string[], side: Colour): number {
  let total = 0;
  for (let n = 0; n < 64; n++) {
    const piece = board[n]!;
    if (piece === ".") continue;
    const value = VALUE[piece]! + (piece === "k" || piece === "K" ? 0 : MIDDLE[n]!);
    total += colourOf(piece) === side ? value : -value;
  }
  return total;
}

/**
 * What a kota of the Largo plays: a couple of moves ahead, by the pieces on the board. `depth` 1 to 3.
 *
 * The zone thinks for the kota inside its step, which has 50 ms for everyone in the street: the search moves pieces
 * with `apply` (its moves are the rules' own already) rather than `playXadrez`, which checks a move against every
 * legal one and then looks for the end of the game. A chess move had taken 80 to 300 ms, and held the street up
 * each time (2026-11-19, F-221).
 *
 * `trocas`: how many captures more a feared kota follows through where the search would stop, so as not to stop in
 * the middle of an exchange and leave a piece hanging; each side may also stop taking when taking would lose.
 */
export function xadrezBot(game: Xadrez, depth = 2, trocas = 0): XadrezMove | null {
  const moves = xadrezMoves(game);
  if (moves.length === 0) return null;
  const side = game.turn;
  // Captures first: the search cuts more, and sooner.
  const ordered = (state: Xadrez, list: { move: XadrezMove; after: Xadrez }[]): { move: XadrezMove; after: Xadrez }[] =>
    [...list].sort((a, b) => Number(state.board[b.move.to] !== ".") - Number(state.board[a.move.to] !== "."));
  // A side with no move is mated when in check, and otherwise it is a draw.
  const ended = (state: Xadrez, left: number): number => (inCheck(state) ? (state.turn === side ? -100_000 - left : 100_000 + left) : 0);
  // At the end of the search: the exchanges under way played out, captures only, the most valuable taken first.
  const quiet = (state: Xadrez, left: number, alpha: number, beta: number): number => {
    const still = worth(state.board, side);
    if (left === 0) return still;
    const mine = state.turn === side;
    // Not taking is always a choice: what stands now bounds the answer.
    if (mine ? still >= beta : still <= alpha) return still;
    let best = still;
    if (mine) alpha = Math.max(alpha, still);
    else beta = Math.min(beta, still);
    const takes = pseudo(state)
      .filter((move) => state.board[move.to] !== ".")
      .sort((a, b) => VALUE[state.board[b.to]!]! - VALUE[state.board[a.to]!]!);
    for (const move of takes) {
      const after = apply(state, move);
      if (inCheck(after, state.turn)) continue;
      const value = quiet(after, left - 1, alpha, beta);
      if (mine) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, value);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, value);
      }
      if (beta <= alpha) break;
    }
    return best;
  };
  const search = (state: Xadrez, left: number, alpha: number, beta: number): number => {
    if (left === 0) {
      // Only a side in check can have been mated: only then are its moves counted.
      if (inCheck(state) && legalAfter(state).length === 0) return ended(state, left);
      return trocas > 0 ? quiet(state, trocas, alpha, beta) : worth(state.board, side);
    }
    const replies = legalAfter(state);
    if (replies.length === 0) return ended(state, left);
    const mine = state.turn === side;
    let best = mine ? -Infinity : Infinity;
    for (const { after } of ordered(state, replies)) {
      const value = search(after, left - 1, alpha, beta);
      if (mine) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, value);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, value);
      }
      if (beta <= alpha) break;
    }
    return best;
  };
  let chosen = moves[0]!;
  let top = -Infinity;
  for (const { move, after } of ordered(game, legalAfter(game))) {
    const value = search(after, depth - 1, top, Infinity);
    if (value > top) {
      top = value;
      chosen = move;
    }
  }
  return chosen;
}
