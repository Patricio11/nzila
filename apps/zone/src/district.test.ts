// The zone reads a district from the pack the phones download.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";
import { CELL_WALK, createWalkGrid } from "@nzila/sim";
import { encodeWalkGrid } from "@nzila/world";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadDistrict, roomNameOf } from "./district.ts";

let dir: string;
const pack = (): URL => pathToFileURL(`${dir}/`);
const manifest = async (body: object): Promise<void> => writeFile(join(dir, "manifest.json"), JSON.stringify(body));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "nzila-zone-"));
  // Two chunks side by side, 10 m each of half-metre cells; the second has one cell of wall and stands a metre higher.
  const west = createWalkGrid(500, 0, 0, 20, 20);
  west.flags.fill(CELL_WALK);
  const east = createWalkGrid(500, 20, 0, 20, 20, 1000);
  east.flags.fill(CELL_WALK);
  east.flags[0] = 0;
  await writeFile(join(dir, "west.walkz"), deflateRawSync(encodeWalkGrid(west)));
  await writeFile(join(dir, "east.walkz"), deflateRawSync(encodeWalkGrid(east)));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("a district read from its pack", () => {
  test("the ground is every chunk's walk grid, and the door is the pack's first arrival, in the zone's own units", async () => {
    await manifest({
      id: "ao-lua/l1",
      province: "ao-lua",
      chunks: [{ walkGrid: "west.walkz" }, { walkGrid: "east.walkz" }, {}],
      spawns: [
        { id: "other", pos: [1, 0, 1], facing: 0, kind: "return" },
        { id: "arrival", pos: [2.5, 0.14, 7.49], facing: 270, kind: "first_arrival" },
      ],
    });
    const district = await loadDistrict(pack());
    expect(district).toMatchObject({ id: "ao-lua/l1", provinceId: "ao-lua", arrival: { x: 2500, y: 140, z: 7490, yaw: 27_000 } });
    expect(district.ground.cellMm).toBe(500);
    expect(district.ground.flagsAt(3, 3) & CELL_WALK).toBe(CELL_WALK);
    // The wall in the east chunk, the height of its floor, and nothing at all beyond the pack.
    expect(district.ground.flagsAt(20, 0)).toBe(0);
    expect(district.ground.heightAt(25, 5)).toBe(1000);
    expect(district.ground.flagsAt(99, 99)).toBe(0);
  });

  test("with no arrival named, the first place to stand is the door, facing ahead", async () => {
    await manifest({ id: "ao-lua/l1", province: "ao-lua", chunks: [{ walkGrid: "west.walkz" }], spawns: [{ id: "a", pos: [1, 0, 2], kind: "return" }] });
    expect((await loadDistrict(pack())).arrival).toEqual({ x: 1000, y: 0, z: 2000, yaw: 0 });
  });

  test("a pack nobody could stand in, or arrive in, is refused aloud", async () => {
    await manifest({ id: "ao-lua/l1", province: "ao-lua", chunks: [{}], spawns: [{ id: "a", pos: [1, 0, 2], kind: "return" }] });
    await expect(loadDistrict(pack())).rejects.toThrow(/no walk grid/);
    await manifest({ id: "ao-lua/l1", province: "ao-lua", chunks: [{ walkGrid: "west.walkz" }], spawns: [] });
    await expect(loadDistrict(pack())).rejects.toThrow(/nowhere to arrive/);
  });

  test("a room's name is the district's id made fit for a web address", () => {
    expect(roomNameOf("ao-lua/l1")).toBe("ao-lua.l1");
  });
});
