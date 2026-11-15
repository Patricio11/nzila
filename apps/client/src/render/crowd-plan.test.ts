import { describe, expect, test } from "vitest";
import { actorAt, type CrowdActor } from "./crowd-plan.ts";

// Stands 10 s facing north, walks 20 m east in 10 s, stands 5 s fishing, walks back.
const actor: CrowdActor = {
  role: "any",
  offset: 0,
  keys: [
    [0, 0, 0, "", 180],
    [10, 0, 0, "", 90],
    [20, 20, 0, "fish", 180],
    [25, 20, 0, "", 270],
    [35, 0, 0, "", 180],
  ],
};

describe("a timetable", () => {
  test("standing: the place, the facing given, no pace", () => {
    expect(actorAt(actor, 4)).toMatchObject({ x: 0, z: 0, speed: 0, pose: "", travelled: 0 });
    expect(actorAt(actor, 4).yaw).toBeCloseTo(Math.PI);
  });

  test("walking: between the two places, facing where it goes, at the pace the distance and the time give", () => {
    const moment = actorAt(actor, 15);
    expect(moment).toMatchObject({ x: 10, z: 0, speed: 2, pose: "", travelled: 10 });
    expect(moment.yaw).toBeCloseTo(Math.PI / 2);
  });

  test("a pose is held where they stand, with the seconds since it began", () => {
    expect(actorAt(actor, 22)).toMatchObject({ x: 20, pose: "fish", since: 2, travelled: 20 });
  });

  test("the round repeats, an offset moves it, and time before the beginning is the same round", () => {
    expect(actorAt(actor, 35 + 15)).toEqual(actorAt(actor, 15));
    expect(actorAt({ ...actor, offset: 11 }, 4)).toEqual(actorAt(actor, 15));
    expect(actorAt(actor, 15 - 35 * 3)).toEqual(actorAt(actor, 15));
    expect(actorAt(actor, 30).travelled).toBe(30);
  });

  test("a key may say how high the road is, and the height is walked between two of them", () => {
    const climbing: CrowdActor = { role: "", offset: 0, keys: [[0, 0, 0, "", 0, 6], [10, 0, 40, "", 0, 0], [20, 0, 0, "", 0, 6]] };
    expect(actorAt(climbing, 5).y).toBe(3);
    expect(actorAt(climbing, 0).y).toBe(6);
    expect(actorAt(actor, 15).y).toBe(0);
  });

  test("a timetable of one place is that place for ever", () => {
    const seated: CrowdActor = { role: "any", offset: 0, y: 0.3, keys: [[0, 5, 6, "sit", 90], [600, 5, 6, "sit", 90]] };
    expect(actorAt(seated, 12345)).toMatchObject({ x: 5, z: 6, pose: "sit", speed: 0 });
    expect(actorAt({ role: "any", offset: 0, keys: [[0, 1, 2, "sit", 0]] }, 9)).toMatchObject({ x: 1, z: 2, pose: "sit" });
  });
});
