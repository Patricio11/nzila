// Roads for a ride that was asked for (Task 6.2, D-6.5): a moto-táxi, a kupapata or a táxi comes along the road to
// whoever called it and takes them along the road to where they asked. The road is the walk grid's road cells ("=",
// CELL_DRIVE); the way is the shortest along them, worked out on a grid of whole metres, and then straightened into as
// few legs as stay on the road. Pure: the zone plans with it, and a test can draw a town to plan in.

import { CELL_DRIVE, CELL_WALK, type Ground } from "@nzila/sim";

/** A point on the ground, in millimetres. */
export interface Ponto {
  readonly x: number;
  readonly z: number;
}

/** The planning grid's step, in millimetres: a road cell is looked at every metre. */
export const ROAD_STEP_MM = 1000;
/** The most road cells a plan looks at: a district's roads are far fewer; more is a fault, not a town. */
const MOST_CELLS = 400_000;

/** A metre's cell as one number: both shifted past zero first, so that a district on either side of the origin keys the same. */
const SHIFT = 524_288;
const key = (cx: number, cz: number): number => (cx + SHIFT) * 1_048_576 + (cz + SHIFT);
const cxOf = (k: number): number => Math.floor(k / 1_048_576) - SHIFT;
const czOf = (k: number): number => (k % 1_048_576) - SHIFT;
const cellOf = (mm: number): number => Math.floor(mm / ROAD_STEP_MM);
const centre = (cell: number): number => cell * ROAD_STEP_MM + ROAD_STEP_MM / 2;

/** The walk grid's flags at the middle of the metre at (cx, cz). */
const flagsOf = (ground: Ground, cx: number, cz: number): number => ground.flagsAt(Math.floor(centre(cx) / ground.cellMm), Math.floor(centre(cz) / ground.cellMm));

/** Whether the metre at (cx, cz) is road: the walk grid's cell at its middle is CELL_DRIVE. */
function road(ground: Ground, cx: number, cz: number): boolean {
  return (flagsOf(ground, cx, cz) & CELL_DRIVE) !== 0;
}

/** Whether the metre at (cx, cz) is pavement: walked on, never driven. */
function pavement(ground: Ground, cx: number, cz: number): boolean {
  return (flagsOf(ground, cx, cz) & (CELL_WALK | CELL_DRIVE)) === CELL_WALK;
}

/** The road nearest a point, within `reachMm`, by the middle of its metre; null when there is none so near. */
export function nearestRoad(ground: Ground, from: Ponto, reachMm = 20_000): Ponto | null {
  return nearestWhere(ground, from, reachMm, road);
}

/** The pavement nearest a point, within `reachMm`: where someone set down off a ride stands, out of the road. */
export function nearestPavement(ground: Ground, from: Ponto, reachMm = 10_000): Ponto | null {
  return nearestWhere(ground, from, reachMm, pavement);
}

function nearestWhere(ground: Ground, from: Ponto, reachMm: number, wanted: (ground: Ground, cx: number, cz: number) => boolean): Ponto | null {
  const cx = cellOf(from.x);
  const cz = cellOf(from.z);
  const most = Math.ceil(reachMm / ROAD_STEP_MM);
  let best: Ponto | null = null;
  let bestMm = Infinity;
  for (let ring = 0; ring <= most; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring || !wanted(ground, cx + dx, cz + dz)) continue;
        const at = { x: centre(cx + dx), z: centre(cz + dz) };
        const mm = Math.hypot(at.x - from.x, at.z - from.z);
        if (mm < bestMm && mm <= reachMm) {
          best = at;
          bestMm = mm;
        }
      }
    }
    // Nothing nearer can be found once the rings are farther out than the best already found.
    if (best && (ring + 1) * ROAD_STEP_MM > bestMm + ROAD_STEP_MM) break;
  }
  return best;
}

/** How far along the road every road metre is from a point, and which way to go from each to get there. */
export interface Campo {
  /** Distance in millimetres, by metre. */
  readonly far: ReadonlyMap<number, number>;
  readonly next: ReadonlyMap<number, number>;
  readonly to: Ponto;
}

const STEPS = [
  [1, 0, 1000],
  [-1, 0, 1000],
  [0, 1, 1000],
  [0, -1, 1000],
  [1, 1, 1414],
  [1, -1, 1414],
  [-1, 1, 1414],
  [-1, -1, 1414],
] as const;

/** The road's distances to `to` (a road point), by the shortest way along it: a little heap, eight ways from each metre. */
export function roadField(ground: Ground, to: Ponto): Campo {
  const far = new Map<number, number>();
  const next = new Map<number, number>();
  const start = key(cellOf(to.x), cellOf(to.z));
  far.set(start, 0);
  const heap: [number, number, number][] = [[0, cellOf(to.x), cellOf(to.z)]];
  const push = (item: [number, number, number]): void => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const up = (i - 1) >> 1;
      if (heap[up]![0] <= heap[i]![0]) break;
      [heap[up], heap[i]] = [heap[i]!, heap[up]!];
      i = up;
    }
  };
  const pop = (): [number, number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const a = 2 * i + 1;
        const b = a + 1;
        let low = i;
        if (a < heap.length && heap[a]![0] < heap[low]![0]) low = a;
        if (b < heap.length && heap[b]![0] < heap[low]![0]) low = b;
        if (low === i) break;
        [heap[low], heap[i]] = [heap[i]!, heap[low]!];
        i = low;
      }
    }
    return top;
  };
  while (heap.length > 0 && far.size < MOST_CELLS) {
    const [mm, cx, cz] = pop();
    if (mm > far.get(key(cx, cz))!) continue;
    for (const [dx, dz, cost] of STEPS) {
      const nx = cx + dx;
      const nz = cz + dz;
      // A diagonal step is taken only between two road metres: no corner of a pavement is cut.
      if (!road(ground, nx, nz) || (dx !== 0 && dz !== 0 && (!road(ground, cx + dx, cz) || !road(ground, cx, cz + dz)))) continue;
      const k = key(nx, nz);
      const there = mm + cost;
      if (there < (far.get(k) ?? Infinity)) {
        far.set(k, there);
        next.set(k, key(cx, cz));
        push([there, nx, nz]);
      }
    }
  }
  return { far, next, to };
}

/** Whether a straight line between two road points stays on the road, metre by metre. */
function straight(ground: Ground, a: Ponto, b: Ponto): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (ROAD_STEP_MM / 2));
  for (let n = 0; n <= steps; n++) {
    const t = steps === 0 ? 0 : n / steps;
    if (!road(ground, cellOf(a.x + (b.x - a.x) * t), cellOf(a.z + (b.z - a.z) * t))) return false;
  }
  return true;
}

/**
 * The way along the road from `from` (a road point) to the field's point, straightened: each leg as long as it can be
 * and still on the road. Null when the road does not join them.
 */
export function roadPath(ground: Ground, field: Campo, from: Ponto): Ponto[] | null {
  let at = key(cellOf(from.x), cellOf(from.z));
  if (!field.far.has(at)) return null;
  const cells: Ponto[] = [];
  for (let guard = 0; guard < MOST_CELLS; guard++) {
    cells.push({ x: centre(cxOf(at)), z: centre(czOf(at)) });
    const step = field.next.get(at);
    if (step === undefined) break;
    at = step;
  }
  const path: Ponto[] = [cells[0]!];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !straight(ground, cells[i]!, cells[j]!)) j--;
    path.push(cells[j]!);
    i = j;
  }
  return path;
}

/** A road point about `wantMm` along the road from the field's point (as near as the road allows): where a ride sets out from. */
export function roadAround(field: Campo, wantMm: number): Ponto {
  let best = key(cellOf(field.to.x), cellOf(field.to.z));
  let bestOff = Infinity;
  for (const [k, mm] of field.far) {
    const off = Math.abs(mm - wantMm);
    if (off < bestOff || (off === bestOff && k < best)) {
      best = k;
      bestOff = off;
    }
  }
  return { x: centre(cxOf(best)), z: centre(czOf(best)) };
}

/** A path's length, in millimetres. */
export function pathLength(path: readonly Ponto[]): number {
  let mm = 0;
  for (let i = 1; i < path.length; i++) mm += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  return mm;
}

/** Where along a path one is after going `mm` of it, and which way one faces (radians, 0 along +Z, as the world's yaw). */
export function alongPath(path: readonly Ponto[], mm: number): { readonly x: number; readonly z: number; readonly heading: number } {
  let left = Math.max(0, mm);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const leg = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    if (left <= leg || i === path.length - 1) {
      const t = leg === 0 ? 1 : Math.min(1, left / leg);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading };
    }
    left -= leg;
  }
  return { x: path[0]?.x ?? 0, z: path[0]?.z ?? 0, heading: 0 };
}
