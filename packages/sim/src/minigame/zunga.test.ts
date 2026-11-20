import { describe, expect, test } from "vitest";
import { ZUNGA_COMING_MS, ZUNGA_GAP_MS, ZUNGA_GOODS, ZUNGA_INPUTS_MAX, scoreZunga, zungaRound, type Cliente, type ZungaInput } from "./zunga.ts";

const LENGTH = 75_000;

describe("zunga (Task 4.5)", () => {
  test("a round is the same from the same seed; the passers-by come one at a time, quicker as it goes on", () => {
    const round = zungaRound(5, LENGTH);
    expect(zungaRound(5, LENGTH)).toEqual(round);
    expect(zungaRound(6, LENGTH)).not.toEqual(round);
    expect(round.length).toBeGreaterThan(20);
    expect(round.length).toBeLessThan(40);
    expect(round[0]!.from).toBe(ZUNGA_COMING_MS);
    for (let i = 1; i < round.length; i++) expect(round[i]!.from).toBeGreaterThan(round[i - 1]!.until);
    expect(round.every((client) => client.want >= 0 && client.want < ZUNGA_GOODS.length && client.until <= LENGTH)).toBe(true);
    const stays = round.map((client) => client.until - client.from);
    expect(stays.at(-2)!).toBeLessThan(stays[0]!);
    // Never the same thing three times running.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const each = zungaRound(seed, LENGTH);
      for (let i = 2; i < each.length; i++) expect(each[i]!.want === each[i - 1]!.want && each[i]!.want === each[i - 2]!.want).toBe(false);
    }
  });

  test("the right thing to everyone, half a second after they stop, sells to everyone", () => {
    const round = zungaRound(9, LENGTH);
    const inputs = round.map((client): ZungaInput => ({ t: client.from + 500, what: client.want }));
    expect(scoreZunga(round, inputs, LENGTH)).toEqual({ score: 1000, sold: round.length, wrong: 0, clients: round.length });
  });

  test("the wrong thing sends them on; the first tap answers them; taps when nobody stands there count for nothing", () => {
    const round: Cliente[] = [{ from: 1000, until: 3000, want: 2 }, { from: 4000, until: 6000, want: 0 }];
    expect(scoreZunga(round, [{ t: 1500, what: 1 }, { t: 1800, what: 2 }], LENGTH)).toEqual({ score: 0, sold: 0, wrong: 1, clients: 2 });
    expect(scoreZunga(round, [{ t: 500, what: 2 }, { t: 3500, what: 0 }, { t: 4500, what: 0 }], LENGTH)).toEqual({ score: 500, sold: 1, wrong: 0, clients: 2 });
    // Walked on: a tap after they left is for whoever stands there next, if anyone.
    expect(scoreZunga(round, [{ t: 3200, what: 2 }], LENGTH).sold).toBe(0);
    expect(scoreZunga([], [], LENGTH)).toEqual({ score: 0, sold: 0, wrong: 0, clients: 0 });
  });

  test("taps faster than a hand, out of order, after the round or past a hand's count, count for nothing", () => {
    const round: Cliente[] = [{ from: 1000, until: 3000, want: 2 }];
    // A wrong thing and then the right one, too close together: only the first counts.
    expect(scoreZunga(round, [{ t: 1500, what: 1 }, { t: 1500 + ZUNGA_GAP_MS - 1, what: 2 }], LENGTH).sold).toBe(0);
    expect(scoreZunga(round, [{ t: 2000, what: 1 }, { t: 1500, what: 2 }], LENGTH)).toMatchObject({ sold: 0, wrong: 1 });
    expect(scoreZunga([{ from: 1000, until: 80_000, want: 2 }], [{ t: LENGTH + 1, what: 2 }], LENGTH).sold).toBe(0);
    const many = [...Array.from({ length: ZUNGA_INPUTS_MAX }, (): ZungaInput => ({ t: 0, what: 0 })), { t: 1500, what: 2 }];
    expect(scoreZunga(round, many, LENGTH).sold).toBe(0);
  });
});
