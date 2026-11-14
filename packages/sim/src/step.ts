// The fixed step. The world advances 20 times a second, always by the same
// 50 ms, whatever the frame rate of the device drawing it.

export const SIM_HZ = 20;
export const SIM_STEP_MS = 1000 / SIM_HZ;

/** Time carried between frames by whoever drives the simulation. */
export interface StepAccumulator {
  ms: number;
}

/**
 * Adds the time since the last frame and returns how many steps to run now.
 * The caller supplies the elapsed time; the simulation never reads a clock.
 * A long stall (a backgrounded tab, a slow frame) is capped at maxSteps and
 * the backlog beyond it is dropped, so the game never spirals trying to catch
 * up.
 */
export function takeSteps(acc: StepAccumulator, elapsedMs: number, maxSteps = 5): number {
  acc.ms += Math.max(0, elapsedMs);
  const due = Math.floor(acc.ms / SIM_STEP_MS);
  if (due > maxSteps) {
    acc.ms = 0;
    return maxSteps;
  }
  acc.ms -= due * SIM_STEP_MS;
  return due;
}

/** How far the renderer is between the last step and the next, 0..999. */
export function stepPermille(acc: StepAccumulator): number {
  return Math.floor((acc.ms * 1000) / SIM_STEP_MS);
}
