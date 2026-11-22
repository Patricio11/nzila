// The family's house on this phone (Phase 5, D-5.8). Every house of the bairro stands in the street with a doorway
// in its front wall and no door: the doors are hung here, one draw for all of them, shut. The player's own house
// (the API says which) is given its inside (the model of its kind, from the pack of homes), its ground is laid
// over the street's as the zone lays it, and its door swings open before them and shut behind them. Nobody else
// walks in: to them it is a wall, here and at the zone.
//
// Part of being inside (dentro.tsx), and fetched with it.

import { homeGround, homeRect, homeToWorld, type HomeKind, type HomeSite } from "@nzila/world/casas";
import { type Ground } from "@nzila/sim";
// Only what the street already draws with: anything else of the renderer's library would be added to the first
// download of every player (it is one file, F-270), so the doors are made here corner by corner.
import { BufferAttribute, BufferGeometry, Mesh, Vector3, type Material, type Scene } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { meteredFetch } from "../net/data-meter.ts";
import { askAsPlayer } from "../world/account.ts";

/** Where the pack of homes is served. */
const CASAS = "/packs/casas/";
/** How wide a door swings, and how fast: radians, radians a second. */
const OPEN = 1.65;
const SWING = 4.2;
/** How near its own door a player is for it to open: metres from the middle of the doorway. */
const NEAR_M = 2.3;
const UP = new Vector3(0, 1, 0);
/** How thick a door is: metres. */
const THICK = 0.045;

/** What of the district this needs. */
export interface Bairro {
  readonly manifest: { readonly id: string; readonly homes?: readonly (HomeSite & { readonly door: string })[] | undefined };
  readonly chunks: { ground(): Ground | null };
}

/** What of the renderer this needs. */
export interface Cena {
  readonly scene: Scene;
  readonly paletteMaterial: Material;
}

/** The player's own house, as being inside needs it: the rectangle one is inside of, and the height of its walls. */
export interface Casa {
  readonly id: "casa";
  readonly house: number;
  readonly rect: readonly [number, number, number, number];
  readonly height: number;
  /** The middle of its doorway, and where its family wakes: metres. */
  readonly door: readonly [number, number];
  readonly wake: readonly [number, number];
  /** Where the street's camera is turned for someone who wakes here: behind them, looking at the door. Radians. */
  readonly look: number;
}

/** The pack of homes: the kinds of house, and where in the palette's picture the paints a door or a sign is given are. */
interface Pack {
  readonly kinds: readonly HomeKind[];
  readonly paint: Readonly<Record<string, readonly [number, number]>>;
}

type Turned = (x: number, y: number, z: number) => [number, number, number];
interface Corners {
  position: number[];
  normal: number[];
  uv: number[];
}

/**
 * The corners of a box, face by face, each through `put` (where it stands) and `turn` (which way its faces look).
 * Its top and its bottom are left out: of a door they are never seen, and every door of a bairro is drawn in every picture.
 */
const FACES: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const WHOLE: typeof FACES = [...FACES, [0, 1, 0], [0, -1, 0]];
function box(into: Corners, min: readonly number[], max: readonly number[], uv: readonly [number, number], put: Turned, turn: Turned, faces = FACES): void {
  for (const n of faces) {
    const axis = n.findIndex((v) => v !== 0);
    const [a, b] = [(axis + 1) % 3, (axis + 2) % 3];
    const at = (sa: number, sb: number): [number, number, number] => {
      const corner = [0, 0, 0];
      corner[axis] = n[axis]! > 0 ? max[axis]! : min[axis]!;
      corner[a] = sa > 0 ? max[a]! : min[a]!;
      corner[b] = sb > 0 ? max[b]! : min[b]!;
      return put(corner[0]!, corner[1]!, corner[2]!);
    };
    // Two triangles, wound so that the face looks outward.
    const order = n[axis]! > 0 ? [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]] : [[-1, -1], [1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]];
    for (const [sa, sb] of order) {
      into.position.push(...at(sa!, sb!));
      into.normal.push(...turn(n[0], n[1], n[2]));
      into.uv.push(uv[0], uv[1]);
    }
  }
}
/** A model of its own from corners. */
function model(of: Corners): BufferGeometry {
  const made = new BufferGeometry();
  made.setAttribute("position", new BufferAttribute(new Float32Array(of.position), 3));
  made.setAttribute("normal", new BufferAttribute(new Float32Array(of.normal), 3));
  made.setAttribute("uv", new BufferAttribute(new Float32Array(of.uv), 2));
  return made;
}
/** How many corners a door is drawn with: a leaf and a handle, a box each (sixteen triangles a door). */
const CORNERS = 48;

export class Casas {
  /** The player's own house here, once the API has said which and its inside has arrived. */
  casa: Casa | null = null;
  /** How far the player's own door stands open, 0 to 1: for the tests. */
  aberta = 0;
  private readonly sites: readonly (HomeSite & { readonly door: string })[];
  private kinds = new Map<string, HomeKind>();
  private paints: Pack["paint"] = {};
  private doors: BufferGeometry | null = null;
  private angle = 0;
  private mine = -1;
  private mark: Mesh | null = null;
  private last = 0;
  private readonly bairro: Bairro;
  private readonly onHome: (casa: Casa) => void;

  constructor(bairro: Bairro, onHome: (casa: Casa) => void) {
    this.bairro = bairro;
    this.onHome = onHome;
    this.sites = bairro.manifest.homes ?? [];
  }

  /** Hangs the doors and asks which house is the player's. Once, the first time there is a scene to hang them in. */
  private begun = false;
  private begin(cena: Cena): void {
    this.begun = true;
    if (this.sites.length === 0) return;
    void (async () => {
      const pack = JSON.parse(new TextDecoder().decode(await meteredFetch(`${CASAS}casas.json`))) as Pack;
      this.kinds = new Map(pack.kinds.map((kind) => [kind.id, kind]));
      this.paints = pack.paint;
      this.hang(cena);
      const { answer } = await askAsPlayer<{ home: { districtId: string; house: number } | null }>("GET", "/v1/me/casa");
      const site = answer?.home?.districtId === this.bairro.manifest.id ? this.sites[answer.home.house - 1] : undefined;
      const kind = site ? this.kinds.get(site.kind) : undefined;
      if (site && kind) await this.open(cena, answer!.home!.house, site, kind);
    })().catch(() => {
      // The pack of homes is not built here, or the line fell: the houses stay as the street has them.
    });
  }

  /** Every door of the bairro, shut, each in the paint its house was given: one model, one draw. */
  private hang(cena: Cena): void {
    const into: Corners = { position: [], normal: [], uv: [] };
    for (const site of this.sites) this.leaf(into, site, 0);
    const doors = model(into);
    const mesh = new Mesh(doors, cena.paletteMaterial);
    // Spread over the whole bairro: never left out because its middle is behind the camera.
    mesh.frustumCulled = false;
    cena.scene.add(mesh);
    this.doors = doors;
  }

  /** The corners of a house's door, swung by `angle` radians into the house: the leaf, and a handle through it at its free edge. */
  private leaf(into: Corners, site: HomeSite & { readonly door: string }, angle: number): void {
    const kind = this.kinds.get(site.kind);
    if (!kind) return;
    const { wide, high, sill, hinge } = kind.leaf;
    const [hx, hz] = homeToWorld(site, hinge);
    const turn = site.facing === 180 ? -1 : 1;
    const side = turn * (site.flip ? -1 : 1);
    // Shut, the leaf runs from its hinge along the wall; it swings about the hinge, into the house.
    const about = (side > 0 ? 0 : Math.PI) + angle * side * turn;
    const [cos, sin] = [Math.cos(about), Math.sin(about)];
    const turned: Turned = (x, y, z) => [x * cos + z * sin, y, -x * sin + z * cos];
    const put: Turned = (x, y, z) => {
      const [tx, ty, tz] = turned(x, y, z);
      return [hx + tx, site.pos[1] + sill + ty, hz + tz];
    };
    box(into, [0, 0, -THICK / 2], [wide, high, THICK / 2], this.paints[site.door] ?? [0, 0], put, turned);
    box(into, [wide - 0.14, high * 0.44, -0.07], [wide - 0.08, high * 0.52, 0.07], this.paints.metal ?? [0, 0], put, turned);
  }

  /** The player's own house: its inside set in it, its ground laid over the street's, and a sign over it to find it by. */
  private async open(cena: Cena, house: number, site: HomeSite, kind: HomeKind): Promise<void> {
    const inside = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await meteredFetch(CASAS + kind.model), "")).scene;
    inside.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      (node.material as Material).dispose();
      node.material = cena.paletteMaterial;
      node.receiveShadow = true;
    });
    inside.position.set(site.pos[0], site.pos[1], site.pos[2]);
    inside.rotation.y = site.facing === 180 ? Math.PI : 0;
    inside.scale.x = site.flip ? -1 : 1;
    cena.scene.add(inside);
    // The ground the player walks is the street's with their house open in it: laid again whenever the street's
    // own changes (a chunk arriving), and the same rule the zone walks them by.
    const chunks = this.bairro.chunks;
    const street = chunks.ground.bind(chunks);
    let laid: { of: Ground; own: Ground } | null = null;
    chunks.ground = () => {
      const now = street();
      if (!now) return null;
      if (laid?.of !== now) laid = { of: now, own: homeGround(now, site, kind) };
      return laid.own;
    };
    // A small gold sign over its roof, turning: one house among many that are the same.
    const [dx, dz] = homeToWorld(site, kind.door);
    const sign: Corners = { position: [], normal: [], uv: [] };
    const same: Turned = (x, y, z) => [x, y, z];
    box(sign, [-0.22, -0.22, -0.22], [0.22, 0.22, 0.22], this.paints.flagYellow ?? [0, 0], same, same, WHOLE);
    const mark = new Mesh(model(sign), cena.paletteMaterial);
    // On one corner, as a sign hung by a thread.
    mark.rotation.set(Math.PI / 4, 0, Math.atan(Math.SQRT1_2));
    mark.position.set(site.pos[0], site.pos[1] + kind.height + 2.6, site.pos[2]);
    cena.scene.add(mark);
    this.mark = mark;
    this.mine = house - 1;
    this.casa = { id: "casa", house, rect: homeRect(site, kind), height: kind.height, door: [dx, dz], wake: homeToWorld(site, kind.wake), look: site.facing === 180 ? 0 : Math.PI };
    this.onHome(this.casa);
  }

  /** Each picture: the player's own door opens before them and shuts behind them, and the sign over their roof turns. */
  frame(cena: Cena, x: number, z: number): void {
    if (!this.begun) this.begin(cena);
    const now = performance.now();
    const seconds = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    const casa = this.casa;
    if (!casa || !this.doors) return;
    if (this.mark) {
      this.mark.rotateOnWorldAxis(UP, seconds * 1.4);
      // Out of the way from inside: the roof is between, but the view from above takes the roof off.
      this.mark.visible = !(x > casa.rect[0] && x < casa.rect[2] && z > casa.rect[1] && z < casa.rect[3]);
    }
    const wanted = Math.hypot(x - casa.door[0], z - casa.door[1]) < NEAR_M ? OPEN : 0;
    if (wanted === this.angle) return;
    this.angle = wanted > this.angle ? Math.min(wanted, this.angle + SWING * seconds) : Math.max(wanted, this.angle - SWING * seconds);
    this.aberta = this.angle / OPEN;
    const into: Corners = { position: [], normal: [], uv: [] };
    this.leaf(into, this.sites[this.mine]!, this.angle);
    for (const name of ["position", "normal"] as const) {
      const corners = this.doors.getAttribute(name) as BufferAttribute;
      (corners.array as Float32Array).set(into[name], this.mine * CORNERS * 3);
      corners.needsUpdate = true;
    }
  }
}
