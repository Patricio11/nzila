// The world clock. Game time is a pure function of real time, so every
// channel, the zone, the API and every phone agree on the hour without
// sending it to each other. The game day does not run at an even pace: the
// stretches of the day are given their own share of real minutes, which is
// how golden hour gets to last.

import { floorDiv, floorMod, idiv } from "./fixed.ts";

export const GAME_DAY_S = 86400;

export interface ClockStretch {
  /** Second of the game day at which the stretch begins. It runs to the next stretch. */
  readonly startGameS: number;
  /** How many real milliseconds the stretch lasts. */
  readonly realMs: number;
}

export interface ClockConfig {
  /** The real time (Unix milliseconds) at which the first stretch of day 0 began. */
  readonly epochMs: number;
  /** In order of startGameS. Together they cover the whole game day. */
  readonly stretches: readonly ClockStretch[];
  readonly sunriseGameS: number;
  readonly sunsetGameS: number;
}

/**
 * One game day in 60 real minutes: 40 of daylight and 20 of night. The hour
 * before sunset takes 10 of the 40, a quarter of the day, by design.
 */
export const DEFAULT_CLOCK: ClockConfig = {
  epochMs: 0,
  stretches: [
    { startGameS: 6 * 3600, realMs: 30 * 60_000 },
    { startGameS: 17 * 3600, realMs: 10 * 60_000 },
    { startGameS: 18 * 3600, realMs: 20 * 60_000 },
  ],
  sunriseGameS: 6 * 3600,
  sunsetGameS: 18 * 3600,
};

interface CompiledStretch {
  readonly startGameS: number;
  readonly gameS: number;
  readonly startRealMs: number;
  readonly realMs: number;
}

export interface WorldClock {
  readonly config: ClockConfig;
  readonly cycleMs: number;
  readonly stretches: readonly CompiledStretch[];
}

export interface GameTime {
  /** Game days since the epoch. The number changes at midnight. */
  readonly day: number;
  /** 0..86399. */
  readonly secondOfDay: number;
  readonly daylight: boolean;
}

function inWindow(second: number, start: number, end: number): boolean {
  return start <= end ? second >= start && second < end : second >= start || second < end;
}

/** Whether a second of the game day falls in a window that may wrap past midnight. */
export const inGameWindow = inWindow;

/** Checks a configuration and prepares it for lookups. Throws on a bad one. */
export function compileClock(config: ClockConfig): WorldClock {
  const list = config.stretches;
  if (list.length === 0) throw new Error("the clock needs at least one stretch");
  const stretches: CompiledStretch[] = [];
  let startRealMs = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const next = i + 1 < list.length ? list[i + 1]!.startGameS : list[0]!.startGameS + GAME_DAY_S;
    const gameS = next - s.startGameS;
    if (!Number.isInteger(s.startGameS) || s.startGameS < 0 || s.startGameS >= GAME_DAY_S) {
      throw new Error("a stretch must start inside the game day");
    }
    if (gameS <= 0) throw new Error("stretches must be in order");
    if (!Number.isInteger(s.realMs) || s.realMs <= 0) throw new Error("a stretch must last a whole, positive time");
    stretches.push({ startGameS: s.startGameS, gameS, startRealMs, realMs: s.realMs });
    startRealMs += s.realMs;
  }
  return { config, cycleMs: startRealMs, stretches };
}

/** The game time at a real time in Unix milliseconds. */
export function gameTimeAt(clock: WorldClock, nowMs: number): GameTime {
  const since = nowMs - clock.config.epochMs;
  const cycle = floorDiv(since, clock.cycleMs);
  const into = floorMod(since, clock.cycleMs);
  let stretch = clock.stretches[0]!;
  for (const s of clock.stretches) {
    if (into >= s.startRealMs) stretch = s;
  }
  const game = stretch.startGameS + idiv((into - stretch.startRealMs) * stretch.gameS, stretch.realMs);
  const secondOfDay = game % GAME_DAY_S;
  return {
    // A cycle starts at the first stretch, not at midnight: once the clock
    // passes midnight inside a cycle it is already the next day.
    day: cycle + (game >= GAME_DAY_S ? 1 : 0),
    secondOfDay,
    daylight: inWindow(secondOfDay, clock.config.sunriseGameS, clock.config.sunsetGameS),
  };
}

/** Real milliseconds from now until the game clock next shows the given second of the day. */
export function msUntilGameSecond(clock: WorldClock, nowMs: number, targetGameS: number): number {
  const first = clock.stretches[0]!.startGameS;
  const game = targetGameS < first ? targetGameS + GAME_DAY_S : targetGameS;
  let stretch = clock.stretches[0]!;
  for (const s of clock.stretches) {
    if (game >= s.startGameS) stretch = s;
  }
  const at = stretch.startRealMs + Math.ceil(((game - stretch.startGameS) * stretch.realMs) / stretch.gameS);
  const into = floorMod(nowMs - clock.config.epochMs, clock.cycleMs);
  return floorMod(at - into, clock.cycleMs);
}
