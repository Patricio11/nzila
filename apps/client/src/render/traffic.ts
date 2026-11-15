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
  z: number;
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
          const roamer: Roamer = { plan, body, halfWidthMm: kind.halfWidth * 1000, halfLengthMm: kind.halfLength * 1000, rider: null, yaw: 0, x: 0, z: 0 };
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

  /** Puts every van where the clock says it is. `elapsedMs` since the last call eases the turns. */
  update(nowMs: number, elapsedMs: number, viewerX = 0, viewerZ = 0): void {
    // The other traffic first: where each is, and a rider for the nearest few that have one.
    const near: { roamer: Roamer; far: number }[] = [];
    for (const roamer of this.roamers) {
      const at = actorAt({ role: "", offset: roamer.plan.offset, keys: roamer.plan.keys }, nowMs / 1000);
      const turn = Math.atan2(Math.sin(at.yaw - roamer.yaw), Math.cos(at.yaw - roamer.yaw));
      roamer.yaw = elapsedMs > 0 ? roamer.yaw + turn * Math.min(1, elapsedMs / 380) : at.yaw;
      roamer.x = at.x;
      roamer.z = at.z;
      roamer.body.position.set(at.x, 0, at.z);
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
      for (const at of routeVehiclesAt(line.route, clock, Math.round(nowMs))) {
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
      ...this.roamers.map((roamer): Obstacle => ({ kind: "box", x: Math.round(roamer.x * 1000), z: Math.round(roamer.z * 1000), halfWidthMm: roamer.halfWidthMm, halfLengthMm: roamer.halfLengthMm, yaw: turned(roamer.yaw) })),
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
