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
 * a wall, not the doorway, not the step before the door, not the street's), and none is under another thing. This is what keeps a thing from sinking into a wall
 * or standing in another: it is the zone's to ask, and the phone asks it first so as not to offer what will be refused.
 */
export function mayStand(kind: HomeKind, others: readonly SetDown[], thing: SetDown): boolean {
  if (!Number.isInteger(thing.rot) || thing.rot < 0 || thing.rot > 3) return false;
  const under = new Set(others.flatMap(cellsOf).map(([x, z]) => `${x},${z}`));
  const cell = kind.cellMm / 1000;
  const inside = (x: number, z: number): boolean => (x + 0.5) * cell > kind.rect[0] && (x + 0.5) * cell < kind.rect[2] && (z + 0.5) * cell > kind.rect[1] && (z + 0.5) * cell < kind.rect[3];
  return cellsOf(thing).every(([x, z]) => inside(x, z) && kind.rows[z - kind.cellZ0]?.[x - kind.cellX0] === "." && !under.has(`${x},${z}`));
}
