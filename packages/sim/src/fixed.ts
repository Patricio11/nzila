// Integer maths for the simulation.
//
// Every value the simulation keeps is an integer: positions in millimetres,
// angles in centidegrees, speeds in millimetres per second, time in
// milliseconds. Integers below 2^53 add, multiply and divide to the same
// result in every JavaScript engine, which is what lets the phone predict what
// the zone server will decide. Trigonometry comes from the tables below, never
// from Math.sin and friends, whose last bits differ between engines.

/** Fixed-point scale of sinCdeg and cosCdeg: 65536 means 1.0. */
export const TRIG_ONE = 65536;

/** A full turn in centidegrees. */
export const FULL_TURN = 36000;

// sin(d degrees) * 65536 for d = 0..90.
const SIN_TABLE: readonly number[] = [
  0, 1144, 2287, 3430, 4572, 5712, 6850, 7987, 9121, 10252, 11380, 12505, 13626, 14742, 15855, 16962,
  18064, 19161, 20252, 21336, 22415, 23486, 24550, 25607, 26656, 27697, 28729, 29753, 30767, 31772,
  32768, 33754, 34729, 35693, 36647, 37590, 38521, 39441, 40348, 41243, 42126, 42995, 43852, 44695,
  45525, 46341, 47143, 47930, 48703, 49461, 50203, 50931, 51643, 52339, 53020, 53684, 54332, 54963,
  55578, 56175, 56756, 57319, 57865, 58393, 58903, 59396, 59870, 60326, 60764, 61183, 61584, 61966,
  62328, 62672, 62997, 63303, 63589, 63856, 64104, 64332, 64540, 64729, 64898, 65048, 65177, 65287,
  65376, 65446, 65496, 65526, 65536,
];

// atan(i / 64) in centidegrees for i = 0..64.
const ATAN_TABLE: readonly number[] = [
  0, 90, 179, 268, 358, 447, 536, 624, 713, 800, 888, 975, 1062, 1148, 1234, 1319, 1404, 1488, 1571,
  1653, 1735, 1817, 1897, 1977, 2056, 2134, 2211, 2287, 2363, 2438, 2511, 2584, 2657, 2728, 2798, 2867,
  2936, 3003, 3070, 3136, 3201, 3264, 3327, 3390, 3451, 3511, 3571, 3629, 3687, 3744, 3800, 3855, 3909,
  3963, 4016, 4067, 4119, 4169, 4218, 4267, 4315, 4363, 4409, 4455, 4500,
];

/** Integer division rounding toward zero. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b) + 0; // + 0 turns a negative zero into zero
}

/** Integer division rounding toward minus infinity. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Remainder that is never negative for a positive divisor. */
export function floorMod(a: number, b: number): number {
  return a - Math.floor(a / b) * b;
}

/** Integer division rounding away from zero, so a push is never short. */
export function divAway(a: number, b: number): number {
  const q = a / b;
  return q < 0 ? Math.floor(q) : Math.ceil(q) + 0;
}

/** Integer division of non-negative numbers, rounding to nearest. */
export function divRound(a: number, b: number): number {
  return Math.floor((a + b / 2) / b);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Moves value toward target by at most step. */
export function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(value + step, target);
  return Math.max(value - step, target);
}

/** Floor of the square root of a non-negative integer. */
export function isqrt(n: number): number {
  if (n < 2) return n;
  let x = n;
  let y = idiv(x + 1, 2);
  while (y < x) {
    x = y;
    y = idiv(x + idiv(n, x), 2);
  }
  return x;
}

/** Length of an integer vector, rounded down. */
export function length2(x: number, z: number): number {
  return isqrt(x * x + z * z);
}

/** Brings any angle in centidegrees into 0..35999. */
export function normCdeg(angle: number): number {
  return floorMod(angle, FULL_TURN);
}

function quarterSin(a: number): number {
  const i = idiv(a, 100);
  const f = a - i * 100;
  const lo = SIN_TABLE[i]!;
  if (f === 0) return lo;
  return lo + divRound((SIN_TABLE[i + 1]! - lo) * f, 100);
}

/** Sine of an angle in centidegrees, scaled by TRIG_ONE. */
export function sinCdeg(angle: number): number {
  const a = normCdeg(angle);
  if (a <= 9000) return quarterSin(a);
  if (a <= 18000) return quarterSin(18000 - a);
  if (a <= 27000) return -quarterSin(a - 18000);
  return -quarterSin(FULL_TURN - a);
}

/** Cosine of an angle in centidegrees, scaled by TRIG_ONE. */
export function cosCdeg(angle: number): number {
  return sinCdeg(angle + 9000);
}

/** Multiplies by a TRIG_ONE-scaled factor, rounding to nearest. */
export function mulTrig(value: number, factor: number): number {
  return Math.round((value * factor) / TRIG_ONE) + 0;
}

// atan(r) in centidegrees for r = ratio / 16384 in 0..1.
function atanUnit(ratio: number): number {
  const i = idiv(ratio, 256);
  if (i >= 64) return 4500;
  const f = ratio - i * 256;
  const lo = ATAN_TABLE[i]!;
  return lo + divRound((ATAN_TABLE[i + 1]! - lo) * f, 256);
}

/**
 * The yaw that faces along (dx, dz), in 0..35999.
 * Yaw 0 faces +Z and yaw 9000 faces +X: forward is (sin yaw, cos yaw), the
 * same as a Three.js rotation about Y. A zero vector gives 0.
 */
export function yawFromDir(dx: number, dz: number): number {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (ax === 0 && az === 0) return 0;
  const a = ax <= az ? atanUnit(idiv(ax * 16384, az)) : 9000 - atanUnit(idiv(az * 16384, ax));
  if (dx >= 0) return dz >= 0 ? a : 18000 - a;
  return dz < 0 ? 18000 + a : normCdeg(FULL_TURN - a);
}
