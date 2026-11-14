import { describe, expect, test } from "vitest";
import { KEEP_MARGIN, STREAM, chunkModels, distanceToChunk, planStream, wantedModel, type StreamChunk } from "./streaming.ts";

// A row of five chunks, 64 m each, running east.
const row: StreamChunk[] = Array.from({ length: 5 }, (_, i) => ({
  id: `c-0${i}-00`,
  aabb: [i * 64, 0, 0, i * 64 + 64, 20, 64],
  lods: [`c-0${i}-00.l0.glb`, `c-0${i}-00.l1.glb`, `c-0${i}-00.imp.ktx2`],
}));
const ids = (plan: { want: readonly { id: string }[] }) => plan.want.map((w) => w.id);

test("the tiers stream more as they go up, and the lowest never asks for full detail", () => {
  expect(STREAM.poupanca.nearM).toBe(0);
  expect(STREAM.poupanca.farM).toBeLessThan(STREAM.normal.farM);
  expect(STREAM.normal.farM).toBeLessThan(STREAM.alta.farM);
  for (const rule of Object.values(STREAM)) expect(rule.nearM).toBeLessThan(rule.farM);
});

test("distance to a chunk is zero inside it and measured to its edge outside", () => {
  expect(distanceToChunk(row[1]!.aabb, 100, 30)).toBe(0);
  expect(distanceToChunk(row[1]!.aabb, 50, 30)).toBe(14);
  expect(distanceToChunk(row[1]!.aabb, 131, 68)).toBe(5);
});

test("the models of a chunk: full first, reduced last, pictures ignored", () => {
  expect(chunkModels(row[0]!)).toEqual({ full: "c-00-00.l0.glb", reduced: "c-00-00.l1.glb" });
  expect(chunkModels({ id: "x", aabb: [], lods: ["one.glb"] })).toEqual({ full: "one.glb", reduced: "one.glb" });
  expect(chunkModels({ id: "x", aabb: [], lods: ["only.ktx2"] })).toEqual({ full: null, reduced: null });
});

describe("which model at which distance", () => {
  test("Normal: full detail near, reduced farther, nothing in the haze", () => {
    expect(wantedModel(row[0]!, 0, STREAM.normal)).toBe("c-00-00.l0.glb");
    expect(wantedModel(row[0]!, 60, STREAM.normal)).toBe("c-00-00.l0.glb");
    expect(wantedModel(row[0]!, 61, STREAM.normal)).toBe("c-00-00.l1.glb");
    expect(wantedModel(row[0]!, 140, STREAM.normal)).toBe("c-00-00.l1.glb");
    expect(wantedModel(row[0]!, 141, STREAM.normal)).toBeNull();
  });

  test("Poupança: the reduced model even when standing inside the chunk", () => {
    expect(wantedModel(row[0]!, 0, STREAM.poupanca)).toBe("c-00-00.l1.glb");
    expect(wantedModel(row[0]!, 91, STREAM.poupanca)).toBeNull();
  });
});

describe("the plan", () => {
  test("nearest first, each with its model", () => {
    const plan = planStream(row, 100, 30, STREAM.normal);
    expect(plan.want).toEqual([
      { id: "c-01-00", model: "c-01-00.l0.glb", distanceM: 0 },
      { id: "c-02-00", model: "c-02-00.l0.glb", distanceM: 28 },
      { id: "c-00-00", model: "c-00-00.l0.glb", distanceM: 36 },
      { id: "c-03-00", model: "c-03-00.l1.glb", distanceM: 92 },
    ]);
    expect(plan.drop).toEqual([]);
  });

  test("on the reference phone fewer chunks, and never a full model", () => {
    const plan = planStream(row, 100, 30, STREAM.poupanca);
    expect(ids(plan)).toEqual(["c-01-00", "c-02-00", "c-00-00"]);
    expect(plan.want.every((w) => w.model.endsWith(".l1.glb"))).toBe(true);
  });

  test("a chunk left behind is kept a little past the haze, then let go", () => {
    const loaded = new Map([["c-00-00", "c-00-00.l1.glb"]]);
    // 150 m from its edge: beyond Normal's 140, inside the margin.
    const kept = planStream(row, 64 + 150, 30, STREAM.normal, loaded);
    expect(ids(kept)).toContain("c-00-00");
    expect(kept.drop).toEqual([]);
    const far = 64 + STREAM.normal.farM * KEEP_MARGIN + 1;
    const gone = planStream(row, far, 30, STREAM.normal, loaded);
    expect(ids(gone)).not.toContain("c-00-00");
    expect(gone.drop).toEqual(["c-00-00"]);
  });

  test("a chunk that was never loaded is not fetched from inside the margin", () => {
    expect(ids(planStream(row, 64 + 150, 30, STREAM.normal))).not.toContain("c-00-00");
  });

  test("a full model is not swapped for a reduced one the moment the player steps over the line", () => {
    const loaded = new Map([["c-00-00", "c-00-00.l0.glb"]]);
    // 65 m away: past Normal's 60, inside the margin of 72.
    const just = planStream(row, 64 + 65, 30, STREAM.normal, loaded);
    expect(just.want.find((w) => w.id === "c-00-00")!.model).toBe("c-00-00.l0.glb");
    const beyond = planStream(row, 64 + 80, 30, STREAM.normal, loaded);
    expect(beyond.want.find((w) => w.id === "c-00-00")!.model).toBe("c-00-00.l1.glb");
    // And a reduced one is upgraded as soon as the player is near.
    const near = planStream(row, 64 + 10, 30, STREAM.normal, new Map([["c-00-00", "c-00-00.l1.glb"]]));
    expect(near.want.find((w) => w.id === "c-00-00")!.model).toBe("c-00-00.l0.glb");
  });

  test("the same place always gives the same plan, whatever order the chunks come in", () => {
    const a = planStream(row, 160, 30, STREAM.alta);
    const b = planStream([...row].reverse(), 160, 30, STREAM.alta);
    expect(b).toEqual(a);
  });
});
