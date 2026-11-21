// The gestures a body makes: Acenar, Aplaudir, Chamar, Rir and Dançar. Fetched the first time anybody makes one,
// not carried by every phone from the way in (the megabytes rule, F-270). Each poses the body at `u` seconds into
// the gesture, laid over what it was doing by `e` (0 to 1), and returns how far the hips drop (metres at 1,7 m).
//
// Dançar: kuduro, keyed by hand from stills of two films the founder supplied on 2026-11-15 (a boy dancing in a ring
// of people on a Cazenga street; two dancers in a sala). The longest of the gestures by far, and danced by few at any
// moment: fetched the first time somebody dances, not carried by every phone from the way in (the megabytes rule).

import type { Person } from "./person.ts";

const ease = (u: number): number => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/** Poses a body in the dance at `u` seconds into it, laid over what it was doing by `e` (0 to 1). Returns how far the hips drop, in metres at a height of 1,7. */
export function dancar(person: Person, e: number, u: number): number {
  // Four figures of 2.4 seconds, each melting into the next, at about 150 beats a minute.
  const beat = u * 15.7;
  const half = Math.sin(beat / 2);
  const part = (u % 9.6) / 2.4;
  const weight = (n: number): number => ease(1 - Math.min(Math.abs(part - n - 0.5), 4 - Math.abs(part - n - 0.5)) + 0.5);
  const bounce = weight(0);
  const pump = weight(1);
  const squat = weight(2);
  const lean = weight(3);
  const dip = 0.06 * Math.abs(Math.sin(beat));
  let drop = 9;
  for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
    const mine = Math.max(0, half * side);
    // Knees bent throughout, opening and closing; one foot and then the other comes off the ground.
    const thigh = -(0.42 + dip + 0.32 * mine * (bounce + pump) + 0.7 * squat + 0.16 * lean * mine);
    const shin = 0.84 + 2 * dip + 0.5 * mine * (bounce + pump) + 1.0 * squat + 0.3 * lean * mine;
    const open = side * (0.1 + 0.22 * (0.5 + 0.5 * Math.sin(beat)) * (bounce + pump) + 0.34 * squat + 0.16 * lean) + 0.2 * lean * half;
    person.toward(`thigh${tag}`, e, thigh, 0, open);
    person.toward(`shin${tag}`, e, shin);
    person.toward(`foot${tag}`, e, -(thigh + shin) * 0.9);
    drop = Math.min(drop, 0.4 * (1 - Math.cos(thigh)) + 0.41 * (1 - Math.cos(shin + thigh)));
    // The arms: loose and pumping; then one fist overhead; then both thrown forward; then swung to the side of the lean.
    const loose = 0.55 * half * side;
    person.toward(`upperArm${tag}`, e * (bounce + lean), loose - 0.15 + 0.5 * lean * half * side, 0, side * (0.12 + 0.3 * lean * Math.max(0, half * side)));
    person.toward(`lowerArm${tag}`, e * (bounce + lean), -1.15 - 0.3 * Math.sin(beat));
    person.toward(`upperArm${tag}`, e * squat, -1.25 + 0.12 * Math.sin(beat), 0, side * 0.2);
    person.toward(`lowerArm${tag}`, e * squat, -0.35 - 0.3 * Math.max(0, Math.sin(beat)));
  }
  person.toward("upperArmR", e * pump, -0.25, 0, -2.5 - 0.12 * Math.sin(beat));
  person.toward("lowerArmR", e * pump, -0.55 - 0.45 * Math.max(0, Math.sin(beat)));
  person.toward("upperArmL", e * pump, 0.25, 0, 0.3);
  person.toward("lowerArmL", e * pump, -1.3);
  // The trunk leans in and works against the hips.
  person.toward("hips", e, 0.12 + 0.2 * squat, -0.22 * half * (bounce + pump), 0.1 * half * (bounce + pump) + 0.22 * lean * half);
  person.toward("spine", e, 0.2 + 0.22 * squat + 0.05 * Math.sin(beat), 0.2 * half * (bounce + pump), -0.14 * lean * half);
  person.toward("chest", e, 0.1 + 0.06 * Math.sin(beat + 1), 0.16 * half * bounce, -0.1 * lean * half);
  person.toward("neck", e, -0.2 - 0.2 * squat);
  person.toward("head", e, -0.08 + 0.07 * Math.sin(beat), -0.1 * half * (bounce + lean), 0.08 * lean * half);
  if (person.female) {
    // Her third figure: knees bent, leaning in with a hand on each knee, the back held, and the hips
    // tilting up and down on the beat.
    const work = Math.sin(beat);
    person.toward("hips", e * squat, 0.42 + 0.3 * work, 0, 0.05 * half);
    person.toward("spine", e * squat, 0.2 - 0.27 * work);
    person.toward("chest", e * squat, -0.12 - 0.03 * work);
    person.toward("neck", e * squat, -0.34);
    for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
      // A leg hangs from the hips, so it is turned back by as much as the hips tilt: the knees and the
      // feet stay where they are while the hips move.
      person.toward(`thigh${tag}`, e * squat, -1.0 - (0.42 + 0.3 * work), 0, side * 0.3);
      person.toward(`shin${tag}`, e * squat, 1.35);
      person.toward(`foot${tag}`, e * squat, -0.35);
      // The arms straight down to the knees, and staying there while the hips move.
      person.toward(`upperArm${tag}`, e * squat, -0.72, 0, -side * 0.12);
      person.toward(`lowerArm${tag}`, e * squat, -0.06);
      person.toward(`hand${tag}`, e * squat, 0.35, 0, 0);
    }
    drop += squat * (0.4 * (1 - Math.cos(1.0)) + 0.41 * (1 - Math.cos(0.35)) - drop);
  }
  return drop;
}

/** Rir: thrown back, the shoulders shaking, a hand to the belly. Returns how far the hips drop, as the dance does. */
export function rir(person: Person, e: number, u: number): number {
  const shake = Math.sin(u * 17);
  person.toward("spine", e, -0.1 + 0.025 * shake);
  person.toward("chest", e, -0.12 + 0.035 * shake);
  person.toward("head", e, -0.3 + 0.05 * shake, 0.08 * Math.sin(u * 2.2));
  person.toward("upperArmL", e, -0.35, 0, -0.3);
  person.toward("lowerArmL", e, -1.5, -0.7);
  person.toward("upperArmR", e, 0.1 + 0.04 * shake, 0, 0.26);
  return 0.012 * (1 + shake);
}

/** Acenar: the right arm up and out, the forearm going from side to side. */
export function acenar(person: Person, e: number, u: number): number {
  person.toward("upperArmR", e, -0.1, 0, -2.25);
  person.toward("lowerArmR", e, -0.25, 0, -0.35 + 0.5 * Math.sin(u * 9.5));
  person.toward("handR", e, 0, 0, 0.25 * Math.sin(u * 9.5 + 0.6));
  person.toward("head", e * 0.7, -0.05, -0.12, -0.06);
  person.toward("chest", e * 0.5, 0, -0.06, -0.04);
  return 0;
}

/** Aplaudir: the hands meet in front of the chest and part again. */
export function aplaudir(person: Person, e: number, u: number): number {
  const clap = Math.sin(u * 15);
  for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
    person.toward(`upperArm${tag}`, e, -0.62, 0, -side * 0.3);
    person.toward(`lowerArm${tag}`, e, -1.2, -side * (0.36 + 0.13 * clap));
    person.toward(`hand${tag}`, e, -0.1, -side * 0.2);
  }
  person.toward("head", e * 0.6, -0.06 + 0.02 * clap);
  return 0;
}

/** Chamar: the arm out in front, palm down, the hand folding toward the body again and again. */
export function chamar(person: Person, e: number, u: number): number {
  const beckon = Math.max(0, Math.sin(u * 8));
  person.toward("upperArmR", e, -1.35, 0, -0.1);
  person.toward("lowerArmR", e, -0.25 - 0.75 * beckon);
  person.toward("handR", e, 0.5 - 0.9 * beckon);
  person.toward("head", e * 0.7, 0.06, 0.05);
  person.toward("chest", e * 0.5, 0.05);
  return 0;
}

/** Apertar a mão: the right arm out to the other, and the hand going up and down in theirs. */
export function apertar(person: Person, e: number, u: number): number {
  const shake = Math.sin(u * 11) * Math.min(1, Math.max(0, (u - 0.4) / 0.3));
  person.toward("upperArmR", e, -0.95 + 0.06 * shake, 0, 0.12);
  person.toward("lowerArmR", e, -0.5 + 0.1 * shake);
  person.toward("handR", e, 0.1);
  person.toward("chest", e * 0.7, 0.06, 0.08);
  person.toward("head", e * 0.6, 0.05, 0, 0.03 * shake);
  return 0;
}

/** Abraçar: both arms round the other, the body leaning in, the head to one side; a pat on the back. */
export function abracar(person: Person, e: number, u: number): number {
  const pat = Math.max(0, Math.sin(u * 7)) * Math.min(1, Math.max(0, (u - 1.0) / 0.4));
  for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
    person.toward(`upperArm${tag}`, e, -1.05, 0, -side * 0.34);
    person.toward(`lowerArm${tag}`, e, -0.75 - (side < 0 ? 0.18 * pat : 0), -side * 0.75);
    person.toward(`hand${tag}`, e, 0, -side * 0.3);
  }
  person.toward("spine", e, 0.1);
  person.toward("chest", e, 0.1);
  person.toward("neck", e, 0.04, 0, 0.16);
  person.toward("head", e, 0.02, 0.22, 0.12);
  return 0;
}
