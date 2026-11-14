// Route vehicles: the candongueiros on their linhas. Where every van is at any
// moment is a pure function of the route, its timetable and the clock, so the
// zone and every phone compute the same vans without a byte of network
// traffic. A route is a closed loop; a linha that goes out and back is a loop
// that returns along the other side of the road.

import { floorMod, idiv, length2, yawFromDir } from "./fixed.ts";
import { gameTimeAt, inGameWindow, type WorldClock } from "./clock.ts";

export interface RoutePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RouteStop {
  /** The point of the loop the paragem sits at. */
  readonly pointIndex: number;
  /** How long a van waits there. */
  readonly dwellMs: number;
}

export interface RouteDef {
  /** The loop, in order. The last point joins back to the first. */
  readonly points: readonly RoutePoint[];
  /** In order of pointIndex. A lap begins at the first stop. */
  readonly stops: readonly RouteStop[];
  readonly cruiseMmPerS: number;
  /** Time a van takes to reach cruising speed, and to stop. */
  readonly rampMs: number;
  /** The gap between one van and the next at the same stop. */
  readonly headwayMs: number;
  /** A van starts a lap only inside this window of the game day. It finishes a lap it started. */
  readonly serviceStartGameS: number;
  readonly serviceEndGameS: number;
}

interface Leg {
  /** When, within a lap, the van arrives at the stop this leg leaves from. */
  readonly arriveMs: number;
  readonly departMs: number;
  readonly travelMs: number;
  readonly rampMs: number;
  /** Distance along the loop of the stop this leg leaves from. */
  readonly fromMm: number;
  readonly lengthMm: number;
}

export interface Route {
  readonly def: RouteDef;
  readonly lapMs: number;
  readonly loopMm: number;
  readonly vehicleCount: number;
  /** Distance along the loop at each point, then the loop length. */
  readonly cumMm: readonly number[];
  /** Heading of the segment leaving each point. */
  readonly yaws: readonly number[];
  readonly legs: readonly Leg[];
}

export interface RouteVehicle {
  /** 0..vehicleCount-1. With the route id this names the van for a lap. */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** True while waiting at a stop with the door open. */
  readonly dwelling: boolean;
  /** The stop it is at, or is driving to. An index into the route's stops. */
  readonly stop: number;
  readonly msToStop: number;
}

/** Checks a route and prepares its timetable. Throws on a bad one. */
export function compileRoute(def: RouteDef): Route {
  const { points, stops } = def;
  if (points.length < 2) throw new Error("a route needs at least two points");
  if (stops.length === 0) throw new Error("a route needs at least one stop");
  if (def.cruiseMmPerS <= 0 || def.headwayMs <= 0 || def.rampMs < 0) {
    throw new Error("speed and headway must be positive, the ramp not negative");
  }

  const cumMm: number[] = [0];
  const yaws: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = length2(b.x - a.x, b.z - a.z);
    if (length === 0) throw new Error("two route points are in the same place");
    cumMm.push(cumMm[i]! + length);
    yaws.push(yawFromDir(b.x - a.x, b.z - a.z));
  }
  const loopMm = cumMm[points.length]!;

  const legs: Leg[] = [];
  let at = 0;
  for (let j = 0; j < stops.length; j++) {
    const stop = stops[j]!;
    const next = stops[(j + 1) % stops.length]!;
    const inRange = Number.isInteger(stop.pointIndex) && stop.pointIndex >= 0 && stop.pointIndex < points.length;
    if (!inRange || stop.dwellMs < 0) throw new Error("a stop must sit on a route point and wait a time that is not negative");
    if (j > 0 && stop.pointIndex <= stops[j - 1]!.pointIndex) throw new Error("stops must be in order along the loop");
    const fromMm = cumMm[stop.pointIndex]!;
    // With a single stop the leg is the whole loop, back to the same stop.
    const lengthMm = floorMod(cumMm[next.pointIndex]! - fromMm - 1, loopMm) + 1;
    const cruiseMs = Math.ceil((lengthMm * 1000) / def.cruiseMmPerS);
    const rampMs = Math.min(def.rampMs, cruiseMs);
    const travelMs = cruiseMs + rampMs;
    legs.push({ arriveMs: at, departMs: at + stop.dwellMs, travelMs, rampMs, fromMm, lengthMm });
    at += stop.dwellMs + travelMs;
  }

  return {
    def,
    lapMs: at,
    loopMm,
    vehicleCount: Math.max(1, Math.ceil(at / def.headwayMs)),
    cumMm,
    yaws,
    legs,
  };
}

// Distance covered t ms into a leg: speeding up for rampMs, cruising, slowing
// down for rampMs, arriving exactly at the leg's length.
function distanceInto(leg: Leg, t: number): number {
  const { lengthMm: length, travelMs: total, rampMs: ramp } = leg;
  const cruise = total - ramp;
  if (ramp === 0) return idiv(length * t, total);
  if (t < ramp) return idiv(length * t * t, 2 * ramp * cruise);
  if (t <= cruise) return idiv(length * (2 * t - ramp), 2 * cruise);
  const left = total - t;
  return length - idiv(length * left * left, 2 * ramp * cruise);
}

function pointAt(route: Route, alongMm: number): { x: number; y: number; z: number; yaw: number } {
  const { points } = route.def;
  const along = floorMod(alongMm, route.loopMm);
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (route.cumMm[mid]! <= along) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo]!;
  const b = points[(lo + 1) % points.length]!;
  const into = along - route.cumMm[lo]!;
  const span = route.cumMm[lo + 1]! - route.cumMm[lo]!;
  return {
    x: a.x + idiv((b.x - a.x) * into, span),
    y: a.y + idiv((b.y - a.y) * into, span),
    z: a.z + idiv((b.z - a.z) * into, span),
    yaw: route.yaws[lo]!,
  };
}

// How far into its lap van `index` is at a real time. Vans are spread evenly
// round the lap.
function phaseOf(route: Route, index: number, nowMs: number): number {
  return floorMod(nowMs + idiv(index * route.lapMs, route.vehicleCount), route.lapMs);
}

function lapInService(route: Route, clock: WorldClock, lapStartMs: number): boolean {
  const { secondOfDay } = gameTimeAt(clock, lapStartMs);
  return inGameWindow(secondOfDay, route.def.serviceStartGameS, route.def.serviceEndGameS);
}

/** One van of the route at a real time, or null when it is not running a lap. */
export function routeVehicleAt(route: Route, clock: WorldClock, index: number, nowMs: number): RouteVehicle | null {
  const phase = phaseOf(route, index, nowMs);
  if (!lapInService(route, clock, nowMs - phase)) return null;
  let j = 0;
  for (let k = 0; k < route.legs.length; k++) {
    if (phase >= route.legs[k]!.arriveMs) j = k;
  }
  const leg = route.legs[j]!;
  if (phase < leg.departMs) {
    return { index, ...pointAt(route, leg.fromMm), dwelling: true, stop: j, msToStop: 0 };
  }
  const t = phase - leg.departMs;
  return {
    index,
    ...pointAt(route, leg.fromMm + distanceInto(leg, t)),
    dwelling: false,
    stop: (j + 1) % route.legs.length,
    msToStop: leg.travelMs - t,
  };
}

/** Every van of the route that is on the road at a real time. */
export function routeVehiclesAt(route: Route, clock: WorldClock, nowMs: number): RouteVehicle[] {
  const vans: RouteVehicle[] = [];
  for (let index = 0; index < route.vehicleCount; index++) {
    const van = routeVehicleAt(route, clock, index, nowMs);
    if (van) vans.push(van);
  }
  return vans;
}

/**
 * Real milliseconds until the next van opens its door at a stop: 0 when one is
 * waiting there now, null when no van on the road will reach it.
 */
export function msUntilArrival(route: Route, clock: WorldClock, stop: number, nowMs: number): number | null {
  const leg = route.legs[stop];
  if (!leg) throw new Error("no such stop on this route");
  let best: number | null = null;
  for (let index = 0; index < route.vehicleCount; index++) {
    const phase = phaseOf(route, index, nowMs);
    const lapStartMs = nowMs - phase;
    let wait: number;
    if (phase < leg.departMs || phase === leg.arriveMs) {
      // Still ahead on this lap, or standing at the stop right now.
      if (!lapInService(route, clock, lapStartMs)) continue;
      wait = Math.max(0, leg.arriveMs - phase);
    } else {
      // Already past this stop: it comes round again on the van's next lap.
      if (!lapInService(route, clock, lapStartMs + route.lapMs)) continue;
      wait = route.lapMs - phase + leg.arriveMs;
    }
    if (best === null || wait < best) best = wait;
  }
  return best;
}
