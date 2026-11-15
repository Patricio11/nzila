// The people of the street, as arithmetic. A district's pack gives each of
// them a timetable that repeats (art/scripts/make_l1.py writes it): where
// they are at each moment and what they do there. This file turns a
// timetable and a time into a place, a heading, a pace and a pose, and
// nothing else: no renderer, no randomness, no state. The same clock gives
// every phone the same street.

/** [seconds, x, z, what they do from then on, the way they face when they stand (degrees)] */
export type CrowdKey = readonly [number, number, number, string, number];

export interface CrowdActor {
  /** "any" for someone of the playable people, or a role of the street: zungueira, policia, pescador. */
  readonly role: string;
  /** Which of the people with that role, when there is more than one. */
  readonly who?: number;
  /** Seconds added to the clock, so that two people with the same round are not in step. */
  readonly offset: number;
  /** Height of the feet, when it is not the ground's (someone on a bench). */
  readonly y?: number;
  readonly keys: readonly CrowdKey[];
}

export interface CrowdFile {
  readonly actors: readonly CrowdActor[];
}

export interface ActorMoment {
  readonly x: number;
  readonly z: number;
  /** Radians about the vertical, 0 facing +Z. */
  readonly yaw: number;
  /** Metres a second. */
  readonly speed: number;
  /** Metres travelled since the round began, for the stride. */
  readonly travelled: number;
  /** "", "sit", "fish" or a gesture's name. */
  readonly pose: string;
  /** Seconds into this stretch of the timetable. */
  readonly since: number;
}

/** Where an actor is and what they are doing at a time in seconds. */
export function actorAt(actor: CrowdActor, seconds: number): ActorMoment {
  const keys = actor.keys;
  const last = keys[keys.length - 1]!;
  const period = last[0];
  const t = period > 0 ? (((seconds + actor.offset) % period) + period) % period : 0;
  let travelled = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, x0, z0, pose, face] = keys[i]!;
    const [t1, x1, z1] = keys[i + 1]!;
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (t < t1 || i === keys.length - 2) {
      const span = Math.max(0.001, t1 - t0);
      const part = Math.min(1, Math.max(0, (t - t0) / span));
      const moving = length > 0.01;
      return {
        x: x0 + (x1 - x0) * part,
        z: z0 + (z1 - z0) * part,
        yaw: moving ? Math.atan2(x1 - x0, z1 - z0) : (face * Math.PI) / 180,
        speed: moving ? length / span : 0,
        travelled: travelled + length * part,
        pose: moving ? "" : pose,
        since: t - t0,
      };
    }
    travelled += length;
  }
  const [, x, z, pose, face] = keys[0]!;
  return { x, z, yaw: (face * Math.PI) / 180, speed: 0, travelled: 0, pose, since: 0 };
}
