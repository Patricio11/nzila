// What stands in a district that the walk grid does not hold, and that the
// zone and every phone must agree on (D-3.2, D-0.53): the benches. One
// function, read from the manifest by both, so that a player stops at a
// bench in the same place on the phone and in the zone.

import { type Obstacle } from "@nzila/sim";

/** Half a bench, in millimetres: along it, and from front to back. */
export const BENCH_HALF_WIDTH_MM = 850;
export const BENCH_HALF_DEPTH_MM = 270;

export interface SeatPlace {
  /** Metres. */
  readonly pos: readonly [number, number, number];
  /** Degrees clockwise from +Z: the way a sitter faces. */
  readonly facing: number;
}

/** The benches of a district as bodies a person walks round. */
export function seatObstacles(seats: readonly SeatPlace[]): Obstacle[] {
  return seats.map(
    (seat): Obstacle => ({
      kind: "box",
      x: Math.round(seat.pos[0] * 1000),
      z: Math.round(seat.pos[2] * 1000),
      halfWidthMm: BENCH_HALF_WIDTH_MM,
      halfLengthMm: BENCH_HALF_DEPTH_MM,
      yaw: Math.round((((seat.facing % 360) + 360) % 360) * 100),
    }),
  );
}
