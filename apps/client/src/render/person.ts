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

import { EMOTE_NAMES, type EmoteName } from "@nzila/protocol";
import { Bone, Group, Mesh, MeshBasicMaterial, Quaternion, SkinnedMesh, Vector3, type Material } from "three";
import { type WorldRenderer } from "./world-renderer.ts";
import { modelLoader } from "./model-loader.ts";

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
/** The gestures, as the protocol numbers them: what one phone makes, another must be able to draw. */
export const EMOTES = EMOTE_NAMES;
export type Emote = EmoteName;
/** How long each lasts, in seconds. */
export const EMOTE_SECONDS: Readonly<Record<Emote, number>> = { acenar: 2.4, rir: 2.6, aplaudir: 2.6, chamar: 2.2, dancar: 9.6 };

/** What holds a thing in a body's hand: it poses the arm (with `toward`), and puts the thing right once the bones are set. */
export interface Holding {
  arms(person: Person): void;
  after(person: Person): void;
}

export interface Doing {
  /** A gesture under way, and the seconds since it began. */
  readonly emote?: { readonly kind: Emote; readonly seconds: number };
  /** 0 standing, 1 seated; between the two while sitting down or getting up. */
  readonly sit?: number;
  /** How far through a jump: above 0 and below 1 in the air. */
  readonly jump?: number;
  /** 1 as the feet come down, falling to 0 as the knees take the landing. */
  readonly land?: number;
  /** Something held: a fishing rod out over the water, or a hand up to the bacia on the head. */
  readonly hold?: "cana" | "bacia" | "guiador";
  /** Something in the hand whose pose is its own (a thing given, presente.ts): asked for the arms before the body is set, and again after. */
  readonly holding?: Holding;
  /** 0 to 1: seated low, on a little bench or a kerb, knees up and forearms on them. Over and above `sit`. */
  readonly low?: number;
  /**
   * How the arms rest, asked for outright (the pose page does). Left out, a body still for a few seconds finds
   * its own: standing, the arms crossed or the hands on the hips; seated, the hands on the thighs, the arms
   * crossed, the elbows on the knees. Each person in their own order and time.
   */
  readonly rest?: Rest | null;
}

/** The ways arms rest. "coxas", "joelhos" only seated. */
export type Rest = "cruzados" | "cintura" | "coxas" | "joelhos";
/** What a standing body and a seated one turn to, in turn; null is the arms simply hanging. */
const STANDING_RESTS: readonly (Rest | null)[] = [null, "cruzados", null, "cintura", null, "cruzados"];
const SEATED_RESTS: readonly Rest[] = ["coxas", "cruzados", "coxas", "joelhos", "coxas", "cruzados"];
/** Seconds still before a body first rests its arms; how long each way of resting lasts; how long a change takes. */
const REST_AFTER_S = 3.5;
const REST_EACH_S = 9;
const REST_EASE_S = 0.7;

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

/** The gestures, once they have been fetched; and the fetching of them. */
let dance: Record<Emote, (person: Person, e: number, u: number) => number> | null = null;
let dancing: Promise<void> | null = null;

/** What a body that is only its shadow is painted with: nothing. */
let unseen: MeshBasicMaterial | null = null;

/** Above this speed (metres a second) a body runs; at or below it, it walks. */
export const RUNS_ABOVE_M_S = 3.2;

/**
 * How far a body goes in one stride (two steps), in metres: longer for a taller body, shorter in a skirt, much
 * longer at a run. The legs are posed by how far the body has gone over this, so the feet keep to the ground.
 */
export function strideOf(speed: number, height: number, skirt: boolean): number {
  return (speed > RUNS_ABOVE_M_S ? 2.8 : 1.62) * (height / 1.7) * (skirt ? 0.8 : 1);
}

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
  /** Makes this body's ways of resting its own: two people side by side do not cross their arms together. */
  seed = 0;
  /** When this body last moved, in its own seconds; and how it rests now, eased. */
  private stillFrom: number | null = null;

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

  /** One of the body's bones, by its name ("handR"). */
  bone(name: string): Bone | undefined {
    return this.joints.get(name)?.bone;
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
  toward(name: string, amount: number, x: number, y = 0, z = 0): void {
    const joint = this.joints.get(name);
    if (!joint || amount <= 0) return;
    joint.angles[0] += (x - joint.angles[0]) * amount;
    joint.angles[1] += (y - joint.angles[1]) * amount;
    joint.angles[2] += (z - joint.angles[2]) * amount;
  }

  /** Puts the body in the pose of this moment. */
  pose(gait: Gait, doing: Doing = {}): void {
    const walk = Math.min(1, gait.speed / 1.3);
    // A brisk walk is still a walk: the run begins above it.
    const run = Math.min(1, Math.max(0, (gait.speed - 2.6) / 2.4));
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
      // The arm: down from where it was made, swinging against its own leg from the shoulder; the forearm follows a
      // moment late, bending as the arm comes forward and opening as it goes back; more of all of it at a run.
      const swing = stride * (0.8 + 0.4 * run) * s;
      const late = Math.sin(phase - 0.45);
      this.set(`upperArm${tag}`, swing + 0.03 * still * Math.sin(t * 1.5 + side), side * 0.05 * walk * s, -side * (0.2 - 0.04 * run));
      this.set(`lowerArm${tag}`, -(0.2 + 0.18 * walk + 1.05 * run) - (0.42 * walk + 0.25 * run) * Math.max(0, -late) * (stride / 0.4), -side * 0.12 * walk);
      this.set(`hand${tag}`, -0.12 - 0.08 * walk * Math.max(0, -late), side * 0.1, side * 0.06);
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
        // The hands lie on the thighs: the upper arm nearly straight down, the forearm down and forward to the lap.
        this.toward(`upperArm${tag}`, sit, -0.26, 0, -side * 0.1);
        this.toward(`lowerArm${tag}`, sit, -0.85, 0, -side * 0.32);
        this.toward(`hand${tag}`, sit, -0.35, 0, -side * 0.1);
      }
    }

    // Seated low: the hips nearly to the ground, the knees up and apart, the back rounded forward.
    const low = ease(doing.low ?? 0);
    if (low > 0) {
      hipsY -= low * 0.27 * scale;
      this.toward("hips", low, -0.05);
      this.toward("spine", low, 0.22);
      this.toward("chest", low, 0.12);
      for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
        this.toward(`thigh${tag}`, low, -1.98, 0, side * (this.skirt ? 0.16 : 0.3));
        this.toward(`shin${tag}`, low, 2.12);
        this.toward(`foot${tag}`, low, -0.1);
        this.toward(`upperArm${tag}`, low, -0.78, 0, -side * 0.1);
        this.toward(`lowerArm${tag}`, low, -0.7, -side * 0.35);
      }
    }

    // The arms at rest, when the body is still: crossed, on the hips, on the thighs, on the knees.
    const resting = this.rested(gait, doing, sit, low);
    if (resting) {
      const [rest, r] = resting;
      if (rest === "cruzados") {
        // Folded over the chest, the forearms one above the other, each hand on the other arm.
        for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
          this.toward(`upperArm${tag}`, r, -0.5, 0, side * 0.12);
          this.toward(`lowerArm${tag}`, r, side > 0 ? -1.62 : -1.5, -side * 1.3, 0);
          this.toward(`hand${tag}`, r, 0.1, 0, side * 0.2);
        }
        this.toward("chest", r * 0.5, -0.03);
        this.toward("head", r * 0.5, -0.04, 0.04 * Math.sin(t * 0.3));
      } else if (rest === "cintura") {
        // Hands on the hips, the elbows out: someone waiting, and not in a hurry.
        for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
          this.toward(`upperArm${tag}`, r, 0.12, 0, side * 0.62);
          this.toward(`lowerArm${tag}`, r, -0.35, 0, -side * 1.45);
          this.toward(`hand${tag}`, r, 0, 0, -side * 0.35);
        }
        this.toward("hips", r * 0.6, 0, 0.04, 0.04);
        this.toward("head", r * 0.5, -0.05, -0.08);
      } else if (rest === "joelhos") {
        // Leaning forward, the elbows on the knees and the hands together in front.
        this.toward("spine", r, 0.38);
        this.toward("chest", r, 0.18);
        this.toward("neck", r, -0.3);
        this.toward("head", r, -0.12);
        for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
          this.toward(`upperArm${tag}`, r, -0.12, 0, -side * 0.02);
          this.toward(`lowerArm${tag}`, r, -1.55, -side * 0.55, 0);
          this.toward(`hand${tag}`, r, -0.2, side * 0.2, 0);
        }
      }
      // "coxas" is the seated pose itself.
    }

    // A gesture, eased in and out over whatever the body was doing.
    const emote = doing.emote;
    if (emote) {
      const length = EMOTE_SECONDS[emote.kind];
      const e = ease(emote.seconds / 0.28) * ease((length - emote.seconds) / 0.32);
      const u = emote.seconds;
      // The gestures are fetched the first time anybody makes one (dancar.ts); until they have come, the body waits a moment.
      if (dance) hipsY -= e * dance[emote.kind](this, e, u) * scale;
      // Not come (a weak line, a page being left): asked for again at the next gesture, and no error of it.
      else dancing ??= import("./dancar.ts").then((module) => void (dance = module), () => void (dancing = null));
    }

    doing.holding?.arms(this);
    if (doing.hold === "cana") {
      // Both hands to the rod, the right one leading, the forearms up; the body turned a little to it.
      this.toward("upperArmR", 1, -0.6 + 0.02 * Math.sin(t * 0.9), 0, -0.1);
      this.toward("lowerArmR", 1, -0.66 + 0.03 * Math.sin(t * 0.9 + 0.5));
      this.toward("handR", 1, 0);
      this.toward("upperArmL", 1, -0.5, 0, -0.2);
      this.toward("lowerArmL", 1, -0.9, -0.5);
      this.toward("chest", 1, 0.04, -0.12);
      this.toward("head", 1, 0.06, 0.1);
    } else if (doing.hold === "guiador") {
      // Astride, both hands forward to the bars, leaning a little into the road.
      for (const [tag, side] of [["L", 1], ["R", -1]] as const) {
        this.toward(`upperArm${tag}`, 1, -0.95, 0, side * 0.22);
        this.toward(`lowerArm${tag}`, 1, -0.5);
        this.toward(`thigh${tag}`, 1, -1.25, 0, side * 0.3);
        this.toward(`shin${tag}`, 1, 1.5);
      }
      this.toward("spine", 1, 0.16);
      this.toward("neck", 1, -0.14);
    } else if (doing.hold === "bacia") {
      // One hand up to steady the bacia; the head and the neck held still under it.
      this.toward("upperArmL", 1, -0.25, 0, 2.35);
      this.toward("lowerArmL", 1, -0.2, 0, 0.85);
      this.toward("handL", 1, 0, 0, 0.3);
      this.toward("neck", 0.85, 0);
      this.toward("head", 0.85, 0);
      this.toward("chest", 0.6, 0);
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
    doing.holding?.after(this);
  }

  /**
   * How this body rests its arms now, and how far into it: asked for, or found by itself when it has been still
   * long enough. Null when the arms are doing something else (walking, a gesture, holding something, the air).
   */
  private rested(gait: Gait, doing: Doing, sit: number, low: number): [Rest, number] | null {
    const busy = gait.speed > 0.15 || doing.emote !== undefined || doing.hold !== undefined || doing.holding !== undefined || ((doing.jump ?? 0) > 0 && (doing.jump ?? 0) < 1) || low > 0.05;
    if (doing.rest !== undefined) return doing.rest && !busy ? [doing.rest, 1] : null;
    if (busy || (sit > 0.05 && sit < 0.95)) {
      this.stillFrom = null;
      return null;
    }
    this.stillFrom ??= gait.time;
    const still = gait.time - this.stillFrom - REST_AFTER_S;
    if (still < 0) return null;
    const turns = sit >= 0.95 ? SEATED_RESTS : STANDING_RESTS;
    // Each person starts somewhere of their own in the turn, and takes a little more or less over each.
    const each = REST_EACH_S * (0.8 + 0.4 * ((this.seed * 0.618) % 1));
    const at = still / each + this.seed;
    const rest = turns[Math.floor(at) % turns.length] ?? null;
    if (!rest) return null;
    const into = (at % 1) * each;
    // Into it gently after the first rest, and out of it before the next.
    const r = Math.min(ease(into / REST_EASE_S), ease((each - into) / REST_EASE_S), still < REST_EASE_S ? ease(still / REST_EASE_S) : 1);
    return [rest, r];
  }

  /** The body's own paint, kept while it is only a shadow. */
  private paint: Material | Material[] | null = null;

  /**
   * Only its shadow: the body is not seen, and casts one. For the light body standing in the place of a whole one,
   * whose shadow it casts for a fraction of the triangles.
   */
  set shadowOnly(on: boolean) {
    if (on === (this.paint !== null)) return;
    if (on) {
      this.paint = this.mesh.material;
      this.mesh.material = unseen ??= new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      this.mesh.castShadow = true;
    } else {
      this.mesh.material = this.paint!;
      this.paint = null;
      this.mesh.castShadow = false;
    }
  }

  /** Whether the body casts a shadow where the tier draws real ones. */
  set shadow(on: boolean) {
    this.mesh.castShadow = on;
  }

  /** Lets go of what is this body's alone; its shape is shared with others like it and stays. */
  release(): void {
    this.mesh.skeleton.dispose();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.skeleton.dispose();
  }
}

/** Loads one person's model and dresses it in the world's palette. */
export async function loadPerson(renderer: WorldRenderer, url: string, height: number, skirt: boolean, female = false): Promise<Person> {
  const gltf = await modelLoader().loadAsync(url);
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
