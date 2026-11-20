// A ride asked for (Task 6.2), on the wire: what a phone says of its own ride, and every ride in the channel as the
// zone tells it. Kept apart from messages.ts so the code that writes and reads them is fetched with the code that
// draws rides, not carried by every phone from the first byte; the zone hands the phone the bytes as they came.

import { MSG } from "./messages.ts";
import type { CorridaPedido } from "./messages.ts";
import { ProtocolError, Reader, Writer } from "./wire.ts";

/** The rides a player can ask for, by their number on the wire. Never reordered. */
export const CORRIDA_KINDS = ["mota", "kupapata", "taxi"] as const;
export type CorridaKind = (typeof CORRIDA_KINDS)[number];
/** Where a ride is in its corrida: coming to the player, waiting for them, taking them, going away. Never reordered. */
export const CORRIDA_FASES = ["vem", "espera", "leva", "vai"] as const;
/** The most legs a ride's way is sent in: a district's roads turn far fewer times. */
const CORRIDA_POINTS_MAX = 128;
/** The most rides a channel says at once. */
const CORRIDAS_MAX = 64;

export function encodeCorrida(m: CorridaPedido): Uint8Array {
  const w = new Writer().u8(MSG.CORRIDA);
  if (m.op === "pedir") return w.u8(1).text(m.id).finish();
  return w.u8(m.op === "subir" ? 2 : 3).finish();
}

/** Zone to client: the rides in the channel. Each is drawn at `speed` along `path` from `fromMs` on the zone's clock. */
export interface CorridasSaid {
  readonly nowMs: number;
  readonly rides: readonly {
    readonly vehicle: number;
    /** Its place in CORRIDA_KINDS. */
    readonly kind: number;
    /** Its place in CORRIDA_FASES. */
    readonly fase: number;
    readonly fromMs: number;
    /** Millimetres a second. */
    readonly speed: number;
    /** Millimetres; sent in centimetres. */
    readonly path: readonly { readonly x: number; readonly z: number }[];
  }[];
}

export function encodeCorridas(m: CorridasSaid): Uint8Array {
  if (m.rides.length > CORRIDAS_MAX) throw new RangeError("too many rides for one channel");
  const w = new Writer().u8(MSG.CORRIDAS).uint(m.nowMs).uint(m.rides.length);
  for (const ride of m.rides) {
    if (ride.path.length > CORRIDA_POINTS_MAX) throw new RangeError("a ride's way has too many legs");
    w.uint(ride.vehicle).u8(ride.kind).u8(ride.fase).uint(ride.fromMs).uint(ride.speed).uint(ride.path.length);
    for (const point of ride.path) w.int(Math.round(point.x / 10)).int(Math.round(point.z / 10));
  }
  return w.finish();
}

/** The channel's rides as the zone told them. Throws ProtocolError on anything that is not that. */
export function decodeCorridas(bytes: Uint8Array): CorridasSaid {
  const r = new Reader(bytes);
  if (r.u8() !== MSG.CORRIDAS) throw new ProtocolError("unknown_type", "not the rides");
  const nowMs = r.uint();
  const count = r.bounded(CORRIDAS_MAX, "rides");
  const rides: CorridasSaid["rides"][number][] = [];
  for (let n = 0; n < count; n++) {
    const vehicle = r.uint();
    const kind = r.u8();
    const fase = r.u8();
    const fromMs = r.uint();
    const speed = r.uint();
    const points = r.bounded(CORRIDA_POINTS_MAX, "ride path");
    const path: { x: number; z: number }[] = [];
    for (let p = 0; p < points; p++) path.push({ x: r.int() * 10, z: r.int() * 10 });
    rides.push({ vehicle, kind, fase, fromMs, speed, path });
  }
  return { nowMs, rides };
}
