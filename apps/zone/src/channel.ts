// One channel of one district (Task 3.1): the people in it, and the only
// word on where each of them is (D-3.1). A client sends the stick, never a
// position; the channel steps the shared simulation twenty times a second,
// one frame of each player's stick a step, against the district's ground and
// against each other (D-0.53); and ten times a second it tells each client
// what is near them, as the difference from what they said they last got.
//
// Nothing here knows about sockets. A room (room.ts) feeds it bytes that were
// decoded and carries away bytes it encoded, which is what lets all of it be
// tested without a network.

import { DOING, encodeSnapshot, selectVisible, toMoveInput, type EntityState, type Input, type InputFrame, type Snapshot } from "@nzila/protocol";
import { DEFAULT_CHARACTER, addCharacter, createWorld, removeEntity, stepWorld, type CharacterState, type Ground, type MoveInput, type SimWorld } from "@nzila/sim";

/** How far a client is told about others, and how many of them at the most (the nearest). */
export const SIGHT_MM = 60_000;
export const SEEN_AT_MOST = 30;
/** How many of a player's stick frames wait their turn at the most: more than this is lateness the player would feel, and is let go. */
export const FRAMES_WAITING_AT_MOST = 6;
/** With no word from a client, the last frame of their stick is held this many steps, then they stand: a lost packet does not stop a walk. */
export const HELD_STEPS = 4;
/** Snapshots a client may still name as the one they have: about three seconds of them. */
const REMEMBERED = 32;
/** Where someone arriving is tried, round the place they asked for, until a spot is free: metres out, and how many round. */
const ARRIVAL_RINGS_MM = [0, 800, 1600, 2400, 3200];
const ARRIVAL_ROUND = 8;

export interface Place {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Centidegrees. */
  readonly yaw: number;
}

interface Seat {
  readonly playerId: string;
  /** The stick frames that have arrived and not yet been used, oldest first, each with its number. */
  readonly waiting: { seq: number; frame: InputFrame }[];
  /** The number of the newest frame that was used, which the client is told so that it can replay the later ones. */
  lastInputSeq: number;
  /** The newest frame number ever received: an older one arriving again is a repeat, and is ignored. */
  newestSeq: number;
  held: MoveInput | null;
  heldFor: number;
  /** The tick of the snapshot the client said they have. */
  ackTick: number;
  readonly sent: Map<number, Snapshot>;
  /** Where they were a step ago, to tell walking from standing. */
  wasX: number;
  wasZ: number;
  anim: number;
}

export class Channel {
  readonly world: SimWorld;
  private readonly ground: Ground;
  private readonly seats = new Map<number, Seat>();
  private nextId = 1;

  constructor(ground: Ground, seed = 1) {
    this.ground = ground;
    this.world = createWorld(seed);
  }

  /** How many people are in the channel. */
  get count(): number {
    return this.seats.size;
  }

  /** Whether a body could stand at a point: on ground a person may be on, and not on top of anyone. */
  private free(x: number, z: number): boolean {
    const cell = this.ground.flagsAt(Math.floor(x / this.ground.cellMm), Math.floor(z / this.ground.cellMm));
    if ((cell & 1) === 0) return false;
    return !this.world.characters.some((other) => Math.hypot(other.state.x - x, other.state.z - z) < DEFAULT_CHARACTER.radiusMm * 2);
  }

  /**
   * Someone comes into the channel, at the place asked for or as near it as there is room. Returns
   * the number they are known by here, or null when there is no room anywhere round that place.
   */
  join(playerId: string, at: Place): number | null {
    for (const ring of ARRIVAL_RINGS_MM) {
      for (let k = 0; k < (ring === 0 ? 1 : ARRIVAL_ROUND); k++) {
        const angle = (k / ARRIVAL_ROUND) * Math.PI * 2;
        const x = Math.round(at.x + Math.sin(angle) * ring);
        const z = Math.round(at.z + Math.cos(angle) * ring);
        if (!this.free(x, z)) continue;
        const id = this.nextId++;
        const y = this.ground.heightAt(Math.floor(x / this.ground.cellMm), Math.floor(z / this.ground.cellMm));
        addCharacter(this.world, id, { x, y, z, yaw: ((at.yaw % 36_000) + 36_000) % 36_000 });
        this.seats.set(id, { playerId, waiting: [], lastInputSeq: 0, newestSeq: 0, held: null, heldFor: 0, ackTick: 0, sent: new Map(), wasX: x, wasZ: z, anim: DOING.idle });
        return id;
      }
    }
    return null;
  }

  /** Someone leaves. Gives back who they were and where they stood, to be kept for their return; null for a number nobody has. */
  leave(id: number): { playerId: string; at: Place } | null {
    const seat = this.seats.get(id);
    const body = this.world.characters.find((one) => one.id === id);
    if (!seat || !body) return null;
    this.seats.delete(id);
    removeEntity(this.world, id);
    return { playerId: seat.playerId, at: { x: body.state.x, y: body.state.y, z: body.state.z, yaw: body.state.yaw } };
  }

  /** Where someone is now. */
  placeOf(id: number): Place | null {
    const body = this.world.characters.find((one) => one.id === id);
    return body ? { x: body.state.x, y: body.state.y, z: body.state.z, yaw: body.state.yaw } : null;
  }

  /**
   * A client's stick. Frames are numbered; those already had are ignored (they are repeats, sent so that a lost
   * packet loses nothing), the rest wait their turn, one a step. A client that sends faster than time goes gains
   * nothing: frames beyond a short wait are let go, oldest first.
   */
  input(id: number, input: Input): void {
    const seat = this.seats.get(id);
    if (!seat) return;
    // Newest first in the message: frame i is step seq - i. They are taken oldest first.
    for (let i = input.frames.length - 1; i >= 0; i--) {
      const seq = input.seq - i;
      if (seq <= seat.newestSeq) continue;
      seat.newestSeq = seq;
      seat.waiting.push({ seq, frame: input.frames[i]! });
    }
    while (seat.waiting.length > FRAMES_WAITING_AT_MOST) seat.waiting.shift();
    // The newest snapshot they say they have, when it is one that was really sent them.
    if (seat.sent.has(input.ackTick) && input.ackTick > seat.ackTick) seat.ackTick = input.ackTick;
  }

  /** One step of the world: a twentieth of a second. */
  tick(): void {
    const moves = new Map<number, MoveInput>();
    for (const [id, seat] of this.seats) {
      const next = seat.waiting.shift();
      if (next) {
        seat.lastInputSeq = next.seq;
        seat.held = toMoveInput(next.frame);
        seat.heldFor = 0;
        moves.set(id, seat.held);
      } else if (seat.held && seat.heldFor < HELD_STEPS) {
        // Nothing arrived for this step: they go on as they were going, without jumping again, for a moment.
        seat.heldFor++;
        moves.set(id, { dx: seat.held.dx, dz: seat.held.dz, run: seat.held.run });
      }
    }
    stepWorld(this.world, { ground: this.ground, obstacles: [] }, { moves }, DEFAULT_CHARACTER, { solidPeople: true });
    for (const body of this.world.characters) {
      const seat = this.seats.get(body.id)!;
      const moved = Math.hypot(body.state.x - seat.wasX, body.state.z - seat.wasZ);
      seat.anim = (body.state.air ?? 0) > 0 ? DOING.air : moved < 5 ? DOING.idle : moves.get(body.id)?.run ? DOING.run : DOING.walk;
      seat.wasX = body.state.x;
      seat.wasZ = body.state.z;
    }
  }

  /** Everyone in the channel, as a client is told of them. */
  entities(): EntityState[] {
    return this.world.characters.map((body): EntityState => ({ id: body.id, kind: "player", x: body.state.x, y: body.state.y, z: body.state.z, yaw: body.state.yaw, anim: this.seats.get(body.id)!.anim, vehicleId: null, seat: null }));
  }

  /**
   * What one client is told now: whoever is near them, as the difference from the snapshot they
   * said they have (or whole, when they have none we remember). Null for a number nobody has.
   */
  snapshotFor(id: number, all: readonly EntityState[] = this.entities()): Uint8Array | null {
    const seat = this.seats.get(id);
    if (!seat) return null;
    const snapshot: Snapshot = { tick: this.world.tick, lastInputSeq: seat.lastInputSeq, entities: selectVisible(all, id, SIGHT_MM, SEEN_AT_MOST) };
    const bytes = encodeSnapshot(snapshot, seat.sent.get(seat.ackTick) ?? null);
    seat.sent.set(snapshot.tick, snapshot);
    for (const tick of seat.sent.keys()) {
      if (seat.sent.size <= REMEMBERED) break;
      // The one they have is kept however old; the rest go oldest first.
      if (tick !== seat.ackTick) seat.sent.delete(tick);
    }
    return bytes;
  }
}

export type { CharacterState };
