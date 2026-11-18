// Não te irrites (Task 4B.1): the game everyone in Angola knows from a board on a table, as the server plays it.
// Pure and deterministic: the dice are rolled by whoever holds the game (the zone) and handed in; the same rolls
// and the same choices make the same game everywhere.
//
// The rules, as they are played:
//   - two to four players, each with four pieces of a colour, at home;
//   - a 6 brings a piece out onto its colour's start; with a 6, a piece must come out if one can;
//   - while all four are at home a player has three throws to make a 6;
//   - a 6 throws again;
//   - the track is forty squares round; a piece that lands on another player's sends it home; never on one's own;
//   - after a full round a piece turns into its colour's four squares of the goal, by the exact number, never
//     past its own pieces there;
//   - the first to bring all four in wins.

/** Squares round the board, how far apart the colours' starts are, and squares of each colour's goal. */
export const TRACK = 40;
export const START_GAP = 10;
export const GOAL = 4;
/** At home; and the last square a piece can be on (the goal's far end), counted from its own start. */
export const AT_HOME = -1;
export const LAST = TRACK + GOAL - 1;

export interface Ludo {
  /** For each seat, its colour (0 to 3: where its start is on the board). */
  readonly colours: readonly number[];
  /** For each seat, its four pieces: -1 at home, 0 to 39 round the track from its own start, 40 to 43 in its goal. */
  readonly pieces: readonly (readonly number[])[];
  /** Whose turn. */
  readonly turn: number;
  /** Throws left to make a 6 while all four are at home (three each turn). */
  readonly tries: number;
  /** The winner's seat, when there is one. */
  readonly winner: number | null;
}

export interface LudoMove {
  readonly piece: number;
  readonly from: number;
  readonly to: number;
  /** The seat and piece sent home, when it lands on someone. */
  readonly sends?: { readonly seat: number; readonly piece: number };
}

/** A new game: each seat's colour, two to four of them, all different. */
export function newLudo(colours: readonly number[]): Ludo {
  if (colours.length < 2 || colours.length > 4 || new Set(colours).size !== colours.length || colours.some((c) => !Number.isInteger(c) || c < 0 || c > 3)) {
    throw new Error("Não te irrites: two to four seats, each a different colour from 0 to 3");
  }
  return { colours: [...colours], pieces: colours.map(() => [AT_HOME, AT_HOME, AT_HOME, AT_HOME]), turn: 0, tries: 3, winner: null };
}

/** The board square (0 to 39) a piece is on, for a seat; null at home or in its goal. */
export function squareOf(game: Ludo, seat: number, position: number): number | null {
  return position < 0 || position >= TRACK ? null : (game.colours[seat]! * START_GAP + position) % TRACK;
}

/** Who is on a square of the track: a seat and its piece, or null. */
function onSquare(game: Ludo, square: number): { seat: number; piece: number } | null {
  for (const [seat, pieces] of game.pieces.entries()) {
    for (const [piece, position] of pieces.entries()) if (squareOf(game, seat, position) === square) return { seat, piece };
  }
  return null;
}

/** Every move the seat whose turn it is may make with this throw. */
export function ludoMoves(game: Ludo, roll: number): LudoMove[] {
  if (game.winner !== null || !Number.isInteger(roll) || roll < 1 || roll > 6) return [];
  const seat = game.turn;
  const mine = game.pieces[seat]!;
  const moves: LudoMove[] = [];
  for (const [piece, from] of mine.entries()) {
    let to: number;
    if (from === AT_HOME) {
      if (roll !== 6) continue;
      to = 0;
    } else {
      to = from + roll;
      if (to > LAST) continue;
    }
    if (to >= TRACK) {
      // Into the goal: never onto or past one's own piece there.
      if (mine.some((other, n) => n !== piece && other >= Math.max(from + 1, TRACK) && other <= to)) continue;
      moves.push({ piece, from, to });
      continue;
    }
    const there = onSquare(game, squareOf(game, seat, to)!);
    if (there?.seat === seat) continue;
    moves.push(there ? { piece, from, to, sends: there } : { piece, from, to });
  }
  // With a 6 and a piece at home that can come out, coming out is the only move.
  const out = moves.filter((move) => move.from === AT_HOME);
  return roll === 6 && out.length > 0 ? out : moves;
}

/**
 * The game after a throw and the move chosen (null when there is none to make). A 6 throws again; while all four
 * are at home the seat throws up to three times; otherwise the turn passes on.
 */
export function playLudo(game: Ludo, roll: number, move: LudoMove | null): Ludo {
  if (game.winner !== null) return game;
  const legal = ludoMoves(game, roll);
  if (move && !legal.some((one) => one.piece === move.piece && one.to === move.to)) throw new Error("Não te irrites: not a move this throw allows");
  if (!move && legal.length > 0) throw new Error("Não te irrites: a move must be made when there is one");
  const seat = game.turn;
  const pieces = game.pieces.map((one) => [...one]);
  if (move) {
    pieces[seat]![move.piece] = move.to;
    if (move.sends) pieces[move.sends.seat]![move.sends.piece] = AT_HOME;
  }
  if (pieces[seat]!.every((position) => position >= TRACK)) return { ...game, pieces, winner: seat };
  const allHome = pieces[seat]!.every((position) => position === AT_HOME);
  if (roll === 6) return { ...game, pieces, tries: 3 };
  if (!move && allHome && game.tries > 1) return { ...game, pieces, tries: game.tries - 1 };
  const next = (seat + 1) % game.colours.length;
  return { ...game, pieces, turn: next, tries: 3 };
}

/**
 * What a kota of the bairro plays when a seat is theirs: send someone home if they can, bring a piece into the
 * goal, bring one out, get away from someone close behind, else move the piece furthest on.
 */
export function ludoBot(game: Ludo, roll: number): LudoMove | null {
  const moves = ludoMoves(game, roll);
  if (moves.length === 0) return null;
  const seat = game.turn;
  const danger = (move: LudoMove): number => {
    // Squares one to six behind where it would land, held by someone else: they could send it home.
    if (move.to >= TRACK) return 0;
    const square = squareOf(game, seat, move.to)!;
    let threats = 0;
    for (let back = 1; back <= 6; back++) {
      const there = onSquare(game, (square - back + TRACK) % TRACK);
      if (there && there.seat !== seat) threats++;
    }
    return threats;
  };
  const score = (move: LudoMove): number => (move.sends ? 1000 : 0) + (move.to >= TRACK ? 500 : 0) + (move.from === AT_HOME ? 300 : 0) - danger(move) * 40 + move.to;
  return moves.reduce((best, move) => (score(move) > score(best) ? move : best));
}
