// One channel of one district (Task 3.1): the people in it, and the only
// word on where each of them is (D-3.1). A client sends the stick, never a
// position; the channel steps the shared simulation twenty times a second,
// walking the frames of each player's stick in the order they were sent and
// never one that was not sent, against the district's ground and against each
// other (D-0.53); and ten times a second it tells each client
// what is near them, as the difference from what they said they last got.
//
// Nothing here knows about sockets. A room (room.ts) feeds it bytes that were
// decoded and carries away bytes it encoded, which is what lets all of it be
// tested without a network.

import { DOING, encodeSnapshot, selectVisible, toMoveInput, type EntityState, type Input, type InputFrame, type Snapshot } from "@nzila/protocol";
import { DEFAULT_CHARACTER, addCharacter, createWorld, removeEntity, stepPerson, stepWorld, type CharacterState, type Ground, type MoveInput, type Obstacle, type SimWorld } from "@nzila/sim";

/** How far a client is told about others, and how many of them at the most (the nearest). */
export const SIGHT_MM = 60_000;
export const SEEN_AT_MOST = 30;
/** How many of a player's stick frames wait their turn at the most: more than this is lateness the player would feel, and is let go. */
export const FRAMES_WAITING_AT_MOST = 16;
/**
 * Time is what a client is given to walk in: one frame a step. A phone's frames do not arrive one a step (it draws
 * at its own pace and the network bunches them), so time not used is kept, a little, and a late frame is walked
 * with it: at the most this many steps kept, and this many frames walked in one step. Over any stretch a client
 * walks no more frames than steps have passed, whatever it sends.
 *
 * How much is kept is how long a line may stall and lose nothing: six tenths of a second, which is a lost packet
 * sent again on a slow line (finding F-171: kept shorter, every stall left the player's stick a third of a second
 * late for good, and put their body right when it need not have been). It is also the most a cheat gains by
 * holding their frames back and sending them at once: six tenths of a second of walking, done in a fifth.
 */
export const STEPS_KEPT_AT_MOST = 12;
export const FRAMES_A_STEP_AT_MOST = 3;
/** Someone is said to be standing after this many steps without moving: frames arrive in bunches, and a walker must not be said to stop and start. */
const STOOD_STEPS = 3;
/** Snapshots a client may still name as the one they have: about three seconds of them. */
const REMEMBERED = 32;
/**
 * Where someone arriving is tried, round the place they asked for, until a spot is free: rings a pace apart out to
 * sixteen metres, with a body's width between the places on each. Room for a whole channel to arrive at one door.
 */
const ARRIVAL_RING_MM = 1200;
const ARRIVAL_RINGS = 14;
const ARRIVAL_APART_MM = 1000;

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
  /** Steps of time they have not used yet. */
  owed: number;
  /** Whether the last frame they walked was a run: for how they are seen. */
  running: boolean;
  /** The tick of the snapshot the client said they have. */
  ackTick: number;
  readonly sent: Map<number, Snapshot>;
  /** Who was in the last snapshot made for them. */
  seen: readonly number[];
  /** Where they were a step ago, to tell walking from standing. */
  wasX: number;
  wasZ: number;
  /** Steps since they last moved: a step with no frame in it, between two with, is not standing still. */
  stoodFor: number;
  anim: number;
}

export class Channel {
  readonly world: SimWorld;
  private readonly ground: Ground;
  /** What stands in the district that the ground does not hold: the benches. */
  private readonly obstacles: Obstacle[];
  private readonly seats = new Map<number, Seat>();
  private nextId = 1;

  constructor(ground: Ground, obstacles: readonly Obstacle[] = [], seed = 1) {
    this.ground = ground;
    this.obstacles = [...obstacles];
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
    for (let n = 0; n <= ARRIVAL_RINGS; n++) {
      const ring = n * ARRIVAL_RING_MM;
      const round = n === 0 ? 1 : Math.floor((2 * Math.PI * ring) / ARRIVAL_APART_MM);
      for (let k = 0; k < round; k++) {
        // The first places of a ring are beside whoever stands at its middle, not in front of them or behind: two
        // people who arrive together stand shoulder to shoulder, and neither hides the other from their own view (F-173).
        const angle = (at.yaw / 18_000) * Math.PI + Math.PI / 2 + (k / round) * Math.PI * 2;
        const x = Math.round(at.x + Math.sin(angle) * ring);
        const z = Math.round(at.z + Math.cos(angle) * ring);
        if (!this.free(x, z)) continue;
        const id = this.nextId++;
        const y = this.ground.heightAt(Math.floor(x / this.ground.cellMm), Math.floor(z / this.ground.cellMm));
        addCharacter(this.world, id, { x, y, z, yaw: ((at.yaw % 36_000) + 36_000) % 36_000 });
        this.seats.set(id, { playerId, waiting: [], lastInputSeq: 0, newestSeq: 0, owed: 0, running: false, ackTick: 0, sent: new Map(), seen: [], wasX: x, wasZ: z, stoodFor: STOOD_STEPS, anim: DOING.idle });
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

  /**
   * Someone comes back on a new line to the body they left standing: what the channel remembers of their old
   * line (frames waiting, their numbering, the snapshots they had) is forgotten, because the new line starts
   * its count again. False for a number nobody has.
   */
  resume(id: number): boolean {
    const seat = this.seats.get(id);
    if (!seat) return false;
    seat.waiting.length = 0;
    seat.lastInputSeq = 0;
    seat.newestSeq = 0;
    seat.owed = 0;
    seat.ackTick = 0;
    seat.sent.clear();
    seat.seen = [];
    return true;
  }

  /** Where someone is now. */
  placeOf(id: number): Place | null {
    const body = this.world.characters.find((one) => one.id === id);
    return body ? { x: body.state.x, y: body.state.y, z: body.state.z, yaw: body.state.yaw } : null;
  }

  /**
   * A client's stick. Frames are numbered; those already had are ignored (they are repeats, sent so that a lost
   * packet loses nothing), the rest wait their turn. A client that sends faster than time goes gains nothing:
   * frames beyond a short wait are let go, oldest first, and time is the only thing frames are walked with.
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
    const map = { ground: this.ground, obstacles: this.obstacles };
    const rules = { solidPeople: true };
    const moves = new Map<number, MoveInput>();
    const late: { id: number; move: MoveInput }[] = [];
    for (const [id, seat] of this.seats) {
      seat.owed = Math.min(STEPS_KEPT_AT_MOST, seat.owed + 1);
      // With no frame waiting they stand this step: the zone never walks a frame it was not sent, so that
      // what it says and what the phone worked out for itself are the same thing (the phone would otherwise
      // be put right, a little, many times a second).
      for (let walked = 0; walked < FRAMES_A_STEP_AT_MOST && seat.owed >= 1 && seat.waiting.length > 0; walked++) {
        const next = seat.waiting.shift()!;
        seat.owed--;
        seat.lastInputSeq = next.seq;
        seat.running = next.frame.run;
        const move = toMoveInput(next.frame);
        if (walked === 0) moves.set(id, move);
        else late.push({ id, move });
      }
    }
    stepWorld(this.world, map, { moves }, DEFAULT_CHARACTER, rules);
    // Frames that arrived late, walked with the time their owners had not used.
    for (const one of late) stepPerson(this.world, map, one.id, one.move, DEFAULT_CHARACTER, rules);
    for (const body of this.world.characters) {
      const seat = this.seats.get(body.id)!;
      const moved = Math.hypot(body.state.x - seat.wasX, body.state.z - seat.wasZ);
      seat.stoodFor = moved < 5 ? Math.min(STOOD_STEPS, seat.stoodFor + 1) : 0;
      seat.anim = (body.state.air ?? 0) > 0 ? DOING.air : seat.stoodFor >= STOOD_STEPS ? DOING.idle : seat.running ? DOING.run : DOING.walk;
      seat.wasX = body.state.x;
      seat.wasZ = body.state.z;
    }
  }

  /** The numbers of whoever was in the last snapshot made for someone (themselves among them). */
  seenBy(id: number): readonly number[] {
    return this.seats.get(id)?.seen ?? [];
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
    seat.seen = snapshot.entities.map((entity) => entity.id);
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
