// The family's house on this phone (Phase 5, D-5.8 and D-5.9). Every house of the bairro stands in the street with
// a doorway in its front wall and no door: the doors are hung here, one draw for all of them, and each stands as
// the zone says it was left, open or shut. The player's own house (the API says which) is given its inside (the
// model of its kind, from the pack of homes) and its ground is laid over the street's as the zone lays it. Its door
// is opened and shut by the player's hand, standing at it; shut, it is a wall to them too. Nobody else walks in:
// to them the house is a wall, here and at the zone.
//
// Part of being inside (dentro.tsx), and fetched with it.

import { homeGround, homeRect, homeToWorld, type HomeKind, type HomeSite } from "@nzila/world/casas";
import { EVENT, type WorldEvent } from "@nzila/protocol";
import { VISITA_DITOS, encodePorta, encodeVisita } from "@nzila/protocol/casa";
import { type Ground } from "@nzila/sim";
// Only what the street already draws with: anything else of the renderer's library would be added to the first
// download of every player (it is one file, F-270), so the doors are made here corner by corner.
import { BufferAttribute, BufferGeometry, Mesh, Vector3, type Material, type MeshLambertMaterial, type Object3D, type Scene } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { meteredFetch } from "../net/data-meter.ts";
import { askAsPlayer } from "../world/account.ts";
import { Moveis, type Assento } from "./moveis.tsx";

/** Where the pack of homes is served. */
const CASAS = "/packs/casas/";
/** How wide a door swings, and how fast: radians, radians a second. */
const OPEN = 1.65;
const SWING = 4.2;
/** How near their own door a player stands to put a hand to it: metres from the middle of the doorway (the zone allows a little more). */
const NEAR_M = 2.3;
/** After dark, and before light: the hours a lamp is lit by. And when it is late to be out: the hours the family worries. */
const DARK = [18.2, 5.6] as const;
const LATE = [20, 5] as const;
const between = (hour: number, [from, to]: readonly [number, number]): boolean => hour >= from || hour < to;
const UP = new Vector3(0, 1, 0);
/** How thick a door is: metres. */
const THICK = 0.045;

/** What of the district this needs. */
export interface Bairro {
  readonly manifest: { readonly id: string; readonly homes?: readonly (HomeSite & { readonly door: string })[] | undefined; readonly seats: Assento[] };
  readonly chunks: { ground(): Ground | null };
}

/** What of the renderer this needs. */
export interface Cena {
  readonly scene: Scene;
  readonly paletteMaterial: MeshLambertMaterial;
  setTime(secondOfDay: number): void;
}

/** What of the line to the zone this needs: what the zone said that the way in has no place for, and a way to say something back. */
export interface Rede {
  mais: WorldEvent[];
  post(bytes: Uint8Array): void;
  /** Who someone in the street is, as the zone said. */
  who(entity: number): { readonly name: string } | null | undefined;
}

/** The player's own house, as being inside needs it: the rectangle one is inside of, and the height of its walls. */
export interface Casa {
  /** "casa": the player's own. "visita": a neighbour's they were let into (Task 5.4). */
  readonly id: "casa" | "visita";
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
  /** What a house is furnished with (Task 5.3): each thing's model, and the floor it stands on in cells. */
  readonly moveis?: readonly { readonly id: string; readonly model: string; readonly chao: readonly [number, number]; readonly lugares?: number }[];
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
  /** How far the player's own door stands open, 0 to 1. */
  aberta = 0;
  /** Whether the player stands at their own door, near enough to put a hand to it; and whether it is open (as the zone left it). */
  perto = false;
  destrancada = false;
  /** The pack of the bairro the player's house is in, when it is not this one: they go home by the road. Null at home, or with no house. */
  longe: string | null = null;
  /** Whether the player has a house anywhere; and whether it is late to be out of it. */
  tem = false;
  tarde = false;
  /** The doors that stand open, by the house's place in the pack's list; and those that are swinging, with how far. */
  private readonly abertas = new Set<number>();
  private readonly angles = new Map<number, number>();
  /** What is seen through someone else's open door: the dark of a house one cannot see into. */
  private readonly backs = new Map<number, Mesh>();
  /** The insides' own paint: lit by the bulb after dark. */
  private lit: MeshLambertMaterial | null = null;
  /** The houses that are open to the player, their own and one they are visiting: each laid over the street's ground. */
  private readonly open_: { house: number; site: HomeSite; kind: HomeKind; moveis: Moveis }[] = [];
  private laid: { of: Ground; n: number; own: Ground } | null = null;
  /** The neighbour's house the player was let into (Task 5.4): which, whose, and what is set down in it. */
  visita: { casa: Casa; house: number; de: string; moveis: Moveis; inside: Object3D } | null = null;
  /** The door of a house not their own that the player stands at, to knock: the house's place in the pack's list. */
  bater: number | null = null;
  /** Who is at the player's door, until they are let in or the knock grows old. */
  pedidos: { entity: number; nome: string; ate: number }[] = [];
  /** Until when "nobody is at home" is said, after a knock that nobody heard. */
  ninguem = 0;
  /** The middle of every doorway of the bairro, for finding the one the player stands at. */
  private portas: (readonly [number, number])[] = [];
  private readonly onGone: (id: string) => void;
  /** What the player has set down in their house, once its inside is there (Task 5.3). */
  moveis: Moveis | null = null;
  private pack: Pack | null = null;
  private readonly sites: readonly (HomeSite & { readonly door: string })[];
  private kinds = new Map<string, HomeKind>();
  private paints: Pack["paint"] = {};
  private doors: BufferGeometry | null = null;
  private mine = -1;
  private hour = 12;
  private mark: Mesh | null = null;
  private last = 0;
  private readonly bairro: Bairro;
  private readonly onHome: (casa: Casa) => void;

  constructor(bairro: Bairro, onHome: (casa: Casa) => void, onGone: (id: string) => void = () => {}) {
    this.bairro = bairro;
    this.onHome = onHome;
    this.onGone = onGone;
    this.sites = bairro.manifest.homes ?? [];
  }

  /** Hangs the doors and asks which house is the player's. Once, the first time there is a scene to hang them in. */
  private begun = false;
  private begin(cena: Cena): void {
    this.begun = true;
    // The hour of the game's day, as the street's page gives it to the renderer: kept as it goes by (the renderer
    // keeps the light it makes of it, and not the hour).
    const set = cena.setTime.bind(cena);
    cena.setTime = (second) => {
      this.hour = second / 3600;
      set(second);
    };
    void (async () => {
      if (this.sites.length > 0) {
        const pack = JSON.parse(new TextDecoder().decode(await meteredFetch(`${CASAS}casas.json`))) as Pack;
        this.kinds = new Map(pack.kinds.map((kind) => [kind.id, kind]));
        this.paints = pack.paint;
        this.pack = pack;
        this.hang(cena);
      }
      const { answer } = await askAsPlayer<{ home: { districtId: string; pack: string; house: number } | null }>("GET", "/v1/me/casa");
      this.tem = Boolean(answer?.home);
      this.longe = answer?.home && answer.home.districtId !== this.bairro.manifest.id ? answer.home.pack : null;
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
    this.portas = this.sites.map((site) => {
      const kind = this.kinds.get(site.kind);
      return kind ? homeToWorld(site, kind.door) : ([Infinity, Infinity] as const);
    });
    const mesh = new Mesh(doors, cena.paletteMaterial);
    // Spread over the whole bairro: never left out because its middle is behind the camera.
    mesh.frustumCulled = false;
    cena.scene.add(mesh);
    this.doors = doors;
  }

  /** Where a house's door hangs: how a point of the leaf (its hinge the origin, shut along the wall) stands in the bairro, swung by `angle` radians into the house. */
  private hung(site: HomeSite, kind: HomeKind, angle: number): { put: Turned; turned: Turned; inward: number } {
    const [hx, hz] = homeToWorld(site, kind.leaf.hinge);
    const turn = site.facing === 180 ? -1 : 1;
    const side = turn * (site.flip ? -1 : 1);
    const about = (side > 0 ? 0 : Math.PI) + angle * side * turn;
    const [cos, sin] = [Math.cos(about), Math.sin(about)];
    const turned: Turned = (x, y, z) => [x * cos + z * sin, y, -x * sin + z * cos];
    const put: Turned = (x, y, z) => {
      const [tx, ty, tz] = turned(x, y, z);
      return [hx + tx, site.pos[1] + kind.leaf.sill + ty, hz + tz];
    };
    // Which way of the leaf's own depth is into the house.
    return { put, turned, inward: site.flip ? 1 : -1 };
  }

  /** The corners of a house's door: the leaf, and a handle through it at its free edge. */
  private leaf(into: Corners, site: HomeSite & { readonly door: string }, angle: number): void {
    const kind = this.kinds.get(site.kind);
    if (!kind) return;
    const { wide, high } = kind.leaf;
    const { put, turned } = this.hung(site, kind, angle);
    box(into, [0, 0, -THICK / 2], [wide, high, THICK / 2], this.paints[site.door] ?? [0, 0], put, turned);
    box(into, [wide - 0.14, high * 0.44, -0.07], [wide - 0.08, high * 0.52, 0.07], this.paints.metal ?? [0, 0], put, turned);
  }

  /** Behind someone else's open door: dark. Their inside is theirs, and is not drawn on anyone else's phone. */
  private dark(cena: Cena, n: number, shown: boolean): void {
    const site = this.sites[n];
    const kind = site ? this.kinds.get(site.kind) : undefined;
    if (!shown || !site || !kind || n === this.mine || n === this.visita?.house) {
      const back = this.backs.get(n);
      if (back) {
        cena.scene.remove(back);
        back.geometry.dispose();
        this.backs.delete(n);
      }
      return;
    }
    if (this.backs.has(n)) return;
    const { put, turned, inward } = this.hung(site, kind, 0);
    const into: Corners = { position: [], normal: [], uv: [] };
    const [near, far] = [inward * 0.26, inward * 0.3];
    box(into, [-0.1, 0, Math.min(near, far)], [kind.leaf.wide + 0.1, kind.leaf.high, Math.max(near, far)], this.paints.tarShade ?? [0, 0], put, turned);
    const back = new Mesh(model(into), cena.paletteMaterial);
    cena.scene.add(back);
    this.backs.set(n, back);
  }

  /**
   * A house's inside set in it, and its ground laid over the street's for the player: their own, or a neighbour's
   * they were let into. What is set down in it is the zone's to say.
   */
  private async inside(cena: Cena, house: number, site: HomeSite, kind: HomeKind, assentos: Assento[], own = true): Promise<{ inside: Object3D; moveis: Moveis }> {
    // The insides have a paint of their own: the same palette, and after dark the glow of the bulb on every wall.
    if (!this.lit) {
      this.lit = cena.paletteMaterial.clone();
      this.lit.emissiveMap = this.lit.map;
      this.lit.emissive.setRGB(1, 0.82, 0.56);
      this.lit.emissiveIntensity = 0;
    }
    const lit = this.lit;
    const inside = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await meteredFetch(CASAS + kind.model), "")).scene;
    inside.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      (node.material as Material).dispose();
      node.material = lit;
      node.receiveShadow = true;
    });
    inside.position.set(site.pos[0], site.pos[1], site.pos[2]);
    inside.rotation.y = site.facing === 180 ? Math.PI : 0;
    inside.scale.x = site.flip ? -1 : 1;
    cena.scene.add(inside);
    const moveis = new Moveis(inside, site, kind, lit, this.pack?.moveis ?? [], assentos, this.paints, own);
    this.open_.push({ house, site, kind, moveis });
    this.ground();
    return { inside, moveis };
  }

  /**
   * The ground the player walks: the street's with every house that is open to them laid in it, by the same rule
   * the zone walks them by. Laid again whenever the street's own changes (a chunk arriving) or a house opens or
   * shuts to them. A doorway is theirs only while its door stands open; where a thing is set down, they do not walk.
   */
  private patched = false;
  private ground(): void {
    this.laid = null;
    if (this.patched) return;
    this.patched = true;
    const chunks = this.bairro.chunks;
    const street = chunks.ground.bind(chunks);
    chunks.ground = () => {
      const now = street();
      if (!now) return null;
      if (this.laid?.of !== now || this.laid.n !== this.open_.length) {
        let own = now;
        for (const one of this.open_) own = homeGround(own, one.site, one.kind, () => this.abertas.has(one.house), (cx, cz) => one.moveis.taken(cx, cz));
        this.laid = { of: now, n: this.open_.length, own };
      }
      return this.laid.own;
    };
  }

  /** The player's own house: its inside set in it, its ground laid over the street's, and a sign over it to find it by. */
  private async open(cena: Cena, house: number, site: HomeSite, kind: HomeKind): Promise<void> {
    this.moveis = (await this.inside(cena, house - 1, site, kind, this.bairro.manifest.seats)).moveis;
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

  /** Let into a neighbour's house (Task 5.4): its inside is set in it and its ground is the player's to walk, while the visit lasts. */
  private async visitar(cena: Cena, house: number, de: string): Promise<void> {
    const site = this.sites[house];
    const kind = site ? this.kinds.get(site.kind) : undefined;
    if (!site || !kind || this.visita) return;
    // The seats of a house one visits are its family's to offer: not yet (F-293).
    const { inside, moveis } = await this.inside(cena, house, site, kind, [], false);
    const casa: Casa = { id: "visita", house: house + 1, rect: homeRect(site, kind), height: kind.height, door: homeToWorld(site, kind.door), wake: homeToWorld(site, kind.wake), look: 0 };
    this.visita = { casa, house, de, moveis, inside };
    this.onHome(casa);
  }

  /** The visit is over: the house is a house of the street again. */
  private sair(cena: Cena): void {
    const visita = this.visita;
    if (!visita) return;
    this.visita = null;
    cena.scene.remove(visita.inside);
    const at = this.open_.findIndex((one) => one.moveis === visita.moveis);
    if (at >= 0) this.open_.splice(at, 1);
    this.ground();
    this.onGone("visita");
  }

  /** A knock at the door the player stands at; and whoever is at their own door, let in. */
  bate(net: Rede | null): void {
    net?.post(encodeVisita("bater"));
  }
  deixa(net: Rede | null, entity: number): void {
    net?.post(encodeVisita("deixar", entity));
    this.pedidos = this.pedidos.filter((one) => one.entity !== entity);
  }

  /** A hand to the player's own door: opened if it is shut, shut if it is open. The zone decides, and says so to everyone. */
  porta(net: Rede | null): void {
    if (net) net.post(encodePorta(!this.destrancada));
    // Walking alone (no zone): the door is the phone's own.
    else if (this.abertas.has(this.mine)) this.abertas.delete(this.mine);
    else this.abertas.add(this.mine);
  }

  /**
   * Each picture: what the zone said of doors is taken in, every door that is not as it was left swings towards it,
   * the bulb is lit after dark, and the sign over the player's roof turns.
   */
  frame(cena: Cena, x: number, z: number, net: Rede | null, y = 0, body: Object3D | null = null, sit = 0): void {
    if (!this.begun) this.begin(cena);
    const now = performance.now();
    const seconds = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    // What the zone said that is this's to hear, in the order it was said; the rest is left for whoever it is for.
    // What is set down waits until the house's inside is there to set it in.
    if (net && net.mais.length > 0) {
      const left: WorldEvent[] = [];
      for (const event of net.mais) {
        if (event.kind === EVENT.PORTA) {
          const house = (event.args[0] ?? 0) - 1;
          if (event.args[1] === 1) this.abertas.add(house);
          else this.abertas.delete(house);
          if (!this.angles.has(house)) this.angles.set(house, event.args[1] === 1 ? 0 : OPEN);
        } else if (event.kind === EVENT.VISITA) {
          const dito = VISITA_DITOS[event.args[0] ?? -1];
          const nome = net.who(event.subject)?.name ?? "";
          if (dito === "bate") this.pedidos = [...this.pedidos.filter((one) => one.entity !== event.subject), { entity: event.subject, nome, ate: now + 45_000 }];
          else if (dito === "entra") void this.visitar(cena, (event.args[1] ?? 0) - 1, nome).catch(() => {});
          else if (dito === "saiu") this.sair(cena);
          else if (dito === "ninguem") this.ninguem = now + 4000;
        } else if (event.kind === EVENT.MOVEIS && event.args[6] === 1) {
          // What stands in the house one visits: kept until its inside is there to set it in.
          if (this.visita) this.visita.moveis.hear(event);
          else left.push(event);
        } else if (event.kind === EVENT.MOVEIS && this.moveis) this.moveis.hear(event);
        else left.push(event);
      }
      net.mais.length = 0;
      net.mais.push(...left);
    }
    const hour = this.hour;
    this.tarde = between(hour, LATE);
    if (this.lit) this.lit.emissiveIntensity = between(hour, DARK) ? 0.62 : 0;
    const casa = this.casa;
    if (casa && this.mark) {
      this.mark.rotateOnWorldAxis(UP, seconds * 1.4);
      // Out of the way from inside: the roof is between, but the view from above takes the roof off.
      this.mark.visible = !(x > casa.rect[0] && x < casa.rect[2] && z > casa.rect[1] && z < casa.rect[3]);
    }
    this.perto = casa !== null && Math.hypot(x - casa.door[0], z - casa.door[1]) < NEAR_M;
    // The door of somebody else's house that the player stands at, from the street: to knock at.
    this.pedidos = this.pedidos.filter((one) => one.ate > now);
    const visiting = this.visita?.casa.rect;
    const within = (rect: readonly number[] | undefined): boolean => rect !== undefined && x > rect[0]! && x < rect[2]! && z > rect[1]! && z < rect[3]!;
    let at: number | null = null;
    if (!within(casa?.rect) && !within(visiting)) {
      for (const [n, door] of this.portas.entries()) if (n !== this.mine && n !== this.visita?.house && Math.hypot(x - door[0], z - door[1]) < NEAR_M) at = n;
    }
    this.bater = at;
    if (body) this.moveis?.frame(net, x, y, z, body.rotation.y, casa !== null && x > casa.rect[0] && x < casa.rect[2] && z > casa.rect[1] && z < casa.rect[3], body, sit);
    this.destrancada = this.abertas.has(this.mine);
    if (casa && this.destrancada && !this.angles.has(this.mine)) this.angles.set(this.mine, 0);
    if (!this.doors) return;
    for (const [n, angle] of this.angles) {
      const wanted = this.abertas.has(n) ? OPEN : 0;
      const next = wanted > angle ? Math.min(wanted, angle + SWING * seconds) : Math.max(wanted, angle - SWING * seconds);
      const site = this.sites[n];
      if (!site) {
        this.angles.delete(n);
        continue;
      }
      const into: Corners = { position: [], normal: [], uv: [] };
      this.leaf(into, site, next);
      for (const name of ["position", "normal"] as const) {
        const corners = this.doors.getAttribute(name) as BufferAttribute;
        (corners.array as Float32Array).set(into[name], n * CORNERS * 3);
        corners.needsUpdate = true;
      }
      this.dark(cena, n, next > 0);
      if (n === this.mine) this.aberta = next / OPEN;
      // At rest shut, it is forgotten; open, it is kept (it must be swung shut from there).
      if (next === 0) this.angles.delete(n);
      else this.angles.set(n, next);
    }
  }
}
