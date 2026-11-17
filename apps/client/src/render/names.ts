// Names over heads (founder, 2026-11-16: "show the name when they stop, the
// NPC as well as the players, as if you get close"). A name is shown over
// someone who is standing still and near: a street of people walking has no
// labels on it, and whoever stops to be talked to says who they are. Only
// the nearest few at once.
//
// All of them are one mesh on one picture: one draw. A label is drawn the
// first time it is needed and kept. The same tags will carry players' names
// when there are other players (Phase 3), by the same rule.

import { WORLD } from "@nzila/world/client";
import { BufferAttribute, BufferGeometry, CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3, type Camera } from "three";
import { type WorldRenderer } from "./world-renderer.ts";

/** Someone a name may be shown over: where the top of their head is, who they are, and whether they are standing still. */
export interface Named {
  readonly x: number;
  /** The top of the head, in metres. */
  readonly y: number;
  readonly z: number;
  readonly name: string;
  /** What they do, when it is worth saying ("Zungueira"): a second, smaller line. */
  readonly role?: string;
  readonly still: boolean;
  /** Someone the player has met (a wave answered): named as they pass, and with a mark of the cloth's yellow. */
  readonly known?: boolean;
}

/** A name is shown within this distance, whole within the first; and over this many people at once, the nearest. */
export const NAME_NEAR_M = 9;
export const NAME_FAR_M = 14;
export const NAMES_AT_ONCE = 6;

/** Which of the people get a name: those standing still and near, the nearest first, a few at once. */
export function named(people: readonly Named[], viewerX: number, viewerZ: number): { who: Named; far: number }[] {
  return people
    .filter((who) => who.still || who.known === true)
    .map((who) => ({ who, far: Math.hypot(who.x - viewerX, who.z - viewerZ) }))
    .filter((one) => NAME_FAR_M > one.far && one.far > 0.05)
    .sort((a, b) => a.far - b.far)
    .slice(0, NAMES_AT_ONCE);
}

/**
 * Which of several labels are shown when some would cover others on the screen: given nearest first, each as a
 * box on the screen (its middle and half its size, in any one unit), a label is kept unless it would touch one
 * already kept. The nearest person always keeps theirs.
 */
export function uncrowded(boxes: readonly { readonly x: number; readonly y: number; readonly halfWide: number; readonly halfHigh: number }[]): boolean[] {
  const kept: (typeof boxes)[number][] = [];
  return boxes.map((box) => {
    if (kept.some((other) => Math.abs(other.x - box.x) < other.halfWide + box.halfWide && Math.abs(other.y - box.y) < other.halfHigh + box.halfHigh)) return false;
    kept.push(box);
    return true;
  });
}

/** A label's size in metres and on the picture, and how many different labels the picture holds. */
const WIDE_M = 1.9;
const HIGH_M = 0.53;
const WIDE_PX = 256;
const HIGH_PX = 72;
const ROWS = 48;
const OVER_HEAD_M = 0.34;
const css = (colour: readonly [number, number, number]): string => `#${colour.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

export class NameTags {
  private readonly renderer: WorldRenderer;
  private readonly mesh: Mesh;
  private readonly pen: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly rows = new Map<string, number>();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly middle = new Vector3();
  private readonly edge = new Vector3();
  /** How many names were shown at the last update: for the tests. */
  shown = 0;

  private constructor(renderer: WorldRenderer, mesh: Mesh, pen: CanvasRenderingContext2D, texture: CanvasTexture) {
    this.renderer = renderer;
    this.mesh = mesh;
    this.pen = pen;
    this.texture = texture;
    renderer.scene.add(mesh);
  }

  static open(renderer: WorldRenderer): NameTags | null {
    const canvas = document.createElement("canvas");
    canvas.width = WIDE_PX;
    canvas.height = HIGH_PX * ROWS;
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(NAMES_AT_ONCE * 12), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(NAMES_AT_ONCE * 8), 2));
    const indices: number[] = [];
    for (let n = 0; n < NAMES_AT_ONCE; n++) indices.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
    geometry.setIndex(indices);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.35, fog: false, depthWrite: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return new NameTags(renderer, mesh, pen, texture);
  }

  /** The row of the picture a label is on, drawn now if it never was. When the picture is full the oldest rows are written over. */
  private rowOf(who: Named): number {
    const key = `${who.name}\n${who.role ?? ""}\n${who.known ? "k" : ""}`;
    let row = this.rows.get(key);
    if (row !== undefined) return row;
    row = this.rows.size % ROWS;
    for (const [other, taken] of this.rows) if (taken === row) this.rows.delete(other);
    this.rows.set(key, row);
    const pen = this.pen;
    const top = row * HIGH_PX;
    pen.clearRect(0, top, WIDE_PX, HIGH_PX);
    // A dark plate with round ends, a line of the cloth's yellow under it, the name in white and what they do in yellow.
    pen.font = `700 30px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
    const wide = Math.min(WIDE_PX - 8, Math.max(pen.measureText(who.name).width, who.role ? pen.measureText(who.role).width * 0.7 : 0) + 34);
    const left = (WIDE_PX - wide) / 2;
    pen.fillStyle = css(WORLD.clothBlack);
    pen.beginPath();
    pen.roundRect(left, top + 4, wide, HIGH_PX - 10, 16);
    pen.fill();
    if (who.known) {
      // Someone met: the plate is edged in the cloth's yellow.
      pen.lineWidth = 4;
      pen.strokeStyle = css(WORLD.adBoard);
      pen.beginPath();
      pen.roundRect(left + 2, top + 6, wide - 4, HIGH_PX - 14, 14);
      pen.stroke();
    }
    pen.fillStyle = css(WORLD.adBoard);
    pen.fillRect(left + 14, top + HIGH_PX - 11, wide - 28, 3);
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillStyle = css(WORLD.vanWhite);
    pen.fillText(who.name, WIDE_PX / 2, top + (who.role ? 25 : 34), WIDE_PX - 24);
    if (who.role) {
      pen.font = `600 20px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
      pen.fillStyle = css(WORLD.adBoard);
      pen.fillText(who.role, WIDE_PX / 2, top + 48, WIDE_PX - 24);
    }
    this.texture.needsUpdate = true;
    return row;
  }

  /** Shows the names of whoever is standing still and near, turned to the camera. */
  update(camera: Camera, people: readonly Named[], viewerX: number, viewerZ: number): void {
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const position = this.mesh.geometry.getAttribute("position") as BufferAttribute;
    const uv = this.mesh.geometry.getAttribute("uv") as BufferAttribute;
    const near = named(people, viewerX, viewerZ);
    // The camera's account of itself, made current: it is asked here before the frame is drawn.
    camera.updateWorldMatrix(true, false);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    // Where each label would be on the screen, and how big: two people standing together do not get two labels
    // written over each other; the nearer keeps theirs.
    const boxes = near.map((one) => {
      const size = Math.min(1, Math.max(0, (NAME_FAR_M - one.far) / (NAME_FAR_M - NAME_NEAR_M)));
      const y = one.who.y + OVER_HEAD_M + (HIGH_M / 2) * size;
      this.middle.set(one.who.x, y, one.who.z).project(camera);
      this.edge.set(one.who.x + (this.right.x * WIDE_M * size) / 2 + (this.up.x * HIGH_M * size) / 2, y + (this.right.y * WIDE_M * size) / 2 + (this.up.y * HIGH_M * size) / 2, one.who.z + (this.right.z * WIDE_M * size) / 2 + (this.up.z * HIGH_M * size) / 2).project(camera);
      return { x: this.middle.x, y: this.middle.y, halfWide: Math.abs(this.edge.x - this.middle.x), halfHigh: Math.abs(this.edge.y - this.middle.y) };
    });
    const clear = uncrowded(boxes);
    const list = near.filter((_, n) => clear[n]);
    for (let n = 0; n < NAMES_AT_ONCE; n++) {
      const one = list[n];
      if (!one) {
        for (let corner = 0; corner < 4; corner++) position.setXYZ(n * 4 + corner, 0, -1000, 0);
        continue;
      }
      const row = this.rowOf(one.who);
      const v1 = 1 - row / ROWS;
      const v0 = 1 - (row + 1) / ROWS;
      const size = Math.min(1, Math.max(0, (NAME_FAR_M - one.far) / (NAME_FAR_M - NAME_NEAR_M)));
      const y = one.who.y + OVER_HEAD_M + (HIGH_M / 2) * size;
      for (const [corner, across, upward, u, v] of [[0, -1, -1, 0, v0], [1, 1, -1, 1, v0], [2, 1, 1, 1, v1], [3, -1, 1, 0, v1]] as const) {
        position.setXYZ(n * 4 + corner, one.who.x + ((this.right.x * across * WIDE_M) / 2 + (this.up.x * upward * HIGH_M) / 2) * size, y + ((this.right.y * across * WIDE_M) / 2 + (this.up.y * upward * HIGH_M) / 2) * size, one.who.z + ((this.right.z * across * WIDE_M) / 2 + (this.up.z * upward * HIGH_M) / 2) * size);
        uv.setXY(n * 4 + corner, u, v);
      }
    }
    this.shown = list.length;
    position.needsUpdate = true;
    uv.needsUpdate = true;
  }

  close(): void {
    this.renderer.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.texture.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
