// A dog that moves (the rafeiro of art/scripts/person.py). Like a person, its movement is made here by rule from
// how fast it goes and how far it has gone: a walk and a trot are one continuous thing, the diagonal legs
// together; still for a while, it lies down where it is, as the dogs of the street do in the shade.

import { Bone, Group, Mesh, Quaternion, SkinnedMesh, Vector3, type Material } from "three";
import { type Gait } from "./person.ts";
import { type WorldRenderer } from "./world-renderer.ts";
import { modelLoader } from "./model-loader.ts";

interface Joint {
  readonly bone: Bone;
  readonly rest: Quaternion;
  readonly world: Quaternion;
  readonly worldInverse: Quaternion;
  readonly angles: [number, number, number];
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const turn = new Quaternion();
const step = new Quaternion();
const ease = (u: number): number => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};
/** Seconds still before it lies down, and how long lying down or getting up takes. */
const LIE_AFTER_S = 4;
const LIE_TAKES_S = 1.1;

export class Dog {
  readonly root = new Group();
  /** Metres at the top of the head. */
  readonly height: number;
  readonly skirt = false;
  readonly female = false;
  seed = 0;
  private readonly joints = new Map<string, Joint>();
  private readonly bodyRestY: number;
  private readonly mesh: SkinnedMesh;
  private stillFrom: number | null = null;
  private lying = 0;
  private lastTime: number | null = null;

  constructor(scene: Group, mesh: SkinnedMesh, height: number) {
    this.height = height;
    this.mesh = mesh;
    this.root.add(scene);
    scene.updateMatrixWorld(true);
    for (const bone of mesh.skeleton.bones) {
      const world = bone.getWorldQuaternion(new Quaternion());
      this.joints.set(bone.name.replace(/[^A-Za-z]/g, ""), { bone, rest: bone.quaternion.clone(), world, worldInverse: world.clone().invert(), angles: [0, 0, 0] });
    }
    this.bodyRestY = this.joints.get("body")?.bone.position.y ?? 0;
    mesh.frustumCulled = false;
  }

  private set(name: string, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name);
    if (!joint) return;
    joint.angles[0] = x;
    joint.angles[1] = y;
    joint.angles[2] = z;
  }

  private toward(name: string, amount: number, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name);
    if (!joint || amount <= 0) return;
    joint.angles[0] += (x - joint.angles[0]) * amount;
    joint.angles[1] += (y - joint.angles[1]) * amount;
    joint.angles[2] += (z - joint.angles[2]) * amount;
  }

  /** Puts the dog in the pose of this moment. (A person's second argument, what they are doing, a dog does not need.) */
  pose(gait: Gait): void {
    const t = gait.time;
    const walk = Math.min(1, gait.speed / 1.2);
    const run = Math.min(1, Math.max(0, (gait.speed - 1.8) / 2.2));
    // Lying down after a while still, getting up at once when it moves.
    const moving = gait.speed > 0.1;
    if (moving) this.stillFrom = null;
    else this.stillFrom ??= t;
    const want = !moving && this.stillFrom !== null && t - this.stillFrom > LIE_AFTER_S + (this.seed % 3) ? 1 : 0;
    const dt = this.lastTime === null ? 0 : Math.min(0.2, Math.max(0, t - this.lastTime));
    this.lastTime = t;
    this.lying = moving ? Math.max(0, this.lying - dt * 4) : this.lying + (want - this.lying) * Math.min(1, dt / LIE_TAKES_S * 2.5);
    const lie = ease(this.lying);

    // The legs: diagonal pairs together; each reaches forward as its sine rises and folds as it comes through.
    const amp = 0.32 * walk + 0.28 * run;
    for (const [tag, offset] of [["FL", 0], ["BR", 0], ["FR", Math.PI], ["BL", Math.PI]] as const) {
      const p = gait.phase + offset;
      const s = Math.sin(p);
      const lifting = Math.max(0, Math.cos(p));
      const front = tag[0] === "F";
      this.set(`leg${tag}`, -amp * s, 0, 0);
      // A front leg folds back at the wrist as it lifts; a hind leg flexes at the hock.
      this.set(`paw${tag}`, (front ? 0.75 : -0.55) * lifting * walk);
    }
    // The body rises and falls with each step; the head nods against it; the tail goes.
    const bob = Math.abs(Math.sin(gait.phase)) * (0.012 * walk + 0.02 * run);
    this.set("body", 0, 0.03 * walk * Math.sin(gait.phase), 0);
    this.set("neck", -0.05 * run + 0.04 * walk * Math.sin(gait.phase * 2) + 0.06 * (1 - walk) * Math.sin(t * 0.4 + this.seed), 0.2 * (1 - walk) * Math.sin(t * 0.23 + this.seed));
    this.set("head", 0.03 * Math.sin(t * 1.3), 0.1 * (1 - walk) * Math.sin(t * 0.31 + this.seed * 2));
    // Happy and quick while it goes; slow when it stands; a lazy thump now and then lying down.
    const wag = moving ? Math.sin(t * 11) * 0.45 : Math.sin(t * 4.2) * 0.25 * (1 - lie) + Math.max(0, Math.sin(t * 0.7)) ** 6 * Math.sin(t * 9) * 0.3 * lie;
    this.set("tail", 0, wag, 0);

    // Lying down: the front legs out ahead on the ground, the hind legs folded under, the head lower, the tail down.
    if (lie > 0) {
      for (const tag of ["FL", "FR"] as const) {
        this.toward(`leg${tag}`, lie, -1.45);
        this.toward(`paw${tag}`, lie, 0.05);
      }
      for (const [tag, side] of [["BL", 1], ["BR", -1]] as const) {
        this.toward(`leg${tag}`, lie, -1.2, 0, side * 0.25);
        this.toward(`paw${tag}`, lie, 2.3);
      }
      this.toward("neck", lie, 0.35, 0.25 * Math.sin(t * 0.15 + this.seed));
      this.toward("head", lie, -0.2);
      this.toward("tail", lie, 1.0, wag, 0);
    }

    const body = this.joints.get("body");
    if (body) body.bone.position.y = this.bodyRestY - bob - lie * 0.27;
    for (const joint of this.joints.values()) {
      const [x, y, z] = joint.angles;
      turn.setFromAxisAngle(Y, y);
      if (z !== 0) turn.multiply(step.setFromAxisAngle(Z, z));
      if (x !== 0) turn.multiply(step.setFromAxisAngle(X, x));
      joint.bone.quaternion.copy(joint.rest).multiply(joint.worldInverse).multiply(turn).multiply(joint.world);
    }
  }

  set shadow(on: boolean) {
    this.mesh.castShadow = on;
  }

  release(): void {
    this.mesh.skeleton.dispose();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

/** Loads one dog's model and dresses it in the world's palette (the pose page; the street uses `People`). */
export async function loadDog(renderer: WorldRenderer, url: string, height: number): Promise<Dog> {
  const gltf = await modelLoader().loadAsync(url);
  let body: SkinnedMesh | null = null;
  gltf.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    (node.material as Material).dispose();
    node.material = renderer.paletteMaterial;
    node.castShadow = true;
    if (node instanceof SkinnedMesh) body = node;
  });
  if (!body) throw new Error(`${url} has no skeleton`);
  return new Dog(gltf.scene, body, height);
}
