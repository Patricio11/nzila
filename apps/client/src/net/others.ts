// Everyone else, a moment ago (Task 3.3). The zone says where people are ten
// times a second, and the network delivers that unevenly. Drawn as it
// arrives, a walk would stutter. So the others are drawn slightly in the
// past, between two things the zone really said: far enough back that there
// is nearly always a next word to glide towards, and no farther. How far
// back is measured: a steady network gets a short delay, a ragged one a
// longer one, changed slowly so that nobody is seen to speed up or stall.
//
// Nothing here knows about sockets or pictures.

import { type EntityState, type Snapshot } from "@nzila/protocol";
import { DEFAULT_CHARACTER, SIM_STEP_MS } from "@nzila/sim";

/** The shortest and the longest the others are drawn behind the zone's word, in milliseconds. */
export const DELAY_LEAST_MS = 130;
export const DELAY_MOST_MS = 600;
/** How fast the delay may change: milliseconds of delay per second of play, so that the change is never seen. */
const DELAY_DRIFT_PER_S = 60;
/** What the zone said is kept this long. */
const KEPT_MS = 1500;
/**
 * Nobody is ever drawn jumping (gate of 2026-11-19, F-220). When where someone is to be drawn leaps (a word that came
 * late after a silence; or the zone itself moving them in a burst, when their own phone's steps reached it late), the
 * body catches up briskly instead: never faster than this many times their pace, and this much more, metres a
 * second. Farther than SNAP_M is not a step but a change of place (boarding, a door): that is drawn at once.
 */
export const CATCH_UP_PACE = 1.8;
export const CATCH_UP_EXTRA_M_S = 1;
export const SNAP_M = 4;
/** How quickly the pace a catch-up is measured against follows someone's real pace: a burst does not raise it. */
const PACE_FOLLOWS_MS = 250;
/** Nobody on foot goes faster than a run. */
const RUN_M_S = DEFAULT_CHARACTER.runMmPerS / 1000;

export interface Seen {
  readonly id: number;
  /** Metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians, as the picture turns a body. */
  readonly facing: number;
  /** Metres a second, along the ground. */
  readonly speed: number;
  /** What they are doing (DOING), as the zone last said before this moment. */
  readonly anim: number;
  /** The vehicle they ride (its place in the district's list) and their seat in it; null on foot. */
  readonly vehicleId: number | null;
  readonly seat: number | null;
}

interface Word {
  /** The zone's time: its tick, in milliseconds. */
  readonly at: number;
  readonly state: EntityState;
}

const turn = (from: number, to: number, k: number): number => from + ((((to - from) % 36_000) + 54_000) % 36_000 - 18_000) * k;

export class Others {
  private readonly said = new Map<number, Word[]>();
  /** The zone's time minus the phone's, as nearly as the quickest arrivals show it. */
  private ahead: number | null = null;
  /** How late arrivals run behind the quickest, smoothed. */
  private late = 0;
  private delay = DELAY_LEAST_MS;
  private lastAt: number | null = null;
  /** Where each was drawn last, in metres, and when: what a leap is caught up from. */
  private readonly drawn = new Map<number, { x: number; y: number; z: number; at: number; pace: number }>();

  /** How far in the past the others are drawn now, in milliseconds: for the tests and the meter. */
  get delayMs(): number {
    return this.delay;
  }

  /** A snapshot arrived. `self` is the player's own body, which is not one of the others. */
  take(snapshot: Snapshot, self: number, nowMs: number): void {
    const at = snapshot.tick * SIM_STEP_MS;
    const ahead = at - nowMs;
    // The quickest arrival is the truest clock; later ones say how ragged the line is.
    this.ahead = this.ahead === null || ahead > this.ahead ? ahead : this.ahead + (ahead - this.ahead) * 0.02;
    const lateness = this.ahead - ahead;
    this.late = lateness > this.late ? lateness : this.late + (lateness - this.late) * 0.05;
    const here = new Set<number>();
    for (const state of snapshot.entities) {
      if (state.id === self) continue;
      here.add(state.id);
      const words = this.said.get(state.id) ?? [];
      if (words.length > 0 && words[words.length - 1]!.at >= at) continue;
      words.push({ at, state });
      while (words.length > 2 && words[0]!.at < at - KEPT_MS) words.shift();
      this.said.set(state.id, words);
    }
    // Whoever the zone no longer speaks of has left, or is out of sight.
    for (const id of this.said.keys()) {
      if (here.has(id)) continue;
      this.said.delete(id);
      this.drawn.delete(id);
    }
  }

  /** Where the zone last said each of the others is, in its own units: what the player's body may not walk into. */
  latest(): EntityState[] {
    return [...this.said.values()].map((words) => words[words.length - 1]!.state);
  }

  /** Everyone else as they are to be drawn at this moment. */
  at(nowMs: number): Seen[] {
    if (this.ahead === null) return [];
    // One snapshot's wait, the raggedness twice over, and a little: eased, never jumped.
    const wanted = Math.min(DELAY_MOST_MS, Math.max(DELAY_LEAST_MS, SIM_STEP_MS * 2 + this.late * 2 + 30));
    const drift = this.lastAt === null ? Infinity : ((nowMs - this.lastAt) / 1000) * DELAY_DRIFT_PER_S;
    this.delay += Math.max(-drift, Math.min(drift, wanted - this.delay));
    this.lastAt = nowMs;
    const when = nowMs + this.ahead - this.delay;
    const seen: Seen[] = [];
    for (const [id, words] of this.said) {
      let next = words.findIndex((word) => word.at > when);
      // Nothing newer yet: they stand where they were last said to be. Nothing older: the same, at their first place.
      if (next === -1) next = words.length;
      const a = words[Math.max(0, next - 1)]!;
      const b = words[Math.min(words.length - 1, next)]!;
      const k = b.at === a.at ? 0 : Math.min(1, Math.max(0, (when - a.at) / (b.at - a.at)));
      const speed = b.at === a.at ? 0 : Math.hypot(b.state.x - a.state.x, b.state.z - a.state.z) / (b.at - a.at);
      let x = (a.state.x + (b.state.x - a.state.x) * k) / 1000;
      let y = (a.state.y + (b.state.y - a.state.y) * k) / 1000;
      let z = (a.state.z + (b.state.z - a.state.z) * k) / 1000;
      // A leap is caught up, not jumped; riders go with their vehicle, which is drawn by its own rules.
      const was = this.drawn.get(id);
      const elapsed = was ? Math.max(0, nowMs - was.at) : 0;
      const pace = was ? was.pace + (Math.min(speed, RUN_M_S) - was.pace) * Math.min(1, elapsed / PACE_FOLLOWS_MS) : Math.min(speed, RUN_M_S);
      if (was && b.state.vehicleId === null) {
        const gap = Math.hypot(x - was.x, y - was.y, z - was.z);
        const most = ((pace * CATCH_UP_PACE + CATCH_UP_EXTRA_M_S) * elapsed) / 1000;
        if (gap > most && gap < SNAP_M) {
          const part = most / gap;
          x = was.x + (x - was.x) * part;
          y = was.y + (y - was.y) * part;
          z = was.z + (z - was.z) * part;
        }
      }
      this.drawn.set(id, { x, y, z, at: nowMs, pace });
      seen.push({
        id,
        x,
        y,
        z,
        facing: (turn(a.state.yaw, b.state.yaw, k) * Math.PI) / 18_000,
        speed,
        anim: a.state.anim,
        vehicleId: b.state.vehicleId,
        seat: b.state.seat,
      });
    }
    return seen;
  }
}
