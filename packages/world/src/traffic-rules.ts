// The street's traffic as rules (findings F-133, F-152, F-180): where every
// vehicle is, and when one waits. A vehicle's place comes from its timetable
// and the clock; one that must wait falls behind its timetable (its lag) and
// makes the time up, a little faster than it would drive, once the road is
// clear. It waits for a person in the road ahead and for the vehicle in front.
//
// One set of rules, run in two places. A zone runs them for everyone in a
// channel and tells each phone the lags (D-3.2), so that two players see the
// same van stand for the same person. A phone that walks alone runs them for
// itself. No renderer, no network, no randomness: only arithmetic.

import { DEFAULT_CLOCK, compileClock, compileRoute, routeVehiclesAt, type Route, type RouteVehicle } from "@nzila/sim";
import { actorAt, type CrowdVehicle } from "./crowd-plan.ts";

/** First numbers, to be tuned on the street: about 30 km/h, twelve seconds at a paragem. */
export const CRUISE_MM_PER_S = 8300;
export const RAMP_MS = 3500;
export const DWELL_MS = 12_000;
/** The van's size on the ground (art/scripts/vehicles.py). */
export const VAN_HALF_WIDTH_MM = 850;
export const VAN_HALF_LENGTH_MM = 2350;

/** How far ahead a driver looks, how far short of a person and of a vehicle they stop, and how much faster they make up time. */
const LOOK_M = 9;
const STOP_SHORT_PERSON_M = 1.4;
const STOP_SHORT_VEHICLE_M = 1.3;
const CATCH_UP = 0.3;
/** How far to the side of the vehicle's own width someone still counts as in its way. */
const BESIDE_M = 0.45;
/** A vehicle that has stood this long for other vehicles alone goes on for a while regardless: no knot of traffic lasts. */
const PATIENCE_MS = 14_000;
const PUSH_ON_MS = 4_000;
/** A roamer taken off the road comes back when its place is clear and nobody is nearer than this to see it arrive. */
export const RETURN_UNSEEN_M = 45;
/** How much room two vehicles keep between their bodies at the least, in metres: they never touch. */
const CLEAR_M = 0.3;
/** Two vehicles found one inside the other, neither able to move without touching, are parted after this long. */
export const KNOT_MS = 600;
/** A vehicle the zone's new word puts somewhere else is brought there over this long, never jumped. */
const EASE_MS = 400;

const clock = compileClock(DEFAULT_CLOCK);

/** A linha of the pack as the rules need it: its loop in metres, its paragens' points, its headway. */
export function vanRoute(points: readonly (readonly [number, number, number])[], stopPoints: readonly number[], headwaySeconds: number): Route {
  return compileRoute({
    points: points.map(([x, y, z]) => ({ x: Math.round(x * 1000), y: Math.round(y * 1000), z: Math.round(z * 1000) })),
    stops: stopPoints.map((pointIndex) => ({ pointIndex, dwellMs: DWELL_MS })),
    cruiseMmPerS: CRUISE_MM_PER_S,
    rampMs: RAMP_MS,
    headwayMs: headwaySeconds * 1000,
    // All day and all night for now: when the last van runs is a tunable to come.
    serviceStartGameS: 0,
    serviceEndGameS: 86_400,
  });
}

/** Someone on foot the traffic must not run down, in metres. */
export interface Afoot {
  readonly x: number;
  readonly z: number;
}

export interface Moving {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** Radians; forward is (sin, cos). */
  readonly heading: number;
  readonly halfWidth: number;
  readonly halfLength: number;
}

/** Where a vehicle is now: for a van, what its timetable says of it too (its paragem, whether it stands there). */
export interface VehiclePose extends Moving {
  readonly van?: RouteVehicle & { readonly line: string };
  readonly roamer?: number;
}

/**
 * What a vehicle does that is inside another and cannot move (finding F-180). Two timetables, or a return to the
 * road, can put one vehicle on top of another; "a body does not go where another body is" then holds both where
 * they are for ever, each waiting for the other. After a moment: one of the other traffic leaves the road (it comes
 * back when its place is clear and nobody is looking); a candongueiro, which people ride and wait for, drives on.
 */
export function untangle(roamer: boolean, knotMs: number): "wait" | "leave" | "push" {
  return KNOT_MS > knotMs ? "wait" : roamer ? "leave" : "push";
}

/**
 * Whether the bodies of two vehicles overlap, each grown by `margin` all round. Two rectangles on
 * the ground, at any angle: they are apart when some edge of one has the whole of the other beyond it.
 */
export function touching(a: Moving, b: Moving, margin = 0): boolean {
  if (Math.abs(a.y - b.y) > 1.5) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [first, second] of [[a, b], [b, a]] as const) {
    // The two axes of `first`: along it and across it. `second`'s reach along each is the sum of its own halves, turned.
    const axes = [[Math.sin(first.heading), Math.cos(first.heading), first.halfLength], [Math.cos(first.heading), -Math.sin(first.heading), first.halfWidth]] as const;
    for (const [ax, az, mine] of axes) {
      const theirs = Math.abs(Math.sin(second.heading) * ax + Math.cos(second.heading) * az) * second.halfLength + Math.abs(Math.cos(second.heading) * ax - Math.sin(second.heading) * az) * second.halfWidth;
      if (Math.abs(dx * ax + dz * az) > mine + theirs + margin * 2) return false;
    }
  }
  return true;
}

/**
 * How freely a vehicle may go, from 0 (it must stand) to 1 (the road is clear):
 * less the nearer someone on foot or the vehicle in front is, ahead of it and in its lane.
 */
export function wayAhead(me: Moving, others: readonly Moving[], afoot: readonly Afoot[], heedVehicles = true): number {
  const sin = Math.sin(me.heading);
  const cos = Math.cos(me.heading);
  let free = 1;
  const ahead = (x: number, z: number): { forward: number; beside: number } => ({ forward: (x - me.x) * sin + (z - me.z) * cos, beside: Math.abs((x - me.x) * cos - (z - me.z) * sin) });
  if (1.5 > me.y) {
    for (const person of afoot) {
      const { forward, beside } = ahead(person.x, person.z);
      if (forward > 0 && beside < me.halfWidth + BESIDE_M) free = Math.min(free, (forward - me.halfLength - STOP_SHORT_PERSON_M) / (LOOK_M - STOP_SHORT_PERSON_M));
    }
  }
  for (const other of heedVehicles ? others : []) {
    if (other.key === me.key || Math.abs(other.y - me.y) > 1.5) continue;
    const same = Math.sin(other.heading) * sin + Math.cos(other.heading) * cos;
    const { forward, beside } = ahead(other.x, other.z);
    if (same >= 0.5) {
      // The one in front, going the same way: keep a gap behind it.
      if (forward > 0.05 && beside < 1.4) free = Math.min(free, (forward - me.halfLength - other.halfLength - STOP_SHORT_VEHICLE_M) / 5);
    } else if (same > -0.5 && other.key < me.key) {
      // One that crosses the way ahead. Of two that meet at a crossing one must go first: the one
      // whose name sorts first, always, so that they never both wait. (What comes the other way,
      // in its own lane, is nobody's business.) A crossing vehicle lies across the lane, so it is
      // in the way from further to the side.
      if (forward > 0.05 && beside < other.halfLength + me.halfWidth + 0.3) free = Math.min(free, (forward - me.halfLength - other.halfWidth - STOP_SHORT_VEHICLE_M) / 5);
    }
  }
  return Math.min(1, Math.max(0, free));
}

/**
 * The waiting of the street's traffic, as one side tells another: for each vehicle that is behind its timetable or
 * off the road, by its place in `TrafficRules.keys`, how far behind it is and how fast that is changing.
 */
export interface TrafficState {
  /** The clock of whoever decided, Unix milliseconds. */
  readonly nowMs: number;
  readonly vehicles: readonly { readonly index: number; readonly lagMs: number; /** Milliseconds of lag a millisecond, -1 to 1. */ readonly rate: number; readonly away: boolean }[];
}

export interface RoamerPlan {
  readonly plan: CrowdVehicle;
  readonly halfWidthMm: number;
  readonly halfLengthMm: number;
}

export class TrafficRules {
  /** Every vehicle by its name: the other traffic ("r0"…) in the order of the pack, then the vans ("<linha>/<n>"). */
  readonly keys: readonly string[];
  private readonly lines: readonly { readonly id: string; readonly route: Route }[];
  private readonly roamers: readonly RoamerPlan[];
  /** How far behind its timetable each vehicle is, in milliseconds, for having given way; and how fast that changed. */
  private readonly lag = new Map<string, number>();
  private readonly rate = new Map<string, number>();
  /** How long each has stood for other vehicles alone; below zero, it is pushing on for that long yet. */
  private readonly stood = new Map<string, number>();
  /** Vehicles taken off the road for a while because they were in a knot that would not come undone (roamers only). */
  private readonly away = new Set<string>();
  /** How long each has been inside another and held there. */
  private readonly knot = new Map<string, number>();
  /** What another side said, and when by its clock: followed instead of deciding. */
  private told: { readonly state: TrafficState; readonly lag: ReadonlyMap<string, { lagMs: number; rate: number }> } | null = null;
  /** Where a vehicle was drawn before the last word came, less where that word puts it: eased away, never jumped. */
  private readonly eased = new Map<string, { deltaMs: number; fromMs: number }>();
  /** Where every vehicle was at the last placing. */
  poses: VehiclePose[] = [];
  /** How many vehicles are slowing or standing for the viewer themself, at the last step: for the tests. */
  heeding = 0;

  constructor(lines: readonly { readonly id: string; readonly route: Route }[], roamers: readonly RoamerPlan[]) {
    this.lines = lines;
    this.roamers = roamers;
    this.keys = [...roamers.map((_, n) => `r${n}`), ...lines.flatMap((line) => Array.from({ length: line.route.vehicleCount }, (_, n) => `${line.id}/${n}`))];
  }

  /** How far behind its timetable a vehicle is at `nowMs`: decided here, or as the other side said and carried on. */
  lagOf(key: string, nowMs: number): number {
    if (!this.told) return this.lag.get(key) ?? 0;
    const said = this.told.lag.get(key);
    const told = said ? said.lagMs + said.rate * (nowMs - this.told.state.nowMs) : 0;
    const ease = this.eased.get(key);
    const left = ease ? ease.deltaMs * Math.max(0, 1 - (nowMs - ease.fromMs) / EASE_MS) : 0;
    return Math.max(0, told + left);
  }

  isAway(key: string): boolean {
    return this.told ? this.told.state.vehicles.some((one) => one.away && this.keys[one.index] === key) : this.away.has(key);
  }

  /**
   * Decides who waits, for `elapsedMs` of time ending at `nowMs`, and places every vehicle. `afoot`: everyone on
   * foot near the road (people the traffic gives way to). `watchers`: whoever might see a vehicle come back to the
   * road. `viewer`: the one person whose own effect is counted, for the tests.
   */
  step(nowMs: number, elapsedMs: number, afoot: readonly Afoot[], watchers: readonly Afoot[], viewer: Afoot | null = null): VehiclePose[] {
    this.told = null;
    if (elapsedMs > 0) {
      const step = Math.min(elapsedMs, 250);
      const moving = this.poses;
      this.heeding = viewer ? moving.filter((me) => 1 > wayAhead(me, [], [viewer])).length : 0;
      const placed = new Map<string, Moving>();
      for (const me of [...moving].sort((a, b) => (a.key < b.key ? -1 : 1))) {
        const stood = this.stood.get(me.key) ?? 0;
        const free = wayAhead(me, moving, afoot, stood >= 0);
        // Standing for vehicles only (people are always waited for): patience runs out, then it pushes on, then it is patient again.
        const held = free < 0.05 && wayAhead(me, [], afoot) > 0.05;
        const next = stood < 0 ? Math.min(0, stood + step) : held ? stood + step : 0;
        if (next > PATIENCE_MS) this.stood.set(me.key, -PUSH_ON_MS);
        else if (next === 0) this.stood.delete(me.key);
        else this.stood.set(me.key, next);
        const before = this.lag.get(me.key) ?? 0;
        let lag = Math.max(0, before + step * (1 - free) - (free === 1 ? step * CATCH_UP : 0));
        // And whatever the driver judged, a body does not go where another body is (founder, 2026-11-16: "cars should
        // not brush each other: if they do it is an accident"). Where it would be is tried against where every other
        // vehicle is: those already moved this turn, and the rest where they stood. If it would touch one, it stays
        // exactly where it is. (Two that timetables put on top of one another may still move apart.)
        const there = this.poseOf(me.key, nowMs, lag) ?? me;
        const others = moving.map((other) => placed.get(other.key) ?? other);
        let stopped = others.some((other) => other.key !== me.key && touching(there, other, CLEAR_M) && !(touching(me, other, CLEAR_M) && Math.hypot(there.x - other.x, there.z - other.z) > Math.hypot(me.x - other.x, me.z - other.z)));
        // Held, and already inside another: a knot. It is given a moment, then undone.
        const inside = stopped && others.some((other) => other.key !== me.key && touching(me, other));
        const knotted = inside ? (this.knot.get(me.key) ?? 0) + step : 0;
        if (knotted > 0) this.knot.set(me.key, knotted);
        else this.knot.delete(me.key);
        const undo = inside ? untangle(me.key.startsWith("r"), knotted) : "wait";
        if (undo === "push") stopped = false;
        if (stopped) lag = before + elapsedMs;
        placed.set(me.key, stopped ? me : there);
        this.rate.set(me.key, Math.max(-1, Math.min(1, (lag - before) / elapsedMs)));
        if (lag > 0) this.lag.set(me.key, lag);
        else this.lag.delete(me.key);
        // A knot that will not come undone: after its patience a roamer leaves the road.
        if (undo === "leave" || (stopped && me.key.startsWith("r") && (this.stood.get(me.key) ?? 0) < 0)) {
          this.away.add(me.key);
          this.lag.delete(me.key);
          this.rate.delete(me.key);
          this.stood.delete(me.key);
          this.knot.delete(me.key);
        }
      }
      // A roamer off the road comes back when its place is clear and nobody is near enough to see it arrive.
      for (const key of this.away) {
        const back = this.poseOf(key, nowMs, 0);
        if (back && watchers.every((one) => Math.hypot(back.x - one.x, back.z - one.z) > RETURN_UNSEEN_M) && ![...placed.values()].some((other) => touching(back, other, 2))) this.away.delete(key);
      }
    }
    return this.place(nowMs);
  }

  /** Follows what another side decided (a zone, for a phone among people): until `step` is called again. */
  follow(state: TrafficState, nowMs = state.nowMs): void {
    // Eased only from one word of the zone to the next: the first word, as a phone comes among people, is taken at once.
    const before = this.told ? new Map(this.keys.map((key) => [key, this.lagOf(key, nowMs)])) : new Map<string, number>();
    // Carried into this side's own: if the other side falls silent, deciding here goes on from where it left off.
    this.lag.clear();
    this.away.clear();
    for (const one of state.vehicles) {
      const key = this.keys[one.index];
      if (key === undefined) continue;
      if (one.away) this.away.add(key);
      else this.lag.set(key, one.lagMs);
    }
    this.told = { state, lag: new Map(state.vehicles.filter((one) => !one.away).map((one) => [this.keys[one.index] ?? "", { lagMs: one.lagMs, rate: one.rate }])) };
    // Where each was drawn and where the new word puts it: the difference is eased away over a moment.
    this.eased.clear();
    for (const [key, was] of before) {
      const now = this.lagOf(key, nowMs);
      if (Math.abs(was - now) > 1) this.eased.set(key, { deltaMs: was - now, fromMs: nowMs });
    }
  }

  /** Forgets every wait: each vehicle where its timetable alone says (a still). */
  reset(): void {
    this.told = null;
    this.eased.clear();
    for (const map of [this.lag, this.rate, this.stood, this.knot]) map.clear();
    this.away.clear();
  }

  /** Whether this side is following another's decisions now. */
  get following(): boolean {
    return this.told !== null;
  }

  /** What this side decided, to tell another: only vehicles that are behind or off the road. */
  state(nowMs: number): TrafficState {
    const vehicles = [];
    for (const [index, key] of this.keys.entries()) {
      const away = this.away.has(key);
      const lagMs = this.lag.get(key) ?? 0;
      if (away || lagMs > 0) vehicles.push({ index, lagMs: Math.round(lagMs), rate: Math.round((this.rate.get(key) ?? 0) * 100) / 100, away });
    }
    return { nowMs, vehicles };
  }

  /** Places every vehicle where its timetable and its lag say, at `nowMs`. Vehicles off the road are left out. */
  place(nowMs: number): VehiclePose[] {
    const poses: VehiclePose[] = [];
    for (const [n, roamer] of this.roamers.entries()) {
      const key = `r${n}`;
      if (this.isAway(key)) continue;
      const at = actorAt({ role: "", offset: roamer.plan.offset, keys: roamer.plan.keys }, (nowMs - this.lagOf(key, nowMs)) / 1000);
      poses.push({ key, x: at.x, z: at.z, y: at.y, heading: at.yaw, halfWidth: roamer.halfWidthMm / 1000, halfLength: roamer.halfLengthMm / 1000, roamer: n });
    }
    for (const line of this.lines) {
      // Each van at its own time: the clock's, less what it has waited. Most have waited nothing, and share one reading.
      const readings = new Map<number, RouteVehicle[]>();
      const reading = (lagMs: number): RouteVehicle[] => {
        const at = Math.round(nowMs - lagMs);
        let read = readings.get(at);
        if (!read) readings.set(at, (read = routeVehiclesAt(line.route, clock, at)));
        return read;
      };
      for (const onTime of reading(0)) {
        const key = `${line.id}/${onTime.index}`;
        const at = reading(this.lagOf(key, nowMs)).find((late) => late.index === onTime.index) ?? onTime;
        poses.push({ key, x: at.x / 1000, z: at.z / 1000, y: at.y / 1000, heading: (at.yaw / 18_000) * Math.PI, halfWidth: VAN_HALF_WIDTH_MM / 1000, halfLength: VAN_HALF_LENGTH_MM / 1000, van: { ...at, line: line.id } });
      }
    }
    this.poses = poses;
    return poses;
  }

  /** Where a vehicle is when it is `lagMs` behind its timetable, or null for one that is not on the road. */
  private poseOf(key: string, nowMs: number, lagMs: number): Moving | null {
    if (key.startsWith("r")) {
      const roamer = this.roamers[Number(key.slice(1))];
      if (!roamer) return null;
      const at = actorAt({ role: "", offset: roamer.plan.offset, keys: roamer.plan.keys }, (nowMs - lagMs) / 1000);
      return { key, x: at.x, z: at.z, y: at.y, heading: at.yaw, halfWidth: roamer.halfWidthMm / 1000, halfLength: roamer.halfLengthMm / 1000 };
    }
    const cut = key.lastIndexOf("/");
    const line = this.lines.find((one) => one.id === key.slice(0, cut));
    const at = line ? routeVehiclesAt(line.route, clock, Math.round(nowMs - lagMs)).find((van) => van.index === Number(key.slice(cut + 1))) : undefined;
    return at ? { key, x: at.x / 1000, z: at.z / 1000, y: at.y / 1000, heading: (at.yaw / 18_000) * Math.PI, halfWidth: VAN_HALF_WIDTH_MM / 1000, halfLength: VAN_HALF_LENGTH_MM / 1000 } : null;
  }

  /** How many pairs of vehicles have their bodies overlapping. Vehicles never touch, so this is nothing. */
  get tangled(): number {
    let pairs = 0;
    for (const [n, a] of this.poses.entries()) for (const b of this.poses.slice(n + 1)) if (touching(a, b)) pairs++;
    return pairs;
  }

  /** How far behind its timetable the vehicle that has waited longest is, in seconds. */
  waitedAt(nowMs: number): number {
    return Math.max(0, ...this.keys.map((key) => this.lagOf(key, nowMs))) / 1000;
  }
}
