// Remembers the quality tier chosen for this device, so the ten-second
// benchmark runs once and not at every visit. Stored in the browser only;
// it is a setting of the device, not of the player.

import { TIERS, type TierName } from "./tiers.ts";

const KEY = "nzila.tier";

/** The tier chosen on an earlier visit, or null when none was, or when the browser will not say. */
export function rememberedTier(): TierName | null {
  try {
    const value = localStorage.getItem(KEY);
    return value !== null && Object.hasOwn(TIERS, value) ? (value as TierName) : null;
  } catch {
    // A private window, or storage switched off: play on without remembering.
    return null;
  }
}

export function rememberTier(tier: TierName): void {
  try {
    localStorage.setItem(KEY, tier);
  } catch {
    // Nothing to do: the choice lasts for this visit.
  }
}
