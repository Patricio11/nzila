// The budgets a pack is held to (Rules 1 and 2, D-0.30). docs/BUDGETS.md
// (Task 0.9) explains how each is measured on the reference phone; these are
// the numbers `pack check` enforces before a pack can be published.

export const PACK_BUDGETS = {
  /** One streamed chunk at the Normal tier. */
  chunkNormalBytes: 400_000,
  /** A whole district at the Normal tier. */
  districtNormalBytes: 8_000_000,
  /** First play is under 6 MB including the shell; this is what is left for the first view of the world. */
  firstViewBytes: 6_000_000 - 300_000,
  /** Triangles in view. */
  trisInView: 120_000,
  /** The world's share of the 120 draw calls at Poupança. */
  worldDrawsInView: 60,
  /** A district must be loved for something: at least this many positive points of interest (Rule 7). */
  positivePois: 5,
} as const;

/**
 * How far detail reaches, in metres, for the estimate of what is in view from
 * a point. Placeholders until the renderer and its fog exist (Task 1.1): the
 * check is worth having now, and the numbers are corrected by measurement.
 */
export const VIEW = { nearM: 96, farM: 256 } as const;
