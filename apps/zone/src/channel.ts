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

/**
 * A place that is one family's alone (a home, Phase 5, D-5.8): its ground, laid over the street's for them and for
 * nobody else (to the street the house is a wall); the rectangle that is its inside, in millimetres [minX, minZ,
 * maxX, maxZ]; and whose it is. Two people are in the same room only when they are inside under the same key:
 * many families are given the same house of a bairro, and each has its own inside.
 */
export interface Own {
  readonly ground: Ground;
  readonly rect: readonly [number, number, number, number];
  readonly key: string;
}

const insideOf = (own: Own | null, x: number, z: number): string | null => (own && x > own.rect[0] && x < own.rect[2] && z > own.rect[1] && z < own.rect[3] ? own.key : null);

interface Seat {
  readonly playerId: string;
  /** The place that is theirs, when they have one here. */
  readonly own: Own | null;
  /** The key of the place they are inside of now; null in the street. */
  within: string | null;
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
  /** Effort since it was last taken (Task 4.4): steps walked going fast, and jumps made. */
  fast: number;
  jumps: number;
  /** Whether they were in the air a step ago, and whether a frame walked this step asked to jump. */
  wasAir: boolean;
  jumpAsked: boolean;
  /** Too tired to go fast or to jump: both are let go from what they send (D-0.46). */
  tired: boolean;
}

export class Channel {
  readonly world: SimWorld;
  private readonly ground: Ground;
  /** What stands in the district that the ground does not hold: the benches. */
  private readonly obstacles: Obstacle[];
  private readonly seats = new Map<number, Seat>();
  private nextId = 1;
  /** How many here have a place of their own: with none, nothing of it is asked at each step. */
  private owners = 0;
  /** Whether anyone is inside a place of their own now. */
  private indoors = false;

  constructor(ground: Ground, obstacles: readonly Obstacle[] = [], seed = 1) {
    this.ground = ground;
    this.obstacles = [...obstacles];
    this.world = createWorld(seed);
  }

  /** How many people are in the channel. */
  get count(): number {
    return this.seats.size;
  }

  /**
   * Whether a body could stand at a point: on ground a person may be on (their own, when they have a place of their
   * own), and not on top of anyone who is in the same place as they would be.
   */
  private free(x: number, z: number, own: Own | null = null): boolean {
    const ground = own?.ground ?? this.ground;
    // The whole of the body, not its middle alone: set down with a shoulder in a wall, a body cannot take a step
    // (found standing up from a chair beside a wall of one's own house, F-292).
    const r = DEFAULT_CHARACTER.radiusMm;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      if ((ground.flagsAt(Math.floor((x + dx) / ground.cellMm), Math.floor((z + dz) / ground.cellMm)) & 1) === 0) return false;
    }
    const within = insideOf(own, x, z);
    return !this.world.characters.some((other) => this.seats.get(other.id)!.within === within && Math.hypot(other.state.x - x, other.state.z - z) < DEFAULT_CHARACTER.radiusMm * 2);
  }

  /**
   * Someone comes into the channel, at the place asked for or as near it as there is room. Returns
   * the number they are known by here, or null when there is no room anywhere round that place. `own`: the place
   * that is theirs here (the family's house), which they may be standing in.
   */
  join(playerId: string, at: Place, own: Own | null = null): number | null {
    for (let n = 0; n <= ARRIVAL_RINGS; n++) {
      const ring = n * ARRIVAL_RING_MM;
      const round = n === 0 ? 1 : Math.floor((2 * Math.PI * ring) / ARRIVAL_APART_MM);
      for (let k = 0; k < round; k++) {
        // The first places of a ring are to the east and west of its middle, never north or south of it: every phone's
        // camera first looks north, so two who arrive together stand side by side in both pictures, and neither
        // hides the other (F-189).
        const angle = Math.PI / 2 + (k / round) * Math.PI * 2;
        const x = Math.round(at.x + Math.sin(angle) * ring);
        const z = Math.round(at.z + Math.cos(angle) * ring);
        if (!this.free(x, z, own)) continue;
        const id = this.nextId++;
        const y = (own?.ground ?? this.ground).heightAt(Math.floor(x / this.ground.cellMm), Math.floor(z / this.ground.cellMm));
        addCharacter(this.world, id, { x, y, z, yaw: ((at.yaw % 36_000) + 36_000) % 36_000 });
        if (own) this.owners++;
        this.indoors ||= insideOf(own, x, z) !== null;
        this.seats.set(id, { playerId, own, within: insideOf(own, x, z), waiting: [], lastInputSeq: 0, newestSeq: 0, owed: 0, running: false, ackTick: 0, sent: new Map(), seen: [], wasX: x, wasZ: z, stoodFor: STOOD_STEPS, anim: DOING.idle, fast: 0, jumps: 0, wasAir: false, jumpAsked: false, tired: false });
        return id;
      }
    }
    return null;
  }

  /** Someone leaves. Gives back who they were and where they stood, to be kept for their return; null for a number nobody has. */
  leave(id: number): { playerId: string; at: Place } | null {
    this.riding.delete(id);
    this.sitting.delete(id);
    const seat = this.seats.get(id);
    const body = this.world.characters.find((one) => one.id === id);
    if (!seat || !body) return null;
    this.seats.delete(id);
    if (seat.own) this.owners--;
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

  /** Who rides which vehicle, and in which of its seats. Their body is carried, not walked. */
  private readonly riding = new Map<number, { vehicle: number; seat: number }>();

  /** Someone gets on a vehicle, in a seat: from now on their frames are let go and `carry` puts them where it is. */
  ride(id: number, vehicle: number, seat: number): void {
    if (!this.seats.has(id)) return;
    this.riding.set(id, { vehicle, seat });
    const seat_ = this.seats.get(id)!;
    seat_.waiting.length = 0;
    seat_.anim = DOING.sit;
  }

  ridingOf(id: number): { vehicle: number; seat: number } | null {
    return this.riding.get(id) ?? null;
  }

  /** Everyone riding, with what and where. */
  riders(): { id: number; vehicle: number; seat: number }[] {
    return [...this.riding].map(([id, on]) => ({ id, ...on }));
  }

  /** Puts a rider where their vehicle is. */
  carry(id: number, at: Place): void {
    const body = this.world.characters.find((one) => one.id === id);
    if (!body || !this.riding.has(id)) return;
    Object.assign(body.state, { x: at.x, y: at.y, z: at.z, yaw: at.yaw });
    delete body.state.air;
  }

  /** Someone gets off, at the place asked for when there is room for them there, or as near it as there is. False when there is no room near. */
  alight(id: number, at: Place): boolean {
    return this.riding.has(id) && this.putDown(id, at);
  }

  /** Who sits where, off the street's ground: at a table (Task 4B.1). Their body stays in the seat and their stick is let go. */
  private readonly sitting = new Map<number, Place>();

  /** Someone sits, at a seat that is not on the walking ground: they are put there, and seen sitting. False for a body that rides, or is not here. */
  sit(id: number, at: Place): boolean {
    const body = this.world.characters.find((one) => one.id === id);
    if (!body || this.riding.has(id)) return false;
    this.sitting.set(id, at);
    Object.assign(body.state, { x: at.x, y: at.y, z: at.z, yaw: at.yaw });
    delete body.state.air;
    const seat = this.seats.get(id)!;
    seat.waiting.length = 0;
    seat.anim = DOING.sit;
    return true;
  }

  sittingOf(id: number): Place | null {
    return this.sitting.get(id) ?? null;
  }

  /** Someone sitting gets up, at the place asked for or as near it as there is room. False when they were not sitting, or there is no room near. */
  standUp(id: number, at: Place): boolean {
    return this.sitting.has(id) && this.putDown(id, at);
  }

  /** A body on foot is taken somewhere else (to the hospital), where there is room nearest the place. False when there is none. */
  put(id: number, at: Place): boolean {
    if (this.riding.has(id) || this.sitting.has(id)) return false;
    return this.putDown(id, at);
  }

  /** A body carried or seated is set down on the ground again, where there is room, nearest the place asked for. */
  private putDown(id: number, at: Place): boolean {
    const body = this.world.characters.find((one) => one.id === id)!;
    const was = { x: body.state.x, y: body.state.y, z: body.state.z };
    // Out of the way while their own place is looked for: their body is not in the way of itself.
    body.state.x = Number.MAX_SAFE_INTEGER;
    for (let n = 0; n <= ARRIVAL_RINGS; n++) {
      const ring = n * ARRIVAL_RING_MM;
      const round = n === 0 ? 1 : Math.floor((2 * Math.PI * ring) / ARRIVAL_APART_MM);
      for (let k = 0; k < round; k++) {
        const angle = (k / round) * Math.PI * 2;
        const x = Math.round(at.x + Math.sin(angle) * ring);
        const z = Math.round(at.z + Math.cos(angle) * ring);
        // On their own ground, when they have a place of their own: up from a chair in their house, they stand in it.
        const seat = this.seats.get(id)!;
        if (!this.free(x, z, seat.own)) continue;
        const y = (seat.own?.ground ?? this.ground).heightAt(Math.floor(x / this.ground.cellMm), Math.floor(z / this.ground.cellMm));
        Object.assign(body.state, { x, y, z, yaw: at.yaw });
        this.riding.delete(id);
        this.sitting.delete(id);
        Object.assign(seat, { wasX: x, wasZ: z, stoodFor: STOOD_STEPS, anim: DOING.idle, within: insideOf(seat.own, x, z) });
        seat.waiting.length = 0;
        return true;
      }
    }
    // Nowhere to stand: where they were, they stay.
    Object.assign(body.state, was);
    return false;
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

  /** The effort made since last asked (Task 4.4): steps walked going fast, and jumps. Taken once. */
  takeEffort(id: number): { fast: number; jumps: number } {
    const seat = this.seats.get(id);
    if (!seat) return { fast: 0, jumps: 0 };
    const effort = { fast: seat.fast, jumps: seat.jumps };
    seat.fast = 0;
    seat.jumps = 0;
    return effort;
  }

  /** Too tired to go fast or to jump, or no longer (D-0.46). */
  setTired(id: number, tired: boolean): void {
    const seat = this.seats.get(id);
    if (seat) seat.tired = tired;
  }

  /** One step of the world: a twentieth of a second. */
  tick(): void {
    const map = { ground: this.ground, obstacles: this.obstacles };
    // A place of one's own is walked by its own ground, and two who are not in the same place are not in each
    // other's way (two families of one house, each in their own inside).
    const rules = this.owners > 0 ? { solidPeople: true, groundOf: (id: number) => this.seats.get(id)?.own?.ground, apart: (a: number, b: number) => this.seats.get(a)!.within !== this.seats.get(b)!.within } : { solidPeople: true };
    const moves = new Map<number, MoveInput>();
    const late: { id: number; move: MoveInput }[] = [];
    for (const [id, seat] of this.seats) {
      seat.owed = Math.min(STEPS_KEPT_AT_MOST, seat.owed + 1);
      // A rider is carried, and someone at a table sits: what their stick says is let go, and counted as had.
      if (this.riding.has(id) || this.sitting.has(id)) {
        const last = seat.waiting.at(-1);
        if (last) seat.lastInputSeq = last.seq;
        seat.waiting.length = 0;
        seat.owed = 0;
        continue;
      }
      // With no frame waiting they stand this step: the zone never walks a frame it was not sent, so that
      // what it says and what the phone worked out for itself are the same thing (the phone would otherwise
      // be put right, a little, many times a second).
      seat.jumpAsked = false;
      for (let walked = 0; walked < FRAMES_A_STEP_AT_MOST && seat.owed >= 1 && seat.waiting.length > 0; walked++) {
        const next = seat.waiting.shift()!;
        seat.owed--;
        seat.lastInputSeq = next.seq;
        // Too tired, the stick still walks: going fast and jumping are let go (the phone does not ask for them either).
        const frame = seat.tired ? { ...next.frame, run: false, jump: false } : next.frame;
        seat.running = frame.run;
        if (frame.run && (frame.dx !== 0 || frame.dz !== 0)) seat.fast++;
        if (frame.jump) seat.jumpAsked = true;
        const move = toMoveInput(frame);
        if (walked === 0) moves.set(id, move);
        else late.push({ id, move });
      }
    }
    stepWorld(this.world, map, { moves }, DEFAULT_CHARACTER, rules);
    // Frames that arrived late, walked with the time their owners had not used.
    for (const one of late) stepPerson(this.world, map, one.id, one.move, DEFAULT_CHARACTER, rules);
    this.indoors = false;
    for (const body of this.world.characters) {
      const seat = this.seats.get(body.id)!;
      seat.within = insideOf(seat.own, body.state.x, body.state.z);
      this.indoors ||= seat.within !== null;
      if (this.riding.has(body.id)) {
        seat.anim = DOING.sit;
        continue;
      }
      // Seated at a table: in the seat, whatever the step did (nobody falls off a stool).
      const sat = this.sitting.get(body.id);
      if (sat) {
        Object.assign(body.state, { x: sat.x, y: sat.y, z: sat.z, yaw: sat.yaw });
        delete body.state.air;
        seat.anim = DOING.sit;
        continue;
      }
      // A jump is counted as it leaves the ground (Task 4.4): a fall off a step is no jump.
      const air = (body.state.air ?? 0) > 0;
      if (air && !seat.wasAir && seat.jumpAsked) seat.jumps++;
      seat.wasAir = air;
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

  /** The key of the place of their own that someone is inside of; null in the street, and for a number nobody has. */
  withinOf(id: number): string | null {
    return this.seats.get(id)?.within ?? null;
  }

  /** Everyone in the channel, as a client is told of them. */
  entities(): EntityState[] {
    return this.world.characters.map((body): EntityState => ({ id: body.id, kind: "player", x: body.state.x, y: body.state.y, z: body.state.z, yaw: body.state.yaw, anim: this.seats.get(body.id)!.anim, vehicleId: this.riding.get(body.id)?.vehicle ?? null, seat: this.riding.get(body.id)?.seat ?? null }));
  }

  /**
   * What one client is told now: whoever is near them, as the difference from the snapshot they
   * said they have (or whole, when they have none we remember). Null for a number nobody has.
   */
  snapshotFor(id: number, all: readonly EntityState[] = this.entities()): Uint8Array | null {
    const seat = this.seats.get(id);
    if (!seat) return null;
    // A home is its family's: the street does not see in, and no family sees into another's. From inside, the
    // street is seen through the door and the windows, and whoever passes in it (D-5.9).
    const together = this.indoors ? all.filter((one) => [seat.within, null].includes(this.seats.get(one.id)?.within ?? null)) : all;
    const snapshot: Snapshot = { tick: this.world.tick, lastInputSeq: seat.lastInputSeq, entities: selectVisible(together, id, SIGHT_MM, SEEN_AT_MOST) };
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
