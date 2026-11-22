// The family's house (Phase 5, D-5.8). A bairro's pack says where each house stands (`homes`); the pack of homes
// (`casas`) says what a kind of house is inside: its rooms as a model, and where its family may walk. A house is a
// wall to the street: the street's walk grid has it shut. For its family, and for nobody else, the house's own
// ground is laid over the street's, and they walk in at the door.
//
// The zone and the phone both lay it with this, so that what the phone works out is what the zone decides.

import { CELL_WALK, type Ground } from "@nzila/sim";

/**
 * A kind of home, the same wherever it stands. Local: metres from the middle of the house, its door looking to +Z.
 */
export interface HomeKind {
  readonly id: string;
  /** Its inside, as a model in the pack of homes. */
  readonly model: string;
  readonly cellMm: number;
  /** The first cell of `rows`, counted from the middle of the house. */
  readonly cellX0: number;
  readonly cellZ0: number;
  /**
   * One string a row along Z, one character a cell along X: "." the family walks here, "#" nobody does, "-" as the
   * street has it, "d" the doorway: the family's while the door stands open, a wall while it is shut.
   */
  readonly rows: readonly string[];
  /** Being inside: [minX, minZ, maxX, maxZ]. */
  readonly rect: readonly [number, number, number, number];
  /** The height of its walls, and of its floor above the ground the house stands on. */
  readonly height: number;
  readonly floor: number;
  /** The middle of its doorway, on the outside face of the wall. */
  readonly door: readonly [number, number];
  /** Where its family wakes. */
  readonly wake: readonly [number, number];
  /** The esteira the house came with, when it has one, lain on as a bed is: its middle, and the quarters it is turned (0: one lies along Z, head to -Z). */
  readonly esteira?: readonly [number, number, number?];
  /** The door hung in the doorway: where its hinge is, the leaf's size, and how high the step it stands on. */
  readonly leaf: { readonly hinge: readonly [number, number]; readonly wide: number; readonly high: number; readonly sill: number };
}

/** A house where it stands in a bairro. */
export interface HomeSite {
  /** The middle of the house: x, the height of its floor, z. Metres. */
  readonly pos: readonly [number, number, number];
  /** The way its door looks: 0 to +Z, 180 to -Z. */
  readonly facing: number;
  readonly kind: string;
  /** Built as its own mirror image, left for right. */
  readonly flip?: boolean | undefined;
}

/** A place of the house, in the bairro: metres. */
export function homeToWorld(site: HomeSite, local: readonly [number, number]): [number, number] {
  const turn = site.facing === 180 ? -1 : 1;
  return [site.pos[0] + turn * (site.flip ? -1 : 1) * local[0], site.pos[2] + turn * local[1]];
}

/** Being inside this house, in the bairro: [minX, minZ, maxX, maxZ], metres. */
export function homeRect(site: HomeSite, kind: HomeKind): [number, number, number, number] {
  const a = homeToWorld(site, [kind.rect[0], kind.rect[1]]);
  const b = homeToWorld(site, [kind.rect[2], kind.rect[3]]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/**
 * The ground as the family of this house walks it: the house's own where the house is, the street's everywhere
 * else. A house stands on the walk grid's lines (the pack's build refuses one that does not). `open`: whether its
 * door stands open now; asked at every step, so that a door shut is a wall from that step on. `taken`: whether a
 * cell of the house's own plan has something set down on it (Task 5.3): nobody walks through their own table.
 */
export function homeGround(street: Ground, site: HomeSite, kind: HomeKind, open: () => boolean = () => true, taken: (cx: number, cz: number) => boolean = () => false): Ground {
  if (kind.cellMm !== street.cellMm) throw new Error(`the home "${kind.id}" is drawn in cells of ${kind.cellMm} mm and the street in ${street.cellMm}`);
  const cell = kind.cellMm / 1000;
  const turn = site.facing === 180 ? -1 : 1;
  const side = turn * (site.flip ? -1 : 1);
  const floorMm = Math.round((site.pos[1] + kind.floor) * 1000);
  /** What the house says of a cell of the bairro: "-" beyond it, "#" where something is set down. */
  const said = (cx: number, cz: number): string => {
    const lx = Math.floor((side * ((cx + 0.5) * cell - site.pos[0])) / cell);
    const lz = Math.floor((turn * ((cz + 0.5) * cell - site.pos[2])) / cell);
    const here = kind.rows[lz - kind.cellZ0]?.[lx - kind.cellX0] ?? "-";
    return here === "." && taken(lx, lz) ? "#" : here;
  };
  return {
    cellMm: street.cellMm,
    flagsAt: (cx, cz) => {
      const here = said(cx, cz);
      return here === "." || (here === "d" && open()) ? CELL_WALK : here === "#" || here === "d" ? 0 : street.flagsAt(cx, cz);
    },
    heightAt: (cx, cz) => (".d".includes(said(cx, cz)) ? floorMm : street.heightAt(cx, cz)),
  };
}

/**
 * A thing set down in a house (Task 5.3): the cell of the house's own plan it begins at (its corner nearest the
 * plan's beginning), how many quarters it is turned, and the floor it stands on before turning, in cells.
 */
export interface SetDown {
  readonly cx: number;
  readonly cz: number;
  readonly rot: number;
  readonly chao: readonly [number, number];
}

/** The cells of the house's plan a thing stands on. Turned a quarter, across and deep change places. */
export function cellsOf(thing: SetDown): [number, number][] {
  const [wide, deep] = thing.rot % 2 === 1 ? [thing.chao[1], thing.chao[0]] : thing.chao;
  const cells: [number, number][] = [];
  for (let z = 0; z < deep; z++) for (let x = 0; x < wide; x++) cells.push([thing.cx + x, thing.cz + z]);
  return cells;
}

/**
 * Whether a thing may stand where it is asked to: every cell of it is floor of the inside that the family walks (not
 * a wall, not the doorway, not the step before the door, not the street's), and none is under another thing; and
 * with it there, every part of the floor can still be walked to from the door (nobody shuts themselves in, or a
 * room off, with a sofa). This is what keeps a thing from sinking into a wall or standing in another: it is the
 * zone's to ask, and the phone asks it first so as not to offer what will be refused.
 */
export function mayStand(kind: HomeKind, others: readonly SetDown[], thing: SetDown): boolean {
  if (!Number.isInteger(thing.rot) || thing.rot < 0 || thing.rot > 3) return false;
  const under = new Set(others.flatMap(cellsOf).map(([x, z]) => `${x},${z}`));
  const cell = kind.cellMm / 1000;
  const inside = (x: number, z: number): boolean => (x + 0.5) * cell > kind.rect[0] && (x + 0.5) * cell < kind.rect[2] && (z + 0.5) * cell > kind.rect[1] && (z + 0.5) * cell < kind.rect[3];
  if (!cellsOf(thing).every(([x, z]) => inside(x, z) && kind.rows[z - kind.cellZ0]?.[x - kind.cellX0] === "." && !under.has(`${x},${z}`))) return false;
  // The floor that is left, walked from the doorway: all of it must be reached.
  for (const [x, z] of cellsOf(thing)) under.add(`${x},${z}`);
  const free = new Set<string>();
  const edge: [number, number][] = [];
  for (const [rz, row] of kind.rows.entries()) {
    for (let rx = 0; rx < row.length; rx++) {
      const [x, z] = [rx + kind.cellX0, rz + kind.cellZ0];
      if (row[rx] === "d") edge.push([x, z]);
      else if (row[rx] === "." && inside(x, z) && !under.has(`${x},${z}`)) free.add(`${x},${z}`);
    }
  }
  while (edge.length > 0) {
    const [x, z] = edge.pop()!;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as const) if (free.delete(`${nx},${nz}`)) edge.push([nx, nz]);
  }
  return free.size === 0;
}

/** A thing set down that holds a body: how many sit on it side by side, or -1 for one that is lain on. */
export interface Holds extends SetDown {
  readonly lugares?: number | undefined;
}

/** A place to sit or lie in a house, in the bairro: metres, the way a sitter faces in degrees clockwise from +Z, and whether one lies there. */
export interface HomeSeat {
  readonly pos: [number, number, number];
  readonly facing: number;
  readonly deita: boolean;
}

/** How high a body sits on a chair or a sofa, and lies on a bed or a mattress, above the floor: metres. */
const SEAT_HIGH_M = 0.46;
const BED_HIGH_M = 0.3;

/**
 * Where one sits or lies in a house, in the order of what is set down (the zone and the phone count them the same
 * way: a seat is named by its number). First the esteira the house came with, when it has one; then each thing that
 * holds a body: a chair's one seat, a sofa's three side by side, a bed or a mattress lain on along its length.
 */
export function homeSeats(site: HomeSite, kind: HomeKind, things: readonly Holds[]): HomeSeat[] {
  const cell = kind.cellMm / 1000;
  const turn = site.facing === 180 ? 180 : 0;
  const mirror = site.flip ? -1 : 1;
  const seats: HomeSeat[] = [];
  const seat = (lx: number, lz: number, high: number, quarters: number, deita: boolean): void => {
    const [x, z] = homeToWorld(site, [lx, lz]);
    // A quarter turn of a thing turns its front from +Z to +X; mirrored, to -X.
    seats.push({ pos: [x, site.pos[1] + kind.floor + high, z], facing: (((quarters * 90 * mirror + turn) % 360) + 360) % 360, deita });
  };
  if (kind.esteira) seat(kind.esteira[0], kind.esteira[1], 0.08, kind.esteira[2] ?? 0, true);
  for (const thing of things) {
    if (!thing.lugares) continue;
    const [wide, deep] = thing.rot % 2 === 1 ? [thing.chao[1], thing.chao[0]] : thing.chao;
    const [mx, mz] = [(thing.cx + wide / 2) * cell, (thing.cz + deep / 2) * cell];
    if (thing.lugares < 0) {
      seat(mx, mz, BED_HIGH_M, thing.rot, true);
      continue;
    }
    // Side by side across the thing's own width, which lies along X until it is turned.
    const across = thing.chao[0] * cell;
    for (let n = 0; n < thing.lugares; n++) {
      const off = ((n + 0.5) / thing.lugares - 0.5) * across * 0.8;
      const [ox, oz] = thing.rot % 2 === 1 ? [0, thing.rot === 1 ? -off : off] : [thing.rot === 0 ? off : -off, 0];
      seat(mx + ox, mz + oz, SEAT_HIGH_M, thing.rot, false);
    }
  }
  return seats;
}
