// Streaming a district: the chunks round the player are fetched, nearest
// first, shown, and let go when they are left behind. The rules (which chunk,
// which model, when to drop) are `planStream` in packages/world; this file
// does the fetching and the showing.
//
// The frame is never held up: at most a few downloads run at once, the
// geometry is unpacked on worker threads, and no more than one chunk is put
// into the scene in any one frame.

import { type Ground, type WalkGrid } from "@nzila/sim";
import { STREAM, decodeWalkGrid, groundOf, planStream, type Manifest } from "@nzila/world/client";
import { Group, Mesh, type Material } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { meteredFetch } from "../net/data-meter.ts";
import { type WorldRenderer } from "./world-renderer.ts";

interface Held {
  /** The model file shown, or being fetched. */
  model: string;
  group: Group | null;
  grid: WalkGrid | null;
}

export interface StreamState {
  /** Chunks on screen. */
  readonly shown: number;
  /** Chunks on their way. */
  readonly loading: number;
  /** Chunks the player should have at this spot. */
  readonly wanted: number;
}

/** Unpacks a walk grid as a pack carries it: plain deflate, which every browser can undo by itself. */
async function inflate(packed: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let loader: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!loader) {
    // Unpack geometry off the main thread, so a chunk arriving never costs a frame.
    MeshoptDecoder.useWorkers(2);
    loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export class ChunkStream {
  readonly manifest: Manifest;
  private readonly renderer: WorldRenderer;
  private readonly base: string;
  private readonly held = new Map<string, Held>();
  private readonly ready: { id: string; model: string; group: Group }[] = [];
  private readonly fetching = new Set<string>();
  private wanted = 0;
  private groundCache: Ground | null = null;

  private constructor(renderer: WorldRenderer, base: string, manifest: Manifest) {
    this.renderer = renderer;
    this.base = base;
    this.manifest = manifest;
  }

  /** Opens a pack: downloads its manifest, which is all that is needed to start. `base` ends with a slash. */
  static async open(renderer: WorldRenderer, base: string): Promise<ChunkStream> {
    const manifest = JSON.parse(new TextDecoder().decode(await meteredFetch(`${base}manifest.json`))) as Manifest;
    return new ChunkStream(renderer, base, manifest);
  }

  /**
   * Call every frame with where the player is, in metres. Starts what should
   * be fetched, shows at most one chunk that has arrived, drops what is far.
   */
  update(x: number, z: number): void {
    const rule = STREAM[this.renderer.tier.name];
    const loaded = new Map<string, string>();
    for (const [id, held] of this.held) loaded.set(id, held.model);
    const plan = planStream(this.manifest.chunks, x, z, rule, loaded);
    this.wanted = plan.want.length;

    for (const id of plan.drop) this.drop(id);

    // One arrival a frame goes into the scene: the nearest of those waiting.
    const next = this.ready.shift();
    if (next) {
      const held = this.held.get(next.id);
      // It may have been dropped, or asked for at another detail, while it was on its way.
      if (held && held.model === next.model) {
        if (held.group) this.remove(held.group);
        held.group = next.group;
        this.renderer.scene.add(next.group);
      } else {
        this.dispose(next.group);
      }
    }

    for (const want of plan.want) {
      if (this.fetching.size >= rule.parallel) break;
      const held = this.held.get(want.id);
      if (held && held.model === want.model) continue;
      if (this.fetching.has(want.id)) continue;
      const chunk = this.manifest.chunks.find((c) => c.id === want.id)!;
      if (held) held.model = want.model;
      else this.held.set(want.id, { model: want.model, group: null, grid: null });
      void this.fetch(want.id, want.model, held ? null : chunk.walkGrid);
    }
  }

  private async fetch(id: string, model: string, walkGrid: string | null): Promise<void> {
    this.fetching.add(id);
    try {
      const [bytes, gridBytes] = await Promise.all([meteredFetch(this.base + model), walkGrid ? meteredFetch(this.base + walkGrid) : null]);
      const gltf = await gltfLoader().parseAsync(bytes, "");
      const group = new Group();
      const palette = this.renderer.paletteMaterial;
      gltf.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        // Models coloured from the palette all share the game's one material, whatever the file carried.
        const own = node.material as Material;
        if (own.name.startsWith("palette")) {
          own.dispose();
          node.material = palette;
        }
        node.castShadow = node.receiveShadow = true;
      });
      group.add(gltf.scene);
      group.name = id;
      const held = this.held.get(id);
      if (held && gridBytes) {
        held.grid = decodeWalkGrid(await inflate(gridBytes));
        this.groundCache = null;
      }
      this.ready.push({ id, model, group });
    } catch (error) {
      // A chunk that fails is asked for again on a later frame: mobile networks drop.
      const held = this.held.get(id);
      if (held && !held.group) this.held.delete(id);
      console.warn(`chunk ${id} did not arrive`, error);
    } finally {
      this.fetching.delete(id);
    }
  }

  private dispose(group: Group): void {
    group.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }

  private remove(group: Group): void {
    this.renderer.scene.remove(group);
    this.dispose(group);
  }

  private drop(id: string): void {
    const held = this.held.get(id);
    if (!held) return;
    if (held.group) this.remove(held.group);
    this.held.delete(id);
    this.groundCache = null;
  }

  /** The ground of every chunk that has arrived, for the character controller. Null until the first one has. */
  ground(): Ground | null {
    if (!this.groundCache) {
      const grids = [...this.held.values()].map((held) => held.grid).filter((grid) => grid !== null);
      if (grids.length === 0) return null;
      this.groundCache = groundOf(grids);
    }
    return this.groundCache;
  }

  state(): StreamState {
    let shown = 0;
    for (const held of this.held.values()) if (held.group) shown++;
    return { shown, loading: this.fetching.size + this.ready.length, wanted: this.wanted };
  }

  /** Lets go of everything. */
  close(): void {
    for (const id of [...this.held.keys()]) this.drop(id);
    for (const waiting of this.ready.splice(0)) this.dispose(waiting.group);
  }
}
