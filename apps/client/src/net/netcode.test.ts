// The phone's half of the street: its own body ahead of the zone, everyone else a moment behind.
// The zone here is the real channel (apps/zone), fed and read with no network between.

import { DOING, decodeSnapshot, type EntityState, type InputFrame, type Snapshot } from "@nzila/protocol";
import { DEFAULT_CHARACTER, stepCharacter, type CharacterState, type Ground, type Obstacle } from "@nzila/sim";
import { describe, expect, test } from "vitest";
import { Channel } from "../../../zone/src/channel.ts";
import { Conditioner, LateLine, RESEND_MS, askedLine } from "./conditioner.ts";
import { CATCH_UP_EXTRA_M_S, CATCH_UP_PACE, DELAY_LEAST_MS, DELAY_MOST_MS, Others, SNAP_M } from "./others.ts";
import { AGREE_MM, FRAMES_REPEATED, PENDING_AT_MOST, Prediction, SNAP_MM } from "./predict.ts";
import { SAY_AFTER_MS, TRY_AFTER_MS, TRY_FOR_MS, nextTry } from "./retry.ts";
import { BALLOON_LEAST_MS, BALLOON_MOST_MS, LINES_KEPT, LINE_SHOWN_MS, TYPING_FOR_MS, Talking } from "./talking.ts";

const ground: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cz === 20 || Math.abs(cx) > 400 ? 0 : 1), heightAt: () => 0 };
const north: InputFrame = { dx: 0, dz: 127, run: false, brake: false };
const east: InputFrame = { dx: 127, dz: 0, run: false, brake: false };
const still: InputFrame = { dx: 0, dz: 0, run: false, brake: false };
const walkOn = (obstacles: Obstacle[] = []) => (body: CharacterState, frame: InputFrame): void => stepCharacter(body, { dx: frame.dx, dz: frame.dz, run: frame.run, ...(frame.jump ? { jump: true } : {}) }, ground, obstacles, DEFAULT_CHARACTER);

/** A phone and a zone with a line between them that delays each way by a number of steps and may lose messages up. */
function street(delaySteps: number, lose: (step: number) => boolean = () => false, bunched = false, stalled: (step: number) => boolean = () => false) {
  const channel = new Channel(ground);
  const id = channel.join("me", { x: 0, y: 0, z: 0, yaw: 0 })!;
  const body: CharacterState = { x: 0, y: 0, z: 0, yaw: 0 };
  const prediction = new Prediction();
  const had = new Map<number, Snapshot>();
  const up: { at: number; send: () => void }[] = [];
  const down: { at: number; bytes: Uint8Array }[] = [];
  const slides: number[] = [];
  const held: (() => void)[] = [];
  let step = 0;
  let ack = 0;
  return {
    channel,
    id,
    body,
    slides,
    prediction,
    run(steps: number, frame: (step: number) => InputFrame, obstacles: Obstacle[] = []): void {
      for (let n = 0; n < steps; n++, step++) {
        const now = step;
        // The phone: walk at once, send the stick. A phone that draws slowly walks two steps in one picture and none in the next.
        for (let k = 0; k < (bunched ? (now % 2 === 0 ? 2 : 0) : 1); k++) {
          const f = frame(now);
          walkOn(obstacles)(body, f);
          const sent = prediction.walked(f);
          const ackTick = ack;
          // A stalled line holds everything back, in order, until it runs again.
          if (stalled(now)) held.push(() => channel.input(id, { seq: sent.seq, ackTick, frames: sent.frames }));
          else if (!lose(now)) {
            for (const send of held.splice(0)) up.push({ at: now + delaySteps, send });
            up.push({ at: now + delaySteps, send: () => channel.input(id, { seq: sent.seq, ackTick, frames: sent.frames }) });
          }
        }
        // The zone: what has arrived, one step, and a snapshot every other step.
        while (up.length > 0 && up[0]!.at <= now) up.shift()!.send();
        channel.tick();
        if (channel.world.tick % 2 === 0) down.push({ at: now + delaySteps, bytes: channel.snapshotFor(id)! });
        // The phone again: what has arrived from the zone.
        while (down.length > 0 && down[0]!.at <= now) {
          const snapshot = decodeSnapshot(down.shift()!.bytes, (tick) => had.get(tick));
          had.set(snapshot.tick, snapshot);
          ack = snapshot.tick;
          const mine = snapshot.entities.find((entity) => entity.id === id)!;
          const slide = prediction.reconcile(body, mine, snapshot.lastInputSeq, walkOn(obstacles));
          if (slide) slides.push(Math.hypot(slide.x, slide.z));
        }
      }
    },
  };
}

describe("the player's own body, ahead of the zone", () => {
  test("each message repeats the last frames, newest first, and numbers them", () => {
    const prediction = new Prediction();
    expect(prediction.walked(north)).toEqual({ seq: 1, frames: [north] });
    expect(prediction.walked(east)).toEqual({ seq: 2, frames: [east, north] });
    prediction.walked(still);
    const fourth = prediction.walked(north);
    expect(fourth.seq).toBe(4);
    expect(fourth.frames).toEqual([north, still, east]);
    expect(fourth.frames).toHaveLength(FRAMES_REPEATED);
  });

  test("on a good line and on a slow one, walking and turning, the zone never has to correct the phone", () => {
    for (const delay of [0, 1, 3, 5]) {
      const line = street(delay);
      line.run(60, () => north);
      line.run(40, () => east);
      line.run(30, () => still);
      expect(line.slides, `a delay of ${delay} steps`).toEqual([]);
      // And when all is quiet the phone and the zone say the same place.
      const zone = line.channel.placeOf(line.id)!;
      expect(Math.hypot(zone.x - line.body.x, zone.z - line.body.z)).toBeLessThan(AGREE_MM);
      expect(line.prediction.waiting).toBeLessThanOrEqual(delay * 2 + 3);
    }
  });

  test("a phone that draws slowly sends its frames in bunches, and a ragged line bunches them more: still nothing to correct", () => {
    for (const delay of [0, 2, 4]) {
      const line = street(delay, () => false, true);
      line.run(80, () => north);
      line.run(60, () => east);
      line.run(30, () => still);
      expect(line.slides, `a delay of ${delay} steps`).toEqual([]);
      const zone = line.channel.placeOf(line.id)!;
      expect(Math.hypot(zone.x - line.body.x, zone.z - line.body.z)).toBeLessThan(AGREE_MM);
    }
  });

  test("a line that stalls for half a second and then delivers everything at once loses nothing: no correction, and the stick is not left late", () => {
    // Steps 40 to 49 are held back (a packet lost and sent again), then all arrive together; and again later.
    const line = street(2, () => false, false, (step) => (step >= 40 && step < 50) || (step >= 90 && step < 98));
    line.run(140, () => north);
    expect(line.slides).toEqual([]);
    // The zone has caught up: what the phone is waiting to hear about is no more than the line's own delay.
    expect(line.prediction.waiting).toBeLessThanOrEqual(2 * 2 + 3);
    line.run(20, () => still);
    const zone = line.channel.placeOf(line.id)!;
    expect(Math.hypot(zone.x - line.body.x, zone.z - line.body.z)).toBeLessThan(AGREE_MM);
  });

  test("a wall stops the phone's body where it stops the zone's: no correction at a wall", () => {
    const line = street(3);
    line.run(260, () => north);
    expect(line.body.z).toBeLessThan(10_000);
    expect(line.body.z).toBeGreaterThan(9_000);
    expect(line.slides).toEqual([]);
  });

  test("with messages lost on the way up, the walk goes on and is put right without a jump", () => {
    // One in five is lost, and once four in a row.
    const line = street(2, (step) => step % 5 === 0 || (step >= 40 && step < 44));
    line.run(120, () => north);
    line.run(30, () => still);
    const zone = line.channel.placeOf(line.id)!;
    expect(Math.hypot(zone.x - line.body.x, zone.z - line.body.z)).toBeLessThan(AGREE_MM);
    // Whatever was put right was a step or two of walking, never a teleport.
    expect(Math.max(0, ...line.slides)).toBeLessThan(400);
  });

  test("where the zone knows of something the phone did not, the body ends where the zone says and the picture slides there", () => {
    const line = street(2);
    // Someone the phone has not been told of stands in the way.
    line.channel.join("other", { x: 0, y: 0, z: 2500, yaw: 0 });
    line.run(120, () => north);
    line.run(20, () => still);
    const zone = line.channel.placeOf(line.id)!;
    expect(zone.z).toBeLessThan(2500 - 400);
    expect(Math.hypot(zone.x - line.body.x, zone.z - line.body.z)).toBeLessThan(AGREE_MM);
    expect(line.slides.length).toBeGreaterThan(0);
    expect(Math.max(...line.slides)).toBeLessThan(SNAP_MM);
  });

  test("a phone that claims to be far away is simply put back, with nothing to slide over", () => {
    const prediction = new Prediction();
    const body: CharacterState = { x: 90_000, y: 0, z: 0, yaw: 0 };
    expect(prediction.reconcile(body, { x: 0, y: 0, z: 0, yaw: 9000 }, 0, walkOn())).toEqual({ x: 0, y: 0, z: 0 });
    expect(body).toMatchObject({ x: 0, z: 0, yaw: 9000 });
  });

  test("a body in the air is left to land, and so is one whose unanswered frames begin a jump", () => {
    const prediction = new Prediction();
    const flying: CharacterState = { x: 500, y: 0, z: 0, yaw: 0, air: 4 };
    expect(prediction.reconcile(flying, { x: 0, y: 0, z: 0, yaw: 0 }, 0, walkOn())).toBeNull();
    expect(flying.x).toBe(500);
    const about: CharacterState = { x: 300, y: 0, z: 0, yaw: 0 };
    prediction.walked({ ...north, jump: true });
    expect(prediction.reconcile(about, { x: 0, y: 0, z: 0, yaw: 0 }, 0, walkOn())).toBeNull();
    expect(about.x).toBe(300);
  });

  test("with no answer at all, what is remembered does not grow without end", () => {
    const prediction = new Prediction();
    for (let n = 0; n < PENDING_AT_MOST * 3; n++) prediction.walked(north);
    expect(prediction.waiting).toBe(PENDING_AT_MOST);
  });
});

describe("everyone else, a moment ago", () => {
  const one = (tick: number, x: number, anim: number = DOING.walk, yaw = 9000): Snapshot => ({ tick, lastInputSeq: 0, entities: [{ id: 1, kind: "player", x: 0, y: 0, z: 0, yaw: 0, anim: DOING.idle, vehicleId: null, seat: null }, { id: 7, kind: "player", x, y: 0, z: 0, yaw, anim, vehicleId: null, seat: null }] });

  test("the player's own body is not one of the others, and before the zone has spoken there is nobody", () => {
    const others = new Others();
    expect(others.at(0)).toEqual([]);
    others.take(one(2, 1000), 1, 100);
    expect(others.at(100).map((seen) => seen.id)).toEqual([7]);
    expect(others.latest().map((state: EntityState) => state.id)).toEqual([7]);
  });

  test("someone walking is drawn gliding between what the zone said, never jumping from word to word", () => {
    const others = new Others();
    // A snapshot every 100 ms, on time; they walk 140 mm in each.
    let last = -1;
    let biggest = 0;
    for (let ms = 0; ms <= 3000; ms += 10) {
      if (ms % 100 === 0) others.take(one(ms / 50, (ms / 100) * 140), 1, ms);
      const seen = others.at(ms)[0]!;
      if (last >= 0) biggest = Math.max(biggest, seen.x - last);
      expect(seen.x).toBeGreaterThanOrEqual(last);
      last = seen.x;
    }
    // 1.4 m/s drawn every 10 ms is 14 mm a frame: nothing like the 140 mm of a jump.
    expect(biggest).toBeLessThan(0.03);
    const now = others.at(3000)[0]!;
    expect(now.speed).toBeCloseTo(1.4, 1);
    expect(now.facing).toBeCloseTo(Math.PI / 2, 3);
    expect(now.anim).toBe(DOING.walk);
    // On a steady line the others are a short moment behind, and no more.
    expect(others.delayMs).toBe(DELAY_LEAST_MS);
    expect(3000 * 1.4 / 1000 - now.x).toBeLessThan(0.25);
  });

  test("on a ragged line the delay grows, slowly, so that there is still a next word to glide to; and never beyond its limit", () => {
    const others = new Others();
    let stalls = 0;
    let late = 0;
    for (let ms = 0; ms <= 20_000; ms += 10) {
      // Every snapshot arrives up to 180 ms late, by turns.
      for (let sent = Math.max(0, ms - 200); sent <= ms; sent += 10) {
        if (sent % 100 === 0 && sent + ((sent / 100) % 4) * 60 === ms) others.take(one(sent / 50, (sent / 100) * 140), 1, ms);
      }
      const seen = others.at(ms)[0];
      if (ms > 12_000 && seen && seen.speed === 0) stalls++;
      if (ms > 12_000) late = others.delayMs;
    }
    expect(late).toBeGreaterThan(DELAY_LEAST_MS + 100);
    expect(late).toBeLessThanOrEqual(DELAY_MOST_MS);
    // Once it has settled, they are never seen to stop for want of news.
    expect(stalls).toBe(0);
  });

  test("nobody is drawn jumping: words held back and then arriving together are caught up briskly, never leapt (F-220)", () => {
    const others = new Others();
    let last = -1;
    let biggest = 0;
    for (let ms = 0; ms <= 4000; ms += 10) {
      // A snapshot every 100 ms; at two seconds the line holds three back, and they arrive together 300 ms late.
      if (ms % 100 === 0 && (ms < 2000 || ms > 2300)) others.take(one(ms / 50, (ms / 100) * 230), 1, ms);
      if (ms === 2300) for (const sent of [2000, 2100, 2200, 2300]) others.take(one(sent / 50, (sent / 100) * 230), 1, ms);
      const seen = others.at(ms)[0]!;
      if (last >= 0) biggest = Math.max(biggest, Math.abs(seen.x - last));
      last = seen.x;
    }
    // 2,3 m/s drawn every 10 ms is 23 mm a frame; caught up at most (2,3 x 1,8 + 1) m/s, 51 mm. Leapt, it would be
    // more than half a metre in one frame.
    expect(biggest).toBeLessThan(((2.3 * CATCH_UP_PACE + CATCH_UP_EXTRA_M_S) * 10) / 1000 + 1e-9);
    // And they are where the zone says in the end.
    expect(last).toBeCloseTo(4000 * 2.3 / 1000 - (others.delayMs / 1000) * 2.3, 1);
  });

  test("the zone itself moving someone in a burst (their phone's steps came late) is caught up, not leapt; a change of place is drawn at once", () => {
    const others = new Others();
    let last = -1;
    let biggest = 0;
    for (let ms = 0; ms <= 3000; ms += 10) {
      // Walking, then held still four words, then a metre and more at once, then walking on.
      const x = ms < 1000 ? (ms / 100) * 230 : ms < 1400 ? 2300 : 3600 + ((ms - 1400) / 100) * 230;
      if (ms % 100 === 0) others.take(one(ms / 50, x), 1, ms);
      const seen = others.at(ms)[0]!;
      if (last >= 0) biggest = Math.max(biggest, Math.abs(seen.x - last));
      last = seen.x;
    }
    expect(biggest).toBeLessThan(((2.3 * CATCH_UP_PACE + CATCH_UP_EXTRA_M_S) * 10) / 1000 + 0.02);
    // Farther than a step: drawn there at once.
    others.take(one(62, 3600 + 16 * 230 + SNAP_M * 1000 + 2000), 1, 3100);
    others.take(one(64, 3600 + 16 * 230 + SNAP_M * 1000 + 2000), 1, 3200);
    expect(others.at(3600)[0]!.x).toBeCloseTo((3600 + 16 * 230 + SNAP_M * 1000 + 2000) / 1000, 3);
  });

  test("the delay changes too slowly to be seen", () => {
    const others = new Others();
    others.take(one(0, 0), 1, 0);
    others.at(0);
    // A second of silence, then one very late arrival.
    others.take(one(2, 140), 1, 900);
    const before = others.delayMs;
    others.at(900);
    others.at(1000);
    expect(others.delayMs - before).toBeLessThanOrEqual(60);
  });

  test("a turn goes the short way round, and someone who stops is drawn standing where they stopped", () => {
    const others = new Others();
    others.take(one(0, 0, DOING.walk, 35_000), 1, 0);
    others.take(one(2, 140, DOING.idle, 1000), 1, 100);
    others.take(one(4, 140, DOING.idle, 1000), 1, 200);
    const mid = others.at(100 + DELAY_LEAST_MS - 50)[0]!;
    // Half way from 350° to 10° is 0°, not 180°.
    expect(Math.abs(Math.sin(mid.facing))).toBeLessThan(0.1);
    expect(Math.cos(mid.facing)).toBeGreaterThan(0.9);
    const rest = others.at(2000)[0]!;
    expect(rest).toMatchObject({ x: 0.14, speed: 0, anim: DOING.idle });
  });

  test("someone the zone stops speaking of is gone; and an old word arriving late changes nothing", () => {
    const others = new Others();
    others.take(one(4, 500), 1, 200);
    others.take(one(2, 100), 1, 210);
    expect(others.latest()[0]!.x).toBe(500);
    others.take({ tick: 6, lastInputSeq: 0, entities: [] }, 1, 300);
    expect(others.at(300)).toEqual([]);
    expect(others.latest()).toEqual([]);
  });
});

describe("a weak line, on purpose", () => {
  test("every message is late by the delay, and nothing overtakes what was sent before it", () => {
    const line = new Conditioner(125, 0);
    expect(line.due(1000)).toBe(1125);
    expect(line.due(1010)).toBe(1135);
    // Handed over out of step with the clock: still not before the one ahead.
    expect(line.due(1005)).toBe(1135);
  });

  test("a lost packet holds the line up for a moment, and everything behind it waits and then arrives together", () => {
    const rolls = [0.5, 0.01, 0.5, 0.5, 0.5];
    const line = new Conditioner(100, 5, () => rolls.shift() ?? 0.9);
    expect(line.due(0)).toBe(100);
    // Lost once, sent again.
    expect(line.due(50)).toBe(150 + RESEND_MS);
    // The ones behind it were not lost, and still cannot arrive before it.
    expect(line.due(100)).toBe(150 + RESEND_MS);
    expect(line.due(150)).toBe(150 + RESEND_MS);
    // Then the line runs again.
    expect(line.due(600)).toBe(700);
  });

  test("over many messages the loss asked for is the loss given, and a line that loses everything still delivers, late", () => {
    let seed = 1;
    const random = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000;
    const line = new Conditioner(0, 5, random);
    let stalls = 0;
    for (let n = 0; n < 20_000; n++) if (line.due(n * 1000) > n * 1000) stalls++;
    expect(stalls / 20_000).toBeGreaterThan(0.04);
    expect(stalls / 20_000).toBeLessThan(0.06);
    expect(new Conditioner(10, 100).due(0)).toBe(10 + RESEND_MS);
    expect(new Conditioner(-5, -5).due(7)).toBe(7);
  });

  test("the address asks for it: a round trip and a loss, or nothing", () => {
    expect(askedLine("?rede=250,5")).toEqual({ roundTripMs: 250, lossPercent: 5 });
    expect(askedLine("?hour=12&rede=120")).toEqual({ roundTripMs: 120, lossPercent: 0 });
    expect(askedLine("?rede=99999,400")).toEqual({ roundTripMs: 5000, lossPercent: 100 });
    for (const nonsense of ["", "?rede=", "?rede=depressa", "?rede=-4", "?rede=100,-1", "?rede=100,muito"]) expect(askedLine(nonsense), nonsense).toBeNull();
  });
});

describe("things handed over late", () => {
  test("come out in the order they went in, whatever order their timers wake in, and none before its time", () => {
    let now = 0;
    const wakes: { at: number; run: () => void }[] = [];
    const rolls = [0.9, 0.01, 0.9, 0.9];
    const line = new LateLine(new Conditioner(100, 5, () => rolls.shift() ?? 0.9), () => now, (run, ms) => void wakes.push({ at: now + ms, run }));
    const out: string[] = [];
    line.give(() => out.push("a"));
    now = 10;
    line.give(() => out.push("b"));
    now = 20;
    line.give(() => out.push("c"));
    // The timers wake in the wrong order, and one of them early.
    const run = (at: number): void => {
      now = at;
      for (const wake of wakes.filter((one) => one.at <= at + 1).reverse()) wake.run();
    };
    run(99);
    expect(out).toEqual([]);
    run(100);
    expect(out).toEqual(["a"]);
    // "b" was lost once and sent again: "c", behind it, waits for it.
    run(125);
    expect(out).toEqual(["a"]);
    run(110 + RESEND_MS);
    expect(out).toEqual(["a", "b", "c"]);
  });
});

describe("a fallen line is tried again", () => {
  test("quickly at first, then steadily, for a minute and no longer", () => {
    expect(nextTry(0, 0)).toBe(TRY_AFTER_MS[0]);
    expect(nextTry(500, 1)).toBe(TRY_AFTER_MS[1]);
    expect(nextTry(20_000, 50)).toBe(TRY_AFTER_MS[TRY_AFTER_MS.length - 1]);
    expect(nextTry(TRY_FOR_MS, 3)).toBeNull();
    // Most falls are a blink: the first two tries are over before anything is said.
    expect(TRY_AFTER_MS[0]! + TRY_AFTER_MS[1]!).toBeLessThanOrEqual(SAY_AFTER_MS + 200);
    // And the tries are never so close together that a dead network is hammered.
    let total = 0;
    let tries = 0;
    while (nextTry(total, tries) !== null) total += nextTry(total, tries++)!;
    expect(tries).toBeLessThan(20);
  });
});

describe("what is being said, as the phone keeps it", () => {
  test("a line is a balloon for a while, longer for more words, and a line in the log; a balloon from too far is empty and is not written down", () => {
    const talk = new Talking();
    talk.heard(7, "Dona Xepa", "Bom dia!", 0);
    expect(talk.over(7, 100)).toEqual({ text: "Bom dia!", typing: false });
    expect(talk.over(7, BALLOON_LEAST_MS + 1)).toBeNull();
    talk.heard(7, "Dona Xepa", "a".repeat(200), 10_000);
    expect(talk.over(7, 10_000 + BALLOON_MOST_MS - 1)).not.toBeNull();
    expect(talk.over(7, 10_000 + BALLOON_MOST_MS + 1)).toBeNull();
    talk.heard(8, "Zé", "", 20_000);
    expect(talk.over(8, 20_100)).toEqual({ text: "", typing: false });
    expect(talk.lines(20_100, true).map((line) => line.who)).toEqual(["Dona Xepa", "Dona Xepa"]);
    // The player's own line comes back from the zone and is theirs.
    talk.heard(1, null, "Tudo fixe?", 21_000);
    expect(talk.lines(21_000).at(-1)).toEqual({ who: null, text: "Tudo fixe?", at: 21_000 });
    expect(talk.speaking(21_000).sort()).toEqual([1, 8]);
  });

  test("three dots while someone types, gone when they speak, when they stop, and by themselves if nothing more is heard", () => {
    const talk = new Talking();
    talk.typing(7, true, 0);
    expect(talk.over(7, 10)).toEqual({ text: "", typing: true });
    talk.heard(7, "Dona Xepa", "olá", 500);
    expect(talk.over(7, 600)).toEqual({ text: "olá", typing: false });
    expect(talk.over(7, 500 + BALLOON_LEAST_MS + 1)).toBeNull();
    talk.typing(7, true, 10_000);
    talk.typing(7, false, 10_500);
    expect(talk.over(7, 10_600)).toBeNull();
    talk.typing(7, true, 20_000);
    expect(talk.over(7, 20_000 + TYPING_FOR_MS + 1)).toBeNull();
    talk.typing(9, true, 30_000);
    talk.gone(9);
    expect(talk.speaking(30_001)).toEqual([]);
  });

  test("someone silenced is not heard and not seen to type, until they are heard again; what they said before stays said", () => {
    const talk = new Talking();
    talk.heard(7, "Chato", "primeira", 0);
    talk.silence(7, true);
    expect(talk.silenced(7)).toBe(true);
    expect(talk.over(7, 10)).toBeNull();
    talk.heard(7, "Chato", "segunda", 100);
    talk.typing(7, true, 200);
    expect(talk.over(7, 300)).toBeNull();
    expect(talk.lines(300, true).map((line) => line.text)).toEqual(["primeira"]);
    talk.silence(7, false);
    talk.heard(7, "Chato", "terceira", 400);
    expect(talk.over(7, 500)).toEqual({ text: "terceira", typing: false });
  });

  test("the log shows a few fresh lines and keeps only so many; each line this player sends has a number of its own", () => {
    const talk = new Talking();
    for (let n = 0; n < LINES_KEPT + 10; n++) talk.heard(7, "Zé", `linha ${n}`, n * 100);
    const now = (LINES_KEPT + 9) * 100;
    expect(talk.lines(now, true)).toHaveLength(LINES_KEPT);
    expect(talk.lines(now).map((line) => line.text)).toEqual([`linha ${LINES_KEPT + 6}`, `linha ${LINES_KEPT + 7}`, `linha ${LINES_KEPT + 8}`, `linha ${LINES_KEPT + 9}`]);
    expect(talk.lines(now + LINE_SHOWN_MS + 1)).toEqual([]);
    expect([talk.takeId(), talk.takeId(), talk.takeId()]).toEqual([1, 2, 3]);
  });
});
