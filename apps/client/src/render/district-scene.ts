// A district to look at: its chunks streamed round the viewer, its water, and
// a few ways of standing in it (a fixed walk for the bench, a stroll, a
// postcard, any spot asked for). The viewer here is a camera, not a body: the
// character controller and the real camera are Task 1.3.

import { type Manifest } from "@nzila/world/client";
import { type Mesh } from "three";
import { meteredFetch } from "../net/data-meter.ts";
import { ChunkStream, type StreamState } from "./chunk-stream.ts";
import { Crowd } from "./crowd.ts";
import { Traffic } from "./traffic.ts";
import { type WorldRenderer } from "./world-renderer.ts";

/** Eye height above the road, standing on a pavement, in metres. */
const EYE = 1.8;

export class DistrictScene {
  readonly chunks: ChunkStream;
  private readonly renderer: WorldRenderer;
  private readonly waters: Mesh[] = [];
  private x = 0;
  private z = 0;
  /** The line the walks follow: the promenade when there is a bay, the middle of the district when not. */
  private readonly lineZ: number;

  /** The district's own words (the names of its places), by key: they travel with the pack, not with the game. */
  private readonly words: Readonly<Record<string, string>>;

  /** The vans on the district's linhas, when it has any and their model is built. */
  readonly traffic: Traffic | null;
  /** For a still: the moment the traffic and the people are shown at, in milliseconds, instead of now. */
  trafficAt: number | null = null;
  private lastUpdate = 0;
  /** For a film: added to the clock, so that the street's timetables run from a chosen moment. */
  private shift = 0;

  /** Lets time run, beginning at this moment of the timetables (milliseconds). */
  runFrom(ms: number): void {
    this.trafficAt = null;
    this.shift = ms - Date.now();
  }

  /** The people of the street, when the district has a timetable for them and they are built. */
  readonly crowd: Crowd | null;

  private constructor(renderer: WorldRenderer, chunks: ChunkStream, words: Readonly<Record<string, string>>, traffic: Traffic | null, crowd: Crowd | null) {
    this.traffic = traffic;
    this.crowd = crowd;
    this.words = words;
    this.renderer = renderer;
    this.chunks = chunks;
    for (const sheet of this.manifest.water) {
      const [minX, minZ, maxX, maxZ] = sheet.rect;
      const water = renderer.createWater(maxX - minX, maxZ - minZ);
      water.position.set((minX + maxX) / 2, sheet.level, (minZ + maxZ) / 2);
      renderer.scene.add(water);
      this.waters.push(water);
    }
    const bay = this.manifest.water[0];
    const { minZ, maxZ } = this.manifest.bounds;
    this.lineZ = bay ? bay.rect[1] - 7.2 : (minZ + maxZ) / 2;
    this.walk(0);
  }

  /** Opens the pack served at `base` (which ends with a slash). Rejects when there is no such pack. */
  static async open(renderer: WorldRenderer, base: string): Promise<DistrictScene> {
    const chunks = await ChunkStream.open(renderer, base);
    const words = JSON.parse(new TextDecoder().decode(await meteredFetch(base + chunks.manifest.strings))) as Record<string, string>;
    const [traffic, crowd] = await Promise.all([Traffic.open(renderer, base, chunks.manifest), Crowd.open(renderer, base, chunks.manifest)]);
    return new DistrictScene(renderer, chunks, words, traffic, crowd);
  }

  /** A word of the district, or the key itself when the pack does not have it. */
  word(key: string): string {
    return this.words[key] ?? key;
  }

  get manifest(): Manifest {
    return this.chunks.manifest;
  }

  private aim(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void {
    this.x = x;
    this.z = z;
    this.renderer.camera.position.set(x, y, z);
    // A phone held upright shows far more ground than sky at a level gaze: look up a little.
    const lift = this.renderer.camera.aspect < 1 ? Math.hypot(lookX - x, lookZ - z) * 0.14 : 0;
    this.renderer.camera.lookAt(lookX, lookY + lift, lookZ);
    // Shadows are drawn round what is being looked at, a little ahead of the viewer.
    this.renderer.setFocus(x + (lookX - x) * 0.25, 0, z + (lookZ - z) * 0.25);
  }

  /**
   * The bench's fixed path: a walk along the promenade at eye height, looking
   * ahead and slowly from the city to the bay and back, so every part of the
   * picture is measured. The same second always gives the same view.
   */
  walk(seconds: number): void {
    const { minX, maxX } = this.manifest.bounds;
    const x = (minX + maxX) / 2 - 35 + ((seconds * 2.2) % 70);
    this.aim(x, EYE, this.lineZ, x + 14, 2.4 + 1.5 * Math.cos(seconds * 0.2), this.lineZ + Math.sin(seconds * 0.35) * 16);
  }

  /** An unhurried walk from one end of the district to the other and back. */
  stroll(seconds: number): void {
    const { minX, maxX } = this.manifest.bounds;
    const span = Math.max(1, maxX - minX - 60);
    const along = (seconds * 3) % (span * 2);
    const forward = along < span;
    const x = minX + 30 + (forward ? along : span * 2 - along);
    this.aim(x, EYE, this.lineZ, x + (forward ? 20 : -20), 3.2, this.lineZ + 2.5);
  }

  /** One view worth a picture: down the promenade, the palms and the bay on one side and the town on the other. */
  postcard(): void {
    const { minX, maxX } = this.manifest.bounds;
    const x = (minX + maxX) / 2 - 24;
    this.aim(x, EYE, this.lineZ + 2.2, x + 30, 5.2, this.lineZ + 1.2);
  }

  /** Stands at a spot, in metres: [x, z] or [x, z, eye height], looking at another when one is given. */
  stand(at: readonly number[], look?: readonly number[]): void {
    const [x = 0, z = 0, y = EYE] = at;
    this.aim(x, y, z, look?.[0] ?? x + 20, look?.[2] ?? 3, look?.[1] ?? z + 2);
  }

  /** Call every frame, after placing the viewer: fetches, shows and lets go of chunks. */
  update(): void {
    this.chunks.update(this.x, this.z);
    const now = performance.now();
    const elapsed = this.lastUpdate === 0 ? 0 : now - this.lastUpdate;
    this.traffic?.update(this.trafficAt ?? Date.now() + this.shift, elapsed);
    this.crowd?.update(this.trafficAt ?? Date.now() + this.shift, elapsed, this.x, this.z, this.chunks.ground());
    this.lastUpdate = now;
  }

  state(): StreamState {
    return this.chunks.state();
  }

  /** Resolves when everything the viewer should have where they stand is on screen, or after a wait too long to be the network's fault. */
  settle(timeoutMs = 20_000): Promise<void> {
    return new Promise((done) => {
      const start = performance.now();
      const tick = (): void => {
        this.update();
        const { shown, wanted, loading } = this.state();
        if ((shown > 0 && shown === wanted && loading === 0) || performance.now() - start > timeoutMs) done();
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }

  close(): void {
    this.chunks.close();
    this.traffic?.close();
    this.crowd?.close();
    for (const water of this.waters) {
      this.renderer.scene.remove(water);
      water.geometry.dispose();
    }
  }
}
