// Rides asked for (Task 6.2, D-6.5): a moto-táxi, a kupapata or a táxi, paid through the API, driven by the zone.
// It sets out along the road about ninety metres away, so that it is seen coming; it stops on the road nearest the
// player and waits; the player gets on; it takes them along the road to the road nearest where they asked, puts them
// down beside it, and drives on out of sight. Every leg is a path, a start on the zone's clock and a speed: each
// phone draws the ride from that, and the zone carries the rider by the same.

import { HIRED_VEHICLE_BASE } from "@nzila/protocol";
import { CORRIDA_FASES, CORRIDA_KINDS, type CorridaKind, type CorridasSaid } from "@nzila/protocol/corridas";
import { type Ground } from "@nzila/sim";
import { alongPath, nearestRoad, pathLength, roadAround, roadField, roadPath, type Ponto } from "@nzila/world";

/** How fast each goes on the road, millimetres a second: the moto quick, the kupapata slower with its load, the táxi between. */
export const CORRIDA_SPEED: Readonly<Record<CorridaKind, number>> = { mota: 9000, kupapata: 6500, taxi: 8000 };
/** How far along the road a ride sets out from, to be seen coming. */
export const COMING_FROM_MM = 90_000;
/** How long a ride waits at the kerb for whoever called it, in milliseconds; then it goes, and the fare with it. */
export const WAIT_MS = 45_000;
/** How near the ride a player must stand to get on. */
export const BOARD_REACH_MM = 3500;
/** How far a ride drives on, out of sight, when it is done. */
const LEAVE_MM = 50_000;
/** The nearest road to a player, and to where they asked, must be this near. */
const ROAD_REACH_MM = 30_000;

/** Where a ride is in its corrida. */
export type Fase = (typeof CORRIDA_FASES)[number];

export interface Corrida {
  readonly vehicle: number;
  readonly kind: CorridaKind;
  /** The paid ride's id, and who called it. */
  readonly id: string;
  readonly playerId: string;
  readonly entity: number;
  fase: Fase;
  path: Ponto[];
  fromMs: number;
  /** When it stops waiting (fase "espera"). */
  waitUntil: number;
  /** The road beside the player, and the road nearest where they asked. */
  readonly pickup: Ponto;
  readonly drop: Ponto;
  /** The way from the pickup to the drop, worked out when it was asked for. */
  readonly carrying: Ponto[];
}

/** Where a ride is, and which way it faces, at a moment on the zone's clock. */
export function poseOf(ride: Corrida, nowMs: number): { x: number; z: number; heading: number } {
  return alongPath(ride.path, ((nowMs - ride.fromMs) * CORRIDA_SPEED[ride.kind]) / 1000);
}

/** Whether a ride has come to the end of the leg it is on. */
export function legDone(ride: Corrida, nowMs: number): boolean {
  return ((nowMs - ride.fromMs) * CORRIDA_SPEED[ride.kind]) / 1000 >= pathLength(ride.path);
}

/** The way out of sight from a point on the road: on along the road, about LEAVE_MM. */
function awayFrom(ground: Ground, at: Ponto): Ponto[] {
  const field = roadField(ground, at);
  const far = roadAround(field, LEAVE_MM);
  return (roadPath(ground, field, far) ?? [at]).reverse();
}

export class Corridas {
  private readonly rides = new Map<number, Corrida>();
  private next = 0;
  /** Paid rides already given: a note is good for one ride. */
  private readonly used = new Set<string>();

  /** The district's walk grid: its roads for planning, its pavements for setting a rider down. */
  readonly ground: Ground;

  constructor(ground: Ground) {
    this.ground = ground;
  }

  /** Every ride, as the phones are told of them. */
  said(nowMs: number): CorridasSaid {
    return {
      nowMs,
      rides: [...this.rides.values()].map((ride) => ({ vehicle: ride.vehicle, kind: CORRIDA_KINDS.indexOf(ride.kind), fase: CORRIDA_FASES.indexOf(ride.fase), fromMs: ride.fromMs, speed: CORRIDA_SPEED[ride.kind], path: ride.path })),
    };
  }

  /** The ride a player called, if they have one. */
  of(entity: number): Corrida | null {
    for (const ride of this.rides.values()) if (ride.entity === entity) return ride;
    return null;
  }

  byVehicle(vehicle: number): Corrida | null {
    return this.rides.get(vehicle) ?? null;
  }

  /**
   * A paid ride asked for: from the road beside `at` to the road nearest `to`. Why not, when it cannot be: the note
   * was used already, there is no road near either end, or the roads there do not join.
   */
  ask(paid: { id: string; kind: CorridaKind; playerId: string; entity: number }, at: Ponto, to: Ponto, nowMs: number): Corrida | "usada" | "sem_estrada" {
    if (this.used.has(paid.id)) return "usada";
    const pickup = nearestRoad(this.ground, at, ROAD_REACH_MM);
    const drop = nearestRoad(this.ground, to, ROAD_REACH_MM);
    if (!pickup || !drop) return "sem_estrada";
    const toPickup = roadField(this.ground, pickup);
    const coming = roadPath(this.ground, toPickup, roadAround(toPickup, COMING_FROM_MM));
    const carrying = roadPath(this.ground, roadField(this.ground, drop), pickup);
    if (!coming || !carrying) return "sem_estrada";
    this.used.add(paid.id);
    const ride: Corrida = { vehicle: HIRED_VEHICLE_BASE + (this.next++ % 1024), kind: paid.kind, id: paid.id, playerId: paid.playerId, entity: paid.entity, fase: "vem", path: coming, fromMs: nowMs, waitUntil: 0, pickup, drop, carrying };
    this.rides.set(ride.vehicle, ride);
    return ride;
  }

  /** Got on, at the kerb: the ride sets out with them along the way it worked out. */
  board(ride: Corrida, nowMs: number): void {
    ride.fase = "leva";
    ride.path = ride.carrying;
    ride.fromMs = nowMs;
  }

  /** Done with (arrived, waited too long, got off, called off): the ride drives on out of sight from where it is. */
  leave(ride: Corrida, nowMs: number): void {
    const at = poseOf(ride, nowMs);
    ride.fase = "vai";
    ride.path = awayFrom(this.ground, nearestRoad(this.ground, at, ROAD_REACH_MM) ?? at);
    ride.fromMs = nowMs;
  }

  /**
   * Time passes: a ride that has come waits at the kerb; one that waited too long goes; one that carried someone has
   * arrived; one that has gone out of sight is no more. What changed, for the room to act on and tell.
   */
  step(nowMs: number): { arrived: Corrida[]; waiting: Corrida[]; gaveUp: Corrida[]; changed: boolean } {
    const out = { arrived: [] as Corrida[], waiting: [] as Corrida[], gaveUp: [] as Corrida[], changed: false };
    for (const ride of this.rides.values()) {
      if (ride.fase === "espera") {
        if (nowMs > ride.waitUntil) {
          this.leave(ride, nowMs);
          out.gaveUp.push(ride);
          out.changed = true;
        }
        continue;
      }
      if (!legDone(ride, nowMs)) continue;
      out.changed = true;
      if (ride.fase === "vem") {
        const at = poseOf(ride, nowMs);
        ride.fase = "espera";
        // Standing at the kerb, facing as it came.
        ride.path = [{ x: at.x - Math.sin(at.heading), z: at.z - Math.cos(at.heading) }, { x: at.x, z: at.z }];
        ride.fromMs = nowMs;
        ride.waitUntil = nowMs + WAIT_MS;
        out.waiting.push(ride);
      } else if (ride.fase === "leva") {
        out.arrived.push(ride);
        this.leave(ride, nowMs);
      } else this.rides.delete(ride.vehicle);
    }
    return out;
  }

  /** A ride no longer wanted at all (its caller has gone): taken off the road. */
  drop(ride: Corrida): void {
    this.rides.delete(ride.vehicle);
  }
}
