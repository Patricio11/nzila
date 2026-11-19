// Where things are on a board (Task 4B.1), for the table in the street and the board on the phone alike: one
// account of the squares, so that what the street shows and what the thumb taps are the same square.
//
// A board is seen from seat 0: its row 0 is the far side, its column 0 on seat 0's left. At xadrez and damas the
// pieces of the side that plays first start at the bottom (rows 5 to 7); when the other seat plays first, the
// whole game is turned round (`virado`). Não te irrites is an 11 × 11 board, each colour's arm facing its seat.

import { AT_HOME, GOAL, TRACK, type Ludo } from "@nzila/games";
import { WORLD } from "@nzila/world/client";

const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

/**
 * The colours of the tables, from the world's palette (two palettes and no more: the interface's and the world's).
 * The board in the street and the board on the phone are painted with the same ones.
 */
export const CORES = {
  xadrezClaro: css(WORLD.fortStone),
  xadrezEscuro: css(WORLD.palmTrunkDark),
  xadrezMoldura: css(WORLD.coconut),
  damasClaro: css(WORLD.calcadaLight),
  damasEscuro: css(WORLD.flagBlack),
  damasFaixa: css(WORLD.flagRed),
  damasTriangulo: css(WORLD.flagYellow),
  marfim: css(WORLD.line),
  ebano: css(WORLD.shoe),
  caricaClara: css(WORLD.paintWhite),
  caricaClaraBorda: css(WORLD.concrete),
  caricaEscura: css(WORLD.tailLight),
  caricaEscuraBorda: css(WORLD.zincRust),
  ludoChao: css(WORLD.kerb),
  ludoCasa: css(WORLD.vanWhite),
  tinta: css(WORLD.clothBlack),
  dado: css(WORLD.vanWhite),
  ponto: css(WORLD.eyeDark),
  pontoUm: css(WORLD.flagRed),
} as const;

/** The colours of Não te irrites, seat by seat: vermelho, amarelo, verde, azul. */
export const LUDO_CORES = [css(WORLD.flagRed), css(WORLD.flagYellow), css(WORLD.courtGreen), css(WORLD.signBlue)] as const;
/** The darker edge of each, for outlines and shading. */
export const LUDO_FUNDOS = [css(WORLD.hairRed), css(WORLD.ferroDark), css(WORLD.mangueiraLeafDark), css(WORLD.policeNavy)] as const;

/** A square of an 8 × 8 game as seen from seat 0: its row and column on the board as built. */
export function squareSeen(square: number, virado: boolean): { row: number; col: number } {
  const row = Math.floor(square / 8);
  const col = square % 8;
  return virado ? { row: 7 - row, col: 7 - col } : { row, col };
}

/** And back: the game's square under a row and column of the board as built. */
export function squareUnder(row: number, col: number, virado: boolean): number {
  return virado ? (7 - row) * 8 + (7 - col) : row * 8 + col;
}

/** The track's first ten cells for the colour that sits at seat 0, from its start; the other colours' are this turned. */
const TRACK0: readonly (readonly [number, number])[] = [[4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5]];
const HOME0: readonly (readonly [number, number])[] = [[0, 9], [1, 9], [0, 10], [1, 10]];
const GOAL0: readonly (readonly [number, number])[] = [[5, 9], [5, 8], [5, 7], [5, 6]];

/** A cell (column, row) turned a quarter round the board, to the next seat's side. */
const turned = ([col, row]: readonly [number, number], times: number): [number, number] => {
  let at: [number, number] = [col, row];
  for (let n = 0; n < times; n++) at = [10 - at[1], at[0]];
  return at;
};

/** The cell (column, row) of square `n` of the track, 0 to 39 round from seat 0's start. */
export function trackCell(n: number): [number, number] {
  const square = ((n % TRACK) + TRACK) % TRACK;
  return turned(TRACK0[square % 10]!, Math.floor(square / 10));
}

/** Where a piece of Não te irrites is: at home in its colour's corner, round the track, or in its colour's goal. */
export function ludoCell(game: Ludo, seat: number, piece: number): [number, number] {
  const colour = game.colours[seat]!;
  const position = game.pieces[seat]![piece]!;
  if (position === AT_HOME) return turned(HOME0[piece]!, colour);
  if (position >= TRACK) return turned(GOAL0[Math.min(GOAL - 1, position - TRACK)]!, colour);
  return trackCell(colour * 10 + position);
}

/** The cells of a colour's home and goal, and its start: for drawing the board. */
export const homeCells = (colour: number): [number, number][] => HOME0.map((cell) => turned(cell, colour));
export const goalCells = (colour: number): [number, number][] => GOAL0.map((cell) => turned(cell, colour));
export const startCell = (colour: number): [number, number] => trackCell(colour * 10);

/** Draws Não te irrites on a canvas `side` pixels square: the cross of the track, the four homes, the goals, the rose in the middle. */
export function paintLudo(pen: CanvasRenderingContext2D, side: number, ground: string = CORES.ludoChao): void {
  const cell = side / 11;
  pen.fillStyle = ground;
  pen.fillRect(0, 0, side, side);
  const dot = (col: number, row: number, fill: string, edge: string, r = 0.4): void => {
    pen.beginPath();
    pen.arc((col + 0.5) * cell, (row + 0.5) * cell, cell * r, 0, Math.PI * 2);
    pen.fillStyle = fill;
    pen.fill();
    pen.lineWidth = cell * 0.07;
    pen.strokeStyle = edge;
    pen.stroke();
  };
  // Each home is a square of its colour in the corner, with four places in it.
  for (let colour = 0; colour < 4; colour++) {
    const cells = homeCells(colour);
    const col = Math.min(...cells.map((c) => c[0]));
    const row = Math.min(...cells.map((c) => c[1]));
    pen.fillStyle = LUDO_CORES[colour]!;
    pen.beginPath();
    pen.roundRect((col - 0.08) * cell, (row - 0.08) * cell, cell * 2.16, cell * 2.16, cell * 0.35);
    pen.fill();
    for (const [c, r] of cells) dot(c, r, ground, LUDO_FUNDOS[colour]!, 0.36);
  }
  // The track, white places with the start of each colour in its colour; the goals in their colours.
  for (let n = 0; n < TRACK; n++) {
    const [col, row] = trackCell(n);
    const colour = n % 10 === 0 ? n / 10 : -1;
    dot(col, row, colour >= 0 ? LUDO_CORES[colour]! : CORES.ludoCasa, CORES.tinta);
  }
  for (let colour = 0; colour < 4; colour++) for (const [col, row] of goalCells(colour)) dot(col, row, LUDO_CORES[colour]!, CORES.tinta);
  // The middle: four triangles, one of each colour, pointing in.
  const mid = side / 2;
  for (let colour = 0; colour < 4; colour++) {
    const [col, row] = goalCells(colour)[3]!;
    pen.fillStyle = LUDO_CORES[colour]!;
    pen.beginPath();
    pen.moveTo(mid, mid);
    const ax = (col + 0.5) * cell - mid;
    const ay = (row + 0.5) * cell - mid;
    pen.lineTo(mid + ax * 0.62 - ay * 0.5, mid + ay * 0.62 + ax * 0.5);
    pen.lineTo(mid + ax * 0.62 + ay * 0.5, mid + ay * 0.62 - ax * 0.5);
    pen.fill();
  }
}

/** Paints an 8 × 8 board: `light` and `dark` squares inside a frame of `frame` pixels, with a band of `band` round it. */
export function paintSquares(pen: CanvasRenderingContext2D, side: number, frame: number, light: string, dark: string, band: string): void {
  pen.fillStyle = band;
  pen.fillRect(0, 0, side, side);
  const square = (side - frame * 2) / 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      pen.fillStyle = (row + col) % 2 === 1 ? dark : light;
      pen.fillRect(frame + col * square, frame + row * square, square + 0.5, square + 0.5);
    }
  }
}

/** How much of an 8 × 8 board's side its frame takes, each side: the squares are what is left. */
export const FRAME = 1 / 32;
