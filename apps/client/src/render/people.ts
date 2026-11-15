// The bodies of the game's people, loaded once and handed out. Each model is
// fetched the first time someone needs it; every further person with the
// same body is a copy that shares its shape and has its own skeleton.

import { Mesh, SkinnedMesh, type BufferGeometry, type Group, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { meteredFetch } from "../net/data-meter.ts";
import { Person } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";

const PEOPLE = "/packs/dev-people/";

export interface Listed {
  /** A person of the street has a role (zungueira, policia, cobrador...); one anybody may play has none. */
  readonly role?: string;
  readonly model: string;
  readonly height: number;
  readonly skirt: boolean;
  readonly female?: boolean;
}

export class People {
  private readonly renderer: WorldRenderer;
  private readonly list: readonly Listed[];
  private readonly models = new Map<string, Promise<Object3D>>();
  private readonly geometries = new Set<BufferGeometry>();

  private constructor(renderer: WorldRenderer, list: readonly Listed[]) {
    this.renderer = renderer;
    this.list = list;
  }

  /** Reads who there is. Rejects when the people are not built on this machine. */
  static async open(renderer: WorldRenderer): Promise<People> {
    const file = JSON.parse(new TextDecoder().decode(await meteredFetch(`${PEOPLE}pessoas.json`))) as { people: Listed[] };
    return new People(renderer, file.people);
  }

  /** Someone for a role ("any" is one of those anybody may play); `n` chooses among them. */
  pick(role: string, n: number): Listed | undefined {
    const fitting = this.list.filter((p) => (role === "any" ? !p.role : p.role === role));
    return fitting[((n % Math.max(1, fitting.length)) + fitting.length) % Math.max(1, fitting.length)];
  }

  /**
   * A body for them, with its own skeleton, wearing the world's palette. `light` is the same person in a
   * fifth of the triangles and a third of the download, for the far side of the street (D-0.30).
   */
  async make(who: Listed, light = false): Promise<Person | null> {
    const file = light ? who.model.replace(/\.glb$/, "-leve.glb") : who.model;
    let loading = this.models.get(file);
    if (!loading) {
      loading = meteredFetch(PEOPLE + file).then(async (bytes) => {
        const scene = (await new GLTFLoader().parseAsync(bytes, "")).scene;
        // The material the file came with is not used: every body wears the world's one palette.
        scene.traverse((node) => node instanceof Mesh && (node.material as Material).dispose());
        return scene;
      });
      this.models.set(file, loading);
    }
    const scene = cloneSkinned(await loading) as Group;
    const found: SkinnedMesh[] = [];
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.material = this.renderer.paletteMaterial;
      node.castShadow = true;
      node.receiveShadow = false;
      if (node instanceof SkinnedMesh) found.push(node);
    });
    const body = found[0];
    if (!body) return null;
    this.geometries.add(body.geometry);
    const person = new Person(scene, body, who.height, who.skirt);
    person.female = who.female === true;
    return person;
  }

  close(): void {
    for (const geometry of this.geometries) geometry.dispose();
  }
}
