// A person who moves. The body and its seventeen bones come from
// art/scripts/person.py; the movement is made here, by rule, from how fast
// the person is going and how far they have gone: a walk, a run and standing
// still are one continuous thing, with nothing to download and nothing to
// blend between. Gestures and sitting are laid over that.
//
// Angles are in radians about the body's own axes as it stands: x to its
// left, y up, z the way it faces. About x, a positive angle carries a leg
// backward and a negative one forward. About z, a negative angle lifts the
// right arm out and up, a positive one the left.

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

/**
 * The gestures a player can make. Dançar is kuduro, keyed by hand from stills of two films the
 * founder supplied on 2026-11-15 (a boy dancing in a ring of people on a Cazenga street; two
 * dancers in a sala): the low bounce on bent knees with the knees opening and closing, the fist
 * pumped overhead, the deep squat with the arms thrown forward, the lean from side to side.
 */
export const EMOTES = ["acenar", "rir", "aplaudir", "chamar", "dancar"] as const;
export type Emote = (typeof EMOTES)[number];
/** How long each lasts, in seconds. */
export const EMOTE_SECONDS: Readonly<Record<Emote, number>> = { acenar: 2.4, rir: 2.6, aplaudir: 2.6, chamar: 2.2, dancar: 9.6 };

export interface Doing {
  /** A gesture under way, and the seconds since it began. */
  readonly emote?: { readonly kind: Emote; readonly seconds: number };
  /** 0 standing, 1 seated; between the two while sitting down or getting up. */
  readonly sit?: number;
  /** How far through a jump: above 0 and below 1 in the air. */
  readonly jump?: number;
  /** 1 as the feet come down, falling to 0 as the knees take the landing. */
  readonly land?: number;
}

interface Joint {
  readonly bone: Bone;
  readonly rest: Quaternion;
  /** The bone's direction in the body's axes at rest, and its inverse. */
  readonly world: Quaternion;
  readonly worldInverse: Quaternion;
  /** The angles asked for this frame: about x, y and z. */
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

export class Person {
  readonly root = new Group();
  /** Metres. */
  readonly height: number;
  /** A skirt, a pano or a dress shortens the stride. */
  readonly skirt: boolean;
  private readonly joints = new Map<string, Joint>();
  private readonly hipsRestY: number;
  private readonly mesh: SkinnedMesh;

  /** A woman's Dançar works the hips (founder, 2026-11-15). */
  female = false;

  constructor(scene: Group, mesh: SkinnedMesh, height: number, skirt: boolean) {
    this.height = height;
    this.skirt = skirt;
    this.mesh = mesh;
    this.root.add(scene);
    scene.updateMatrixWorld(true);
    for (const bone of mesh.skeleton.bones) {
      const world = bone.getWorldQuaternion(new Quaternion());
      // The loader drops the dot from a name: "thigh.L" arrives as "thighL".
      this.joints.set(bone.name.replace(/[^A-Za-z]/g, ""), { bone, rest: bone.quaternion.clone(), world, worldInverse: world.clone().invert(), angles: [0, 0, 0] });
    }
    this.hipsRestY = this.joints.get("hips")?.bone.position.y ?? 0;
    // A moving body's box is not where it was made: never let the renderer discard it by that box.
    mesh.frustumCulled = false;
  }

  /** Asks a bone to turn from its rest by angles about the body's axes. */
  private set(name: string, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name);
    if (!joint) return;
    joint.angles[0] = x;
    joint.angles[1] = y;
    joint.angles[2] = z;
  }

  /** Moves what was asked of a bone toward other angles: 0 leaves it, 1 replaces it. */
  private toward(name: string, amount: number, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name);
    if (!joint || amount <= 0) return;
    joint.angles[0] += (x - joint.angles[0]) * amount;
    joint.angles[1] += (y - joint.angles[1]) * amount;
    joint.angles[2] += (z - joint.angles[2]) * amount;
  }

  /** Puts the body in the pose of this moment. */
  pose(gait: Gait, doing: Doing = {}): void {
    const walk = Math.min(1, gait.speed / 1.3);
    const run = Math.min(1, Math.max(0, (gait.speed - 1.9) / 2.0));
    const still = 1 - walk;
    const stride = (0.4 * walk + 0.36 * run) * (this.skirt ? 0.62 : 1);
    const t = gait.time;
    const sway = Math.sin(gait.phase);
    const scale = this.height / 1.7;

    // The trunk: the hips drop as the legs part, turn with the leading leg, and the chest turns back against them.
    let hipsY = this.hipsRestY - (0.028 * walk + 0.03 * run) * Math.abs(sway) * scale - 0.004 * still * (1 + Math.sin(t * 1.5));
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

    // Seated: thighs level, shins down, hands on the knees, the back a little eased.
    const sit = ease(doing.sit ?? 0);
    if (sit > 0) {
      hipsY -= sit * (0.9 - 0.56) * scale;
      this.toward("hips", sit, -0.08);
      this.toward("spine", sit, 0.06 + 0.01 * Math.sin(t * 1.5));
      for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
        this.toward(`thigh${tag}`, sit, -1.5, 0, side * (this.skirt ? 0.02 : 0.1));
        this.toward(`shin${tag}`, sit, 1.45);
        this.toward(`foot${tag}`, sit, 0.05);
        this.toward(`upperArm${tag}`, sit, -0.42, 0, -side * 0.16);
        this.toward(`lowerArm${tag}`, sit, -0.95, -side * 0.25);
      }
    }

    // A gesture, eased in and out over whatever the body was doing.
    const emote = doing.emote;
    if (emote) {
      const length = EMOTE_SECONDS[emote.kind];
      const e = ease(emote.seconds / 0.28) * ease((length - emote.seconds) / 0.32);
      const u = emote.seconds;
      if (emote.kind === "acenar") {
        // The right arm up and out, the forearm going from side to side.
        this.toward("upperArmR", e, -0.1, 0, -2.25);
        this.toward("lowerArmR", e, -0.25, 0, -0.35 + 0.5 * Math.sin(u * 9.5));
        this.toward("handR", e, 0, 0, 0.25 * Math.sin(u * 9.5 + 0.6));
        this.toward("head", e * 0.7, -0.05, -0.12, -0.06);
        this.toward("chest", e * 0.5, 0, -0.06, -0.04);
      } else if (emote.kind === "aplaudir") {
        const clap = Math.sin(u * 15);
        for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
          // Hands meet in front of the chest and part again.
          this.toward(`upperArm${tag}`, e, -0.62, 0, -side * 0.3);
          this.toward(`lowerArm${tag}`, e, -1.2, -side * (0.36 + 0.13 * clap));
          this.toward(`hand${tag}`, e, -0.1, -side * 0.2);
        }
        this.toward("head", e * 0.6, -0.06 + 0.02 * clap);
      } else if (emote.kind === "rir") {
        const shake = Math.sin(u * 17);
        // Thrown back, the shoulders shaking, a hand to the belly.
        this.toward("spine", e, -0.1 + 0.025 * shake);
        this.toward("chest", e, -0.12 + 0.035 * shake);
        this.toward("head", e, -0.3 + 0.05 * shake, 0.08 * Math.sin(u * 2.2));
        this.toward("upperArmL", e, -0.35, 0, -0.3);
        this.toward("lowerArmL", e, -1.5, -0.7);
        this.toward("upperArmR", e, 0.1 + 0.04 * shake, 0, 0.26);
        hipsY -= e * 0.012 * (1 + shake) * scale;
      } else if (emote.kind === "dancar") {
        // Four figures of 2.4 seconds, each melting into the next, at about 150 beats a minute.
        const beat = u * 15.7;
        const half = Math.sin(beat / 2);
        const part = (u % 9.6) / 2.4;
        const weight = (n: number): number => ease(1 - Math.min(Math.abs(part - n - 0.5), 4 - Math.abs(part - n - 0.5)) + 0.5);
        const bounce = weight(0);
        const pump = weight(1);
        const squat = weight(2);
        const lean = weight(3);
        const dip = 0.06 * Math.abs(Math.sin(beat));
        let drop = 9;
        for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
          const mine = Math.max(0, half * side);
          // Knees bent throughout, opening and closing; one foot and then the other comes off the ground.
          const thigh = -(0.42 + dip + 0.32 * mine * (bounce + pump) + 0.7 * squat + 0.16 * lean * mine);
          const shin = 0.84 + 2 * dip + 0.5 * mine * (bounce + pump) + 1.0 * squat + 0.3 * lean * mine;
          const open = side * (0.1 + 0.22 * (0.5 + 0.5 * Math.sin(beat)) * (bounce + pump) + 0.34 * squat + 0.16 * lean) + 0.2 * lean * half;
          this.toward(`thigh${tag}`, e, thigh, 0, open);
          this.toward(`shin${tag}`, e, shin);
          this.toward(`foot${tag}`, e, -(thigh + shin) * 0.9);
          drop = Math.min(drop, 0.4 * (1 - Math.cos(thigh)) + 0.41 * (1 - Math.cos(shin + thigh)));
          // The arms: loose and pumping; then one fist overhead; then both thrown forward; then swung to the side of the lean.
          const loose = 0.55 * half * side;
          this.toward(`upperArm${tag}`, e * (bounce + lean), loose - 0.15 + 0.5 * lean * half * side, 0, side * (0.12 + 0.3 * lean * Math.max(0, half * side)));
          this.toward(`lowerArm${tag}`, e * (bounce + lean), -1.15 - 0.3 * Math.sin(beat));
          this.toward(`upperArm${tag}`, e * squat, -1.25 + 0.12 * Math.sin(beat), 0, side * 0.2);
          this.toward(`lowerArm${tag}`, e * squat, -0.35 - 0.3 * Math.max(0, Math.sin(beat)));
        }
        this.toward("upperArmR", e * pump, -0.25, 0, -2.5 - 0.12 * Math.sin(beat));
        this.toward("lowerArmR", e * pump, -0.55 - 0.45 * Math.max(0, Math.sin(beat)));
        this.toward("upperArmL", e * pump, 0.25, 0, 0.3);
        this.toward("lowerArmL", e * pump, -1.3);
        // The trunk leans in and works against the hips.
        this.toward("hips", e, 0.12 + 0.2 * squat, -0.22 * half * (bounce + pump), 0.1 * half * (bounce + pump) + 0.22 * lean * half);
        this.toward("spine", e, 0.2 + 0.22 * squat + 0.05 * Math.sin(beat), 0.2 * half * (bounce + pump), -0.14 * lean * half);
        this.toward("chest", e, 0.1 + 0.06 * Math.sin(beat + 1), 0.16 * half * bounce, -0.1 * lean * half);
        this.toward("neck", e, -0.2 - 0.2 * squat);
        this.toward("head", e, -0.08 + 0.07 * Math.sin(beat), -0.1 * half * (bounce + lean), 0.08 * lean * half);
        if (this.female) {
          // Her third figure: knees bent, leaning in with a hand on each knee, the back held, and the hips
          // tilting up and down on the beat.
          const work = Math.sin(beat);
          this.toward("hips", e * squat, 0.42 + 0.3 * work, 0, 0.05 * half);
          this.toward("spine", e * squat, 0.2 - 0.27 * work);
          this.toward("chest", e * squat, -0.12 - 0.03 * work);
          this.toward("neck", e * squat, -0.34);
          for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
            // A leg hangs from the hips, so it is turned back by as much as the hips tilt: the knees and the
            // feet stay where they are while the hips move.
            this.toward(`thigh${tag}`, e * squat, -1.0 - (0.42 + 0.3 * work), 0, side * 0.3);
            this.toward(`shin${tag}`, e * squat, 1.35);
            this.toward(`foot${tag}`, e * squat, -0.35);
            // The arms straight down to the knees, and staying there while the hips move.
            this.toward(`upperArm${tag}`, e * squat, -0.72, 0, -side * 0.12);
            this.toward(`lowerArm${tag}`, e * squat, -0.06);
            this.toward(`hand${tag}`, e * squat, 0.35, 0, 0);
          }
          drop += squat * (0.4 * (1 - Math.cos(1.0)) + 0.41 * (1 - Math.cos(0.35)) - drop);
        }
        hipsY -= e * drop * scale;
      } else {
        // Chamar: the arm out in front, palm down, the hand folding toward the body again and again.
        const beckon = Math.max(0, Math.sin(u * 8));
        this.toward("upperArmR", e, -1.35, 0, -0.1);
        this.toward("lowerArmR", e, -0.25 - 0.75 * beckon);
        this.toward("handR", e, 0.5 - 0.9 * beckon);
        this.toward("head", e * 0.7, 0.06, 0.05);
        this.toward("chest", e * 0.5, 0.05);
      }
    }

    // In the air. From standing or a walk, both knees come up and both arms are thrown up; from a run it
    // is a stride held in the air, one leg reaching and the other trailing, the arms against the legs.
    const jump = doing.jump ?? 0;
    if (jump > 0 && jump < 1) {
      const e = ease(jump / 0.14) * ease((1 - jump) / 0.14);
      const top = Math.sin(Math.PI * jump);
      const less = this.skirt ? 0.6 : 1;
      const lead = Math.sin(gait.phase) >= 0 ? 1 : -1;
      for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
        const front = side === lead;
        const thigh = (1 - run) * -1.05 * top * less + run * (front ? -1.15 : 0.6) * less * (0.45 + 0.55 * top);
        const shin = (1 - run) * 1.55 * top * less + run * (front ? 0.55 : 1.25) * top * less;
        this.toward(`thigh${tag}`, e, thigh, 0, side * 0.05);
        this.toward(`shin${tag}`, e, shin);
        this.toward(`foot${tag}`, e, 0.35);
        const arm = (1 - run) * -(0.5 + 1.7 * top) + run * (front ? 0.75 : -1.25);
        this.toward(`upperArm${tag}`, e, arm, 0, -side * 0.24);
        this.toward(`lowerArm${tag}`, e, -0.45 - 0.6 * run);
      }
      this.toward("hips", e, 0.06 + 0.1 * run);
      this.toward("spine", e, 0.08 + 0.1 * run);
      this.toward("chest", e, 0.04);
      this.toward("head", e, -0.1);
    }
    // Coming down: the knees give and the back follows.
    const land = ease(doing.land ?? 0);
    if (land > 0) {
      for (const tag of ["L", "R"] as const) {
        this.toward(`thigh${tag}`, land, -0.5);
        this.toward(`shin${tag}`, land, 0.95);
        this.toward(`foot${tag}`, land, -0.45);
      }
      this.toward("spine", land * 0.7, 0.2);
      hipsY -= land * 0.09 * scale;
    }

    const hips = this.joints.get("hips");
    if (hips) hips.bone.position.y = hipsY;
    for (const joint of this.joints.values()) {
      const [x, y, z] = joint.angles;
      // About y first, then z, then x: the order a body turns, leans and then bends in.
      turn.setFromAxisAngle(Y, y);
      if (z !== 0) turn.multiply(step.setFromAxisAngle(Z, z));
      if (x !== 0) turn.multiply(step.setFromAxisAngle(X, x));
      joint.bone.quaternion.copy(joint.rest).multiply(joint.worldInverse).multiply(turn).multiply(joint.world);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

/** Loads one person's model and dresses it in the world's palette. */
export async function loadPerson(renderer: WorldRenderer, url: string, height: number, skirt: boolean, female = false): Promise<Person> {
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
  const person = new Person(gltf.scene, body, height, skirt);
  person.female = female;
  return person;
}
