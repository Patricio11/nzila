import { describe, expect, test } from "vitest";
import { nearestFood, type Arredores } from "./comida.ts";

const world = (player: { x: number; z: number } | null, pois: { glyph?: string; nameKey: string; pos: number[] }[]): Arredores => ({
  player,
  district: () => ({ pois }),
  word: (key) => (key === "cantina-largo" ? "Cantina do Largo" : key === "cantina-tia" ? "Cantina da Tia Rosa" : key),
});

describe("where a hungry player is told to eat (Task 4.4)", () => {
  test("the nearest cantina, by its name, in tens of metres", () => {
    const near = nearestFood(world({ x: 0, z: 0 }, [
      { glyph: "cantina", nameKey: "cantina-largo", pos: [120, 0, 40] },
      { glyph: "banco", nameKey: "caixa", pos: [5, 0, 0] },
      { glyph: "cantina", nameKey: "cantina-tia", pos: [38, 0, 12] },
    ]));
    expect(near).toEqual({ x: 38, z: 12, name: "Cantina da Tia Rosa", metres: 40 });
  });

  test("never closer than ten metres, said", () => {
    expect(nearestFood(world({ x: 0, z: 0 }, [{ glyph: "cantina", nameKey: "cantina-largo", pos: [2, 0, 1] }]))?.metres).toBe(10);
  });

  test("nothing when the district has no cantina, or the player is nowhere yet", () => {
    expect(nearestFood(world({ x: 0, z: 0 }, [{ glyph: "banco", nameKey: "caixa", pos: [5, 0, 0] }]))).toBeNull();
    expect(nearestFood(world(null, [{ glyph: "cantina", nameKey: "cantina-largo", pos: [2, 0, 1] }]))).toBeNull();
    expect(nearestFood({ player: { x: 0, z: 0 }, district: () => null, word: (key) => key })).toBeNull();
  });
});
