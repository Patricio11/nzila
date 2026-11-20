// Lavar carros (Task 4.5, D-4.22): the lavadores by the road. A car pulls in dusty, with mud on some of its eight
// parts (the roof and windows above, the doors and the wheels below, front to back); each pass of the sponge over a
// dirty part takes a layer off; clean all over, the car drives off and the next in the queue pulls in. Cars keep
// arriving whether or not the last is done: a slow hand makes a queue.
//
// From a seed, the same on the phone and the zone. The phone sends the time of each pass and which part it went
// over; passes closer together than a hand can make them count once.

import { idiv } from "../fixed.ts";
import { createRng, rngRange } from "../rng.ts";
import { SCORE_MAX } from "./timing.ts";

/** The parts of a car, numbered 0 to 7: the four above (front to back), then the four below. */
export const CARRO_PARTS = 8;

/** A pass of the sponge over a part, at a time from the round's start. */
export interface CarrosInput {
  readonly t: number;
  readonly what: number;
}

/** A car: when it arrives in the queue, and how many layers of dirt each of its parts has. */
export interface Carro {
  readonly arrives: number;
  readonly dirt: readonly number[];
}

/** Passes closer together than this are one: a sponge goes over a part at most about twelve times a second. */
export const PASS_GAP_MS = 80;
/** How long a clean car takes to drive off before the next pulls in, in milliseconds. */
export const DRIVE_OFF_MS = 1200;
/** The most inputs a round may have. */
export const CARROS_INPUTS_MAX = 2000;
/** No car arrives this close to the end of the round. */
const LAST_CAR_MS = 6000;

/**
 * The round's cars: the first at once, then one every 3,5 to 5 s (none in the last six seconds, when no hand could wash
 * it), each with four to six dirty parts of one to four layers.
 */
export function carrosRound(seed: number, lengthMs: number): Carro[] {
  const rng = createRng(seed);
  const cars: Carro[] = [];
  let arrives = 0;
  while (arrives < lengthMs - LAST_CAR_MS) {
    const dirt = new Array<number>(CARRO_PARTS).fill(0);
    const dirty = rngRange(rng, 4, 6);
    for (let n = 0; n < dirty; n++) {
      let part = rngRange(rng, 0, CARRO_PARTS - 1);
      while (dirt[part]! > 0) part = (part + 1) % CARRO_PARTS;
      dirt[part] = rngRange(rng, 1, 4);
    }
    cars.push({ arrives, dirt });
    arrives += rngRange(rng, 3500, 5000);
  }
  return cars;
}

/** The washing place at a moment: which car is in it (if one is), its dirt left, and when it pulled in. */
export interface Lavagem {
  car: number;
  dirt: number[];
  /** When the car in the place pulled in (it may be washed from then). */
  inAt: number;
  washed: number;
  lastPass: number;
}

export function carrosStart(cars: readonly Carro[]): Lavagem {
  return { car: 0, dirt: [...(cars[0]?.dirt ?? [])], inAt: 0, washed: 0, lastPass: -PASS_GAP_MS };
}

/**
 * One pass, at its time. A car pulls into the place when the one before has driven off and it has arrived; a pass
 * before then, or over a clean part, does nothing. When the last layer comes off, the car is washed and drives off.
 */
export function carrosPass(state: Lavagem, cars: readonly Carro[], input: CarrosInput): void {
  const s = state;
  if (input.t - s.lastPass < PASS_GAP_MS) return;
  s.lastPass = input.t;
  const car = cars[s.car];
  if (!car || input.t < Math.max(car.arrives, s.inAt)) return;
  const part = input.what;
  if (part < 0 || part >= CARRO_PARTS || s.dirt[part]! === 0) return;
  s.dirt[part]! -= 1;
  if (s.dirt.every((layers) => layers === 0)) {
    s.washed += 1;
    s.car += 1;
    s.dirt = [...(cars[s.car]?.dirt ?? [])];
    s.inAt = input.t + DRIVE_OFF_MS;
  }
}

export interface CarrosScore {
  /** 0 to 1 000: the cars washed, out of every car of the round. */
  readonly score: number;
  readonly washed: number;
  readonly cars: number;
}

/** Replays the passes. Out of order, after the round's end, or past a hand's count, count for nothing. */
export function scoreCarros(cars: readonly Carro[], inputs: readonly CarrosInput[], lengthMs: number): CarrosScore {
  const state = carrosStart(cars);
  let lastT = 0;
  for (const input of inputs.slice(0, CARROS_INPUTS_MAX)) {
    if (input.t < lastT || input.t > lengthMs) break;
    lastT = input.t;
    carrosPass(state, cars, input);
  }
  return { score: cars.length === 0 ? 0 : Math.min(SCORE_MAX, idiv(state.washed * SCORE_MAX, cars.length)), washed: state.washed, cars: cars.length };
}
