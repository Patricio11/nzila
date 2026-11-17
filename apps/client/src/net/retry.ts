// When a fallen line is tried again, and what the player is told meanwhile
// (Task 3.4). Arithmetic and words only, so that it can be tested without a
// socket or a picture.

/** How long a fallen line is tried again before the player is told: the zone keeps their place as long. */
export const TRY_FOR_MS = 60_000;
/** The waits between tries: quick at first (most falls are a blink), then steady. Milliseconds. */
export const TRY_AFTER_MS = [300, 700, 1500, 3000, 5000];
/** A fall mended within this is never mentioned: no banner for a blink. */
export const SAY_AFTER_MS = 900;
/** With no zone to be had at all, the matchmaker is asked again now and then: milliseconds, and how many times. */
export const ALONE_RETRY_MS = 4000;
/** The longest wait between two looks for a zone when there has been none: the phone never stops looking (the founder, 2026-11-17). */
export const ALONE_RETRY_MOST_MS = 30_000;

/**
 * How it stands with the zone, as the player should be told of it:
 *   alone         no zone; the street is the phone's own
 *   linked        in a channel
 *   reconnecting  the line fell and is being picked up ("A ligar de novo…")
 *   lost          a minute of trying has passed ("Sem rede. Guardámos onde estavas.")
 */
export type NetState = "alone" | "linked" | "reconnecting" | "lost";

/** How long to wait before the next try, given how long ago the line fell and how many tries have been made; null when the time for trying is over. */
export function nextTry(sinceFallMs: number, tries: number): number | null {
  if (sinceFallMs >= TRY_FOR_MS) return null;
  return TRY_AFTER_MS[Math.min(tries, TRY_AFTER_MS.length - 1)]!;
}
