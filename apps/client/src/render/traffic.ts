// The candongueiros on their linhas. Where each van is comes from the route,
// its timetable and the clock alone (packages/sim/route.ts), so every phone
// and the zone see the same van at the same paragem without a byte sent.
// Here they are only drawn: one model, one draw for each van on the road.

import { DEFAULT_CLOCK, compileClock, compileRoute, routeVehiclesAt, type Obstacle, type Route } from "@nzila/sim";
import { type Manifest } from "@nzila/world/client";
import { Group, Mesh, type BufferGeometry, type Material, type Object3D } from "three";
import { meteredFetch } from "../net/data-meter.ts";
import { gltfLoader } from "./chunk-stream.ts";
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

const clock = compileClock(DEFAULT_CLOCK);

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

export class Traffic {
  private readonly lines: Line[] = [];
  private readonly root = new Group();
  private readonly renderer: WorldRenderer;
  private readonly geometries: BufferGeometry[] = [];
  /** The vans on the road at the last update. */
  seen: VanSeen[] = [];

  private constructor(renderer: WorldRenderer) {
    this.renderer = renderer;
    renderer.scene.add(this.root);
  }

  /** Opens the traffic of a district, or resolves to null when it has no routes or the vehicles are not built. */
  static async open(renderer: WorldRenderer, base: string, manifest: Manifest): Promise<Traffic | null> {
    const routes = manifest.routes.filter((route) => route.kind === "candongueiro");
    if (routes.length === 0) return null;
    try {
      const gltf = await gltfLoader().parseAsync(await meteredFetch(`${VEHICLES}candongueiro.glb`), "");
      const traffic = new Traffic(renderer);
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
          body.visible = false;
          traffic.root.add(body);
          vans.push({ body, yaw: 0, shown: false });
        }
        const stops = listed.stops.map((id) => manifest.paragens.find((p) => p.id === id)?.nameKey ?? id);
        traffic.lines.push({ id: listed.id, route, stops, vans });
      }
      return traffic;
    } catch {
      return null;
    }
  }

  /** Puts every van where the clock says it is. `elapsedMs` since the last call eases the turns. */
  update(nowMs: number, elapsedMs: number): void {
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

  /** The vans as things a body cannot walk through, for the step of whoever is on foot. */
  obstacles(): Obstacle[] {
    return this.seen.map((van) => ({ kind: "box", x: Math.round(van.x * 1000), z: Math.round(van.z * 1000), halfWidthMm: HALF_WIDTH_MM, halfLengthMm: HALF_LENGTH_MM, yaw: ((Math.round((van.yaw * 18_000) / Math.PI) % 36_000) + 36_000) % 36_000 }));
  }

  close(): void {
    this.renderer.scene.remove(this.root);
    for (const geometry of this.geometries) geometry.dispose();
  }
}
