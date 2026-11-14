// A person who moves. The body and its seventeen bones come from
// art/scripts/person.py; the movement is made here, by rule, from how fast
// the person is going and how far they have gone: a walk, a run and standing
// still are one continuous thing, with nothing to download and nothing to
// blend between.
//
// Angles are in radians about the body's own axes as it stands: x to its
// left, y up, z the way it faces. About x, a positive angle carries a leg
// backward and a negative one forward.

import { Bone, Group, Mesh, Quaternion, SkinnedMesh, Vector3, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type WorldRenderer } from "./world-renderer.ts";

export interface Gait {
  /** Metres a second over the ground, as actually travelled. */
  readonly speed: number;
  /** Where in the stride the person is: it advances by a full turn every two steps. */
  readonly phase: number;
  /** Seconds, for breathing and the small movements of standing. */
  readonly time: number;
}

interface Joint {
  readonly bone: Bone;
  readonly rest: Quaternion;
  /** The bone's direction in the body's axes at rest, and its inverse. */
  readonly world: Quaternion;
  readonly worldInverse: Quaternion;
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const turn = new Quaternion();
const step = new Quaternion();

export class Person {
  readonly root = new Group();
  /** Metres. */
  readonly height: number;
  /** A skirt, a pano or a dress shortens the stride. */
  readonly skirt: boolean;
  private readonly joints = new Map<string, Joint>();
  private readonly hipsRestY: number;
  private readonly mesh: SkinnedMesh;

  constructor(scene: Group, mesh: SkinnedMesh, height: number, skirt: boolean) {
    this.height = height;
    this.skirt = skirt;
    this.mesh = mesh;
    this.root.add(scene);
    scene.updateMatrixWorld(true);
    for (const bone of mesh.skeleton.bones) {
      const world = bone.getWorldQuaternion(new Quaternion());
      // The loader drops the dot from a name: "thigh.L" arrives as "thighL".
      this.joints.set(bone.name.replace(/[^A-Za-z]/g, ""), { bone, rest: bone.quaternion.clone(), world, worldInverse: world.clone().invert() });
    }
    this.hipsRestY = this.joints.get("hips")?.bone.position.y ?? 0;
    // A moving body's box is not where it was made: never let the renderer discard it by that box.
    mesh.frustumCulled = false;
  }

  /** Turns a bone from its rest by angles about the body's axes, x first, then z, then y. */
  private set(name: string, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name);
    if (!joint) return;
    turn.setFromAxisAngle(Y, y);
    if (z !== 0) turn.multiply(step.setFromAxisAngle(Z, z));
    if (x !== 0) turn.multiply(step.setFromAxisAngle(X, x));
    joint.bone.quaternion.copy(joint.rest).multiply(joint.worldInverse).multiply(turn).multiply(joint.world);
  }

  /** Puts the body in the pose of this moment of its gait. */
  pose(gait: Gait): void {
    const walk = Math.min(1, gait.speed / 1.3);
    const run = Math.min(1, Math.max(0, (gait.speed - 1.9) / 2.0));
    const still = 1 - walk;
    const stride = (0.4 * walk + 0.36 * run) * (this.skirt ? 0.62 : 1);
    const t = gait.time;
    const sway = Math.sin(gait.phase);

    // The trunk: the hips drop as the legs part, turn with the leading leg, and the chest turns back against them.
    const hips = this.joints.get("hips");
    if (hips) hips.bone.position.y = this.hipsRestY - (0.028 * walk + 0.03 * run) * Math.abs(sway) * (this.height / 1.7) - 0.004 * still * (1 + Math.sin(t * 1.5));
    this.set("hips", 0.02 * walk + 0.1 * run, -0.11 * walk * sway, 0.035 * walk * Math.cos(gait.phase) + 0.018 * still * Math.sin(t * 0.45));
    this.set("spine", 0.02 * walk + 0.07 * run + 0.01 * still * Math.sin(t * 1.5), 0.09 * walk * sway, -0.02 * walk * Math.cos(gait.phase) - 0.012 * still * Math.sin(t * 0.45));
    this.set("chest", 0.012 * Math.sin(t * 1.5 + 0.4) * still + 0.03 * run, 0.1 * walk * sway);
    this.set("neck", -0.02 * walk - 0.08 * run, -0.05 * walk * sway + 0.06 * still * Math.sin(t * 0.33));
    this.set("head", -0.03 * run, -0.03 * walk * sway + 0.05 * still * Math.sin(t * 0.33 + 0.8), 0.015 * still * Math.sin(t * 0.21));

    for (const [tag, side, phase] of [["L", 1, gait.phase], ["R", -1, gait.phase + Math.PI]] as const) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      // The leg: forward as its sine rises; the knee folds while it travels forward and is nearly straight on the ground.
      const thigh = -stride * s - 0.05 * walk - 0.16 * run;
      const lifting = Math.max(0, c);
      // A walk lifts the foot just clear of the ground; a run folds the leg; a skirt allows less of either.
      const knee = walk * (0.08 + (0.5 + 0.95 * run) * (this.skirt ? 0.7 : 1) * lifting ** 1.4) + 0.12 * run;
      this.set(`thigh${tag}`, thigh, 0, side * 0.012 * still);
      this.set(`shin${tag}`, knee);
      // The foot stays near level, the toe lifting a little as the heel comes down.
      this.set(`foot${tag}`, -(thigh + knee) * 0.55 - 0.12 * walk * Math.max(0, s) * (1 - lifting));
      // The arm: down from where it was made, swinging against its own leg, the elbow bending more at a run.
      const swing = stride * (0.75 + 0.35 * run) * s;
      this.set(`upperArm${tag}`, swing + 0.03 * still * Math.sin(t * 1.5 + side), 0, -side * (0.2 - 0.03 * run));
      this.set(`lowerArm${tag}`, -(0.16 + 0.1 * walk + 1.0 * run) - 0.3 * stride * Math.max(0, -s));
      this.set(`hand${tag}`, -0.1, 0, side * 0.06);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

/** Loads one person's model and dresses it in the world's palette. */
export async function loadPerson(renderer: WorldRenderer, url: string, height: number, skirt: boolean): Promise<Person> {
  const gltf = await new GLTFLoader().loadAsync(url);
  let body: SkinnedMesh | null = null;
  gltf.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    (node.material as Material).dispose();
    node.material = renderer.paletteMaterial;
    node.castShadow = true;
    node.receiveShadow = false;
    if (node instanceof SkinnedMesh) body = node;
  });
  if (!body) throw new Error(`${url} has no skeleton`);
  return new Person(gltf.scene, body, height, skirt);
}
