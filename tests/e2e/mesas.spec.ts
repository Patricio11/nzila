// Every move of every piece, by a thumb, on the board a player has at a table (F-222). Played on /mesa, a board alone
// that keeps the rules without a zone, from positions the address gives: castling both ways, en passant, a pawn made a
// knight, a mate; at damas a run of captures chosen a hop at a time where two runs end on the same square, a man
// crowned, a dama flying to the square chosen; at Não te irrites a piece sent home and a piece brought out with a 6.

import { expect, test, type Page } from "@playwright/test";
import { watch } from "./harness.ts";

/** A chess square by its name ("e4"), as the game numbers them: a8 is 0, h1 is 63. */
const sq = (name: string): number => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
/** A damas square by its row (0 the dark side's back row) and column (0 on the light side's left). */
const rc = (row: number, col: number): number => row * 8 + col;

type Seen = { partida: { jogo: string; estado: { board?: (string | number)[]; pieces?: number[][]; turn: unknown; result?: unknown; winner?: unknown } }; versao: number; recusa: string | null };
const state = (page: Page): Promise<Seen> => page.evaluate(() => window.__mesa as unknown as Seen);

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/mesa?${query}`);
  await page.waitForFunction(() => window.__mesa !== undefined);
  // The board drawn and listening before the first tap: on a busy machine a tap made sooner is lost.
  await page.locator("[data-quadrado], .ms-ludo canvas").first().waitFor();
  await page.waitForTimeout(150);
}

const lit = (page: Page): Promise<number[]> => page.locator(".ms-target[data-casa]").evaluateAll((dots) => dots.map((dot) => Number(dot.getAttribute("data-casa"))).sort((a, b) => a - b));
/** Taps a square of the board (a piece standing on it, or the square itself). */
const tap = (page: Page, square: number): Promise<void> => page.locator(`[data-quadrado="${square}"]`).click({ force: true });
/**
 * Taps a square lit as somewhere to go (it pulses, so it is never still: a thumb does not wait for that), and waits for
 * the board to take it: the game moved on, or the next hop lit.
 */
async function go(page: Page, square: number): Promise<void> {
  const before = JSON.stringify([await page.evaluate(() => window.__mesa!.versao), await lit(page)]);
  await page.locator(`.ms-target[data-casa="${square}"]`).click({ force: true });
  await expect.poll(async () => JSON.stringify([await page.evaluate(() => window.__mesa!.versao), await lit(page)])).not.toBe(before);
}

/** A damas board, row by row from the dark side's back row: each piece at (row, col) as b B (light) or p P (dark). */
const damas = (pieces: [number, number, string][]): string => {
  const squares = Array.from({ length: 64 }, () => ".");
  for (const [row, col, piece] of pieces) squares[rc(row, col)] = piece;
  return squares.join("");
};

test.describe("xadrez, every move by a thumb", () => {
  test("castling, both ways: the king goes two squares and the rook comes round", async ({ page }, info) => {
    const seen = watch(page);
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"));
    await tap(page, sq("e1"));
    await expect.poll(() => lit(page)).toEqual([sq("c1"), sq("d1"), sq("f1"), sq("g1")].sort((a, b) => a - b));
    await page.screenshot({ path: info.outputPath("roque-escolha.png") });
    await go(page, sq("g1"));
    const short = await state(page);
    expect([short.partida.estado.board![sq("g1")], short.partida.estado.board![sq("f1")], short.partida.estado.board![sq("h1")], short.partida.estado.board![sq("e1")]]).toEqual(["K", "R", ".", "."]);
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1"));
    await tap(page, sq("e8"));
    await go(page, sq("c8"));
    const long = await state(page);
    expect([long.partida.estado.board![sq("c8")], long.partida.estado.board![sq("d8")], long.partida.estado.board![sq("a8")]]).toEqual(["k", "r", "."]);
    expect(seen.errors).toEqual([]);
  });

  test("en passant: the pawn that passed is taken from beside", async ({ page }) => {
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"));
    await tap(page, sq("e5"));
    await expect.poll(() => lit(page)).toEqual([sq("d6"), sq("e6")].sort((a, b) => a - b));
    await go(page, sq("d6"));
    const after = await state(page);
    expect([after.partida.estado.board![sq("d6")], after.partida.estado.board![sq("d5")], after.partida.estado.board![sq("e5")]]).toEqual(["P", ".", "."]);
  });

  test("a pawn on the last rank: the player chooses what it becomes, a knight here", async ({ page }, info) => {
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1"));
    await tap(page, sq("b7"));
    // The last rank opens the choice of piece, and nothing moves until it is made.
    await expect.poll(() => lit(page)).toEqual([sq("b8")]);
    await page.locator(`.ms-target[data-casa="${sq("b8")}"]`).click({ force: true });
    const board = page.getByRole("dialog", { name: "Xadrez" });
    await expect(board.locator(".ms-promote button")).toHaveCount(4);
    await page.screenshot({ path: info.outputPath("promocao.png") });
    await board.getByRole("button", { name: "Cavalo" }).click();
    await expect.poll(async () => (await state(page)).partida.estado.board![sq("b8")]).toBe("N");
  });

  test("a mate ends the game, and the board says who won", async ({ page }) => {
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"));
    await tap(page, sq("a1"));
    await go(page, sq("a8"));
    await expect(page.locator(".ms-line")).toHaveText("Ganhaste. Quem perde paga o café.");
    expect((await state(page)).partida.estado.result).toBe("w");
  });

  test("a move the rules do not allow is not offered: a pinned piece has nowhere to go; a king in check must answer it", async ({ page }) => {
    // The white knight on e2 is pinned to the king by the rook on e8; the white king is not in check.
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1"));
    await tap(page, sq("e2"));
    await expect.poll(() => lit(page)).toEqual([]);
    // In check from the rook on e8: only the king's moves off the file, and none onto it.
    await open(page, "jogo=xadrez&fen=" + encodeURIComponent("4r1k1/8/8/8/8/8/8/4K3 w - - 0 1"));
    await tap(page, sq("e1"));
    await expect.poll(() => lit(page)).toEqual([sq("d1"), sq("d2"), sq("f1"), sq("f2")].sort((a, b) => a - b));
  });
});

test.describe("damas, every move by a thumb", () => {
  test("a run of four captures round a diamond and back to where it began, chosen a hop at a time, the pieces marked as it goes", async ({ page }, info) => {
    const seen = watch(page);
    // The light man on 6-2 and four dark men round it: a man captures backward too (as in Luanda), so it goes all the
    // way round, one way or the other, and takes all four (the rule of the most), ending where it started. Where the
    // two ways cross (2-2) is the middle of the run, not its end.
    await open(page, "jogo=damas&vez=0&damas=" + damas([[6, 2, "b"], [5, 1, "p"], [3, 1, "p"], [5, 3, "p"], [3, 3, "p"], [0, 6, "p"]]));
    await tap(page, rc(6, 2));
    await expect.poll(() => lit(page)).toEqual([rc(4, 0), rc(4, 4)]);
    await go(page, rc(4, 4));
    // The first hop: the piece it takes marked, the way drawn, the next hop offered.
    await expect(page.locator(".ms-taken")).toHaveCount(1);
    await expect(page.locator(".ms-route")).toHaveCount(1);
    await expect.poll(() => lit(page)).toEqual([rc(2, 2)]);
    await go(page, rc(2, 2));
    await expect.poll(() => lit(page)).toEqual([rc(4, 0)]);
    await expect(page.locator(".ms-taken")).toHaveCount(2);
    await page.screenshot({ path: info.outputPath("damas-percurso.png") });
    await go(page, rc(4, 0));
    await expect.poll(() => lit(page)).toEqual([rc(6, 2)]);
    await go(page, rc(6, 2));
    const board = (await state(page)).partida.estado.board as number[];
    expect([board[rc(6, 2)], board[rc(5, 3)], board[rc(3, 3)], board[rc(5, 1)], board[rc(3, 1)]]).toEqual([1, 0, 0, 0, 0]);
    expect(seen.errors).toEqual([]);
  });

  test("two runs that share a hop and then part: either can be chosen", async ({ page }) => {
    // A man on 6-2 takes 5-3 and lands on 4-4, from which it can take 3-5 (to 2-6) or 3-3 (to 2-2): two runs that
    // share their first hop and part after it.
    await open(page, "jogo=damas&vez=0&damas=" + damas([[6, 2, "b"], [5, 3, "p"], [3, 5, "p"], [3, 3, "p"], [0, 0, "p"]]));
    await tap(page, rc(6, 2));
    await expect.poll(() => lit(page)).toEqual([rc(4, 4)]);
    await go(page, rc(4, 4));
    await expect.poll(() => lit(page)).toEqual([rc(2, 2), rc(2, 6)]);
    await go(page, rc(2, 6));
    const board = (await state(page)).partida.estado.board as number[];
    expect([board[rc(2, 6)], board[rc(5, 3)], board[rc(3, 5)], board[rc(3, 3)]]).toEqual([1, 0, 0, -1]);
  });

  test("a man reaching the far row is crowned; a dama captures from afar and lands where the player chooses", async ({ page }, info) => {
    await open(page, "jogo=damas&vez=0&damas=" + damas([[1, 1, "b"], [7, 7, "p"]]));
    await tap(page, rc(1, 1));
    await go(page, rc(0, 0));
    expect(((await state(page)).partida.estado.board as number[])[rc(0, 0)]).toBe(2);
    await expect(page.locator(".ms-crown")).toHaveCount(1);
    await open(page, "jogo=damas&vez=0&damas=" + damas([[7, 7, "B"], [4, 4, "p"], [0, 6, "p"]]));
    await tap(page, rc(7, 7));
    await expect.poll(() => lit(page)).toEqual([rc(0, 0), rc(1, 1), rc(2, 2), rc(3, 3)]);
    await page.screenshot({ path: info.outputPath("damas-dama.png") });
    await go(page, rc(1, 1));
    const board = (await state(page)).partida.estado.board as number[];
    expect([board[rc(1, 1)], board[rc(4, 4)], board[rc(7, 7)]]).toEqual([2, 0, 0]);
  });

  test("a capture must be made: with one on the board, a step is not offered", async ({ page }) => {
    await open(page, "jogo=damas&vez=0&damas=" + damas([[5, 1, "b"], [5, 5, "b"], [4, 6, "p"], [0, 0, "p"]]));
    await tap(page, rc(5, 1));
    await expect.poll(() => lit(page)).toEqual([]);
    await tap(page, rc(5, 5));
    await expect.poll(() => lit(page)).toEqual([rc(3, 7)]);
  });
});

test.describe("Não te irrites, every move by a thumb", () => {
  test("a throw, a piece sent home by tapping where it goes; then a 6 brings one out and throws again", async ({ page }, info) => {
    const seen = watch(page);
    // Seat 0 at its square 3; seat 1's piece at its 35, which is the board's 5: a 2 lands on it.
    await open(page, "jogo=ludo&vez=0&dado=2&ludo=" + encodeURIComponent("3,-1,-1,-1;35,-1,-1,-1;-1,-1,-1,-1;-1,-1,-1,-1"));
    const board = page.getByRole("dialog", { name: "Não te irrites" });
    await board.getByRole("button", { name: "Lançar o dado" }).click();
    await expect(page.locator(".ms-target-manda")).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("ludo-manda.png") });
    await page.locator(".ms-target-manda").click({ force: true });
    const sent = await state(page);
    expect(sent.partida.estado.pieces![0]![0]).toBe(5);
    expect(sent.partida.estado.pieces![1]![0]).toBe(-1);
    // A 6 with all at home: a piece comes out onto its start, and the same seat throws again.
    await open(page, "jogo=ludo&vez=0&dado=6");
    await board.getByRole("button", { name: "Lançar o dado" }).click();
    // The four at home are alike: whichever comes out, one stands on the start and three wait.
    await page.locator('[data-peca="vai-0"]').click({ force: true });
    const out = await state(page);
    expect([...out.partida.estado.pieces![0]!].sort((a, b) => a - b)).toEqual([-1, -1, -1, 0]);
    expect(out.partida.estado.turn).toBe(0);
    await expect(board.getByRole("button", { name: "Lançar o dado" })).toBeVisible();
    expect(seen.errors).toEqual([]);
  });
});
