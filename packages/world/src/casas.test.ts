import { expect, test } from "vitest";
import { CELL_WALK, type Ground } from "@nzila/sim";
import { cellsOf, homeGround, homeRect, homeToWorld, mayStand, type HomeKind } from "./casas.ts";

// A house of two metres by two, a wall all round, its door in the middle of the wall that looks to +Z and off to
// one side of it, and a cell in front of the door that is the family's whatever the street says.
const kind: HomeKind = {
  id: "quarto",
  model: "quarto.glb",
  cellMm: 500,
  cellX0: -2,
  cellZ0: -2,
  rows: ["####", "#..#", "#..#", "##d#", "--.-"],
  rect: [-0.5, -0.5, 0.5, 0.5],
  height: 2.6,
  floor: 0.1,
  leaf: { hinge: [0, 1], wide: 0.5, high: 2, sill: 0.1 },
  door: [0.25, 1],
  wake: [-0.25, -0.25],
};
// The street: open everywhere but where the house stands (a wall to everyone), at 100 mm.
const street: Ground = { cellMm: 500, flagsAt: (cx, cz) => (cx >= 18 && cx < 22 && cz >= 38 && cz < 43 ? 0 : CELL_WALK), heightAt: () => 100 };

test("a house is open to its family where it is a wall to the street, and the street's everywhere else", () => {
  const site = { pos: [10, 0.2, 20], facing: 0, kind: "quarto" } as const;
  const ground = homeGround(street, site, kind);
  // Inside: walked, at the height of its floor.
  expect(ground.flagsAt(19, 39)).toBe(CELL_WALK);
  expect(ground.heightAt(19, 39)).toBe(300);
  // Its walls: nobody's, though the street were open there.
  expect(ground.flagsAt(18, 38)).toBe(0);
  expect(ground.flagsAt(21, 41)).toBe(0);
  // The doorway, and the cell before it that the street had shut.
  expect(ground.flagsAt(20, 41)).toBe(CELL_WALK);
  expect(ground.flagsAt(20, 42)).toBe(CELL_WALK);
  expect(street.flagsAt(20, 42)).toBe(0);
  // Beside the door, and beyond the house: as the street has it.
  expect(ground.flagsAt(19, 42)).toBe(0);
  expect(ground.flagsAt(30, 30)).toBe(CELL_WALK);
  expect(ground.heightAt(30, 30)).toBe(100);
  expect(homeRect(site, kind)).toEqual([9.5, 19.5, 10.5, 20.5]);
  expect(homeToWorld(site, kind.door)).toEqual([10.25, 21]);
  // The door shut: the doorway is a wall to its own family too, from that step on; the step before it is still theirs.
  let open = false;
  const doored = homeGround(street, site, kind, () => open);
  expect(doored.flagsAt(20, 41)).toBe(0);
  expect(doored.flagsAt(20, 42)).toBe(CELL_WALK);
  expect(doored.flagsAt(19, 39)).toBe(CELL_WALK);
  open = true;
  expect(doored.flagsAt(20, 41)).toBe(CELL_WALK);
  expect(doored.heightAt(20, 41)).toBe(300);
});

test("a house that looks the other way, or is built as its mirror image, has its door where it is drawn", () => {
  const north = { pos: [10, 0, 20], facing: 180, kind: "quarto" } as const;
  expect(homeToWorld(north, kind.door)).toEqual([9.75, 19]);
  const turned = homeGround(street, north, kind);
  // The doorway is on the -Z side now, and on the other hand.
  expect(turned.flagsAt(19, 38)).toBe(CELL_WALK);
  expect(turned.flagsAt(19, 37)).toBe(CELL_WALK);
  expect(turned.flagsAt(20, 38)).toBe(0);
  const mirrored = { pos: [10, 0, 20], facing: 0, kind: "quarto", flip: true } as const;
  expect(homeToWorld(mirrored, kind.door)).toEqual([9.75, 21]);
  expect(homeGround(street, mirrored, kind).flagsAt(19, 41)).toBe(CELL_WALK);
  expect(homeGround(street, mirrored, kind).flagsAt(20, 41)).toBe(0);
  expect(homeRect(north, kind)).toEqual([9.5, 19.5, 10.5, 20.5]);
});

test("a house drawn in other cells than the street's is refused", () => {
  expect(() => homeGround({ ...street, cellMm: 250 }, { pos: [0, 0, 0], facing: 0, kind: "quarto" }, kind)).toThrow(/cells/);
});

test("a thing set down stands on the floor of the house: never in a wall, in the doorway or in another thing; and where it stands nobody walks", () => {
  // The same house, a metre longer: three rows of floor, two cells across.
  const sala: HomeKind = { ...kind, rows: ["####", "#..#", "#..#", "#..#", "##d#", "--.-"], rect: [-0.5, -0.5, 0.5, 1] };
  const stool = { cx: -1, cz: -1, rot: 0, chao: [1, 1] as const };
  const bench = { cx: -1, cz: 0, rot: 0, chao: [1, 2] as const };
  expect(cellsOf(bench)).toEqual([[-1, 0], [-1, 1]]);
  // Turned a quarter it lies across.
  expect(cellsOf({ ...bench, rot: 1 })).toEqual([[-1, 0], [0, 0]]);
  expect(mayStand(sala, [], stool)).toBe(true);
  expect(mayStand(sala, [], bench)).toBe(true);
  // Into the wall, into the doorway, out into the street: refused.
  expect(mayStand(sala, [], { ...stool, cx: -2 })).toBe(false);
  expect(mayStand(sala, [], { ...bench, cz: 1, cx: 0 })).toBe(false);
  expect(mayStand(sala, [], { ...stool, cx: 0, cz: 3 })).toBe(false);
  expect(mayStand(sala, [], { ...stool, cx: 9, cz: 9 })).toBe(false);
  // On another thing, or with a turn that is no turn: refused.
  expect(mayStand(sala, [stool], { ...bench, cz: -1 })).toBe(false);
  expect(mayStand(sala, [stool], bench)).toBe(true);
  expect(mayStand(sala, [], { ...stool, rot: 4 })).toBe(false);
  expect(mayStand(sala, [], { ...stool, rot: 0.5 })).toBe(false);
  // Where it stands, its own family does not walk; beside it, they do.
  const site = { pos: [10, 0.2, 20], facing: 0, kind: "quarto" } as const;
  const under = new Set(cellsOf(stool).map(([x, z]) => `${x},${z}`));
  const ground = homeGround(street, site, sala, () => true, (x, z) => under.has(`${x},${z}`));
  expect(ground.flagsAt(19, 39)).toBe(0);
  expect(ground.flagsAt(20, 39)).toBe(CELL_WALK);
  expect(homeGround(street, site, sala).flagsAt(19, 39)).toBe(CELL_WALK);
});
