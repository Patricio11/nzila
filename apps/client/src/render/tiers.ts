// The three quality tiers (UX_UI_SPEC.md §0.3), how one is chosen for a
// phone, and how the picture is made smaller, moment by moment, to hold the
// frame rate. No renderer in here: these are the rules, and they are tested.

import { STREAM } from "@nzila/world/client";

export type TierName = "poupanca" | "normal" | "alta";

export interface Tier {
  readonly name: TierName;
  /** The picture is drawn at most this many pixels tall, and stretched to the screen. */
  readonly height: number;
  /** And never fewer than this, however hard the phone is struggling. */
  readonly minHeight: number;
  /** Beyond this many metres the world is lost in haze, which is also what hides streaming. */
  readonly drawDistanceM: number;
  /** "blobs": a soft patch under each body. "sun": a real shadow from the sun, over this many metres round the player. */
  readonly shadows: "blobs" | "sun";
  readonly shadowReachM: number;
  readonly shadowMapSize: number;
  /** People and creatures drawn around the player. */
  readonly crowd: number;
  /** Whether the bay shows moving light on the water. */
  readonly waterSparkle: boolean;
}

export const TIERS: Readonly<Record<TierName, Tier>> = {
  // The reference phone, and what Modo Poupança forces. The game must be beautiful here.
  poupanca: { name: "poupanca", height: 540, minHeight: 432, drawDistanceM: STREAM.poupanca.farM, shadows: "blobs", shadowReachM: 0, shadowMapSize: 0, crowd: 12, waterSparkle: false },
  normal: { name: "normal", height: 720, minHeight: 540, drawDistanceM: STREAM.normal.farM, shadows: "sun", shadowReachM: 28, shadowMapSize: 1024, crowd: 24, waterSparkle: true },
  alta: { name: "alta", height: 1080, minHeight: 720, drawDistanceM: STREAM.alta.farM, shadows: "sun", shadowReachM: 70, shadowMapSize: 2048, crowd: 40, waterSparkle: true },
};

export const FPS_TARGET = 30;

/**
 * Chooses a tier from the ten-second benchmark a phone runs at first play,
 * which is drawn at the Normal tier. `memoryGb` is what the browser reports,
 * when it reports it. The player can change the choice in Definições, and
 * Modo Poupança always means the lowest.
 */
export function chooseTier(bench: { readonly fpsSustained: number }, memoryGb?: number): TierName {
  // Normal did not hold thirty: the lower tier draws less than half the pixels.
  if (bench.fpsSustained < FPS_TARGET + 3) return "poupanca";
  // A phone with little memory stays low whatever its speed: textures are what kills it.
  if (memoryGb !== undefined && memoryGb <= 2) return "poupanca";
  // Alta draws more than twice Normal's pixels and a larger shadow: only with room to spare.
  if (bench.fpsSustained >= 55 && (memoryGb === undefined || memoryGb >= 6)) return "alta";
  return "normal";
}

/**
 * Dynamic resolution. Watches how long frames take and moves the height of
 * the picture between the tier's two limits: down quickly when frames run
 * long, up slowly when there is room, so the picture does not pump.
 */
export class ResolutionGovernor {
  private smoothedMs = 1000 / FPS_TARGET;
  private height: number;
  private readonly tier: Tier;

  constructor(tier: Tier) {
    this.tier = tier;
    this.height = tier.height;
  }

  /** Tells it how long the last frame took. Returns the height to draw the next one at. */
  frame(ms: number): number {
    // A single long frame (a tab coming back, a download finishing) says nothing: no one frame
    // counts for more than two, and it takes several slow ones in a row to move the picture.
    this.smoothedMs += (Math.min(ms, 66) - this.smoothedMs) * 0.08;
    const budget = 1000 / FPS_TARGET;
    if (this.smoothedMs > budget * 1.08) this.height = Math.max(this.tier.minHeight, Math.round(this.height * 0.94));
    else if (this.smoothedMs < budget * 0.8) this.height = Math.min(this.tier.height, Math.round(this.height * 1.02) + 1);
    return this.height;
  }

  get current(): number {
    return this.height;
  }
}
