import { describe, expect, test } from "vitest";
import { MSG } from "./messages.ts";
import { decodeSnapshot, encodeSnapshot, selectVisible, type EntityState, type Snapshot } from "./snapshot.ts";
import { ProtocolError, Writer } from "./wire.ts";

const person = (id: number, x: number, z: number, change: Partial<EntityState> = {}): EntityState => ({
  id,
  kind: "player",
  x,
  y: 2000,
  z,
  yaw: 9000,
  anim: 1,
  vehicleId: null,
  seat: null,
  ...change,
});

const none = (): undefined => undefined;

/** Thirty avatars spread over a busy stretch of a district 512 m wide, with ids as a live channel has them. */
function crowd(): EntityState[] {
  return Array.from({ length: 30 }, (_, i) =>
    person(1000 + i * 37, 200_000 + ((i * 7919) % 60_000), 150_000 + ((i * 104_729) % 60_000), { yaw: (i * 1234) % 36000, anim: i % 4 }),
  );
}

/** Everyone takes a tenth of a second's walk or run, most of them turning a little. */
function walkOn(entities: readonly EntityState[], step: number): EntityState[] {
  return entities.map((e, i) => {
    const pace = i % 5 === 0 ? 420 : 150;
    const yaw = i % 3 === 0 ? e.yaw : (e.yaw + 500 * step) % 36000;
    return { ...e, x: e.x + (i % 2 ? pace : -pace), z: e.z + ((i % 4) - 1) * (pace / 2), yaw };
  });
}

describe("round trips", () => {
  test("a whole snapshot", () => {
    const snapshot: Snapshot = {
      tick: 1200,
      lastInputSeq: 588,
      entities: [
        person(3, -5000, 120_000),
        person(9, 511_999, 383_999, { kind: "npc", y: -400, yaw: 35_999, anim: 255 }),
        person(40, 100_000, 100_000, { kind: "vehicle", y: 0 }),
        person(41, 100_000, 100_000, { vehicleId: 40, seat: 3 }),
        person(42, 100_000, 100_000, { vehicleId: 0, seat: 0 }),
      ],
    };
    expect(decodeSnapshot(encodeSnapshot(snapshot, null), none)).toEqual(snapshot);
  });

  test("a rider with no seat named is put in seat 0", () => {
    const snapshot: Snapshot = { tick: 1, lastInputSeq: 0, entities: [person(1, 0, 0, { vehicleId: 40, seat: null })] };
    expect(decodeSnapshot(encodeSnapshot(snapshot, null), none).entities[0]).toMatchObject({ vehicleId: 40, seat: 0 });
  });

  test("an empty one", () => {
    const snapshot: Snapshot = { tick: 1, lastInputSeq: 0, entities: [] };
    expect(decodeSnapshot(encodeSnapshot(snapshot, null), none)).toEqual(snapshot);
  });

  test("a delta: someone moves, turns, climbs, changes animation, boards, gets off, arrives, leaves, stands still", () => {
    const base: Snapshot = {
      tick: 100,
      lastInputSeq: 40,
      entities: [
        person(1, 1000, 1000),
        person(2, 2000, 2000),
        person(3, 3000, 3000),
        person(4, 4000, 4000),
        person(5, 5000, 5000),
        person(6, 6000, 6000, { vehicleId: 90, seat: 2 }),
        person(7, 7000, 7000),
        person(8, 8000, 8000),
        person(90, 6000, 6000, { kind: "vehicle" }),
      ],
    };
    const next: Snapshot = {
      tick: 102,
      lastInputSeq: 41,
      entities: [
        person(1, 1150, 925),
        person(2, 2000, 2000, { yaw: 18_000 }),
        person(3, 3000, 3000, { y: 2350 }),
        person(4, 4000, 4000, { anim: 7 }),
        person(5, 5000, 5000, { vehicleId: 90, seat: 4 }),
        person(6, 6000, 6000),
        // 7 left; 8 stands still; 9 arrives.
        person(8, 8000, 8000),
        person(9, 9000, 9000, { kind: "npc" }),
        person(90, 6100, 6000, { kind: "vehicle", yaw: 9100 }),
      ],
    };
    const bytes = encodeSnapshot(next, base);
    expect(decodeSnapshot(bytes, (tick) => (tick === 100 ? base : undefined))).toEqual(next);
    // And it is much smaller than sending everything again.
    expect(bytes.length).toBeLessThan(encodeSnapshot(next, null).length / 2);
  });

  test("an id reused by a different kind of thing is sent as new", () => {
    const base: Snapshot = { tick: 10, lastInputSeq: 0, entities: [person(5, 1000, 1000)] };
    const next: Snapshot = { tick: 12, lastInputSeq: 0, entities: [person(5, 1000, 1000, { kind: "vehicle" })] };
    expect(decodeSnapshot(encodeSnapshot(next, base), () => base)).toEqual(next);
  });

  test("a chain of deltas over a minute stays exact", () => {
    let entities = crowd();
    let kept: Snapshot = { tick: 2, lastInputSeq: 1, entities };
    let seen = decodeSnapshot(encodeSnapshot(kept, null), none);
    for (let step = 2; step <= 600; step++) {
      entities = walkOn(entities, step);
      if (step % 50 === 0) entities = entities.slice(1).concat(person(5000 + step, 210_000, 160_000));
      const next: Snapshot = { tick: step * 2, lastInputSeq: step, entities: [...entities].sort((a, b) => a.id - b.id) };
      const base = seen;
      seen = decodeSnapshot(encodeSnapshot(next, kept), (tick) => (tick === base.tick ? base : undefined));
      expect(seen).toEqual(next);
      kept = next;
    }
  });
});

describe("sizes (Task 0.4: an on-foot snapshot for 30 visible avatars under 600 bytes)", () => {
  test("thirty avatars sent whole: under 600 bytes", () => {
    const bytes = encodeSnapshot({ tick: 1_000_000, lastInputSeq: 500_000, entities: crowd() }, null);
    expect(bytes.length).toBeLessThan(600);
  });

  test("thirty avatars all walking, as a delta: under 300 bytes", () => {
    const before: Snapshot = { tick: 1_000_000, lastInputSeq: 500_000, entities: crowd() };
    const after: Snapshot = { tick: 1_000_002, lastInputSeq: 500_001, entities: walkOn(before.entities, 1) };
    const bytes = encodeSnapshot(after, before);
    expect(bytes.length).toBeLessThan(300);
    // At ten snapshots a second that is under 3 KB/s with everyone moving at once.
    expect(bytes.length * 10).toBeLessThan(3000);
  });

  test("thirty avatars standing still cost a header and nothing more", () => {
    const before: Snapshot = { tick: 1_000_000, lastInputSeq: 500_000, entities: crowd() };
    const after: Snapshot = { ...before, tick: 1_000_002 };
    expect(encodeSnapshot(after, before).length).toBeLessThanOrEqual(10);
  });
});

describe("a client never trusts a snapshot", () => {
  const base: Snapshot = { tick: 100, lastInputSeq: 0, entities: [person(1, 1000, 1000)] };

  test("a delta against a snapshot it no longer has asks for a whole one", () => {
    const next: Snapshot = { tick: 102, lastInputSeq: 0, entities: [person(1, 1100, 1000)] };
    const error = (() => {
      try {
        decodeSnapshot(encodeSnapshot(next, base), none);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ProtocolError);
    expect((error as ProtocolError).code).toBe("missing_baseline");
  });

  test("malformed snapshots fail as a ProtocolError", () => {
    const header = () => new Writer().u8(MSG.SNAPSHOT).uint(5).uint(0).uint(0);
    const cases = [
      new Uint8Array([MSG.EVENT, 0, 0, 0]),
      header().uint(600).finish(),
      header().uint(0).uint(600).finish(),
      // A change to an entity that is not there.
      header().uint(0).uint(1).uint(77).u8(2).int(5).int(5).finish(),
      // A kind that does not exist.
      header().uint(0).uint(1).uint(77).u8(1).u8(9).finish(),
    ];
    for (const bytes of cases) expect(() => decodeSnapshot(bytes, none)).toThrow(ProtocolError);
    const good = encodeSnapshot({ tick: 5, lastInputSeq: 1, entities: crowd() }, null);
    for (let cut = 0; cut < good.length; cut += 3) expect(() => decodeSnapshot(good.subarray(0, cut), none)).toThrow(ProtocolError);
  });
});

describe("area of interest", () => {
  const all = [
    person(1, 0, 0),
    person(2, 10_000, 0),
    person(3, 0, 59_000),
    person(4, 61_000, 0),
    person(5, -20_000, -20_000),
    person(6, 0, 10_000),
    person(7, 500_000, 500_000),
  ];

  test("everything within the radius, the viewer included, in order of id", () => {
    expect(selectVisible(all, 1, 60_000, 30).map((e) => e.id)).toEqual([1, 2, 3, 5, 6]);
  });

  test("over the limit, the nearest are kept, and ties go to the lower id", () => {
    expect(selectVisible(all, 1, 60_000, 3).map((e) => e.id)).toEqual([1, 2, 6]);
    expect(selectVisible(all, 1, 60_000, 2).map((e) => e.id)).toEqual([1, 2]);
    expect(selectVisible(all, 1, 60_000, 1).map((e) => e.id)).toEqual([1]);
  });

  test("it is centred on the viewer, whoever they are", () => {
    expect(selectVisible(all, 7, 60_000, 30).map((e) => e.id)).toEqual([7]);
    expect(selectVisible(all, 4, 60_000, 30).map((e) => e.id)).toEqual([2, 4]);
  });

  test("a viewer who is not in the world sees nothing", () => {
    expect(selectVisible(all, 99, 60_000, 30)).toEqual([]);
  });
});
