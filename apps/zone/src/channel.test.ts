// A channel without a network: who is in it, where each really is, and what each is told.

import { DOING, decodeSnapshot, type Input, type InputFrame, type Snapshot } from "@nzila/protocol";
import { type Ground } from "@nzila/sim";
import { describe, expect, test } from "vitest";
import { Channel, FRAMES_A_STEP_AT_MOST, FRAMES_WAITING_AT_MOST, SEEN_AT_MOST, SIGHT_MM, STEPS_KEPT_AT_MOST } from "./channel.ts";

// Open ground everywhere, but for a wall along z = 10 m (and nothing beyond x = ±200 m).
const ground: Ground = {
  cellMm: 500,
  flagsAt: (cx, cz) => (cz === 20 || Math.abs(cx) > 400 ? 0 : 1),
  heightAt: () => 0,
};
const here = { x: 0, y: 0, z: 0, yaw: 0 };
const north: InputFrame = { dx: 0, dz: 127, run: false, brake: false };
const still: InputFrame = { dx: 0, dz: 0, run: false, brake: false };
/** One message a step, each carrying the newest frame and the two before it, as a client sends them. */
const walking = (channel: Channel, id: number, from: number, steps: number, frame = north, ackTick = 0): void => {
  for (let seq = from; seq < from + steps; seq++) {
    channel.input(id, { seq, ackTick, frames: [frame, frame, frame].slice(0, Math.min(3, seq)) });
    channel.tick();
  }
};

/** A client's side of the snapshots: it remembers what it was sent, to read the next difference. */
function reader() {
  const had = new Map<number, Snapshot>();
  return (bytes: Uint8Array): Snapshot => {
    const snapshot = decodeSnapshot(bytes, (tick) => had.get(tick));
    had.set(snapshot.tick, snapshot);
    return snapshot;
  };
}

describe("coming in and going out", () => {
  test("someone arrives where they asked, the next beside them and not on top of them, and each has a number of their own", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const b = channel.join("player-b", here)!;
    expect(a).not.toBe(b);
    expect(channel.count).toBe(2);
    expect(channel.placeOf(a)).toEqual(here);
    const beside = channel.placeOf(b)!;
    expect(Math.hypot(beside.x, beside.z)).toBeGreaterThanOrEqual(1000);
    expect(Math.hypot(beside.x, beside.z)).toBeLessThan(1700);
  });

  test("a whole channel can arrive at one door: eighty people, nobody on top of anybody, nobody far from it", () => {
    const channel = new Channel(ground);
    const ids = Array.from({ length: 80 }, (_, n) => channel.join(`player-${n}`, here));
    expect(ids.every((id) => id !== null)).toBe(true);
    const places = ids.map((id) => channel.placeOf(id!)!);
    for (const [n, a] of places.entries()) {
      expect(Math.hypot(a.x, a.z)).toBeLessThan(12_000);
      for (const b of places.slice(n + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(450);
    }
  });

  test("nobody arrives inside a wall, and where there is no room at all nobody arrives", () => {
    const channel = new Channel(ground);
    // Asked for the middle of the wall: put on the ground beside it.
    const id = channel.join("player-a", { x: 0, y: 0, z: 10_200, yaw: 0 })!;
    expect((ground.flagsAt(0, Math.floor(channel.placeOf(id)!.z / 500)) & 1) !== 0).toBe(true);
    expect(channel.join("player-b", { x: 300_000, y: 0, z: 0, yaw: 0 })).toBeNull();
  });

  test("leaving gives back who they were and where they stood, and their number is nobody's", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", { ...here, yaw: -9000 })!;
    walking(channel, a, 1, 20);
    const left = channel.leave(a)!;
    expect(left.playerId).toBe("player-a");
    expect(left.at.z).toBeGreaterThan(500);
    expect(left.at.yaw).toBeGreaterThanOrEqual(0);
    expect(channel.count).toBe(0);
    expect(channel.leave(a)).toBeNull();
    expect(channel.placeOf(a)).toBeNull();
    expect(channel.snapshotFor(a)).toBeNull();
    // A stick from someone who has left moves nothing and breaks nothing.
    channel.input(a, { seq: 99, ackTick: 0, frames: [north] });
    channel.tick();
  });
});

describe("the channel decides where everyone is", () => {
  test("a stick is walked by the simulation: one frame a step, at a walking pace, and a wall stops it", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    walking(channel, a, 1, 20);
    const after = channel.placeOf(a)!.z;
    // A second of walking is a metre or two, whatever the client would like.
    expect(after).toBeGreaterThan(900);
    expect(after).toBeLessThan(2500);
    walking(channel, a, 21, 400);
    // The wall is at 10 m: they are against it and not through it.
    expect(channel.placeOf(a)!.z).toBeLessThan(10_000);
    expect(channel.placeOf(a)!.z).toBeGreaterThan(9_000);
  });

  test("a client that sends its stick many times over, or far ahead, gets no farther than time allows", () => {
    const honest = new Channel(ground);
    const a = honest.join("player-a", here)!;
    walking(honest, a, 1, 20);

    const greedy = new Channel(ground);
    const b = greedy.join("player-b", here)!;
    for (let step = 1; step <= 20; step++) {
      // Eight new frames with every message, and each message sent three times.
      const input: Input = { seq: step * 8, ackTick: 0, frames: Array.from({ length: 8 }, () => north) };
      for (let again = 0; again < 3; again++) greedy.input(b, input);
      greedy.tick();
    }
    expect(greedy.placeOf(b)!.z).toBeLessThanOrEqual(honest.placeOf(a)!.z);
    // And what was waiting when they stop is short: they do not walk on for seconds.
    for (let n = 0; n < FRAMES_WAITING_AT_MOST + 2; n++) greedy.tick();
    const rest = greedy.placeOf(b)!.z;
    greedy.tick();
    expect(greedy.placeOf(b)!.z).toBe(rest);
  });

  test("a lost packet loses nothing, and the zone never walks a frame it was not sent: with no word they stand, then catch up", () => {
    const whole = new Channel(ground);
    const w = whole.join("player-w", here)!;
    walking(whole, w, 1, 13);

    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    walking(channel, a, 1, 10);
    const before = channel.placeOf(a)!.z;
    // Two steps with no word at all: they stand where they are, and nothing is said to have been used.
    channel.tick();
    channel.tick();
    expect(channel.placeOf(a)!.z).toBe(before);
    expect(decodeSnapshot(channel.snapshotFor(a)!, () => undefined).lastInputSeq).toBe(10);
    // Then frame 13 arrives carrying 12 and 11 with it: all three are walked, with the time that was not used.
    channel.input(a, { seq: 13, ackTick: 0, frames: [north, north, north] });
    channel.tick();
    channel.tick();
    // Exactly where thirteen frames take anyone, no more and no less.
    expect(channel.placeOf(a)).toEqual(whole.placeOf(w));
    // A frame already had, arriving again, is not walked twice.
    channel.input(a, { seq: 13, ackTick: 0, frames: [north, north, north] });
    channel.tick();
    expect(channel.placeOf(a)).toEqual(whole.placeOf(w));
  });

  test("time not used is kept only a little: after a long silence a burst is walked at the pace of time, not all at once", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    for (let n = 0; n < 100; n++) channel.tick();
    channel.input(a, { seq: 6, ackTick: 0, frames: Array.from({ length: 6 }, () => north) });
    channel.tick();
    const one = channel.placeOf(a)!.z;
    // A few frames in the first step, at the most: never the whole burst at once.
    // (A walk's step is 115 mm.)
    expect(one).toBeLessThan(120 * FRAMES_A_STEP_AT_MOST);
    expect(decodeSnapshot(channel.snapshotFor(a)!, () => undefined).lastInputSeq).toBe(FRAMES_A_STEP_AT_MOST);
    channel.tick();
    expect(decodeSnapshot(channel.snapshotFor(a)!, () => undefined).lastInputSeq).toBe(6);
    // And what is kept has an end: a longer burst is walked at the pace of time once it is spent.
    const long = new Channel(ground);
    const b = long.join("player-b", here)!;
    for (let n = 0; n < 100; n++) long.tick();
    long.input(b, { seq: 8, ackTick: 0, frames: Array.from({ length: 8 }, () => north) });
    long.input(b, { seq: 16, ackTick: 0, frames: Array.from({ length: 8 }, () => north) });
    let steps = 0;
    while (decodeSnapshot(long.snapshotFor(b)!, () => undefined).lastInputSeq < 16) {
      long.tick();
      steps++;
    }
    expect(steps).toBeGreaterThan(16 / FRAMES_A_STEP_AT_MOST);
    expect(STEPS_KEPT_AT_MOST).toBeLessThanOrEqual(12);
  });

  test("two people cannot stand in the same place: one walking at another stops before them", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const b = channel.join("player-b", { x: 0, y: 0, z: 3000, yaw: 0 })!;
    walking(channel, a, 1, 100);
    expect(channel.placeOf(b)!.z - channel.placeOf(a)!.z).toBeGreaterThan(400);
    expect(channel.placeOf(b)).toMatchObject({ x: 0, z: 3000 });
  });
});

describe("coming back to a body left standing", () => {
  test("a new line starts its count again: its first frames are walked, not taken for repeats, and it is sent everything whole", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const read = reader();
    walking(channel, a, 1, 30);
    const first = read(channel.snapshotFor(a)!);
    channel.input(a, { seq: 31, ackTick: first.tick, frames: [still] });
    channel.tick();
    const stood = channel.placeOf(a)!;
    expect(channel.resume(a)).toBe(true);
    expect(channel.resume(999)).toBe(false);
    // The same body, the same place, the same number.
    expect(channel.placeOf(a)).toEqual(stood);
    // A phone with no memory reads the next snapshot: it is whole, and says none of the new frames are used yet.
    const whole = decodeSnapshot(channel.snapshotFor(a)!, () => undefined);
    expect(whole.lastInputSeq).toBe(0);
    expect(whole.entities).toHaveLength(1);
    // Frames numbered from one again are walked.
    walking(channel, a, 1, 10);
    expect(channel.placeOf(a)!.z).toBeGreaterThan(stood.z + 400);
  });
});

describe("riding a van (F-157)", () => {
  test("a rider is carried, not walked; others are told what they ride and where they sit; off, they stand beside it and walk again", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const b = channel.join("player-b", here)!;
    channel.ride(a, 7, 6);
    channel.ride(b, 7, 2);
    expect(channel.riders()).toEqual([{ id: a, vehicle: 7, seat: 6 }, { id: b, vehicle: 7, seat: 2 }]);
    // Their sticks are let go while they ride; the van carries them.
    walking(channel, a, 1, 10);
    channel.carry(a, { x: 50_000, y: 0, z: 3000, yaw: 9000 });
    channel.carry(b, { x: 50_000, y: 0, z: 3000, yaw: 9000 });
    channel.tick();
    expect(channel.placeOf(a)).toEqual({ x: 50_000, y: 0, z: 3000, yaw: 9000 });
    const seen = channel.entities();
    expect(seen.find((one) => one.id === a)).toMatchObject({ vehicleId: 7, seat: 6, anim: DOING.sit });
    expect(seen.find((one) => one.id === b)).toMatchObject({ vehicleId: 7, seat: 2 });
    // Off where they ask: there, when there is room; the second beside the first, never on top.
    expect(channel.alight(a, { x: 50_000, y: 0, z: 5000, yaw: 0 })).toBe(true);
    expect(channel.alight(b, { x: 50_000, y: 0, z: 5000, yaw: 0 })).toBe(true);
    const off = [channel.placeOf(a)!, channel.placeOf(b)!];
    expect(off[0]).toMatchObject({ x: 50_000, z: 5000 });
    expect(Math.hypot(off[0]!.x - off[1]!.x, off[0]!.z - off[1]!.z)).toBeGreaterThanOrEqual(450);
    expect(channel.riders()).toEqual([]);
    expect(channel.entities().find((one) => one.id === a)).toMatchObject({ vehicleId: null, seat: null });
    // And they walk again.
    walking(channel, a, 20, 20);
    expect(channel.placeOf(a)!.z).toBeGreaterThan(5500);
    // Getting off a van one is not on does nothing; nor does riding someone who is not there.
    expect(channel.alight(a, here)).toBe(false);
    channel.ride(999, 1, 1);
    expect(channel.riders()).toEqual([]);
  });

  test("leaving the channel while riding leaves the van too", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    channel.ride(a, 3, 6);
    channel.leave(a);
    expect(channel.riders()).toEqual([]);
    expect(channel.ridingOf(a)).toBeNull();
  });
});

describe("sitting at a table (Task 4B.1)", () => {
  test("seated, the stick is let go and everyone sees them sitting, in the seat, however long; up, they stand behind it and walk", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    // The seat is a stool on ground that is not walked: its height is the seat's.
    const stool = { x: 4000, y: 460, z: 9800, yaw: 18_000 };
    expect(channel.sit(a, stool)).toBe(true);
    walking(channel, a, 1, 30);
    expect(channel.placeOf(a)).toEqual(stool);
    expect(channel.sittingOf(a)).toEqual(stool);
    expect(channel.entities().find((one) => one.id === a)).toMatchObject({ anim: DOING.sit, vehicleId: null });
    // Up behind the stool, on the ground.
    expect(channel.standUp(a, { x: 4000, y: 0, z: 8500, yaw: 0 })).toBe(true);
    expect(channel.placeOf(a)).toMatchObject({ x: 4000, y: 0, z: 8500 });
    expect(channel.sittingOf(a)).toBeNull();
    walking(channel, a, 40, 10);
    expect(channel.placeOf(a)!.z).toBeGreaterThan(8500);
    // Getting up when not sitting does nothing.
    expect(channel.standUp(a, here)).toBe(false);
  });

  test("nobody sits who rides or is not there; nowhere to stand, they stay seated; leaving the channel leaves the seat", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const b = channel.join("player-b", { x: 50_000, y: 0, z: 0, yaw: 0 })!;
    expect(channel.sit(999, here)).toBe(false);
    channel.ride(b, 1, 1);
    expect(channel.sit(b, here)).toBe(false);
    const stool = { x: 0, y: 460, z: 3000, yaw: 0 };
    channel.sit(a, stool);
    // Behind the wall and beyond the edge there is no room anywhere near.
    expect(channel.standUp(a, { x: 900_000, y: 0, z: 0, yaw: 0 })).toBe(false);
    expect(channel.placeOf(a)).toEqual(stool);
    expect(channel.sittingOf(a)).toEqual(stool);
    channel.leave(a);
    expect(channel.sittingOf(a)).toBeNull();
  });
});

describe("what stands in the district", () => {
  test("a bench stops a walk in the zone as it does on the phone", () => {
    const channel = new Channel(ground, [{ kind: "box", x: 0, z: 3000, halfWidthMm: 850, halfLengthMm: 270, yaw: 0 }]);
    const a = channel.join("player-a", here)!;
    walking(channel, a, 1, 100);
    expect(channel.placeOf(a)!.z).toBeLessThan(3000 - 270);
    expect(channel.placeOf(a)!.z).toBeGreaterThan(2000);
  });
});

describe("what a client is told", () => {
  test("first everything near, whole; then only what changed since the snapshot they say they have", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const b = channel.join("player-b", { x: 5000, y: 0, z: 0, yaw: 0 })!;
    const read = reader();
    channel.tick();
    const whole = channel.snapshotFor(a)!;
    const first = read(whole);
    expect(first.entities.map((entity) => entity.id)).toEqual([a, b]);
    // The channel remembers who it told them of, so that the room can say who each is.
    expect(channel.seenBy(a)).toEqual([a, b]);
    expect(channel.seenBy(999)).toEqual([]);
    expect(first.entities.every((entity) => entity.kind === "player" && entity.anim === DOING.idle)).toBe(true);

    // Nobody moves, and the client says it has that snapshot: the next is a few bytes.
    channel.input(a, { seq: 1, ackTick: first.tick, frames: [still] });
    channel.tick();
    const quiet = channel.snapshotFor(a)!;
    expect(quiet.length).toBeLessThan(whole.length);
    expect(quiet.length).toBeLessThan(12);
    expect(read(quiet).entities).toEqual(first.entities);

    // The other walks: the client is told where they are now, and that they are walking.
    walking(channel, b, 1, 4);
    const moved = read(channel.snapshotFor(a)!);
    const other = moved.entities.find((entity) => entity.id === b)!;
    expect(other.z).toBeGreaterThan(100);
    expect(other.anim).toBe(DOING.walk);
    expect(moved.tick).toBe(channel.world.tick);
  });

  test("the snapshot says which of the client's own frames were used, so that it can replay the rest", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const read = reader();
    expect(read(channel.snapshotFor(a)!).lastInputSeq).toBe(0);
    channel.input(a, { seq: 3, ackTick: 0, frames: [north, north, north] });
    channel.tick();
    expect(read(channel.snapshotFor(a)!).lastInputSeq).toBe(1);
    channel.tick();
    channel.tick();
    expect(read(channel.snapshotFor(a)!).lastInputSeq).toBe(3);
  });

  test("a client that names a snapshot it was never sent is sent everything, whole", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    channel.join("player-b", { x: 4000, y: 0, z: 0, yaw: 0 });
    channel.tick();
    const whole = channel.snapshotFor(a)!.length;
    channel.input(a, { seq: 1, ackTick: 987_654, frames: [still] });
    channel.tick();
    // Read by a client with no memory at all: it can only be whole.
    const again = channel.snapshotFor(a)!;
    expect(again.length).toBeGreaterThanOrEqual(whole - 2);
    expect(decodeSnapshot(again, () => undefined).entities).toHaveLength(2);
  });

  test("only who is near: someone beyond sight is not told of, and of a crowd only the nearest", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const far = channel.join("player-far", { x: SIGHT_MM + 5000, y: 0, z: 0, yaw: 0 })!;
    for (let n = 0; n < SEEN_AT_MOST + 10; n++) channel.join(`crowd-${n}`, { x: 2000 + n * 1200, y: 0, z: -4000, yaw: 0 });
    channel.tick();
    const seen = decodeSnapshot(channel.snapshotFor(a)!, () => undefined).entities;
    expect(seen).toHaveLength(SEEN_AT_MOST);
    expect(seen.some((entity) => entity.id === a)).toBe(true);
    expect(seen.some((entity) => entity.id === far)).toBe(false);
  });

  test("running, jumping and standing are told apart", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const mine = (): number => channel.entities().find((entity) => entity.id === a)!.anim;
    walking(channel, a, 1, 3, { ...north, run: true });
    expect(mine()).toBe(DOING.run);
    walking(channel, a, 4, 1, { ...north, jump: true });
    expect(mine()).toBe(DOING.air);
    walking(channel, a, 5, 30, still);
    expect(mine()).toBe(DOING.idle);
  });

  test("a long stay does not fill the channel's memory with old snapshots", () => {
    const channel = new Channel(ground);
    const a = channel.join("player-a", here)!;
    const read = reader();
    const first = read(channel.snapshotFor(a)!);
    channel.input(a, { seq: 1, ackTick: first.tick, frames: [still] });
    for (let n = 0; n < 200; n++) {
      channel.tick();
      read(channel.snapshotFor(a)!);
    }
    // The one they have is still there to make a difference from, two hundred snapshots later.
    channel.tick();
    expect(channel.snapshotFor(a)!.length).toBeLessThan(12);
  });
});

test("nobody is set down with a shoulder in a wall: the place asked for is a hand from one, and they stand clear of it, and can walk (F-292)", () => {
  const channel = new Channel(ground);
  // The wall is the row of cells from z = 10 m: a body's middle at 9,9 m would have its shoulder in it.
  const id = channel.join("perto", { x: 0, y: 0, z: 9900, yaw: 0 })!;
  expect(channel.placeOf(id)!.z).toBeLessThanOrEqual(10_000 - 230);
  const from = channel.placeOf(id)!;
  walking(channel, id, 1, 20, { dx: 127, dz: 0, run: false, brake: false });
  expect(channel.placeOf(id)!.x).toBeGreaterThan(from.x + 500);
});

describe("a place of one's own (the family's house, Phase 5)", () => {
  // A row of houses stands from z = 10 m to z = 16,5 m, a wall to the street. One of them is two metres wide and
  // open to its families from its front wall to its back one.
  const street: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cz >= 20 && cz <= 32 ? 0 : ground.flagsAt(cx, cz)), heightAt: () => 0 };
  const inside: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cx >= -2 && cx < 2 && cz >= 20 && cz < 32 ? 1 : street.flagsAt(cx, cz)), heightAt: () => 0 };
  const house = (key: string) => ({ ground: inside, rect: [-1000, 10_500, 1000, 16_000] as const, key });
  const seenBy = (channel: Channel, id: number): number[] => (channel.snapshotFor(id), [...channel.seenBy(id)].sort((a, b) => a - b));

  test("its family walks in where the street meets a wall; inside they see only who is inside with them, and the street does not see in", () => {
    const channel = new Channel(street);
    const mae = channel.join("mae", { x: -500, y: 0, z: 8000, yaw: 0 }, house("familia-1"))!;
    const filho = channel.join("filho", { x: 500, y: 0, z: 8000, yaw: 0 }, house("familia-1"))!;
    const vizinho = channel.join("vizinho", { x: 0, y: 0, z: 6000, yaw: 0 }, house("familia-2"))!;
    const estranho = channel.join("estranho", { x: 3000, y: 0, z: 8000, yaw: 0 })!;
    // In the street everyone sees everyone.
    expect(seenBy(channel, estranho)).toEqual([mae, filho, vizinho, estranho]);
    expect(channel.withinOf(mae)).toBeNull();
    for (let seq = 1; seq <= 90; seq++) {
      for (const id of [mae, filho, estranho]) channel.input(id, { seq, ackTick: 0, frames: [north] });
      channel.tick();
    }
    // The family is in; the stranger stands at the wall.
    expect(channel.placeOf(mae)!.z).toBeGreaterThan(11_000);
    expect(channel.placeOf(filho)!.z).toBeGreaterThan(11_000);
    expect(channel.placeOf(estranho)!.z).toBeLessThan(10_000);
    expect(channel.withinOf(mae)).toBe("familia-1");
    expect(channel.withinOf(estranho)).toBeNull();
    // From inside, the street is seen through the window, and who is in it; the street does not see in.
    expect(seenBy(channel, mae)).toEqual([mae, filho, vizinho, estranho]);
    expect(seenBy(channel, estranho)).toEqual([vizinho, estranho]);
    // Another family of the same house walks into the same walls and is in a room of their own: nobody is in their
    // way, though the first family stands where they walk, and neither sees the other.
    for (let seq = 1; seq <= 110; seq++) {
      channel.input(vizinho, { seq, ackTick: 0, frames: [north] });
      channel.tick();
    }
    expect(channel.placeOf(vizinho)!.z).toBeGreaterThan(12_000);
    expect(channel.withinOf(vizinho)).toBe("familia-2");
    expect(seenBy(channel, vizinho)).toEqual([vizinho, estranho]);
    expect(seenBy(channel, mae)).toEqual([mae, filho, estranho]);
    expect(channel.withinOf(999)).toBeNull();
  });

  test("someone who went to sleep at home wakes there, even where another family of the same house stands; set down in the street, they are in the street", () => {
    const channel = new Channel(street);
    const bed = { x: 0, y: 0, z: 12_000, yaw: 0 };
    const first = channel.join("first", bed, house("a"))!;
    const second = channel.join("second", bed, house("b"))!;
    expect(channel.placeOf(first)).toMatchObject({ x: 0, z: 12_000 });
    expect(channel.placeOf(second)).toMatchObject({ x: 0, z: 12_000 });
    expect(channel.withinOf(second)).toBe("b");
    // Someone of the first family arrives at the same bed: beside who is there, still inside.
    const third = channel.join("third", bed, house("a"))!;
    expect(channel.placeOf(third)).not.toMatchObject({ x: 0, z: 12_000 });
    expect(channel.withinOf(third)).toBe("a");
    // With no house of their own here, the same place is a wall: they are put where there is ground, outside.
    const stranger = channel.join("stranger", bed)!;
    expect(channel.placeOf(stranger)!.z).toBeLessThan(10_000);
    // Seated in her house (a chair of her own), and up again a step from it: she stands in her house, not put out of it.
    expect(channel.sit(second, { x: 0, y: 460, z: 13_000, yaw: 0 })).toBe(true);
    expect(channel.standUp(second, { x: 0, y: 0, z: 13_600, yaw: 0 })).toBe(true);
    expect(channel.placeOf(second)).toMatchObject({ x: 0, z: 13_600 });
    expect(channel.withinOf(second)).toBe("b");
    // Let into a neighbour's inside (Task 5.4): the stranger is given it over nothing of his own, walks where it is
    // open, and is inside under the neighbour's key; the visit over, the house is a wall to him again.
    expect(channel.ownOf(stranger)).toBeNull();
    channel.setOwn(stranger, { ...house("b"), also: null });
    channel.setOwn(999, house("b"));
    expect(channel.put(stranger, { x: 500, y: 0, z: 14_000, yaw: 0 })).toBe(true);
    channel.tick();
    expect(channel.withinOf(stranger)).toBe("b");
    // And someone with a house of their own who is let into another's is inside whichever they stand in.
    channel.setOwn(third, { ground: inside, rect: [-1000, 10_500, 1000, 12_500], key: "visita", also: channel.ownOf(third) });
    channel.tick();
    expect(channel.withinOf(third)).toBe(channel.placeOf(third)!.z < 12_500 ? "visita" : "a");
    channel.setOwn(stranger, null);
    expect(channel.put(stranger, { x: 500, y: 0, z: 14_000, yaw: 0 })).toBe(true);
    expect(channel.placeOf(stranger)!.z).toBeGreaterThan(16_500);
    // Taken to the hospital from their bed: in the street at once, and seen there.
    expect(channel.put(first, here)).toBe(true);
    expect(channel.withinOf(first)).toBeNull();
    channel.leave(third);
    channel.leave(second);
    channel.tick();
    expect(seenBy(channel, stranger)).toEqual([first, stranger]);
  });
});
