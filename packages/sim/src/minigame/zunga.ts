// Zunga (Task 4.5, D-4.22): a bacia on the head along the Marginal. Passers-by come one at a time, each wanting one
// thing from the bacia (banana, ginguba, a bag of water, bread); the thumb gives them it before they walk on. The
// wrong thing, and they go without buying. They come quicker as the afternoon goes on, and stop for less long.
//
// The round is made from a seed, the same on the phone and the zone; the phone sends the time of each tap and which
// thing it was, and the zone replays them here. Taps closer together than a hand can tap count once.

import { idiv } from "../fixed.ts";
import { createRng, rngRange } from "../rng.ts";
import { SCORE_MAX } from "./timing.ts";

/** What the bacia holds, in the order of its places: banana, ginguba, a bag of water, bread. */
export const ZUNGA_GOODS = ["banana", "ginguba", "agua", "pao"] as const;

/** A tap on one thing in the bacia, at a time from the round's start: `what` is its place in ZUNGA_GOODS. */
export interface ZungaInput {
  readonly t: number;
  readonly what: number;
}

/** A passer-by: from when they stop to when they walk on (milliseconds), and the thing they want. */
export interface Cliente {
  readonly from: number;
  readonly until: number;
  readonly want: number;
}

/** How long a passer-by takes to walk up before stopping, in milliseconds: they are seen coming. */
export const ZUNGA_COMING_MS = 700;
/** Taps closer together than this count once. */
export const ZUNGA_GAP_MS = 120;
/** The most inputs a round may have. */
export const ZUNGA_INPUTS_MAX = 2000;

/**
 * The round's passers-by: one after another, each stopping for 2,6 s at the start down to 1,3 s at the end, with
 * 0,3 to 0,9 s between one walking on and the next stopping; never the same thing wanted three times running.
 */
export function zungaRound(seed: number, lengthMs: number): Cliente[] {
  const rng = createRng(seed);
  const clients: Cliente[] = [];
  let from = ZUNGA_COMING_MS;
  while (from < lengthMs) {
    const late = idiv(from * 100, lengthMs);
    const until = Math.min(lengthMs, from + 2600 - idiv(1300 * late, 100));
    let want = rngRange(rng, 0, ZUNGA_GOODS.length - 1);
    const [a, b] = [clients.at(-1)?.want, clients.at(-2)?.want];
    if (a === want && b === want) want = (want + 1) % ZUNGA_GOODS.length;
    clients.push({ from, until, want });
    from = until + rngRange(rng, 300, 900) + ZUNGA_COMING_MS;
  }
  return clients;
}

export interface ZungaScore {
  /** 0 to 1 000: the passers-by who bought, out of every one of the round. */
  readonly score: number;
  readonly sold: number;
  /** Given the wrong thing. */
  readonly wrong: number;
  readonly clients: number;
}

/**
 * Replays the taps. A passer-by is answered by the first tap while they stand there: the thing they want is a sale,
 * any other sends them on without buying. Taps while nobody stands there, faster than a hand, out of order, after the
 * round or past a hand's count, count for nothing.
 */
export function scoreZunga(clients: readonly Cliente[], inputs: readonly ZungaInput[], lengthMs: number): ZungaScore {
  let sold = 0;
  let wrong = 0;
  let next = 0;
  let lastTap = -ZUNGA_GAP_MS;
  let lastT = 0;
  for (const input of inputs.slice(0, ZUNGA_INPUTS_MAX)) {
    if (input.t < lastT || input.t > lengthMs) break;
    lastT = input.t;
    if (input.t - lastTap < ZUNGA_GAP_MS) continue;
    lastTap = input.t;
    while (next < clients.length && clients[next]!.until < input.t) next += 1;
    const client = clients[next];
    if (!client || input.t < client.from) continue;
    if (input.what === client.want) sold += 1;
    else wrong += 1;
    next += 1;
  }
  const count = clients.length;
  return { score: count === 0 ? 0 : idiv(sold * SCORE_MAX, count), sold, wrong, clients: count };
}
