// Scoring for minigames built on timing: tap when the mark comes round. A
// typed stub with the first scorer; Phase 4 (Task 4.5) builds the four
// biscatos on it. The client sends the times of its taps and nothing else:
// the zone scores them with this function, so a score cannot be invented.

import { idiv } from "../fixed.ts";

export const SCORE_MAX = 1000;

export interface TimingRules {
  /** A tap this close to a mark, in milliseconds, is perfect. */
  readonly perfectMs: number;
  /** A tap farther than this from every mark counts for nothing. */
  readonly windowMs: number;
}

/**
 * Scores taps against marks, 0..1000. Each mark is worth an equal share and
 * is matched with at most one tap, the closest unused one inside the window;
 * the share falls off evenly between perfect and the edge of the window.
 * Extra taps earn nothing, so tapping wildly is no better than tapping well.
 */
export function scoreTiming(marksMs: readonly number[], tapsMs: readonly number[], rules: TimingRules): number {
  if (marksMs.length === 0) return 0;
  const used = new Set<number>();
  let total = 0;
  for (const mark of marksMs) {
    let best = -1;
    let bestOff = rules.windowMs + 1;
    for (let i = 0; i < tapsMs.length; i++) {
      const off = Math.abs(tapsMs[i]! - mark);
      if (off < bestOff && !used.has(i)) {
        best = i;
        bestOff = off;
      }
    }
    if (best < 0) continue;
    used.add(best);
    total +=
      bestOff <= rules.perfectMs
        ? SCORE_MAX
        : idiv(SCORE_MAX * (rules.windowMs - bestOff), rules.windowMs - rules.perfectMs);
  }
  return idiv(total, marksMs.length);
}
