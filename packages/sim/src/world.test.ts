import { describe, expect, test } from "vitest";
import { CELL_DRIVE, CELL_WALK, createWalkGrid, fillCells, gridGround } from "./grid.ts";
import { type MoveInput } from "./movement.ts";
import { type DriveInput } from "./vehicle.ts";
import { addCharacter, addVehicle, cloneWorld, createWorld, hashWorld, removeEntity, stepWorld, type SimMap } from "./world.ts";

const grid = createWalkGrid(500, 0, 0, 120, 120);
fillCells(grid, 0, 0, 119, 119, CELL_WALK | CELL_DRIVE, 0);
const map: SimMap = { ground: gridGround(grid), obstacles: [{ kind: "circle", x: 30_000, z: 30_000, radiusMm: 500 }] };

const person = (x: number, z: number) => ({ x, y: 0, z, yaw: 0 });
const van = (x: number, z: number, yaw = 0) => ({ x, y: 0, z, yaw, speed: 0 });

describe("who is in the world", () => {
  test("entities are kept in order of id whatever order they arrive in", () => {
    const world = createWorld(1);
    addCharacter(world, 30, person(1000, 1000));
    addCharacter(world, 10, person(2000, 1000));
    addCharacter(world, 20, person(3000, 1000));
    addVehicle(world, 7, "car", van(10_000, 10_000));
    addVehicle(world, 3, "van", van(20_000, 10_000));
    expect(world.characters.map((c) => c.id)).toEqual([10, 20, 30]);
    expect(world.vehicles.map((v) => v.id)).toEqual([3, 7]);
  });

  test("an id cannot be used twice", () => {
    const world = createWorld(1);
    addCharacter(world, 1, person(1000, 1000));
    expect(() => addCharacter(world, 1, person(2000, 2000))).toThrow();
  });

  test("entities can leave", () => {
    const world = createWorld(1);
    addCharacter(world, 1, person(1000, 1000));
    addVehicle(world, 2, "car", van(10_000, 10_000));
    expect(removeEntity(world, 2)).toBe(true);
    expect(removeEntity(world, 1)).toBe(true);
    expect(removeEntity(world, 1)).toBe(false);
    expect(world.characters.length + world.vehicles.length).toBe(0);
  });
});

describe("a step", () => {
  test("counts the tick and moves only those with input", () => {
    const world = createWorld(1);
    addCharacter(world, 1, person(5000, 5000));
    addCharacter(world, 2, person(8000, 5000));
    addVehicle(world, 3, "car", van(20_000, 20_000));
    stepWorld(world, map, { moves: new Map([[1, { dx: 0, dz: 127, run: false }]]) });
    expect(world.tick).toBe(1);
    expect(world.characters[0]!.state.z).toBe(5075);
    expect(world.characters[1]!.state).toEqual(person(8000, 5000));
    expect(world.vehicles[0]!.state).toEqual(van(20_000, 20_000));
    stepWorld(world, map);
    expect(world.tick).toBe(2);
  });

  test("a person cannot walk through a parked van, and walks round the map's obstacles", () => {
    const world = createWorld(1);
    addVehicle(world, 1, "van", van(10_000, 10_000, 9000));
    addCharacter(world, 2, person(10_000, 6000));
    addCharacter(world, 3, person(30_050, 27_000));
    const moves = new Map<number, MoveInput>([
      [2, { dx: 0, dz: 127, run: false }],
      [3, { dx: 0, dz: 127, run: false }],
    ]);
    for (let i = 0; i < 100; i++) stepWorld(world, map, { moves });
    expect(world.characters[0]!.state.z).toBeLessThan(10_000 - 950);
    expect(world.characters[1]!.state.z).toBeGreaterThan(31_000);
  });

  test("two vehicles do not drive through each other", () => {
    const world = createWorld(1);
    addVehicle(world, 1, "car", van(10_000, 10_000));
    addVehicle(world, 2, "car", van(10_000, 30_000, 18000));
    const gas: DriveInput = { throttle: 127, steer: 0, brake: false };
    const drives = new Map([[1, gas], [2, gas]]);
    for (let i = 0; i < 120; i++) stepWorld(world, map, { drives });
    const [a, b] = world.vehicles;
    expect(b!.state.z - a!.state.z).toBeGreaterThanOrEqual(2 * 2100);
  });

  test("people do not block each other", () => {
    const world = createWorld(1);
    addCharacter(world, 1, person(5000, 5000));
    addCharacter(world, 2, person(5000, 6000));
    const moves = new Map([[1, { dx: 0, dz: 127, run: false }]]);
    for (let i = 0; i < 40; i++) stepWorld(world, map, { moves });
    expect(world.characters[0]!.state.z).toBe(8000);
  });
});

describe("copies and hashes", () => {
  function busyWorld() {
    const world = createWorld(99);
    addCharacter(world, 1, person(5000, 5000));
    addVehicle(world, 2, "motorizada", van(20_000, 20_000));
    return world;
  }
  const inputs = {
    moves: new Map<number, MoveInput>([[1, { dx: 90, dz: 60, run: true }]]),
    drives: new Map<number, DriveInput>([[2, { throttle: 127, steer: 40, brake: false }]]),
  };

  test("a clone is equal and independent", () => {
    const world = busyWorld();
    const copy = cloneWorld(world);
    expect(copy).toEqual(world);
    expect(hashWorld(copy)).toBe(hashWorld(world));
    stepWorld(world, map, inputs);
    expect(hashWorld(copy)).not.toBe(hashWorld(world));
    expect(copy.tick).toBe(0);
    expect(copy.characters[0]!.state.x).toBe(5000);
  });

  test("replaying the same inputs on a clone reaches the same state: prediction can be rolled back", () => {
    const world = busyWorld();
    for (let i = 0; i < 10; i++) stepWorld(world, map, inputs);
    const checkpoint = cloneWorld(world);
    for (let i = 0; i < 30; i++) stepWorld(world, map, inputs);
    for (let i = 0; i < 30; i++) stepWorld(checkpoint, map, inputs);
    expect(hashWorld(checkpoint)).toBe(hashWorld(world));
    expect(checkpoint).toEqual(world);
  });
});
