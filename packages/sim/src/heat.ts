// Heat: how risky a block is right now. A typed stub: the inputs, the bands
// the map shows, and a first weighted sum. Phase 7 (Task 7.1) fills in decay
// over time and the effect of recent offences. Weights come from tunables.
//
// Rule 7: heat is always computed from what is happening. Nothing here, or
// anywhere, stores a permanent danger value for a place.

import { clamp, idiv } from "./fixed.ts";

export const HEAT_MAX = 1000;

/** What the block is like at this moment. Each input is 0..1000. */
export interface HeatInputs {
  /** 0 at midday, 1000 in the dead of night. */
  readonly darkness: number;
  /** 0 on a street with no working lamps, 1000 on a well lit one. */
  readonly lighting: number;
  /** 0 empty, 1000 packed. */
  readonly crowd: number;
  readonly police: number;
  readonly recentOffences: number;
}

/** How much each input counts, in thousandths. */
export interface HeatWeights {
  readonly darkness: number;
  readonly lighting: number;
  readonly crowd: number;
  readonly police: number;
  readonly recentOffences: number;
}

/** Heat of a block, 0..1000. Dark and recent trouble raise it; light, people and police lower it. */
export function heatValue(inputs: HeatInputs, weights: HeatWeights): number {
  const raised = inputs.darkness * weights.darkness + inputs.recentOffences * weights.recentOffences;
  const lowered = inputs.lighting * weights.lighting + inputs.crowd * weights.crowd + inputs.police * weights.police;
  return clamp(idiv(raised - lowered, 1000), 0, HEAT_MAX);
}

/** The band the Mapa app tints a block with: 0 calm to 3 hot. */
export function heatBand(value: number): 0 | 1 | 2 | 3 {
  if (value < 250) return 0;
  if (value < 500) return 1;
  if (value < 750) return 2;
  return 3;
}
