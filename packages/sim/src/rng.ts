// Seeded random numbers and hashing. The simulation never calls Math.random:
// the same seed must give the same world on the phone and on the zone server.

/** Generator state. One 32-bit integer, so it copies and serialises trivially. */
export interface Rng {
  s: number;
}

export function createRng(seed: number): Rng {
  return { s: seed | 0 };
}

/** Next unsigned 32-bit integer (mulberry32). */
export function rngU32(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = Math.imul(rng.s ^ (rng.s >>> 15), 1 | rng.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** Integer in 0..n-1. n must be between 1 and 2^20. */
export function rngInt(rng: Rng, n: number): number {
  return Math.floor((rngU32(rng) * n) / 4294967296);
}

/** Integer in min..max, both included. */
export function rngRange(rng: Rng, min: number, max: number): number {
  return min + rngInt(rng, max - min + 1);
}

/** True with a probability of permille in a thousand. */
export function rngChance(rng: Rng, permille: number): boolean {
  return rngInt(rng, 1000) < permille;
}

function mixWord(h: number, value: number): number {
  let k = Math.imul(value | 0, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

function finish(h: number, count: number): number {
  h ^= count;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Hash of a list of integers to an unsigned 32-bit integer (murmur3 mixing).
 * Used for stateless randomness ("what does the crowd at this stop look like
 * at this minute") and for comparing two simulation states.
 */
export function hashInts(seed: number, values: readonly number[]): number {
  let h = seed | 0;
  for (const value of values) h = mixWord(h, value);
  return finish(h, values.length);
}
