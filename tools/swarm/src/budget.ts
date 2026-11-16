// What a full channel may cost, and whether a run stayed inside it.

import { type SwarmReport } from "./bots.ts";

export const BUDGET = {
  /** One client's downstream on foot (docs/BUDGETS.md): 2 KB a second. */
  downBytesPerSecond: 2048,
  /** A step of the world has 50 ms; it may use a tenth of that on the mean, and half of it at the worst. */
  stepMeanMs: 5,
  stepWorstMs: 25,
} as const;

export interface ZoneHealth {
  readonly ok: boolean;
  readonly rooms: readonly { readonly name: string; readonly channel: number; readonly players: number; readonly steps: number; readonly meanMs: number; readonly worstMs: number }[];
}

export function verdict(report: SwarmReport, health: ZoneHealth, room: string): { ok: boolean; lines: string[] } {
  const channels = health.rooms.filter((one) => one.name === room);
  const meanMs = Math.max(0, ...channels.map((one) => one.meanMs));
  const worstMs = Math.max(0, ...channels.map((one) => one.worstMs));
  const lines = [
    `  let in            ${report.joined} of ${report.asked}, ${report.stayed} still in at the end`,
    `  channels          ${channels.map((one) => `${one.channel} (${one.players})`).join(", ") || "none seen"}`,
    `  down, per client  ${report.downBytesPerSecond.mean.toFixed(0)} B/s on the mean, ${report.downBytesPerSecond.worst.toFixed(0)} B/s the most (budget ${BUDGET.downBytesPerSecond})`,
    `  snapshots         ${report.snapshotsPerSecond.toFixed(1)} a second; ${report.seen.mean.toFixed(1)} others seen on the mean, ${report.seen.most} at the most; largest message ${report.largestMessage} B`,
    `  a step            ${meanMs.toFixed(2)} ms on the mean, ${worstMs.toFixed(2)} ms at the worst (budget ${BUDGET.stepMeanMs} and ${BUDGET.stepWorstMs})`,
  ];
  const ok = report.joined === report.asked && report.stayed === report.asked && report.downBytesPerSecond.worst <= BUDGET.downBytesPerSecond && meanMs <= BUDGET.stepMeanMs && worstMs <= BUDGET.stepWorstMs;
  return { ok, lines };
}
