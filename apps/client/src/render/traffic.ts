// The candongueiros on their linhas. Where each van is comes from the route,
// its timetable and the clock alone (packages/sim/route.ts), so every phone
// and the zone see the same van at the same paragem without a byte sent.
// Here they are only drawn: one model, one draw for each van on the road.

import { DEFAULT_CLOCK, compileClock, compileRoute, routeVehiclesAt, type Obstacle, type Route } from "@nzila/sim";
import { WORLD, type Manifest } from "@nzila/world/client";
import { ptAOTranslator as tr } from "@nzila/i18n";
import { BufferAttribute, BufferGeometry, CanvasTexture, Group, LinearFilter, Mesh, MeshLambertMaterial, SRGBColorSpace, type Material, type Object3D } from "three";
import { meteredFetch } from "../net/data-meter.ts";
import { gltfLoader } from "./chunk-stream.ts";
import { actorAt, type CrowdFile, type CrowdVehicle } from "./crowd-plan.ts";
import { type People } from "./people.ts";
import { type Person } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";

/** Where the vehicles' models are served. They belong to the game, not to a district. */
const VEHICLES = "/packs/dev-vehicles/";
/** First numbers, to be tuned on the street: about 30 km/h, twelve seconds at a paragem. */
const CRUISE_MM_PER_S = 8300;
const RAMP_MS = 3500;
const DWELL_MS = 12_000;
/** The van's size on the ground (art/scripts/vehicles.py). */
const HALF_WIDTH_MM = 850;
const HALF_LENGTH_MM = 2350;

/** The phrases a van may have across its back window, and how often one carries an advert there instead. */
const PHRASES = 8;
const AD_EVERY = 4;
const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

const clock = compileClock(DEFAULT_CLOCK);

/**
 * The back windows of `count` vans on one picture: each its own phrase in white across the glass,
 * as they are written in Luanda, and every fourth an advert that covers it.
 */
function backWindows(count: number, wide: number, high: number): { material: MeshLambertMaterial; plane: (n: number) => BufferGeometry } {
  const W = 512;
  const H = Math.round((W * high) / wide);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H * count;
  const pen = canvas.getContext("2d")!;
  for (let n = 0; n < count; n++) {
    const top = n * H;
    const advert = n % AD_EVERY === AD_EVERY - 1;
    const words = advert ? tr.t("van.ad.house") : tr.t(`van.phrase.${n % PHRASES}` as "van.phrase.0");
    if (advert) {
      pen.fillStyle = css(WORLD.adBoard);
      pen.fillRect(0, top, W, H);
      pen.fillStyle = css(WORLD.adBoardBand);
      pen.fillRect(0, top + H - 34, W, 34);
    }
    pen.fillStyle = css(advert ? WORLD.adBoardBand : n % 3 === 1 ? WORLD.adBoard : WORLD.vanWhite);
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    let size = 110;
    do {
      size -= 4;
      pen.font = `italic 900 ${size}px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
    } while (pen.measureText(words).width > W - 36 && size > 24);
    pen.fillText(words, W / 2, top + (advert ? (H - 34) / 2 : H / 2) + 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  const material = new MeshLambertMaterial({ map: texture, alphaTest: 0.35, transparent: false });
  return {
    material,
    plane(n) {
      const v0 = 1 - ((n + 1) * H) / canvas.height;
      const v1 = 1 - (n * H) / canvas.height;
      // Facing backward: to someone behind the van, its right-hand end is at the van's left (+x).
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array([wide / 2, -high / 2, 0, -wide / 2, -high / 2, 0, -wide / 2, high / 2, 0, wide / 2, high / 2, 0]), 3));
      geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, v0, 1, v0, 1, v1, 0, v1]), 2));
      geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]), 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      return geometry;
    },
  };
}

export interface VanSeen {
  readonly route: string;
  readonly index: number;
  readonly x: number;
  readonly z: number;
  /** Radians about the vertical, 0 facing +Z. */
  readonly yaw: number;
  readonly dwelling: boolean;
  /** The stop it stands at or drives to (an index into the route's stops), and how far it has come from the one before, 0 to 1. */
  readonly stop: number;
  readonly progress: number;
  /** The names of the route's paragens, as keys of the district's words, in order. */
  readonly stops: readonly string[];
}

interface Line {
  readonly id: string;
  readonly route: Route;
  readonly stops: readonly string[];
  readonly vans: { readonly body: Object3D; yaw: number; shown: boolean }[];
}

/** A place to sit in a van, in its own axes: x to its left, the height of the seat, z forward. */
interface VanAd {
  readonly id: string;
  readonly size: readonly [number, number];
  readonly pos?: readonly [number, number, number];
}

export interface VanSeat {
  readonly who: string;
  readonly pos: readonly [number, number, number];
}

/** A car, a kupapata or a moto going round by its timetable, and whoever rides it. */
interface Roamer {
  readonly plan: CrowdVehicle;
  readonly body: Object3D;
  readonly halfWidthMm: number;
  readonly halfLengthMm: number;
  rider: Person | null;
  yaw: number;
  x: number;
  /** How high it is: on a viaduct it is over people's heads and stops nobody. */
  y: number;
  z: number;
}

/** Whether a vehicle is down among people: one on a viaduct is over their heads and stops nobody. */
const onTheGround = (roamer: Roamer): boolean => 1.5 > roamer.y;

// Giving way (finding F-133). A vehicle's place comes from its timetable and the clock; a vehicle
// that must wait falls behind its timetable (its `lag`), and makes the time up, a little faster
// than it would drive, once the road is clear. It waits for a person in the road ahead of it and
// for the vehicle in front. This is the phone's own traffic (LocalWorld): when the zone runs the
// streets (Phase 3) the waiting is the zone's to decide, by the same rule.
/** How far ahead a driver looks, how far short of a person and of a vehicle they stop, and how much faster they make up time. */
const LOOK_M = 9;
const STOP_SHORT_PERSON_M = 1.4;
const STOP_SHORT_VEHICLE_M = 1.3;
const CATCH_UP = 0.3;
/** How far to the side of the vehicle's own width someone still counts as in its way. */
const BESIDE_M = 0.45;
/** A vehicle that has stood this long for other vehicles alone goes on for a while regardless: no knot of traffic lasts. */
const PATIENCE_MS = 14_000;
const PUSH_ON_MS = 4_000;
/** A roamer taken off the road comes back when its place is clear and the viewer is at least this far from it; and where "off the road" is. */
const RETURN_UNSEEN_M = 45;
const OFF_THE_ROAD_M = 1000;

/** Someone on foot the traffic must not run down. */
export interface Afoot {
  readonly x: number;
  readonly z: number;
}

interface Moving {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** Radians; forward is (sin, cos). */
  readonly heading: number;
  readonly halfWidth: number;
  readonly halfLength: number;
}

/** How much room two vehicles keep between their bodies at the least, in metres: they never touch. */
const CLEAR_M = 0.3;
/** Two vehicles found one inside the other, neither able to move without touching, are parted after this long. */
export const KNOT_MS = 600;

/**
 * What a vehicle does that is inside another and cannot move (finding F-180). Two timetables, or a return to the
 * road, can put one vehicle on top of another; "a body does not go where another body is" then holds both where
 * they are for ever, each waiting for the other. After a moment: one of the other traffic leaves the road (it comes
 * back when its place is clear and nobody is looking); a candongueiro, which people ride and wait for, drives on.
 */
export function untangle(roamer: boolean, knotMs: number): "wait" | "leave" | "push" {
  return KNOT_MS > knotMs ? "wait" : roamer ? "leave" : "push";
}

/**
 * Whether the bodies of two vehicles overlap, each grown by `margin` all round. Two rectangles on
 * the ground, at any angle: they are apart when some edge of one has the whole of the other beyond it.
 */
export function touching(a: Moving, b: Moving, margin = 0): boolean {
  if (Math.abs(a.y - b.y) > 1.5) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [first, second] of [[a, b], [b, a]] as const) {
    // The two axes of `first`: along it and across it. `second`'s reach along each is the sum of its own halves, turned.
    const axes = [[Math.sin(first.heading), Math.cos(first.heading), first.halfLength], [Math.cos(first.heading), -Math.sin(first.heading), first.halfWidth]] as const;
    for (const [ax, az, mine] of axes) {
      const theirs = Math.abs(Math.sin(second.heading) * ax + Math.cos(second.heading) * az) * second.halfLength + Math.abs(Math.cos(second.heading) * ax - Math.sin(second.heading) * az) * second.halfWidth;
      if (Math.abs(dx * ax + dz * az) > mine + theirs + margin * 2) return false;
    }
  }
  return true;
}

/**
 * How freely a vehicle may go, from 0 (it must stand) to 1 (the road is clear):
 * less the nearer someone on foot or the vehicle in front is, ahead of it and in its lane.
 */
export function wayAhead(me: Moving, others: readonly Moving[], afoot: readonly Afoot[], heedVehicles = true): number {
  const sin = Math.sin(me.heading);
  const cos = Math.cos(me.heading);
  let free = 1;
  const ahead = (x: number, z: number): { forward: number; beside: number } => ({ forward: (x - me.x) * sin + (z - me.z) * cos, beside: Math.abs((x - me.x) * cos - (z - me.z) * sin) });
  if (1.5 > me.y) {
    for (const person of afoot) {
      const { forward, beside } = ahead(person.x, person.z);
      if (forward > 0 && beside < me.halfWidth + BESIDE_M) free = Math.min(free, (forward - me.halfLength - STOP_SHORT_PERSON_M) / (LOOK_M - STOP_SHORT_PERSON_M));
    }
  }
  for (const other of heedVehicles ? others : []) {
    if (other.key === me.key || Math.abs(other.y - me.y) > 1.5) continue;
    const same = Math.sin(other.heading) * sin + Math.cos(other.heading) * cos;
    const { forward, beside } = ahead(other.x, other.z);
    if (same >= 0.5) {
      // The one in front, going the same way: keep a gap behind it.
      if (forward > 0.05 && beside < 1.4) free = Math.min(free, (forward - me.halfLength - other.halfLength - STOP_SHORT_VEHICLE_M) / 5);
    } else if (same > -0.5 && other.key < me.key) {
      // One that crosses the way ahead. Of two that meet at a crossing one must go first: the one
      // whose name sorts first, always, so that they never both wait. (What comes the other way,
      // in its own lane, is nobody's business.) A crossing vehicle lies across the lane, so it is
      // in the way from further to the side.
      if (forward > 0.05 && beside < other.halfLength + me.halfWidth + 0.3) free = Math.min(free, (forward - me.halfLength - other.halfWidth - STOP_SHORT_VEHICLE_M) / 5);
    }
  }
  return Math.min(1, Math.max(0, free));
}

/** How near a moto or a kupapata must be for its rider to be drawn, in metres, and how many riders at once. */
const RIDER_REACH_M = 55;
const RIDERS = 2;

export class Traffic {
  private readonly lines: Line[] = [];
  private readonly root = new Group();
  private readonly renderer: WorldRenderer;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshLambertMaterial[] = [];
  private readonly roamers: Roamer[] = [];
  /** Where people sit in a van. */
  seats: readonly VanSeat[] = [];
  /** The vans on the road at the last update. */
  seen: VanSeen[] = [];
  /** How far behind its timetable each vehicle is, in milliseconds, for having given way. */
  private readonly lag = new Map<string, number>();
  /** How long each has stood for other vehicles alone; below zero, it is pushing on for that long yet. */
  private readonly stood = new Map<string, number>();
  /** Vehicles taken off the road for a while because they were in a knot that would not come undone (roamers only, by their key). */
  private readonly away = new Set<string>();
  /** How long each vehicle has been inside another and held there. */
  private readonly knot = new Map<string, number>();
  private moving: Moving[] = [];
  /** How many vehicles are slowing or standing for the viewer themself, at the last update: for the tests. */
  heeding = 0;

  private constructor(renderer: WorldRenderer) {
    this.renderer = renderer;
    renderer.scene.add(this.root);
  }

  /** Opens the traffic of a district, or resolves to null when it has no routes or the vehicles are not built. */
  static async open(renderer: WorldRenderer, base: string, manifest: Manifest, people: People | null = null): Promise<Traffic | null> {
    const routes = manifest.routes.filter((route) => route.kind === "candongueiro");
    if (routes.length === 0) return null;
    try {
      const gltf = await gltfLoader().parseAsync(await meteredFetch(`${VEHICLES}candongueiro.glb`), "");
      const traffic = new Traffic(renderer);
      const listed = JSON.parse(new TextDecoder().decode(await meteredFetch(`${VEHICLES}veiculos.json`))) as { vehicles: { name: string; model: string; halfWidth: number; halfLength: number; seats?: VanSeat[]; adSlots?: VanAd[] }[] };
      const model = listed.vehicles.find((vehicle) => vehicle.name === "candongueiro");
      traffic.seats = model?.seats ?? [];
      const glass = model?.adSlots?.find((slot) => slot.id === "vidro-traseiro" && slot.pos);
      const total = routes.reduce((sum, route) => sum + Math.max(1, Math.ceil(3600 / route.headwaySeconds)), 0) + 8;
      const windows = glass ? backWindows(total, glass.size[0], glass.size[1]) : null;
      if (windows) traffic.materials.push(windows.material);
      let numbered = 0;
      gltf.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        (node.material as Material).dispose();
        node.material = renderer.paletteMaterial;
        node.castShadow = true;
        node.receiveShadow = false;
        traffic.geometries.push(node.geometry as BufferGeometry);
      });
      for (const listed of routes) {
        const spline = JSON.parse(new TextDecoder().decode(await meteredFetch(base + listed.spline))) as { points: [number, number, number][] };
        const route = compileRoute({
          points: spline.points.map(([x, y, z]) => ({ x: Math.round(x * 1000), y: Math.round(y * 1000), z: Math.round(z * 1000) })),
          stops: listed.stopPoints.map((pointIndex) => ({ pointIndex, dwellMs: DWELL_MS })),
          cruiseMmPerS: CRUISE_MM_PER_S,
          rampMs: RAMP_MS,
          headwayMs: listed.headwaySeconds * 1000,
          // All day and all night for now: when the last van runs is a tunable to come.
          serviceStartGameS: 0,
          serviceEndGameS: 86_400,
        });
        const vans = [];
        for (let i = 0; i < route.vehicleCount; i++) {
          const body = gltf.scene.clone();
          if (windows && glass?.pos && numbered < total) {
            // Its own phrase across the back window.
            const written = new Mesh(windows.plane(numbered++), windows.material);
            written.position.set(glass.pos[0], glass.pos[1], glass.pos[2]);
            traffic.geometries.push(written.geometry);
            body.add(written);
          }
          body.visible = false;
          traffic.root.add(body);
          vans.push({ body, yaw: 0, shown: false });
        }
        const stops = listed.stops.map((id) => manifest.paragens.find((p) => p.id === id)?.nameKey ?? id);
        traffic.lines.push({ id: listed.id, route, stops, vans });
      }
      // The other traffic, when the district has a timetable for it: each model fetched once, each vehicle a copy.
      if (manifest.npc.crowd) {
        const file = JSON.parse(new TextDecoder().decode(await meteredFetch(base + manifest.npc.crowd))) as CrowdFile;
        const loaded = new Map<string, Promise<Object3D>>();
        for (const [n, plan] of (file.vehicles ?? []).entries()) {
          const kind = listed.vehicles.find((vehicle) => vehicle.name === plan.model);
          if (!kind) continue;
          let loading = loaded.get(kind.model);
          if (!loading) {
            loading = meteredFetch(VEHICLES + kind.model).then(async (bytes) => {
              const scene = (await gltfLoader().parseAsync(bytes, "")).scene;
              scene.traverse((node) => {
                if (!(node instanceof Mesh)) return;
                (node.material as Material).dispose();
                node.material = renderer.paletteMaterial;
                node.castShadow = true;
                node.receiveShadow = false;
                traffic.geometries.push(node.geometry as BufferGeometry);
              });
              return scene;
            });
            loaded.set(kind.model, loading);
          }
          const body = (await loading).clone();
          traffic.root.add(body);
          const roamer: Roamer = { plan, body, halfWidthMm: kind.halfWidth * 1000, halfLengthMm: kind.halfLength * 1000, rider: null, yaw: 0, x: 0, y: 0, z: 0 };
          traffic.roamers.push(roamer);
          // A moto and a kupapata are ridden by someone: seated, hands to the bars.
          const seat = kind.seats?.find((s) => s.who === "condutor");
          const who = seat ? people?.pick("any", n * 5 + 1) : undefined;
          if (seat && who && people) {
            void people.make(who).then((rider) => {
              if (!rider) return;
              rider.root.position.set(seat.pos[0], seat.pos[1] - 0.46 * (rider.height / 1.7), seat.pos[2]);
              rider.root.visible = false;
              rider.shadow = false;
              body.add(rider.root);
              roamer.rider = rider;
            });
          }
        }
      }
      return traffic;
    } catch {
      return null;
    }
  }

  /**
   * Puts every vehicle where the clock says it is, less what it has had to wait. `elapsedMs` since
   * the last call eases the turns. `afoot` is who is on foot near the road: the traffic gives way
   * to them and to the vehicle in front; null holds every vehicle to its timetable (a still).
   */
  update(nowMs: number, elapsedMs: number, viewerX = 0, viewerZ = 0, afoot: readonly Afoot[] | null = null): void {
    // What each vehicle saw at the last update decides how much of this one's time it may use.
    if (afoot && elapsedMs > 0) {
      const step = Math.min(elapsedMs, 250);
      const viewer = afoot.filter((person) => person.x === viewerX && person.z === viewerZ);
      this.heeding = this.moving.filter((me) => 1 > wayAhead(me, [], viewer)).length;
      const placed = new Map<string, Moving>();
      for (const me of [...this.moving].sort((a, b) => (a.key < b.key ? -1 : 1))) {
        const stood = this.stood.get(me.key) ?? 0;
        const free = wayAhead(me, this.moving, afoot, stood >= 0);
        // Standing for vehicles only (people are always waited for): patience runs out, then it pushes on, then it is patient again.
        const held = free < 0.05 && wayAhead(me, [], afoot) > 0.05;
        const next = stood < 0 ? Math.min(0, stood + step) : held ? stood + step : 0;
        if (next > PATIENCE_MS) this.stood.set(me.key, -PUSH_ON_MS);
        else if (next === 0) this.stood.delete(me.key);
        else this.stood.set(me.key, next);
        const before = this.lag.get(me.key) ?? 0;
        let lag = Math.max(0, before + step * (1 - free) - (free === 1 ? step * CATCH_UP : 0));
        // And whatever the driver judged, a body does not go where another body is (founder, 2026-11-16: "cars should
        // not brush each other: if they do it is an accident"). Where it would be is tried against where every other
        // vehicle is: those already moved this turn, and the rest where they stood. If it would touch one, it stays
        // exactly where it is. (Two that timetables put on top of one another may still move apart.)
        const there = this.poseOf(me.key, nowMs, lag) ?? me;
        const others = this.moving.map((other) => placed.get(other.key) ?? other);
        let stopped = others.some((other) => other.key !== me.key && touching(there, other, CLEAR_M) && !(touching(me, other, CLEAR_M) && Math.hypot(there.x - other.x, there.z - other.z) > Math.hypot(me.x - other.x, me.z - other.z)));
        // Held, and already inside another: a knot. It is given a moment, then undone.
        const inside = stopped && others.some((other) => other.key !== me.key && touching(me, other));
        const knotted = inside ? (this.knot.get(me.key) ?? 0) + step : 0;
        if (knotted > 0) this.knot.set(me.key, knotted);
        else this.knot.delete(me.key);
        const undo = inside ? untangle(me.key.startsWith("r"), knotted) : "wait";
        if (undo === "push") stopped = false;
        if (stopped) lag = before + elapsedMs;
        placed.set(me.key, stopped ? me : there);
        if (undo === "leave") {
          this.away.add(me.key);
          this.lag.delete(me.key);
          this.stood.delete(me.key);
          this.knot.delete(me.key);
          continue;
        }
        if (lag > 0) this.lag.set(me.key, lag);
        else this.lag.delete(me.key);
        // A knot that will not come undone: after its patience a roamer leaves the road, and comes back to its
        // timetable when its place there is clear and nobody is near enough to see it arrive.
        if (stopped && me.key.startsWith("r") && (this.stood.get(me.key) ?? 0) < 0) {
          this.away.add(me.key);
          this.lag.delete(me.key);
          this.stood.delete(me.key);
        }
      }
      for (const key of this.away) {
        const back = this.poseOf(key, nowMs, 0);
        if (back && Math.hypot(back.x - viewerX, back.z - viewerZ) > RETURN_UNSEEN_M && ![...placed.values()].some((other) => touching(back, other, 2))) this.away.delete(key);
      }
    } else if (!afoot) {
      this.lag.clear();
      this.stood.clear();
      this.away.clear();
      this.knot.clear();
    }
    const moving: Moving[] = [];
    // The other traffic first: where each is, and a rider for the nearest few that have one.
    const near: { roamer: Roamer; far: number }[] = [];
    for (const [n, roamer] of this.roamers.entries()) {
      roamer.body.visible = !this.away.has(`r${n}`);
      if (!roamer.body.visible) {
        // Off the road: nowhere anybody could walk into it or see it.
        roamer.y = OFF_THE_ROAD_M;
        continue;
      }
      const at = actorAt({ role: "", offset: roamer.plan.offset, keys: roamer.plan.keys }, (nowMs - (this.lag.get(`r${n}`) ?? 0)) / 1000);
      moving.push({ key: `r${n}`, x: at.x, z: at.z, y: at.y, heading: at.yaw, halfWidth: roamer.halfWidthMm / 1000, halfLength: roamer.halfLengthMm / 1000 });
      const turn = Math.atan2(Math.sin(at.yaw - roamer.yaw), Math.cos(at.yaw - roamer.yaw));
      roamer.yaw = elapsedMs > 0 ? roamer.yaw + turn * Math.min(1, elapsedMs / 380) : at.yaw;
      roamer.x = at.x;
      roamer.z = at.z;
      roamer.body.position.set(at.x, at.y, at.z);
      roamer.y = at.y;
      roamer.body.rotation.y = roamer.yaw;
      if (roamer.rider) {
        roamer.rider.root.visible = false;
        const far = Math.hypot(at.x - viewerX, at.z - viewerZ);
        if (far < RIDER_REACH_M) near.push({ roamer, far });
      }
    }
    near.sort((a, b) => a.far - b.far);
    for (const { roamer } of near.slice(0, RIDERS)) {
      roamer.rider!.root.visible = true;
      roamer.rider!.pose({ speed: 0, phase: 0, time: nowMs / 1000 + roamer.plan.offset }, { sit: 1, hold: "guiador" });
    }
    const seen: VanSeen[] = [];
    for (const line of this.lines) {
      for (const van of line.vans) van.body.visible = false;
      // Each van at its own time: the clock's, less what it has waited. Most have waited nothing, and share one reading of the timetable.
      const readings = new Map<number, ReturnType<typeof routeVehiclesAt>>();
      const reading = (lagMs: number): ReturnType<typeof routeVehiclesAt> => {
        const at = Math.round(nowMs - lagMs);
        let read = readings.get(at);
        if (!read) readings.set(at, (read = routeVehiclesAt(line.route, clock, at)));
        return read;
      };
      for (const onTime of reading(0)) {
        const key = `${line.id}/${onTime.index}`;
        const at = reading(this.lag.get(key) ?? 0).find((late) => late.index === onTime.index) ?? onTime;
        moving.push({ key, x: at.x / 1000, z: at.z / 1000, y: at.y / 1000, heading: (at.yaw / 18_000) * Math.PI, halfWidth: HALF_WIDTH_MM / 1000, halfLength: HALF_LENGTH_MM / 1000 });
        const van = line.vans[at.index]!;
        const target = (at.yaw / 18_000) * Math.PI;
        // A route turns at its points; a van turns over a second or so.
        const turn = Math.atan2(Math.sin(target - van.yaw), Math.cos(target - van.yaw));
        van.yaw = van.shown ? van.yaw + turn * Math.min(1, elapsedMs / 450) : target;
        van.shown = true;
        van.body.visible = true;
        van.body.position.set(at.x / 1000, at.y / 1000, at.z / 1000);
        van.body.rotation.y = van.yaw;
        const legs = line.route.legs;
        const travel = legs[(at.stop + legs.length - 1) % legs.length]!.travelMs;
        seen.push({ route: line.id, index: at.index, x: at.x / 1000, z: at.z / 1000, yaw: van.yaw, dwelling: at.dwelling, stop: at.stop, progress: at.dwelling ? 1 : 1 - at.msToStop / Math.max(1, travel), stops: line.stops });
      }
      for (const van of line.vans) if (!van.body.visible) van.shown = false;
    }
    this.seen = seen;
    this.moving = moving;
  }

  /** Where a vehicle is when it is `lagMs` behind its timetable, or null for one that is not on the road. */
  private poseOf(key: string, nowMs: number, lagMs: number): Moving | null {
    if (key.startsWith("r")) {
      const roamer = this.roamers[Number(key.slice(1))];
      if (!roamer) return null;
      const at = actorAt({ role: "", offset: roamer.plan.offset, keys: roamer.plan.keys }, (nowMs - lagMs) / 1000);
      return { key, x: at.x, z: at.z, y: at.y, heading: at.yaw, halfWidth: roamer.halfWidthMm / 1000, halfLength: roamer.halfLengthMm / 1000 };
    }
    const cut = key.lastIndexOf("/");
    const line = this.lines.find((one) => one.id === key.slice(0, cut));
    const at = line ? routeVehiclesAt(line.route, clock, Math.round(nowMs - lagMs)).find((van) => van.index === Number(key.slice(cut + 1))) : undefined;
    return at ? { key, x: at.x / 1000, z: at.z / 1000, y: at.y / 1000, heading: (at.yaw / 18_000) * Math.PI, halfWidth: HALF_WIDTH_MM / 1000, halfLength: HALF_LENGTH_MM / 1000 } : null;
  }

  /** How many pairs of vehicles have their bodies overlapping: for the tests. Vehicles never touch, so this is nothing. */
  get tangled(): number {
    let pairs = 0;
    for (const [n, a] of this.moving.entries()) for (const b of this.moving.slice(n + 1)) if (touching(a, b)) pairs++;
    return pairs;
  }

  /** How far behind its timetable the vehicle that has waited longest is, in seconds: for the tests. */
  get waited(): number {
    return Math.max(0, ...this.lag.values()) / 1000;
  }

  /** The other traffic at the last update: what each is and where. */
  get roaming(): { model: string; x: number; z: number }[] {
    return this.roamers.map((roamer) => ({ model: roamer.plan.model, x: roamer.x, z: roamer.z }));
  }

  /** The van itself, to seat people in or to see out of. */
  bodyOf(route: string, index: number): Object3D | null {
    return this.lines.find((line) => line.id === route)?.vans[index]?.body ?? null;
  }

  /** The vans as things a body cannot walk through, for the step of whoever is on foot. */
  obstacles(): Obstacle[] {
    const turned = (yaw: number): number => ((Math.round((yaw * 18_000) / Math.PI) % 36_000) + 36_000) % 36_000;
    return [
      ...this.seen.map((van): Obstacle => ({ kind: "box", x: Math.round(van.x * 1000), z: Math.round(van.z * 1000), halfWidthMm: HALF_WIDTH_MM, halfLengthMm: HALF_LENGTH_MM, yaw: turned(van.yaw) })),
      ...this.roamers.filter(onTheGround).map((roamer): Obstacle => ({ kind: "box", x: Math.round(roamer.x * 1000), z: Math.round(roamer.z * 1000), halfWidthMm: roamer.halfWidthMm, halfLengthMm: roamer.halfLengthMm, yaw: turned(roamer.yaw) })),
    ];
  }

  close(): void {
    this.renderer.scene.remove(this.root);
    for (const roamer of this.roamers) roamer.rider?.release();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) {
      material.map?.dispose();
      material.dispose();
    }
  }
}
