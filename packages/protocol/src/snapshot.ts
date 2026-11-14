// The snapshot: what a client can see, ten times a second. It is the message
// that decides the data bill, so it is built to be small three ways:
//
//   1. Area of interest. A client is sent only what is near it (selectVisible).
//   2. Delta. A snapshot is written as the difference from one the client has
//      confirmed receiving. Whoever stood still costs nothing.
//   3. Packing. Positions travel as small signed steps in millimetres.
//
// Thirty people walking cost about 250 bytes; the same thirty sent whole,
// which happens once at join and after a long gap, under 600 (Task 0.4).

import { MSG } from "./messages.ts";
import { ProtocolError, Reader, Writer } from "./wire.ts";

export const ENTITY_KINDS = ["player", "npc", "vehicle"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** One thing in the world as a client is told about it. Integers only. */
export interface EntityState {
  readonly id: number;
  readonly kind: EntityKind;
  /** Millimetres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Centidegrees, 0..35999. */
  readonly yaw: number;
  /** 0..255: which animation is playing. */
  readonly anim: number;
  /** The vehicle this entity is riding in, and its seat there. */
  readonly vehicleId: number | null;
  readonly seat: number | null;
}

export interface Snapshot {
  readonly tick: number;
  /** The newest input of this client the zone had applied. The client replays its later ones on top. */
  readonly lastInputSeq: number;
  /** Everything visible, in order of id. */
  readonly entities: readonly EntityState[];
}

const MAX_ENTITIES = 512;

const NEW = 1;
const MOVED = 2;
const HEIGHT = 4;
const YAW = 8;
const ANIM = 16;
const RIDE = 32;

function writeRide(w: Writer, e: EntityState): void {
  // 0 means on foot; otherwise the vehicle's id plus one, then the seat.
  if (e.vehicleId === null) w.uint(0);
  else w.uint(e.vehicleId + 1).u8(e.seat ?? 0);
}

function readRide(r: Reader): { vehicleId: number | null; seat: number | null } {
  const ride = r.uint();
  return ride === 0 ? { vehicleId: null, seat: null } : { vehicleId: ride - 1, seat: r.u8() };
}

/**
 * Encodes what a client should now see. `entities` must be in order of id.
 * With a baseline (a snapshot the client acknowledged) only the differences
 * are written; without one, everything is.
 */
export function encodeSnapshot(snapshot: Snapshot, baseline: Snapshot | null): Uint8Array {
  const w = new Writer().u8(MSG.SNAPSHOT).uint(snapshot.tick);
  // How many ticks back the baseline is; 0 means there is none.
  w.uint(baseline ? snapshot.tick - baseline.tick : 0).uint(snapshot.lastInputSeq);

  const before = new Map<number, EntityState>();
  for (const e of baseline?.entities ?? []) before.set(e.id, e);
  const now = new Set(snapshot.entities.map((e) => e.id));
  const gone = [...before.keys()].filter((id) => !now.has(id));
  w.uint(gone.length);
  for (const id of gone) w.uint(id);

  const body = new Writer();
  let changed = 0;
  for (const e of snapshot.entities) {
    const was = before.get(e.id);
    if (!was || was.kind !== e.kind) {
      body.uint(e.id).u8(NEW).u8(ENTITY_KINDS.indexOf(e.kind)).int(e.x).int(e.y).int(e.z).uint(e.yaw).u8(e.anim);
      writeRide(body, e);
      changed++;
      continue;
    }
    const mask =
      (was.x !== e.x || was.z !== e.z ? MOVED : 0) +
      (was.y !== e.y ? HEIGHT : 0) +
      (was.yaw !== e.yaw ? YAW : 0) +
      (was.anim !== e.anim ? ANIM : 0) +
      (was.vehicleId !== e.vehicleId || was.seat !== e.seat ? RIDE : 0);
    if (mask === 0) continue;
    body.uint(e.id).u8(mask);
    if (mask & MOVED) body.int(e.x - was.x).int(e.z - was.z);
    if (mask & HEIGHT) body.int(e.y - was.y);
    if (mask & YAW) body.uint(e.yaw);
    if (mask & ANIM) body.u8(e.anim);
    if (mask & RIDE) writeRide(body, e);
    changed++;
  }
  w.uint(changed);
  const head = w.finish();
  const tail = body.finish();
  const out = new Uint8Array(head.length + tail.length);
  out.set(head);
  out.set(tail, head.length);
  return out;
}

/**
 * Decodes a snapshot. `baselineAt` returns the snapshot the client kept for a
 * tick, if it still has it. When a delta arrives against one it no longer
 * has, this throws "missing_baseline": the client then acknowledges tick 0 in
 * its next Input and the zone sends the next snapshot whole.
 */
export function decodeSnapshot(bytes: Uint8Array, baselineAt: (tick: number) => Snapshot | undefined): Snapshot {
  const r = new Reader(bytes);
  if (r.u8() !== MSG.SNAPSHOT) throw new ProtocolError("unknown_type", "not a snapshot");
  const tick = r.uint();
  const back = r.uint();
  const lastInputSeq = r.uint();

  const entities = new Map<number, EntityState>();
  if (back > 0) {
    const baseline = baselineAt(tick - back);
    if (!baseline) throw new ProtocolError("missing_baseline", String(tick - back));
    for (const e of baseline.entities) entities.set(e.id, e);
  }
  const gone = r.bounded(MAX_ENTITIES, "removed entities");
  for (let i = 0; i < gone; i++) entities.delete(r.uint());

  const changed = r.bounded(MAX_ENTITIES, "entities");
  for (let i = 0; i < changed; i++) {
    const id = r.uint();
    const mask = r.u8();
    if (mask & NEW) {
      const kind = ENTITY_KINDS[r.u8()];
      if (!kind) throw new ProtocolError("malformed", "entity kind");
      const x = r.int();
      const y = r.int();
      const z = r.int();
      entities.set(id, { id, kind, x, y, z, yaw: r.uint(), anim: r.u8(), ...readRide(r) });
      continue;
    }
    const was = entities.get(id);
    if (!was) throw new ProtocolError("malformed", "a change to an entity that is not there");
    let { x, y, z, yaw, anim, vehicleId, seat } = was;
    if (mask & MOVED) {
      x += r.int();
      z += r.int();
    }
    if (mask & HEIGHT) y += r.int();
    if (mask & YAW) yaw = r.uint();
    if (mask & ANIM) anim = r.u8();
    if (mask & RIDE) ({ vehicleId, seat } = readRide(r));
    entities.set(id, { id, kind: was.kind, x, y, z, yaw, anim, vehicleId, seat });
  }
  return { tick, lastInputSeq, entities: [...entities.values()].sort((a, b) => a.id - b.id) };
}

/**
 * Area of interest: of everything in the channel, what one viewer is sent.
 * Everything within the radius, nearest first, up to `limit`; the viewer's
 * own entity is always included. The result is in order of id.
 */
export function selectVisible(
  all: readonly EntityState[],
  viewerId: number,
  radiusMm: number,
  limit: number,
): EntityState[] {
  const viewer = all.find((e) => e.id === viewerId);
  if (!viewer) return [];
  const near: { e: EntityState; d2: number }[] = [];
  for (const e of all) {
    if (e.id === viewerId) continue;
    const dx = e.x - viewer.x;
    const dz = e.z - viewer.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= radiusMm * radiusMm) near.push({ e, d2 });
  }
  // Ties broken by id, so every zone process picks the same set.
  near.sort((a, b) => a.d2 - b.d2 || a.e.id - b.e.id);
  const chosen = near.slice(0, Math.max(0, limit - 1)).map((n) => n.e);
  chosen.push(viewer);
  return chosen.sort((a, b) => a.id - b.id);
}
