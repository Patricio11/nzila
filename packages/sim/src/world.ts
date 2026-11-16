// The stepped world: the people and vehicles of one channel, advanced one
// fixed step at a time from the inputs of that step. The zone owns the real
// one. A client keeps a copy to predict with, and replays its own inputs on
// it when the zone's answer arrives.

import { type Obstacle } from "./collision.ts";
import { type Ground } from "./grid.ts";
import { DEFAULT_CHARACTER, NO_MOVE, stepCharacter, type CharacterParams, type CharacterState, type MoveInput } from "./movement.ts";
import { createRng, hashInts, type Rng } from "./rng.ts";
import { NO_DRIVE, VEHICLES, stepVehicle, vehicleObstacle, type DriveInput, type VehicleKind, type VehicleState } from "./vehicle.ts";

/** What does not change from step to step. */
export interface SimMap {
  readonly ground: Ground;
  readonly obstacles: readonly Obstacle[];
}

export interface CharacterEntity {
  readonly id: number;
  readonly state: CharacterState;
}

export interface VehicleEntity {
  readonly id: number;
  readonly kind: VehicleKind;
  readonly state: VehicleState;
}

export interface SimWorld {
  tick: number;
  readonly rng: Rng;
  /** Kept in order of id, so every machine steps them in the same order. */
  readonly characters: CharacterEntity[];
  readonly vehicles: VehicleEntity[];
}

/** The inputs of one step, by entity id. An entity with no input stands still or coasts. */
export interface StepInputs {
  readonly moves?: ReadonlyMap<number, MoveInput>;
  readonly drives?: ReadonlyMap<number, DriveInput>;
}

export function createWorld(seed: number): SimWorld {
  return { tick: 0, rng: createRng(seed), characters: [], vehicles: [] };
}

function insertById<T extends { readonly id: number }>(list: T[], entity: T): void {
  let i = list.length;
  while (i > 0 && list[i - 1]!.id > entity.id) i--;
  if (i > 0 && list[i - 1]!.id === entity.id) throw new Error("an entity with this id is already in the world");
  list.splice(i, 0, entity);
}

export function addCharacter(world: SimWorld, id: number, state: CharacterState): void {
  insertById(world.characters, { id, state });
}

export function addVehicle(world: SimWorld, id: number, kind: VehicleKind, state: VehicleState): void {
  insertById(world.vehicles, { id, kind, state });
}

/** Removes a character or a vehicle. Returns false when the id is not there. */
export function removeEntity(world: SimWorld, id: number): boolean {
  for (const list of [world.characters, world.vehicles]) {
    const i = list.findIndex((entity) => entity.id === id);
    if (i >= 0) {
      list.splice(i, 1);
      return true;
    }
  }
  return false;
}

/** How much of a standing person another person cannot step into: with the walker's own radius, two bodies stay about an arm apart. */
export const PERSON_BODY_MM = 160;

export interface StepRules {
  /**
   * Whether people are solid to each other (D-0.53: "the user cannot overlap another object").
   * The zone says yes. Left out, people pass through each other, as the first worlds did.
   */
  readonly solidPeople?: boolean;
}

/** What one person cannot walk into: what is given, and, when the rules say so, everyone else where they stand now. */
function solidFor(world: SimWorld, person: SimWorld["characters"][number], solid: Obstacle[], rules: StepRules): Obstacle[] {
  return rules.solidPeople
    ? solid.concat(world.characters.filter((other) => other !== person).map((other): Obstacle => ({ kind: "circle", x: other.state.x, z: other.state.z, radiusMm: PERSON_BODY_MM })))
    : solid;
}

/**
 * One more step for one person, and for nobody else: the world's clock does not move. A zone uses it to
 * walk a frame of someone's stick that arrived late, so that what it has walked is always exactly the
 * frames it was sent, in order. Does nothing for an id that is nobody's.
 */
export function stepPerson(world: SimWorld, map: SimMap, id: number, move: MoveInput, character: CharacterParams = DEFAULT_CHARACTER, rules: StepRules = {}): void {
  const person = world.characters.find((one) => one.id === id);
  if (!person) return;
  const solid = map.obstacles.concat(world.vehicles.map((vehicle) => vehicleObstacle(vehicle.state, VEHICLES[vehicle.kind])));
  stepCharacter(person.state, move, map.ground, solidFor(world, person, solid, rules), character);
}

/**
 * Advances the world by one step. Vehicles move first, each against the map
 * and the other vehicles; then people move against the map and the vehicles,
 * and, when the rules say so, against each other: in order of id, each
 * against where the others stand at that moment, so that every machine
 * agrees who gave way.
 */
export function stepWorld(
  world: SimWorld,
  map: SimMap,
  inputs: StepInputs = {},
  character: CharacterParams = DEFAULT_CHARACTER,
  rules: StepRules = {},
): void {
  world.tick++;
  const bodies = world.vehicles.map((vehicle) => vehicleObstacle(vehicle.state, VEHICLES[vehicle.kind]));
  for (let i = 0; i < world.vehicles.length; i++) {
    const vehicle = world.vehicles[i]!;
    const others = map.obstacles.concat(bodies.filter((_, k) => k !== i));
    stepVehicle(vehicle.state, inputs.drives?.get(vehicle.id) ?? NO_DRIVE, map.ground, others, VEHICLES[vehicle.kind]);
    bodies[i] = vehicleObstacle(vehicle.state, VEHICLES[vehicle.kind]);
  }
  const solid = map.obstacles.concat(bodies);
  for (const person of world.characters) {
    stepCharacter(person.state, inputs.moves?.get(person.id) ?? NO_MOVE, map.ground, solidFor(world, person, solid, rules), character);
  }
}

/** A deep copy, for prediction and rollback. */
export function cloneWorld(world: SimWorld): SimWorld {
  return {
    tick: world.tick,
    rng: { s: world.rng.s },
    characters: world.characters.map((c) => ({ id: c.id, state: { ...c.state } })),
    vehicles: world.vehicles.map((v) => ({ id: v.id, kind: v.kind, state: { ...v.state } })),
  };
}

/** One number for the whole state. Two machines that agree on it agree on the world. */
export function hashWorld(world: SimWorld): number {
  const values: number[] = [world.tick, world.rng.s];
  for (const c of world.characters) {
    values.push(c.id, c.state.x, c.state.y, c.state.z, c.state.yaw);
    // In the air there is more to a body than where it is. On the ground nothing is added, so the hash of a world nobody jumps in is what it always was.
    if (c.state.air) values.push(c.state.air, c.state.airX ?? 0, c.state.airZ ?? 0);
  }
  for (const v of world.vehicles) values.push(v.id, v.state.x, v.state.y, v.state.z, v.state.yaw, v.state.speed);
  return hashInts(0, values);
}
