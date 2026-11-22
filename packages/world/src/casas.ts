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
  /** One string a row along Z, one character a cell along X: "." the family walks here, "#" nobody does, "-" as the street has it. */
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
 * else. A house stands on the walk grid's lines (the pack's build refuses one that does not).
 */
export function homeGround(street: Ground, site: HomeSite, kind: HomeKind): Ground {
  if (kind.cellMm !== street.cellMm) throw new Error(`the home "${kind.id}" is drawn in cells of ${kind.cellMm} mm and the street in ${street.cellMm}`);
  const cell = kind.cellMm / 1000;
  const turn = site.facing === 180 ? -1 : 1;
  const side = turn * (site.flip ? -1 : 1);
  const floorMm = Math.round((site.pos[1] + kind.floor) * 1000);
  /** What the house says of a cell of the bairro: "-" beyond it. */
  const said = (cx: number, cz: number): string => {
    const lx = side * ((cx + 0.5) * cell - site.pos[0]);
    const lz = turn * ((cz + 0.5) * cell - site.pos[2]);
    return kind.rows[Math.floor(lz / cell) - kind.cellZ0]?.[Math.floor(lx / cell) - kind.cellX0] ?? "-";
  };
  return {
    cellMm: street.cellMm,
    flagsAt: (cx, cz) => {
      const here = said(cx, cz);
      return here === "." ? CELL_WALK : here === "#" ? 0 : street.flagsAt(cx, cz);
    },
    heightAt: (cx, cz) => (said(cx, cz) === "." ? floorMm : street.heightAt(cx, cz)),
  };
}
