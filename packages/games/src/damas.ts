// Damas (Task 4B.1), as most of Angola plays it, by the Portuguese rules (the founder confirms, finding F-204):
//   - an 8 × 8 board, twelve pieces each on the dark squares; the light pieces start;
//   - a man moves one square diagonally forward, and captures by jumping, forward or backward;
//   - capturing is obligatory, and of the ways to capture one must take the one that takes the most pieces;
//   - a piece captured in a run stays on the board until the run ends, and is never jumped twice;
//   - a man that ends its move on the far row becomes a dama, which moves and captures along a whole diagonal;
//   - a player who cannot move loses; forty moves in a row with no capture and no man moving is a draw.
// Pure and deterministic, like the other rules: whoever holds the game hands in the moves.

/** A square's content: 0 empty; 1 and 2 the light man and dama; -1 and -2 the dark ones. */
export type Square = -2 | -1 | 0 | 1 | 2;

export interface Damas {
  /** 64 squares, row by row from the dark side's back row (row 0) to the light side's (row 7). */
  readonly board: readonly Square[];
  /** 0: the light pieces to move; 1: the dark. */
  readonly turn: 0 | 1;
  /** Moves since the last capture or man's move: forty is a draw. */
  readonly quiet: number;
  /** The winner (0, 1), "empate" for a draw, null while it goes on. */
  readonly result: 0 | 1 | "empate" | null;
}

export interface DamasMove {
  /** The squares the piece stands on, from where it starts to where it ends. */
  readonly path: readonly number[];
  /** The squares of the pieces taken, in order. */
  readonly takes: readonly number[];
}

export const QUIET_DRAW = 40;
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const on = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;
const sideOf = (square: Square): 0 | 1 | null => (square > 0 ? 0 : square < 0 ? 1 : null);

/** The start: the dark pieces on rows 0 to 2, the light on rows 5 to 7, on the dark squares. */
export function newDamas(): Damas {
  const board: Square[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.push((r + c) % 2 === 1 ? (r < 3 ? -1 : r > 4 ? 1 : 0) : 0);
  return { board, turn: 0, quiet: 0, result: null };
}

/** Every run of captures a piece can make from where it stands, with the pieces taken so far. */
function captures(board: readonly Square[], from: number, side: 0 | 1, dama: boolean, taken: readonly number[], path: readonly number[]): DamasMove[] {
  const r = Math.floor(from / 8);
  const c = from % 8;
  const runs: DamasMove[] = [];
  for (const [dr, dc] of DIAGONALS) {
    let rr = r + dr;
    let cc = c + dc;
    if (dama) {
      // Along the diagonal to the first piece.
      while (on(rr, cc) && board[rr * 8 + cc] === 0) {
        rr += dr;
        cc += dc;
      }
    }
    if (!on(rr, cc)) continue;
    const over = rr * 8 + cc;
    if (sideOf(board[over]!) !== 1 - side || taken.includes(over)) continue;
    // Landing beyond it: one square for a man, any free square on for a dama.
    let lr = rr + dr;
    let lc = cc + dc;
    while (on(lr, lc) && board[lr * 8 + lc] === 0) {
      const to = lr * 8 + lc;
      const further = captures(board, to, side, dama, [...taken, over], [...path, to]);
      runs.push(...(further.length > 0 ? further : [{ path: [...path, to], takes: [...taken, over] }]));
      if (!dama) break;
      lr += dr;
      lc += dc;
    }
  }
  return runs;
}

/** Every move the side to move may make: the captures that take the most, when there is a capture; else the steps. */
export function damasMoves(game: Damas): DamasMove[] {
  if (game.result !== null) return [];
  const side = game.turn;
  // The run is worked out with the moving piece lifted from its square: it may pass over where it started.
  const runs: DamasMove[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = game.board[from]!;
    if (sideOf(piece) !== side) continue;
    const lifted = [...game.board];
    lifted[from] = 0;
    runs.push(...captures(lifted, from, side, Math.abs(piece) === 2, [], [from]));
  }
  if (runs.length > 0) {
    const most = Math.max(...runs.map((run) => run.takes.length));
    return runs.filter((run) => run.takes.length === most);
  }
  const steps: DamasMove[] = [];
  const forward = side === 0 ? -1 : 1;
  for (let from = 0; from < 64; from++) {
    const piece = game.board[from]!;
    if (sideOf(piece) !== side) continue;
    const r = Math.floor(from / 8);
    const c = from % 8;
    for (const [dr, dc] of DIAGONALS) {
      if (Math.abs(piece) === 1 && dr !== forward) continue;
      let rr = r + dr;
      let cc = c + dc;
      while (on(rr, cc) && game.board[rr * 8 + cc] === 0) {
        steps.push({ path: [from, rr * 8 + cc], takes: [] });
        if (Math.abs(piece) === 1) break;
        rr += dr;
        cc += dc;
      }
    }
  }
  return steps;
}

/** The game after a move (one of `damasMoves`). The other side then moves; a side with no move has lost. */
export function playDamas(game: Damas, move: DamasMove): Damas {
  const legal = damasMoves(game);
  if (!legal.some((one) => one.path.join() === move.path.join() && one.takes.join() === move.takes.join())) throw new Error("Damas: not a move the rules allow");
  const board = [...game.board];
  const from = move.path[0]!;
  const to = move.path[move.path.length - 1]!;
  let piece = board[from]!;
  board[from] = 0;
  for (const taken of move.takes) board[taken] = 0;
  const lastRow = game.turn === 0 ? 0 : 7;
  const man = Math.abs(piece) === 1;
  if (man && Math.floor(to / 8) === lastRow) piece = (game.turn === 0 ? 2 : -2) as Square;
  board[to] = piece;
  const quiet = move.takes.length > 0 || man ? 0 : game.quiet + 1;
  const turn = (1 - game.turn) as 0 | 1;
  const next: Damas = { board, turn, quiet, result: null };
  if (quiet >= QUIET_DRAW) return { ...next, result: "empate" };
  return damasMoves(next).length === 0 ? { ...next, result: game.turn } : next;
}

/** How the board stands for a side: a man is worth one, a dama three, and a man is worth more the further on it is. */
function worth(board: readonly Square[], side: 0 | 1): number {
  let total = 0;
  for (let n = 0; n < 64; n++) {
    const piece = board[n]!;
    if (piece === 0) continue;
    const row = Math.floor(n / 8);
    const value = Math.abs(piece) === 2 ? 300 : 100 + (piece > 0 ? 7 - row : row) * 4;
    total += sideOf(piece) === side ? value : -value;
  }
  return total;
}

/** What a kota of the bairro plays: a few moves ahead, by the pieces on the board. `depth` 1 to 4. */
export function damasBot(game: Damas, depth = 3): DamasMove | null {
  const moves = damasMoves(game);
  if (moves.length === 0) return null;
  const side = game.turn;
  const search = (state: Damas, left: number, alpha: number, beta: number): number => {
    if (state.result !== null) return state.result === "empate" ? 0 : state.result === side ? 100_000 : -100_000;
    if (left === 0) return worth(state.board, side);
    const mine = state.turn === side;
    let best = mine ? -Infinity : Infinity;
    for (const move of damasMoves(state)) {
      const value = search(playDamas(state, move), left - 1, alpha, beta);
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
  for (const move of moves) {
    const value = search(playDamas(game, move), depth - 1, -Infinity, Infinity);
    if (value > top) {
      top = value;
      chosen = move;
    }
  }
  return chosen;
}
