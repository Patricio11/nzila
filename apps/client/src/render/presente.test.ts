import { describe, expect, test } from "vitest";
import { Bone, Group } from "three";
import { type Person } from "./person.ts";
import { CARRY_SECONDS, GIVE_SECONDS, Hand, shapeOf, thingFor } from "./presente.ts";

/** A body that is one hand: what is put in it, and which bones were asked to turn. */
function body(): { person: Person; hand: Bone; turned: string[] } {
  const hand = new Bone();
  const root = new Group();
  root.add(hand);
  const turned: string[] = [];
  return { person: { root, bone: (name: string) => (name === "handR" ? hand : undefined), toward: (name: string) => void turned.push(name) } as unknown as Person, hand, turned };
}

describe("a thing in the hand (F-264)", () => {
  test("held out for a moment by whoever gives it, arm forward, then gone", () => {
    const { person, hand, turned } = body();
    const giving = new Hand();
    expect(giving.update(10)).toBeUndefined();
    giving.dar("flores");
    expect(giving.item).toBe("flores");
    const held = giving.update(10)!;
    expect(held.kind).toBe("dar");
    held.arms(person);
    held.after(person);
    expect(turned).toContain("upperArmR");
    expect(hand.children).toHaveLength(1);
    // The same holding from frame to frame, and the thing put in the hand once.
    expect(giving.update(10 + GIVE_SECONDS - 0.1)).toBe(held);
    held.after(person);
    expect(hand.children).toHaveLength(1);
    expect(giving.update(10 + GIVE_SECONDS + 0.1)).toBeUndefined();
    expect([hand.children.length, giving.item]).toEqual([0, null]);
  });

  test("taken a moment after it is held out, carried a while, then put away", () => {
    const { person, hand } = body();
    const taking = new Hand();
    taking.tem("pano");
    // Not yet: the giver is still holding it out.
    expect(taking.update(0)).toBeUndefined();
    const held = taking.update(GIVE_SECONDS)!;
    expect(held.kind).toBe("presente");
    held.after(person);
    expect(hand.children).toHaveLength(1);
    expect(taking.update(GIVE_SECONDS * 0.75 + CARRY_SECONDS - 0.1)).toBe(held);
    expect(taking.update(GIVE_SECONDS * 0.75 + CARRY_SECONDS + 0.1)).toBeUndefined();
    expect(hand.children).toHaveLength(0);
  });

  test("a second thing given takes the place of the first", () => {
    const { person, hand } = body();
    const taking = new Hand();
    taking.dar("flores");
    taking.update(0)!.after(person);
    taking.dar("perfume");
    expect(hand.children).toHaveLength(0);
    taking.update(5)!.after(person);
    expect([hand.children.length, taking.item]).toEqual([1, "perfume"]);
  });

  test("the things that have a shape of their own, and a parcel for the rest; each small enough to be nothing on a phone", () => {
    expect(["flores", "perfume", "pano", "gelado", "chocolate"].map(shapeOf)).toEqual(["flores", "perfume", "pano", "gelado", "chocolate"]);
    expect(shapeOf("arroz")).toBe("embrulho");
    for (const item of ["flores", "perfume", "pano", "gelado", "chocolate", "arroz"]) {
      const mesh = thingFor(item) as unknown as { geometry: { getAttribute(name: string): { count: number } } };
      const triangles = mesh.geometry.getAttribute("position").count / 3;
      expect(triangles, item).toBeGreaterThan(10);
      expect(triangles, item).toBeLessThan(400);
      // Painted, every corner.
      expect(mesh.geometry.getAttribute("color").count).toBe(mesh.geometry.getAttribute("position").count);
    }
    // One shape is made once, and shared.
    expect((thingFor("flores") as unknown as { geometry: object }).geometry).toBe((thingFor("flores") as unknown as { geometry: object }).geometry);
  });
});
