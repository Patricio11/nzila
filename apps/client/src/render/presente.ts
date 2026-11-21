// A thing in the hand (F-257, D-10.2): what was just given is seen held out by whoever gives it, and then carried
// for a while by whoever was given it. Small shapes made here, a few dozen triangles each, one material for all
// of them: a ramo de flores, a perfume, a pano folded, a gelado, and a parcel for anything else.

import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, Mesh, MeshLambertMaterial, Quaternion, SRGBColorSpace, SphereGeometry, type Object3D } from "three";
import { WORLD } from "@nzila/world/client";
import type { Holding } from "./person.ts";

/** How long a thing is held out, and how long whoever was given it carries it, in seconds. */
export const GIVE_SECONDS = 1.6;
export const CARRY_SECONDS = 14;

type Rgb = (typeof WORLD)["wood"];
type Part = readonly [BufferGeometry, Rgb];

const box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: Rgb): Part => [new BoxGeometry(w, h, d).translate(x, y, z), colour];
const ball = (r: number, x: number, y: number, z: number, colour: Rgb): Part => [new SphereGeometry(r, 6, 4).translate(x, y, z), colour];
/** A cone with its point down, its mouth at `top`. */
const cone = (r: number, h: number, top: number, colour: Rgb): Part => [new ConeGeometry(r, h, 7).rotateX(Math.PI).translate(0, top - h / 2, 0), colour];

// The world's own colours (its palette), never one written here.
const RED = WORLD.awningRed;
const GOLD = WORLD.awningGold;
const WHITE = WORLD.paintWhite;
const BLACK = WORLD.tarShade;
const PINK = WORLD.muralPink;
const LEAF = WORLD.acaciaLeafDark;

/** The shapes, standing in the hand: y up from the grip. */
const SHAPES: Readonly<Record<string, () => Part[]>> = {
  flores: () => [
    cone(0.07, 0.24, 0.16, WHITE),
    box(0.075, 0.03, 0.075, 0, 0.0, 0, RED),
    ...[0, 1, 2, 3, 4].map((k): Part => ball(0.042, Math.cos(k * 1.257) * 0.05, 0.19 + (k % 2) * 0.03, Math.sin(k * 1.257) * 0.05, [RED, GOLD, WHITE, RED, PINK][k]!)),
    ball(0.045, 0, 0.24, 0, GOLD),
    ball(0.03, 0.03, 0.15, 0.04, LEAF),
    ball(0.03, -0.04, 0.15, -0.03, LEAF),
  ],
  perfume: () => [box(0.075, 0.1, 0.045, 0, 0.07, 0, PINK), box(0.035, 0.03, 0.035, 0, 0.135, 0, GOLD), box(0.05, 0.035, 0.047, 0, 0.065, 0, WHITE)],
  pano: () => [
    box(0.26, 0.05, 0.18, 0, 0.04, 0.03, RED),
    box(0.262, 0.052, 0.045, 0, 0.04, 0.03, GOLD),
    box(0.264, 0.054, 0.014, 0, 0.04, 0.062, BLACK),
    box(0.264, 0.054, 0.014, 0, 0.04, -0.002, WHITE),
    box(0.24, 0.035, 0.17, 0, 0.082, 0.03, GOLD),
  ],
  gelado: () => [cone(0.04, 0.14, 0.1, WORLD.mucua), ball(0.05, 0, 0.125, 0, PINK), ball(0.04, 0, 0.185, 0, WHITE)],
  chocolate: () => [box(0.13, 0.19, 0.022, 0, 0.09, 0, WORLD.coconut), box(0.132, 0.06, 0.024, 0, 0.09, 0, GOLD)],
  embrulho: () => [box(0.15, 0.12, 0.15, 0, 0.07, 0, RED), box(0.152, 0.122, 0.03, 0, 0.07, 0, GOLD), box(0.03, 0.122, 0.152, 0, 0.07, 0, GOLD), ball(0.03, 0, 0.14, 0, GOLD)],
};

let material: MeshLambertMaterial | null = null;
const made = new Map<string, BufferGeometry>();

/** Many small shapes as one, each painted its own colour. */
function joined(parts: readonly Part[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  for (const [shape, colour] of parts) {
    const flat = shape.toNonIndexed();
    const paint = new Color().setRGB(colour[0] / 255, colour[1] / 255, colour[2] / 255, SRGBColorSpace);
    positions.push(...(flat.getAttribute("position").array as Float32Array));
    normals.push(...(flat.getAttribute("normal").array as Float32Array));
    for (let i = 0; i < flat.getAttribute("position").count; i++) colours.push(paint.r, paint.g, paint.b);
    shape.dispose();
    flat.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colours), 3));
  return geometry;
}

/** Which shape a thing has: its own, or a parcel. */
export const shapeOf = (item: string): string => (item in SHAPES ? item : "embrulho");

/** A thing to put in a hand. Its shape and its paint are shared by every one like it. */
export function thingFor(item: string): Object3D {
  const shape = shapeOf(item);
  let geometry = made.get(shape);
  if (!geometry) made.set(shape, (geometry = joined(SHAPES[shape]!())));
  material ??= new MeshLambertMaterial({ vertexColors: true });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

const turned = new Quaternion();
const upright = new Quaternion();

/**
 * A thing held in a body's right hand: held out to someone ("dar"), or carried before the body ("presente"). It
 * goes where the hand goes and stays upright as the body stands, however the hand is turned.
 */
export function holding(thing: Object3D, kind: "dar" | "presente"): Holding & { readonly kind: "dar" | "presente" } {
  return {
    kind,
    arms(person) {
      if (kind === "presente") {
        // Something small carried before the body: the elbow bent, the forearm up.
        person.toward("upperArmR", 1, -0.28, 0, -0.1);
        person.toward("lowerArmR", 1, -1.3, 0.2);
        person.toward("handR", 1, 0);
        person.toward("head", 0.5, 0.08, -0.1);
      } else {
        // Held out to someone: the arm forward, the body leaning a little after it.
        person.toward("upperArmR", 1, -1.12, 0, -0.06);
        person.toward("lowerArmR", 1, -0.32);
        person.toward("handR", 1, 0);
        person.toward("chest", 0.8, 0.07);
        person.toward("head", 0.6, 0.04);
      }
    },
    after(person) {
      const hand = person.bone("handR");
      if (!hand) return;
      if (thing.parent !== hand) {
        thing.position.set(0, 0.1, 0);
        hand.add(thing);
      }
      hand.updateWorldMatrix(true, false);
      thing.quaternion.copy(hand.getWorldQuaternion(turned).invert()).multiply(person.root.getWorldQuaternion(upright));
    },
  };
}

/** One body's right hand over time: a thing held out for a moment, or carried for a while, then gone. */
export class Hand {
  private now: { item: string; thing: Object3D; mode: "dar" | "tem"; from: number | null; wait: number; held: ReturnType<typeof holding> | null } | null = null;

  /** What is in it, for the tests. */
  get item(): string | null {
    return this.now?.item ?? null;
  }

  /** Holds a thing out to someone. */
  dar(item: string): void {
    this.put(item, "dar", 0);
  }

  /** Takes a thing from whoever holds it out (a moment after they do), and carries it. */
  tem(item: string): void {
    this.put(item, "tem", GIVE_SECONDS * 0.75);
  }

  private put(item: string, mode: "dar" | "tem", wait: number): void {
    this.now?.thing.removeFromParent();
    this.now = { item, thing: thingFor(item), mode, from: null, wait, held: null };
  }

  /** Every frame, before the body is posed: how the thing is held now, to pose it with; nothing when the hand is empty. */
  update(seconds: number): ReturnType<typeof holding> | undefined {
    const now = this.now;
    if (!now) return undefined;
    now.from ??= seconds + now.wait;
    const since = seconds - now.from;
    if (since > (now.mode === "dar" ? GIVE_SECONDS : CARRY_SECONDS)) {
      now.thing.removeFromParent();
      this.now = null;
      return undefined;
    }
    if (since < 0) return undefined;
    return (now.held ??= holding(now.thing, now.mode === "dar" ? "dar" : "presente"));
  }
}
